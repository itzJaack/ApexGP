"""Import surveyed raceway centre lines from saved OpenStreetMap API extracts.

Network access is deliberately separate from the build. Keep the selected OSM
coordinates and provenance in art/references/circuits.json (ODbL 1.0).
"""
from pathlib import Path
import json
import math
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
REFERENCES = ROOT / 'art/references/circuits.json'

# Stable game ID, OSM circuit relation (or explicit ways), official lap metres,
# approximate finish line latitude/longitude, direction, width, pit side.
SELECTIONS = [
    ('toscana', '8487163', 5245, (43.9976, 11.3710), 'clockwise', 12, -1),
    ('adriatica', '8671383', 4226, (43.9621766, 12.6842075), 'clockwise', 12, -1),
    ('dune', '21297662', 5380, (25.4890496, 51.4497373), 'clockwise', 12, -1),
    ('alpine', '5309181', 4348, (47.2202964, 14.7667292), 'clockwise', 13, -1),
    ('sakura', ['28213529', '28213530'], 4801, (36.5310998, 140.2286125), 'clockwise', 14, -1),
    ('marina', '21420925', 4657, (41.5698, 2.2611), 'clockwise', 12, -1),
    ('azzurra', '2725877', 4185, (47.9498718, .2075404), 'clockwise', 13, -1),
    ('nordland', ['359172905'], 4542, (52.9627, 6.5231), 'clockwise', 12, -1),
    ('canyon', '6537729', 5513, (30.1318909, -97.6398260), 'counterclockwise', 15, 1),
    ('atlas', None, 4592, (37.2298018, -8.6299791), 'clockwise', 14, -1),
    ('jerez', None, 4423, (36.7103492, -6.033029), 'clockwise', 11, -1),
    ('sachsenring', '2148312', 3671, (50.7913, 12.6877), 'counterclockwise', 12, -1),
    ('phillip', ['43598473'], 4448, (-38.5018807, 145.2319222), 'counterclockwise', 13, -1),
    ('silverstone', '51160', 5900, (52.0693366, -1.0221521), 'clockwise', 15, -1),
]

MUGELLO_CORNERS = [
    ('San Donato','612265027',.5),('Luco','612265024',.5),
    ('Poggio Secco','612265023',.5),('Materassi','612265020',.5),
    ('Borgo San Lorenzo','612265019',.5),('Casanova','612265017',.5),
    ('Savelli','612265016',.5),('Arrabbiata 1','612265004',.5),
    ('Arrabbiata 2','612265013',.5),('Scarperia','612265010',.5),
    ('Palagio','612265009',.5),('Correntaio','612265034',.5),
    ('Biondetti 1','612265031',.28),('Biondetti 2','612265031',.72),
    ('Bucine','612265029',.5),
]


def tags(element):
    return {t.get('k'): t.get('v') for t in element.findall('tag')}


def distance(a, b):
    lat = math.radians((a[0] + b[0]) / 2)
    return math.hypot((b[1] - a[1]) * math.cos(lat), b[0] - a[0]) * 111195


def extract(selection):
    ident, source, metres, finish, direction, width, pit_side = selection
    path = ROOT / 'artifacts' / (ident + '-osm.xml')
    if ident == 'toscana':
        path = ROOT / 'artifacts/mugello-osm.txt'
    root = ET.parse(path).getroot()
    nodes = {n.get('id'): (float(n.get('lat')), float(n.get('lon'))) for n in root.findall('node')}
    ways = {w.get('id'): w for w in root.findall('way')}
    if isinstance(source, str):
        relation = next(r for r in root.findall('relation') if r.get('id') == source)
        selected = {m.get('ref') for m in relation.findall('member')
                    if m.get('type') == 'way' and m.get('role') in ('', 'forward')}
    elif source:
        selected = set(source)
    else:
        selected = {key for key, way in ways.items() if tags(way).get('highway') == 'raceway'
                    and tags(way).get('oneway') == 'yes'
                    and tags(way).get('surface') == 'asphalt'}
    selected = {key for key in selected if key in ways and
                ('straight' in tags(ways[key]).get('name', '').lower() or
                 not any(word in tags(ways[key]).get('name', '').lower()
                         for word in ('pit', 'boxen', 'penalty')))}
    graph = {}
    edge_way = {}
    for key in sorted(selected):
        refs = [n.get('ref') for n in ways[key].findall('nd')]
        for a, b in zip(refs, refs[1:]):
            if a != b:
                graph.setdefault(a, set()).add(b)
                graph.setdefault(b, set()).add(a)
                edge_way[a, b] = edge_way[b, a] = key
    # The finish is projected onto the actual circuit below; choosing a nearby
    # graph vertex only makes cycle enumeration independent of OSM way order.
    start = min(graph, key=lambda key: distance(nodes[key], finish))
    cycles = []

    def walk(at, route, used, length):
        if length > metres * 1.15:
            return
        for nxt in sorted(graph[at]):
            length_next = length + distance(nodes[at], nodes[nxt])
            if nxt == start and len(route) > 20:
                cycles.append((abs(length_next - metres), route[:], length_next))
            elif nxt not in used:
                used.add(nxt)
                route.append(nxt)
                walk(nxt, route, used, length_next)
                route.pop()
                used.remove(nxt)

    import sys
    sys.setrecursionlimit(10000)
    walk(start, [start], {start}, 0)
    if not cycles:
        raise ValueError(f'{ident}: no closed raceway through finish')
    _, route, measured = min(cycles, key=lambda c: c[0])
    if abs(measured / metres - 1) > .05:
        raise ValueError(f'{ident}: centre line length {measured:.1f} differs from {metres}')
    coordinates = [nodes[key] for key in route]
    area = sum(a[1] * b[0] - b[1] * a[0] for a, b in zip(coordinates, coordinates[1:] + coordinates[:1]))
    if (area < 0) != (direction == 'clockwise'):
        route = [route[0], *reversed(route[1:])]
    coordinates = [nodes[key] for key in route]
    used_ways = sorted({edge_way[a, b] for a, b in zip(route, route[1:] + route[:1])})
    corners = []
    if ident == 'toscana':
        for number, (name, way_id, fraction) in enumerate(MUGELLO_CORNERS, 1):
            refs = [nd.get('ref') for nd in ways[way_id].findall('nd')]
            point = nodes[refs[round((len(refs)-1)*fraction)]]
            corners.append({'number': number, 'name': name, 'coordinate': point})
    print(ident, len(route), round(measured, 1), 'm', len(cycles), 'candidates', flush=True)
    return {
        'id': ident, 'length': metres, 'width': width, 'pitSide': pit_side,
        'direction': direction, 'finish': finish, 'coordinates': coordinates, 'corners': corners,
        'source': {'provider': 'OpenStreetMap contributors', 'license': 'ODbL-1.0',
                   'url': 'https://www.openstreetmap.org/' + ('relation/' + source if isinstance(source, str) else 'way/' + used_ways[0]),
                   'ways': used_ways, 'retrieved': '2026-10-26', 'measuredMetres': round(measured, 2)},
    }


if __name__ == '__main__':
    REFERENCES.parent.mkdir(parents=True, exist_ok=True)
    REFERENCES.write_text(json.dumps([extract(s) for s in SELECTIONS], ensure_ascii=False, indent=2), encoding='utf-8')
