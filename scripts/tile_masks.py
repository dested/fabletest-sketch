#!/usr/bin/env python3
"""Direct-position sampling of flat-top tiles: connection masks & land/water edges.

img_x = 128 + (u-v)*116 ; img_y = 236 + (u+v)*55 - 110*h
For flat families the top surface is at h=1 (path) or banks h=1 / water h~0.75.
"""
import os, sys
from PIL import Image

BASE = '/Users/sal/code/fabletest-sketch/public/tiles'

def px_at(im, u, v, h):
    x = int(round(128 + (u - v) * 116))
    y = int(round(236 + (u + v) * 55 - 110 * h))
    if 0 <= x < im.size[0] and 0 <= y < im.size[1]:
        return im.getpixel((x, y))
    return None

def is_green(c):
    if c is None or c[3] < 120: return False
    r, g, b, a = c
    return g > 95 and g > r + 15 and g > b + 30

def is_water(c):
    if c is None or c[3] < 120: return False
    r, g, b, a = c
    return b > 150 and b > r + 30

def is_path(c):
    if c is None or c[3] < 120: return False
    r, g, b, a = c
    # kenney path: salmon/orange (r>g>b), distinct from grass green
    return r > 150 and r > g + 30 and g > b + 10

def edge_pts(edge, inset):
    ts = [0.25, 0.4, 0.5, 0.6, 0.75]
    if edge == 'N': return [(t, 1 - inset) for t in ts]
    if edge == 'E': return [(1 - inset, t) for t in ts]
    if edge == 'S': return [(t, inset) for t in ts]
    if edge == 'W': return [(inset, t) for t in ts]

def corner_pts(corner, inset=0.13):
    c = {'T': (inset, inset), 'B': (1 - inset, 1 - inset),
         'L': (inset, 1 - inset), 'R': (1 - inset, inset)}[corner]
    return [c]

def edge_votes(im, edge, pred, hs):
    n = 0
    for (u, v) in edge_pts(edge, 0.10):
        if any(pred(px_at(im, u, v, h)) for h in hs):
            n += 1
    return n

def analyze(pack, fam, variants, pred, hs, label):
    print(f'--- {fam} [{label}]')
    for var in variants:
        for s in 'NESW':
            name = f'{fam}{var}_{s}'
            p = os.path.join(BASE, pack, name + '.png')
            if not os.path.exists(p):
                continue
            im = Image.open(p).convert('RGBA')
            mask = ''
            for e in 'NESW':
                mask += e if edge_votes(im, e, pred, hs) >= 3 else '.'
            # corners (useful for water nubs)
            cm = ''
            for c in 'TLBR':
                (u, v) = corner_pts(c)[0]
                cm += c if any(pred(px_at(im, u, v, h)) for h in hs) else '.'
            print(f'{name}: edges {mask}  corners {cm}')
    print()

if __name__ == '__main__':
    V = ['', 'Bend', 'Split', 'Crossing', 'End', 'EndSquare']
    analyze('town', 'grass_path', V, is_path, [1.0], 'path stripe edges')
    analyze('town', 'grass_river', V, is_water, [1.0, 0.78], 'water edges')
    analyze('town', 'grass_water', [''], is_green, [1.0], 'grass lip edges')
    analyze('town', 'grass_waterConcave', [''], is_green, [1.0], 'grass lip edges')
    analyze('town', 'grass_waterConvex', [''], is_green, [1.0], 'grass nub corners')
    analyze('town', 'grass_waterRiver', [''], is_green, [1.0], 'mouth nubs')
    analyze('town', 'grass_waterFall', [''], is_water, [1.0, 0.78], 'fall water edges')
    analyze('town', 'grass_riverBridge', [''], is_water, [1.0, 0.78], 'bridge river axis')
    analyze('town', 'grass_riverBridge', [''], is_path, [1.3, 1.25], 'bridge deck (raised)')
