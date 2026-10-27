#!/usr/bin/env python3
"""Package the static client and optional LAN server. Run npm run build first."""
import argparse
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
ROOT = Path(__file__).resolve().parents[1]
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('destination', type=Path)
    output = parser.parse_args().destination.resolve()
    output.mkdir(parents=True, exist_ok=True)
    archive = output / 'ApexGP-4.4.0.zip'
    files = [p for p in (ROOT / 'dist').rglob('*') if p.is_file() and p.suffix != '.obj']
    files += [ROOT / name for name in ['README.md', 'server.py', 'data/race-data.json']]
    with ZipFile(archive, 'w', ZIP_DEFLATED, compresslevel=6) as bundle:
        for path in files:
            bundle.write(path, 'ApexGP/' + path.relative_to(ROOT).as_posix())
    print(archive)
if __name__ == '__main__':
    main()
