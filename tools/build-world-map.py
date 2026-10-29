"""Regenerate the small offline world map from public-domain Natural Earth data."""
import json
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson'

def build():
    data = json.loads(urllib.request.urlopen(SOURCE, timeout=30).read())
    paths = []
    for feature in data['features']:
        geometry = feature['geometry']
        polygons = geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else [geometry['coordinates']]
        for polygon in polygons:
            rings = []
            for ring in polygon:
                points = [(round((lon + 180) * 1000 / 360, 1), round((90 - lat) * 500 / 180, 1)) for lon, lat, *_ in ring]
                rings.append('M' + 'L'.join(f'{x:g},{y:g}' for x, y in points) + 'Z')
            paths.append(''.join(rings))
    target = ROOT / 'dist/assets/world-land.svg'
    target.write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500">'
                      '<!-- Natural Earth 1:110m land; public domain. https://www.naturalearthdata.com/ -->'
                      '<path fill="#334957" fill-rule="evenodd" d="' + ''.join(paths) + '"/></svg>', encoding='utf-8')
    circuits = json.loads((ROOT / 'art/references/circuits.json').read_text(encoding='utf-8'))
    locations = {circuit['id']: circuit['finish'] for circuit in circuits}
    (ROOT / 'dist/track-locations.js').write_text('// Latitude/longitude of surveyed finish lines. Source: art/references/circuits.json (OSM, ODbL).\n'
        + 'export const TRACK_LOCATIONS = ' + json.dumps(locations, indent=2) + ';\n', encoding='utf-8')

if __name__ == '__main__':
    build()
