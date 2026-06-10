#!/usr/bin/env python3
"""Composite a tile placement JSON (from calib.ts / probe.ts) into a PNG."""
import json, sys, os
from PIL import Image

PACKS = {
    'town': '/Users/sal/code/fabletest-sketch/public/tiles/town',
    'exp': '/Users/sal/code/fabletest-sketch/public/tiles/exp',
    'desert': '/Users/sal/code/fabletest-sketch/public/tiles/desert',
}
SUF = 'NESW'
HALF_W, HALF_H, LEVEL = 116, 55, 110
AX, AY = -128, -236
S = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5

src = sys.argv[1] if len(sys.argv) > 1 else '/tmp/tilecheck/scene.json'
out = sys.argv[2] if len(sys.argv) > 2 else '/tmp/tilecheck/scene.png'

data = json.load(open(src))
tiles = [t for t in data['tiles'] if not t['name'].startswith('__')]
tiles.sort(key=lambda t: ((t['x'] + t['y']) * 64 + t['z'], t['x']))

cache = {}
def img(pack, name, d):
    k = f"{pack}/{name}_{SUF[d]}"
    if k not in cache:
        p = os.path.join(PACKS[pack], f"{name}_{SUF[d]}.png")
        if not os.path.exists(p):
            print('MISSING', k)
            cache[k] = None
        else:
            im = Image.open(p).convert('RGBA')
            cache[k] = im.resize((int(256 * S), int(352 * S)), Image.LANCZOS)
    return cache[k]

xs, ys = [], []
for t in tiles:
    sx = (t['x'] - t['y']) * HALF_W
    sy = (t['x'] + t['y']) * HALF_H - t['z'] * LEVEL
    xs += [sx + AX, sx + AX + 256]
    ys += [sy + AY, sy + AY + 352]
minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
W, H = int((maxx - minx) * S) + 20, int((maxy - miny) * S) + 20
canvas = Image.new('RGBA', (W, H), (232, 213, 192, 255))
for t in tiles:
    im = img(t['pack'], t['name'], t['dir'])
    if im is None:
        continue
    sx = (t['x'] - t['y']) * HALF_W + AX - minx
    sy = (t['x'] + t['y']) * HALF_H - t['z'] * LEVEL + AY - miny
    canvas.paste(im, (int(sx * S) + 10, int(sy * S) + 10), im)
canvas.save(out)
print('saved', out, canvas.size, len(tiles), 'tiles')
