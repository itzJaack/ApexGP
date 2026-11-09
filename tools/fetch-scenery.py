"""Cache OpenStreetMap surroundings for offline scenery generation."""
import argparse
import json
import math
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'art/references/scenery'
ENDPOINTS=['https://overpass.private.coffee/api/interpreter','https://overpass-api.de/api/interpreter']

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--track')
    parser.add_argument('--source',choices=['overpass','osm-api'],default='overpass')
    parser.add_argument('--refresh',action='store_true')
    parser.add_argument('--extract-dir',type=Path,help='Use cached full OSM API XML and its source receipt when available.')
    args=parser.parse_args()
    CACHE.mkdir(parents=True,exist_ok=True)
    for circuit in json.loads((ROOT/'art/references/circuits.json').read_text(encoding='utf8')):
        if args.track and circuit['id']!=args.track:continue
        path=CACHE/(circuit['id']+'.json')
        if path.exists() and not args.refresh:
            print(circuit['id']+': cached',flush=True);continue
        coordinates=circuit['coordinates'];latitude=circuit['finish'][0]
        lat_margin=500/111195;lon_margin=lat_margin/math.cos(math.radians(latitude))
        bbox=[min(p[0] for p in coordinates)-lat_margin,min(p[1] for p in coordinates)-lon_margin,
              max(p[0] for p in coordinates)+lat_margin,max(p[1] for p in coordinates)+lon_margin]
        area=','.join(str(round(value,7)) for value in bbox)
        if args.source=='osm-api':
            url='https://api.openstreetmap.org/api/0.6/map?bbox='+','.join(str(value) for value in [bbox[1],bbox[0],bbox[3],bbox[2]])
            extract=args.extract_dir/(circuit['id']+'-osm.xml') if args.extract_dir else None
            receipt={}
            if extract and extract.exists():
                root=ET.parse(extract).getroot()
                receipt_path=extract.with_name(circuit['id']+'-osm-source.json')
                if receipt_path.exists():receipt=json.loads(receipt_path.read_text(encoding='utf8'))
                url=receipt.get('url',url)
            else:
                request=urllib.request.Request(url,headers={'User-Agent':'ApexGP-offline-scenery/5.0'})
                with urllib.request.urlopen(request,timeout=55) as response:root=ET.fromstring(response.read())
            nodes={int(n.get('id')):{'lat':float(n.get('lat')),'lon':float(n.get('lon'))} for n in root.findall('node')}
            elements=[];ways={}
            for node in root.findall('node'):
                if node.findall('tag'):elements.append({'type':'node','id':int(node.get('id')),**nodes[int(node.get('id'))],
                    'tags':{tag.get('k'):tag.get('v') for tag in node.findall('tag')}})
            for way in root.findall('way'):
                element={'type':'way','id':int(way.get('id')),'tags':{tag.get('k'):tag.get('v') for tag in way.findall('tag')},
                    'geometry':[nodes[int(n.get('ref'))] for n in way.findall('nd') if int(n.get('ref')) in nodes]}
                elements.append(element);ways[element['id']]=element
            for relation in root.findall('relation'):
                tags={tag.get('k'):tag.get('v') for tag in relation.findall('tag')}
                if tags.get('type')!='multipolygon':continue
                members=[]
                for member in relation.findall('member'):
                    ref=int(member.get('ref'))
                    if member.get('type')=='way' and ref in ways:members.append({'type':'way','ref':ref,'role':member.get('role'),'geometry':ways[ref]['geometry']})
                elements.append({'type':'relation','id':int(relation.get('id')),'tags':tags,'members':members})
            data={'elements':elements,'apexgpSource':{'endpoint':url,'bbox':bbox,'downloadedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),
                'attribution':'OpenStreetMap contributors','license':'https://opendatacommons.org/licenses/odbl/1-0/',
                **({'extractReceipt':receipt} if receipt else {})}}
            path.write_text(json.dumps(data,separators=(',',':')),encoding='utf8')
            print(circuit['id']+': '+str(len(elements))+' OSM map elements',flush=True)
            time.sleep(2);continue
        query='[out:json][timeout:45];('
        for tag in ['[building]','["building:part"]','[natural~"^(wood|water|scrub|tree_row)$"]',
                    '[landuse~"^(forest|orchard|vineyard)$"]','[leisure=park]',
                    '[leisure=grandstand]','[amenity=parking]','[barrier~"^(fence|wall)$"]',
                    '[highway~"^(service|residential|unclassified|tertiary|secondary|primary|footway|path)$"]']:
            query+='way'+tag+'('+area+');'
        query+='relation[type=multipolygon][natural~"^(wood|water)$"]('+area+');'
        query+='relation[type=multipolygon][landuse=forest]('+area+');'
        query+='relation[type=multipolygon][building]('+area+');'
        query+='node[natural=tree]('+area+');node[highway=street_lamp]('+area+'););out geom;'
        error=None
        for endpoint in ENDPOINTS:
            try:
                request=urllib.request.Request(endpoint,data=urllib.parse.urlencode({'data':query}).encode(),
                    headers={'User-Agent':'ApexGP-offline-scenery/4.7 (public OSM cache)'})
                with urllib.request.urlopen(request,timeout=55) as response:data=json.load(response)
                if data.get('remark'):raise RuntimeError(data['remark'])
                data['apexgpSource']={'endpoint':endpoint,'query':query,'bbox':bbox,
                    'downloadedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),
                    'attribution':'OpenStreetMap contributors','license':'https://opendatacommons.org/licenses/odbl/1-0/'}
                path.write_text(json.dumps(data,separators=(',',':')),encoding='utf8')
                print(circuit['id']+': '+str(len(data['elements']))+' OSM elements',flush=True)
                error=None;break
            except Exception as failure:
                if hasattr(failure,'read'):print(failure.read().decode(errors='replace')[:1600],flush=True)
                error=failure;print(circuit['id']+': '+str(failure),flush=True)
        if error:raise error
        time.sleep(1)

if __name__=='__main__':main()
