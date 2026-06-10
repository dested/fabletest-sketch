#!/usr/bin/env python3
"""Measure tile surface geometry from the PNG art.

Cell geometry inside the 256x352 image (cell top vertex at (128,236), one
height level = 110px):
  level-top diamond corners:  top(128,126) right(244,181) bottom(128,346-110=236... )
Actually for a one-level block sitting at its cell:
  top face corners when HIGH:  L(12,181) T(128,126) R(244,181) B(128,236)
  when LOW (surface at base plane): L(12,291) T(128,236) R(244,291) B(128,346)

Silhouette probes:
  left corner  = leftmost opaque pixel  -> y ~181 high / ~291 low
  right corner = rightmost opaque pixel -> y ~181 high / ~291 low
  top corner   = topmost opaque pixel   -> y ~126 high / ~236 low
Bottom corner can't be read from silhouette (vertical faces hang below);
infer it from the others when the family geometry is known.
"""
import sys, os
from PIL import Image

BASE = '/Users/sal/code/fabletest-sketch/public/tiles'

def probe(pack, name):
    p = os.path.join(BASE, pack, name + '.png')
    im = Image.open(p).convert('RGBA')
    px = im.load()
    w, h = im.size
    lx, ly = None, None
    for x in range(w):
        col = [y for y in range(h) if px[x, y][3] > 40]
        if col:
            lx, ly = x, min(col)
            break
    rx, ry = None, None
    for x in range(w - 1, -1, -1):
        col = [y for y in range(h) if px[x, y][3] > 40]
        if col:
            rx, ry = x, min(col)
            break
    ty, tx = None, None
    for y in range(h):
        row = [x for x in range(w) if px[x, y][3] > 40]
        if row:
            ty, tx = y, sum(row) // len(row)
            break
    by = None
    for y in range(h - 1, -1, -1):
        row = [x for x in range(w) if px[x, y][3] > 40]
        if row:
            by = y
            break
    def lvl_side(y):  # for left/right corners
        return round((291 - y) / 110, 2)
    def lvl_top(y):
        return round((236 - y) / 110, 2)
    return {
        'L': (lx, ly, lvl_side(ly)),
        'R': (rx, ry, lvl_side(ry)),
        'T': (tx, ty, lvl_top(ty)),
        'Bot': by,
    }

if __name__ == '__main__':
    pack = sys.argv[1]
    for name in sys.argv[2:]:
        for s in 'NESW':
            r = probe(pack, f'{name}_{s}')
            print(f"{name}_{s}: L y={r['L'][1]} lvl={r['L'][2]} | T y={r['T'][1]} lvl={r['T'][2]} | R y={r['R'][1]} lvl={r['R'][2]} | bottom y={r['Bot']}")
        print()
