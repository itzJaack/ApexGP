"""Cache a continuous local Copernicus GLO-90 height grid via Open-Meteo."""
import argparse
import json
import math
from pathlib import Path
import subprocess
import time
import urllib.parse
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'art/references/elevation'

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--track');parser.add_argument('--spacing',type=int,default=240);args=parser.parse_args()
    source=subprocess.run(['node','--input-type=module','-e',"import {CIRCUIT_LAYOUTS} from './dist/circuit-layouts.js';console.log(JSON.stringify(CIRCUIT_LAYOUTS));"],cwd=ROOT,capture_output=True,text=True,check=True)
    layouts=json.loads(source.stdout);CACHE.mkdir(parents=True,exist_ok=True)
    for identifier,layout in layouts.items():
        if args.track and identifier!=args.track:continue
        path=CACHE/(identifier+'.json')
        if path.exists():data=json.loads(path.read_text(encoding='utf8'))
        else:
            points=layout['points'];step=max(120,args.spacing)
            x=math.floor((min(p[0] for p in points)-500)/step)*step
            z=math.floor((min(p[1] for p in points)-500)/step)*step
            width=math.ceil((max(p[0] for p in points)+500-x)/step)+1
            depth=math.ceil((max(p[1] for p in points)+500-z)/step)+1
            data={'x':x,'z':z,'step':step,'width':width,'depth':depth,'elevations':[],
                  'geo':layout['geo'],'source':'https://open-meteo.com/en/docs/elevation-api',
                  'dataset':'Copernicus DEM 2021 GLO-90','sourceResolutionMetres':90,
                  'sampleSpacingMetres':step,'attribution':'Copernicus / Open-Meteo',
                  'downloadedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
        total=data['width']*data['depth']
        while len(data['elevations'])<total:
            start=len(data['elevations']);geo=data['geo'];latitude,longitude=geo['origin'];latitudes=[];longitudes=[]
            for i in range(start,min(start+100,total)):
                x=data['x']+(i%data['width'])*data['step'];z=data['z']+(i//data['width'])*data['step']
                latitudes.append(latitude-(z/geo['scale']+geo['shift'][1])/111195)
                longitudes.append(longitude+(x/geo['scale']+geo['shift'][0])/(math.cos(math.radians(latitude))*111195))
            url='https://api.open-meteo.com/v1/elevation?'+urllib.parse.urlencode({'latitude':','.join(f'{v:.7f}' for v in latitudes),'longitude':','.join(f'{v:.7f}' for v in longitudes)})
            error=None
            for attempt in range(6):
                try:
                    request=urllib.request.Request(url,headers={'User-Agent':'ApexGP-offline-elevation/4.7'})
                    with urllib.request.urlopen(request,timeout=35) as response:values=json.load(response)['elevation']
                    if len(values)!=len(latitudes) or not all(isinstance(v,(int,float)) and math.isfinite(v) for v in values):raise ValueError('Incomplete terrain elevation response')
                    data['elevations'].extend(values);path.write_text(json.dumps(data,separators=(',',':')),encoding='utf8');error=None;break
                except Exception as failure:
                    error=failure;print(identifier+': '+str(failure),flush=True)
                    if hasattr(failure,'read'):print(failure.read().decode(errors='replace')[:500],flush=True)
                    time.sleep(65 if getattr(failure,'code',0)==429 else 2+attempt*2)
            if error:raise error
            time.sleep(13)
        print(identifier+': '+str(total)+' Copernicus elevation samples',flush=True)

if __name__=='__main__':main()
