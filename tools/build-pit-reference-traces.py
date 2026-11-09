"""Convert manually inspected aerial-image trace points into game coordinates.

Pixel coordinates refer to the saved georeferenced receipts, never screen pixels.
The image provider is a reference, not a texture bundled with the game.
"""
import json, math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'artifacts/pit-reference-2026'
circuits={c['id']:c for c in json.loads((BASE/'geometry-before.json').read_text(encoding='utf8'))}
frames=json.loads((ROOT/'art/references/pit-image-frames.json').read_text(encoding='utf8'))
traces={
 'adriatica':('overview',[[1054,127],[1031,144],[1011,171],[990,208],[968,253],[943,308],[917,364],[890,423],[865,478],[838,536],[813,590],[788,645],[765,696],[747,737],[732,768],[718,792],[700,805],[677,809],[642,809],[610,806]]),
 'nordland':('circuit',[[810,427],[818,402],[823,381],[829,366],[837,356],[844.63,348.16],[850,337],[861,322],[878,303],[896,286],[911,265],[938,234],[997,189],[1053,149],[1088.58,111.97],[1120,95]]),
 'azzurra:garage':('overview',[[768,278],[794,279],[786,535],[760,533],[768,278]])
}
out={}
for ident,(kind,pixels) in traces.items():
    circuit_id=ident.split(':')[0]
    receipt=frames[circuit_id+':'+kind];geo=circuits[circuit_id]['geo']
    x0,y0,x1,y1=receipt['bbox3857'];width,height=receipt['size'];points=[]
    for px,py in pixels:
        mx=x0+px/width*(x1-x0);my=y1-py/height*(y1-y0)
        lon=math.degrees(mx/6378137);lat=math.degrees(2*math.atan(math.exp(my/6378137))-math.pi/2)
        x=((lon-geo['origin'][1])*math.cos(math.radians(geo['origin'][0]))*111195-geo['shift'][0])*geo['scale']
        z=(-(lat-geo['origin'][0])*111195-geo['shift'][1])*geo['scale']
        points.append([round(x,2),round(z,2)])
    out[ident]={'points':points,'source':receipt['url'],'attribution':receipt['attribution'],
        'method':'Hand-traced pit entry, fast lane and exit from georeferenced aerial reference; game reconstruction.'}
(ROOT/'art/references/pit-traces.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf8')
(ROOT/'dist/pit-traces.js').write_text('// Authored from art/references/pit-traces.json.\nexport const PIT_TRACES='+json.dumps({k:v['points'] for k,v in out.items() if ':' not in k},separators=(',',':'))+';\nexport const PIT_GARAGE_FOOTPRINTS='+json.dumps({k.split(':')[0]:v['points'] for k,v in out.items() if ':garage' in k},separators=(',',':'))+';\n',encoding='utf8')
