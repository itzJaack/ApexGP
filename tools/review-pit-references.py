"""Produce reference contact sheets, with current geometry visibly overlaid."""
import json, math, subprocess
from pathlib import Path
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]/'artifacts/pit-reference-2026'
circuits=json.loads((ROOT/'geometry-before.json').read_text())

def tile(c,kind):
    path=ROOT/c['id']/(kind+'.jpg')
    if not path.exists():return Image.new('RGB',(800,540),'#333333')
    im=Image.open(path).convert('RGB');d=ImageDraw.Draw(im)
    receipt=json.loads(path.with_suffix('.json').read_text());x0,y0,x1,y1=receipt['bbox3857']
    geo=c['geo']
    def project(p):
        x,z=(p['x'],p['z']) if isinstance(p,dict) else p
        lat=geo['origin'][0]-(z/geo['scale']+geo['shift'][1])/111195
        lon=geo['origin'][1]+(x/geo['scale']+geo['shift'][0])/(math.cos(math.radians(geo['origin'][0]))*111195)
        mx=6378137*math.radians(lon);my=6378137*math.log(math.tan(math.pi/4+math.radians(lat)/2))
        return((mx-x0)/(x1-x0)*im.width,(y1-my)/(y1-y0)*im.height)
    d.line([project(p) for p in c['pit']],fill='#ff39ce',width=4)
    for key,color in [('entry','#00ffff'),('exit','#ffff00')]:
        x,y=project(c[key]);d.ellipse((x-8,y-8,x+8,y+8),outline=color,width=4)
    im.thumbnail((800,500));out=Image.new('RGB',(800,540),'#111111');out.paste(im,(0,40))
    ImageDraw.Draw(out).text((12,10),c['id']+' / '+c['name']+' / '+kind,fill='white',font_size=20)
    return out

for kind in ['overview','entry','exit']:
    for start in range(0,len(circuits),6):
        sheet=Image.new('RGB',(1600,1620),'#111111')
        for i,c in enumerate(circuits[start:start+6]):sheet.paste(tile(c,kind),(i%2*800,i//2*540))
        sheet.save(ROOT/('review-'+kind+'-'+str(start//6+1)+'.jpg'),quality=92)
print('Reference contact sheets saved')
if not (ROOT/'scenery-review.json').exists():
    script="import fs from'node:fs';import{SCENERY_DATA as S}from'./dist/scenery-data.js';fs.writeFileSync('artifacts/pit-reference-2026/scenery-review.json',JSON.stringify(Object.fromEntries(Object.entries(S).map(([id,s])=>[id,s.features.filter(f=>['building','road','grandstand'].includes(f.kind))]))))"
    subprocess.run(['node','--input-type=module','-e',script],cwd=ROOT.parents[1],check=True)
scenery=json.loads((ROOT/'scenery-review.json').read_text(encoding='utf8'))
for c in circuits:
    path=ROOT/c['id']/'overview.jpg'
    im=Image.open(path).convert('RGB');d=ImageDraw.Draw(im)
    x0,y0,x1,y1=json.loads(path.with_suffix('.json').read_text())['bbox3857'];geo=c['geo']
    def project(p):
        x,z=p
        lat=geo['origin'][0]-(z/geo['scale']+geo['shift'][1])/111195
        lon=geo['origin'][1]+(x/geo['scale']+geo['shift'][0])/(math.cos(math.radians(geo['origin'][0]))*111195)
        mx=6378137*math.radians(lon);my=6378137*math.log(math.tan(math.pi/4+math.radians(lat)/2))
        return((mx-x0)/(x1-x0)*im.width,(y1-my)/(y1-y0)*im.height)
    for f in scenery[c['id']]:
        if f['kind']=='road':
            if f['tags'].get('highway') not in ['raceway','service']:continue
            points=[project(p) for p in f['line']];color='#cc00ff'
        else:
            points=[project(p) for p in f['rings'][0]];color='#00eeff'
        d.line(points,fill=color,width=2)
        mid=points[len(points)//2]
        if 0<mid[0]<im.width and 0<mid[1]<im.height:
            d.text(mid,f['id'],fill='yellow',stroke_fill='black',stroke_width=1,font_size=15)
    im.save(ROOT/c['id']/'mapped-overview.jpg',quality=94)
