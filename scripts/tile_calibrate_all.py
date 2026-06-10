#!/usr/bin/env python3
"""Authoritative calibration of ALL directional tile families via pixel analysis.

Coordinate frame: u along +x (grid N..., screen lower-right), v along +y
(screen lower-left).  img_x = 128 + (u-v)*116 ; img_y = 236 + (u+v)*55 - 110*h.

Edges of the cell diamond: N edge = v=1 side (screen lower-left),
E = u=1 (lower-right), S = v=0 (upper-right), W = u=0 (upper-left).
Corners: T=(0,0) B=(1,1) L=(0,1) R=(1,0).
"""
import os, sys, math
from PIL import Image

BASE = '/Users/sal/code/fabletest-sketch/public/tiles'

def img_pt(u, v, h=1.0):
    return (128 + (u - v) * 116, 236 + (u + v) * 55 - 110 * h)

def load(pack, name):
    p = os.path.join(BASE, pack, name + '.png')
    if not os.path.exists(p):
        return None
    return Image.open(p).convert('RGBA')

# ---------- color predicates ----------
def is_green(c):
    r, g, b, a = c
    return a > 100 and g > 90 and g > r + 18 and g > b + 25

def is_water(c):
    r, g, b, a = c
    return a > 100 and b > 140 and b > r + 25 and g > 100

def is_pathy(c, bg):
    # path/dirt stripe: noticeably different hue from the base surface color
    r, g, b, a = c
    if a < 100:
        return False
    br, bg_, bb = bg
    return abs(r - br) + abs(g - bg_) + abs(b - bb) > 90

# ---------- samplers ----------
def sample_surface(im, u, v, hmax=1.25):
    """walk down the column from above the highest possible surface; return first opaque pixel color"""
    x, y0 = img_pt(u, v, hmax)
    px = im.load()
    x = int(round(x))
    if not (0 <= x < im.size[0]):
        return None
    for y in range(max(0, int(y0)), im.size[1]):
        c = px[x, y]
        if c[3] > 100:
            return c
    return None

def edge_mid_colors(im, inset=0.12, span=0.55):
    """sample colors near the middle of each edge (on the top surface)"""
    out = {}
    for edge, pts in {
        'N': [(0.5 + t, 1 - inset) for t in (-span/2, 0, span/2)],
        'E': [(1 - inset, 0.5 + t) for t in (-span/2, 0, span/2)],
        'S': [(0.5 + t, inset) for t in (-span/2, 0, span/2)],
        'W': [(inset, 0.5 + t) for t in (-span/2, 0, span/2)],
    }.items():
        out[edge] = [sample_surface(im, u, v) for (u, v) in pts]
    return out

def corner_colors(im, inset=0.16):
    return {
        'T': sample_surface(im, inset, inset),
        'B': sample_surface(im, 1 - inset, 1 - inset),
        'L': sample_surface(im, inset, 1 - inset),
        'R': sample_surface(im, 1 - inset, inset),
    }

def center_color(im):
    return sample_surface(im, 0.5, 0.5)

# ---------- family analyzers ----------
def water_lip(pack, fam):
    """which edges have GRASS (non-water) on them"""
    print(f'--- {fam} (edges that are grass vs water)')
    for s in 'NESW':
        im = load(pack, f'{fam}_{s}')
        if im is None:
            print(f'{fam}_{s}: MISSING')
            continue
        ec = edge_mid_colors(im)
        desc = []
        for e in 'NESW':
            cs = [c for c in ec[e] if c]
            wat = sum(1 for c in cs if is_water(c))
            grs = sum(1 for c in cs if not is_water(c))
            desc.append(f'{e}:{"water" if wat > grs else "land"}')
        cc = corner_colors(im)
        cdesc = ' '.join(f'{k}:{"W" if (c and is_water(c)) else "L"}' for k, c in cc.items())
        print(f'{fam}_{s}: {" ".join(desc)} | corners {cdesc}')

def linear_mask(pack, fam, pred_kind='path'):
    """which edges does the stripe (path/river) reach"""
    print(f'--- {fam} (stripe connection mask)')
    for variant in ['', 'Bend', 'Split', 'Crossing', 'End', 'EndSquare']:
        for s in 'NESW':
            nm = f'{fam}{variant}_{s}'
            im = load(pack, nm)
            if im is None:
                continue
            cen = center_color(im)
            # base surface color: average corners (assumed grass/sand)
            cc = [c for c in corner_colors(im, 0.1).values() if c]
            bg = tuple(sum(ch[i] for ch in cc) // len(cc) for i in range(3))
            ec = edge_mid_colors(im, inset=0.06, span=0.4)
            mask = ''
            for e in 'NESW':
                cs = [c for c in ec[e] if c]
                if pred_kind == 'river':
                    hit = sum(1 for c in cs if is_water(c)) >= 2
                else:
                    hit = sum(1 for c in cs if is_pathy(c, bg)) >= 2
                mask += e if hit else '.'
            print(f'{nm}: edges {mask}')
    print()

def envelope_classify(pack, names):
    HYP = {
        'flat': lambda u, v: 1.0,
        'descE': lambda u, v: 1 - u, 'descW': lambda u, v: u,
        'descN': lambda u, v: 1 - v, 'descS': lambda u, v: v,
        'ridge_uAxis': lambda u, v: 1 - abs(2 * v - 1),  # ridge runs along u (+x)
        'ridge_vAxis': lambda u, v: 1 - abs(2 * u - 1),
    }
    COLS = list(range(40, 217, 8))
    def pred_env(h, x):
        k = (x - 128) / 116.0
        best = 1e9
        for i in range(61):
            if k >= 0:
                u = k + (1 - k) * i / 60; v = u - k
            else:
                v = -k + (1 + k) * i / 60; u = v + k
            if 0 <= u <= 1 and 0 <= v <= 1:
                y = 236 + (u + v) * 55 - 110 * h(u, v)
                best = min(best, y)
        return best
    for name in names:
        for s in 'NESW':
            im = load(pack, f'{name}_{s}')
            if im is None:
                print(f'{name}_{s}: MISSING'); continue
            px = im.load()
            meas = []
            for x in COLS:
                col = None
                for y in range(im.size[1]):
                    if px[x, y][3] > 60:
                        col = y; break
                meas.append(col)
            scored = []
            for hn, h in HYP.items():
                sse = sum((m - pred_env(h, x)) ** 2 for m, x in zip(meas, COLS) if m is not None)
                scored.append((math.sqrt(sse / len(COLS)), hn))
            scored.sort()
            print(f'{name}_{s}: ' + ' | '.join(f'{hn}:{v:.1f}' for v, hn in scored[:3]))
        print()

def dark_feature_edge(pack, fam):
    """which edge has the dark feature (door) — centroid of dark pixels"""
    print(f'--- {fam} (dark feature centroid)')
    for s in 'NESW':
        im = load(pack, f'{fam}_{s}')
        if im is None:
            print(f'{fam}_{s}: MISSING'); continue
        px = im.load()
        sx = sy = n = 0
        for y in range(0, im.size[1], 2):
            for x in range(0, im.size[0], 2):
                r, g, b, a = px[x, y]
                if a > 150 and r < 110 and g < 95 and b < 95:
                    sx += x; sy += y; n += 1
        if n < 10:
            print(f'{fam}_{s}: no dark pixels'); continue
        cx, cy = sx / n, sy / n
        dx = cx - 128
        # which side: N edge faces lower-left (dx<0, lower y region), E lower-right
        side = ('E' if dx > 0 else 'N') if n else '?'
        print(f'{fam}_{s}: centroid dx={dx:+.0f} dy(img)={cy:.0f} n={n} -> visible face {side}')

if __name__ == '__main__':
    which = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if which in ('water', 'all'):
        water_lip('town', 'grass_water')
        water_lip('town', 'grass_waterConcave')
        water_lip('town', 'grass_waterConvex')
        water_lip('town', 'grass_waterRiver')
        print()
    if which in ('linear', 'all'):
        linear_mask('town', 'grass_path', 'path')
        linear_mask('town', 'grass_river', 'river')
    if which in ('env', 'all'):
        envelope_classify('town', ['grass_riverSlope', 'grass_pathSlope'])
        envelope_classify('desert', ['stairs_full'])
    if which in ('door', 'all'):
        dark_feature_edge('town', 'building_door')
