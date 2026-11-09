"""Download georeferenced aerial reference images for manual pit-lane review.

Reference-only photographs stay in ignored artifacts/. The game does not
redistribute these images or use them as textures. Receipts retain source URLs,
attribution and image bounds so authored corrections can be checked again.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import subprocess
import urllib.parse
import urllib.request
import time

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'artifacts/pit-reference-2026'
SERVICE='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
ATTRIBUTION='Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community'

def mercator(lon,lat):
    return 6378137*math.radians(lon),6378137*math.log(math.tan(math.pi/4+math.radians(lat)/2))

def fetch(job):
    ident,kind,bounds,size=job
    folder=OUTPUT/ident;folder.mkdir(parents=True,exist_ok=True)
    path=folder/(kind+'.jpg')
    if path.exists() and path.with_suffix('.json').exists():return ident+' '+kind
    url=SERVICE+'/export?'+urllib.parse.urlencode({'bbox':','.join(str(round(v,3)) for v in bounds),'bboxSR':3857,
        'imageSR':3857,'size':','.join(str(v) for v in size),'format':'jpg','f':'image'})
    if not path.exists():
        request=urllib.request.Request(url,headers={'User-Agent':'ApexGP-pitlane-reference-review/4.11'})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request,timeout=50) as response:data=response.read()
                break
            except (OSError, urllib.error.HTTPError):
                if attempt == 2:raise
                # Some high-zoom mosaics reject an export at their seam.
                cx,cy=(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2
                w,h=(bounds[2]-bounds[0])*.8,(bounds[3]-bounds[1])*.8
                bounds=[cx-w,cy-h,cx+w,cy+h];size=[800,800]
                url=SERVICE+'/export?'+urllib.parse.urlencode({'bbox':','.join(str(round(v,2)) for v in bounds),'bboxSR':3857,'imageSR':3857,'size':'800,800','format':'jpg','f':'image'})
                request=urllib.request.Request(url,headers={'User-Agent':'ApexGP-reference-review'})
                time.sleep(1)
        if not data.startswith(b'\xff\xd8'):raise RuntimeError(ident+' '+kind+': '+data[:240].decode(errors='replace'))
        path.write_bytes(data)
    receipt={'url':url,'service':SERVICE,'attribution':ATTRIBUTION,'bbox3857':bounds,'size':size,
        'downloadedAt':datetime.now(timezone.utc).isoformat(),'purpose':'Reference review only; imagery date may vary by location.'}
    path.with_suffix('.json').write_text(json.dumps(receipt,indent=2),encoding='utf8')
    return ident+' '+kind

def main():
    script="import{TRACKS,Circuit}from'./dist/simulation.js';import{penaltyRoutes}from'./dist/penalty-routes.js';console.log(JSON.stringify(TRACKS.map(c=>{const t=new Circuit(c),p=penaltyRoutes(t).pit;return{id:c.id,name:c.name,geo:c.geo,track:c.points,pit:p.points,entry:p.sample(p.serviceStart),exit:p.sample(p.serviceEnd)}})))"
    OUTPUT.mkdir(parents=True,exist_ok=True)
    snapshot=OUTPUT/'geometry-before.json'
    if snapshot.exists():circuits=json.loads(snapshot.read_text(encoding='utf8'))
    else:
        script="import fs from'node:fs';"+script.replace('console.log(JSON.stringify(',"fs.writeFileSync('artifacts/pit-reference-2026/geometry-before.json',JSON.stringify(")
        subprocess.run(['node','--input-type=module','-e',script],cwd=ROOT,check=True)
        circuits=json.loads(snapshot.read_text(encoding='utf8'))
    (OUTPUT/'geometry-before.json').write_text(json.dumps(circuits),encoding='utf8')
    jobs=[]
    for circuit in circuits:
        geo=circuit['geo'];factor=1/math.cos(math.radians(geo['origin'][0]))
        def project(p):
            x,z=(p['x'],p['z']) if isinstance(p,dict) else p
            lat=geo['origin'][0]-(z/geo['scale']+geo['shift'][1])/111195
            lon=geo['origin'][1]+(x/geo['scale']+geo['shift'][0])/(math.cos(math.radians(geo['origin'][0]))*111195)
            return mercator(lon,lat)
        points=[project(p) for p in circuit['pit']]
        x0,x1=min(p[0] for p in points),max(p[0] for p in points)
        y0,y1=min(p[1] for p in points),max(p[1] for p in points)
        cx,cy=(x0+x1)/2,(y0+y1)/2
        width=max(x1-x0+300*factor,(y1-y0+300*factor)*1.6);height=width/1.6
        jobs.append((circuit['id'],'overview',[cx-width/2,cy-height/2,cx+width/2,cy+height/2],[1600,1000]))
        for kind in ['entry','exit']:
            x,y=project(circuit[kind]);radius=210*factor
            jobs.append((circuit['id'],kind,[x-radius,y-radius,x+radius,y+radius],[900,900]))
        if circuit['id'] in ['adriatica','nordland','balaton','mandalika']:
            p=[project(q) for q in circuit['track']]
            cx=(min(q[0] for q in p)+max(q[0] for q in p))/2;cy=(min(q[1] for q in p)+max(q[1] for q in p))/2
            width=max(max(q[0] for q in p)-min(q[0] for q in p)+150*factor,(max(q[1] for q in p)-min(q[1] for q in p)+150*factor)*1.6)
            jobs.append((circuit['id'],'circuit',[cx-width/2,cy-width/3.2,cx+width/2,cy+width/3.2],[1600,1000]))
    frames=json.loads((ROOT/'art/references/pit-image-frames.json').read_text(encoding='utf8'))
    jobs=[(ident,kind,frames[ident+':'+kind]['bbox3857'],frames[ident+':'+kind]['size']) if ident+':'+kind in frames else (ident,kind,bounds,size) for ident,kind,bounds,size in jobs]
    with ThreadPoolExecutor(max_workers=3) as pool:
        for future in as_completed([pool.submit(fetch,job) for job in jobs]):print(future.result(),flush=True)
    print(str(len(jobs))+' georeferenced reference images ready',flush=True)

if __name__=='__main__':main()
