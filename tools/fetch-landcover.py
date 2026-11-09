"""Cache ESA WorldCover 2021 land cover around the circuits (offline runtime).

Requires numpy/rasterio. Native source: 10 m, CC BY 4.0. The game samples a
20 m grid; current mapped roads/buildings/runoffs override this older raster.
"""
import argparse
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import subprocess
import numpy as np
import rasterio
from rasterio.windows import Window

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT/'art/references/landcover'

def fetch(identifier, layout):
    step = 20
    points = layout['points']
    x = math.floor((min(p[0] for p in points)-550)/step)*step
    z = math.floor((min(p[1] for p in points)-550)/step)*step
    width = math.ceil((max(p[0] for p in points)+550-x)/step)+1
    depth = math.ceil((max(p[1] for p in points)+550-z)/step)+1
    geo = layout['geo']
    east = x+np.tile(np.arange(width),depth)*step
    south = z+np.repeat(np.arange(depth),width)*step
    lat = geo['origin'][0]-(south/geo['scale']+geo['shift'][1])/111195
    lon = geo['origin'][1]+(east/geo['scale']+geo['shift'][0])/(math.cos(math.radians(geo['origin'][0]))*111195)
    tile_lat,tile_lon=(np.floor(lat/3)*3).astype(int),(np.floor(lon/3)*3).astype(int)
    classes=np.zeros(len(east),dtype=np.uint8)
    sources=[]
    for a,b in sorted(set(zip(tile_lat.tolist(),tile_lon.tolist()))):
        tile=('N' if a>=0 else 'S')+f'{abs(a):02d}'+('E' if b>=0 else 'W')+f'{abs(b):03d}'
        url=f'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{tile}_Map.tif'
        selected=(tile_lat==a)&(tile_lon==b)
        with rasterio.open(url) as ds:
            inverse=~ds.transform
            cols=np.floor(inverse.a*lon[selected]+inverse.b*lat[selected]+inverse.c).astype(int)
            rows=np.floor(inverse.d*lon[selected]+inverse.e*lat[selected]+inverse.f).astype(int)
            c0,r0=int(cols.min()),int(rows.min())
            raster=ds.read(1,window=Window(c0,r0,int(cols.max())-c0+1,int(rows.max())-r0+1))
            classes[selected]=raster[rows-r0,cols-c0]
        sources.append(url)
    data={'x':x,'z':z,'step':step,'width':width,'depth':depth,'classes':classes.tolist(),
          'geo':geo,'source':'https://esa-worldcover.org/en/data-access','tiles':sources,
          'dataset':'ESA WorldCover 10 m 2021 v200','sourceResolutionMetres':10,'license':'CC-BY-4.0',
          'attribution':'© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium',
          'downloadedAt':datetime.now(timezone.utc).isoformat(),
          'limitation':'2021 land cover classification, not a current aerial photograph; newer mapped facilities override it.'}
    path=CACHE/(identifier+'.json')
    temporary=path.with_suffix('.json.tmp');temporary.write_text(json.dumps(data,separators=(',',':')),encoding='utf8');temporary.replace(path)
    print(identifier+': '+str(width)+'x'+str(depth)+', trees '+str(int(np.count_nonzero(classes==10))),flush=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--track',action='append');parser.add_argument('--refresh',action='store_true');args=parser.parse_args()
    result=subprocess.run(['node','--input-type=module','-e',"import{CIRCUIT_LAYOUTS}from'./dist/circuit-layouts.js';console.log(JSON.stringify(CIRCUIT_LAYOUTS))"],cwd=ROOT,capture_output=True,text=True,check=True)
    CACHE.mkdir(parents=True,exist_ok=True)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif',GDAL_HTTP_MAX_RETRY=2,GDAL_HTTP_RETRY_DELAY=1,GDAL_HTTP_TIMEOUT=45):
        for identifier,layout in json.loads(result.stdout).items():
            if args.track and identifier not in args.track:continue
            if (CACHE/(identifier+'.json')).exists() and not args.refresh:continue
            fetch(identifier,layout)

if __name__=='__main__':main()
