#!/usr/bin/env python3
"""Parse Kenney sample .tmx maps and print neighborhoods around tiles of
interest, to calibrate orientation conventions authoritatively.

Axes: Tiled col = our x (+x screen lower-right), row = our y (+y lower-left).
"""
import re, sys, os

def load(pack_dir):
    tsx = open(os.path.join(pack_dir, 'Map/map_tiles.tsx')).read()
    names = {}
    for m in re.finditer(r"<tile id='(\d+)'><image[^>]*source='\.\./Tiles/([^']+)\.png'", tsx):
        names[int(m.group(1)) + 1] = m.group(2)  # firstgid=1
    tmx = open(os.path.join(pack_dir, 'Map/map_sample.tmx')).read()
    w = int(re.search(r'<layer[^>]*width="(\d+)"', tmx).group(1))
    h = int(re.search(r'<layer[^>]*height="(\d+)"', tmx).group(1))
    csv = re.search(r'<data encoding="csv">\s*(.*?)\s*</data>', tmx, re.S).group(1)
    vals = [int(v) for v in csv.replace('\n', '').split(',') if v.strip()]
    grid = {}
    for i, v in enumerate(vals):
        if v == 0:
            continue
        gid = v & 0x0FFFFFFF  # strip flip bits
        grid[(i % w, i // w)] = names.get(gid, f'?{gid}')
    return grid, w, h

def hood(grid, x, y, r=1):
    rows = []
    for dy in range(-r, r + 1):
        row = []
        for dx in range(-r, r + 1):
            row.append(grid.get((x + dx, y + dy), '.').ljust(24))
        rows.append(' '.join(row))
    return '\n'.join(rows)

if __name__ == '__main__':
    pack = sys.argv[1]
    pat = sys.argv[2]
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else 8
    grid, w, h = load(pack)
    n = 0
    for (x, y), name in sorted(grid.items(), key=lambda kv: (kv[0][1], kv[0][0])):
        if re.search(pat, name):
            print(f'--- ({x},{y}) {name}')
            print(hood(grid, x, y))
            n += 1
            if n >= limit:
                break
    if n == 0:
        print('no matches; sample names:', sorted({v.rsplit("_",1)[0] for v in grid.values()})[:60])
