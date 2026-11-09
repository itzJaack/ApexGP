"""Cache metre-scale terrain grids from the public Copernicus GLO-30 COGs.

Run separately from the offline build. Requires numpy and rasterio.
GLO-90 is a documented fallback where a public GLO-30 tile is unavailable.
The source is a surface model, including vegetation and structures, not a
survey of the racing asphalt. Runtime road-profile fitting remains necessary.
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
CACHE = ROOT/'art/references/elevation'


def tile_url(latitude, longitude, resolution):
    north = ('N' if latitude >= 0 else 'S') + f'{abs(latitude):02d}_00'
    east = ('E' if longitude >= 0 else 'W') + f'{abs(longitude):03d}_00'
    seconds = '10' if resolution == 30 else '30'
    tile = f'Copernicus_DSM_COG_{seconds}_{north}_{east}_DEM'
    return f'https://copernicus-dem-{resolution}m.s3.amazonaws.com/{tile}/{tile}.tif'


def read_tile(latitudes, longitudes, tile_lat, tile_lon):
    failures = []
    for resolution in [30, 90]:
        url = tile_url(tile_lat, tile_lon, resolution)
        try:
            with rasterio.open(url) as dataset:
                inverse = ~dataset.transform
                columns = inverse.a*longitudes+inverse.b*latitudes+inverse.c-.5
                rows = inverse.d*longitudes+inverse.e*latitudes+inverse.f-.5
                col_start = max(0, int(np.floor(columns.min()))-1)
                row_start = max(0, int(np.floor(rows.min()))-1)
                col_end = min(dataset.width, int(np.ceil(columns.max()))+3)
                row_end = min(dataset.height, int(np.ceil(rows.max()))+3)
                window = Window(col_start, row_start, col_end-col_start, row_end-row_start)
                raster = dataset.read(1, window=window, masked=True).filled(0)
                x = np.clip(columns-col_start, 0, raster.shape[1]-1.00001)
                y = np.clip(rows-row_start, 0, raster.shape[0]-1.00001)
                i, j = x.astype(int), y.astype(int)
                a, b = x-i, y-j
                values = ((1-a)*raster[j, i]+a*raster[j, i+1])*(1-b) + (
                    (1-a)*raster[j+1, i]+a*raster[j+1, i+1])*b
                if not np.isfinite(values).all():
                    raise ValueError('Non-finite Copernicus elevations')
                return values, {'url': url, 'resolutionMetres': resolution}
        except rasterio.errors.RasterioIOError as error:
            failures.append(str(error))
            print(f'  GLO-{resolution} tile {tile_lat},{tile_lon}: {error}', flush=True)
    raise RuntimeError('Copernicus tile unavailable: ' + '; '.join(failures))


def fetch(identifier, layout, spacing):
    points = layout['points']
    x = math.floor((min(p[0] for p in points)-600)/spacing)*spacing
    z = math.floor((min(p[1] for p in points)-600)/spacing)*spacing
    width = math.ceil((max(p[0] for p in points)+600-x)/spacing)+1
    depth = math.ceil((max(p[1] for p in points)+600-z)/spacing)+1
    geo = layout['geo']
    east = x+np.tile(np.arange(width), depth)*spacing
    south = z+np.repeat(np.arange(depth), width)*spacing
    latitudes = geo['origin'][0]-(south/geo['scale']+geo['shift'][1])/111195
    longitudes = geo['origin'][1]+(east/geo['scale']+geo['shift'][0]) / (
        math.cos(math.radians(geo['origin'][0]))*111195)
    tile_lat, tile_lon = np.floor(latitudes).astype(int), np.floor(longitudes).astype(int)
    heights = np.empty(len(east))
    sources = []
    for latitude, longitude in sorted(set(zip(tile_lat.tolist(), tile_lon.tolist()))):
        selected = (tile_lat == latitude) & (tile_lon == longitude)
        heights[selected], source = read_tile(latitudes[selected], longitudes[selected], latitude, longitude)
        sources.append(source)
    data = {
        'x': x, 'z': z, 'step': spacing, 'width': width, 'depth': depth,
        'elevations': np.round(heights, 2).tolist(), 'geo': geo,
        'source': 'https://registry.opendata.aws/copernicus-dem/',
        'dataset': 'Copernicus DEM 2021 GLO-30 Public',
        'sourceResolutionMetres': max(source['resolutionMetres'] for source in sources),
        'sampleSpacingMetres': spacing, 'tiles': sources,
        'attribution': 'Copernicus DEM / European Union / ESA / AWS Open Data',
        'downloadedAt': datetime.now(timezone.utc).isoformat(),
        'limitation': 'Surface model; road heights are fitted to remove vegetation and structure artefacts.',
    }
    if any(source['resolutionMetres'] == 90 for source in sources):
        data['dataset'] += ' / GLO-90 fallback'
    path = CACHE/(identifier+'.json')
    temporary = path.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(data, separators=(',', ':')), encoding='utf8')
    temporary.replace(path)
    print(f'{identifier}: {width}x{depth}, {spacing} m grid, GLO-{data["sourceResolutionMetres"]}', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--track', action='append')
    parser.add_argument('--spacing', type=int, default=30)
    parser.add_argument('--refresh', action='store_true')
    args = parser.parse_args()
    if args.spacing < 30:
        parser.error('Sampling below the source resolution is not supported')
    result = subprocess.run(['node', '--input-type=module', '-e',
        "import {CIRCUIT_LAYOUTS} from './dist/circuit-layouts.js';console.log(JSON.stringify(CIRCUIT_LAYOUTS))"],
        cwd=ROOT, capture_output=True, text=True, check=True)
    layouts = json.loads(result.stdout)
    CACHE.mkdir(parents=True, exist_ok=True)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',
                      CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif',
                      GDAL_HTTP_MAX_RETRY=2, GDAL_HTTP_RETRY_DELAY=1,
                      GDAL_HTTP_TIMEOUT=45, AWS_NO_SIGN_REQUEST='YES'):
        for identifier, layout in layouts.items():
            if args.track and identifier not in args.track:
                continue
            path = CACHE/(identifier+'.json')
            if path.exists() and not args.refresh:
                previous = json.loads(path.read_text(encoding='utf8'))
                if previous.get('sampleSpacingMetres') == args.spacing and previous.get('tiles') and previous.get('geo') == layout['geo']:
                    print(identifier+': cached GLO-30 grid', flush=True)
                    continue
            fetch(identifier, layout, args.spacing)


if __name__ == '__main__':
    main()
