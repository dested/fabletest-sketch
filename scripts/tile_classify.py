#!/usr/bin/env python3
"""Classify slope-family tiles by fitting their upper-envelope silhouette
against predicted wedge geometries.

Cell parametrization u (along +x), v (along +y) in [0,1]:
  img_x = 128 + (u-v)*116
  img_y_surface = 236 + (u+v)*55 - 110*h(u,v)

Hypotheses (surface height fields):
  straight slopes:  descE: 1-u   descW: u   descN: 1-v   descS: v
  convex (one HIGH corner, fold along T-B diagonal):
    highT: 1-max(u,v)  highR: min(u,1-v)  highB: min(u,v)  highL: min(1-u,v)
    (descent corner = corner opposite the high one... named by low corner)
  concave (one LOW corner):
    lowT: max(u,v)  lowR: 1-min(u,1-v)  lowB: 1-min(u,v)  lowL: 1-min(1-u,v)
  flat cube: 1
"""
import os, sys
import math
from PIL import Image

BASE = '/Users/sal/code/fabletest-sketch/public/tiles'

HYP = {
    'flat':   lambda u, v: 1.0,
    'descE':  lambda u, v: 1 - u,
    'descW':  lambda u, v: u,
    'descN':  lambda u, v: 1 - v,
    'descS':  lambda u, v: v,
    'cvx_highT': lambda u, v: max(0.0, 1 - max(u, v)),
    'cvx_highR': lambda u, v: max(0.0, min(u, 1 - v)),
    'cvx_highB': lambda u, v: max(0.0, min(u, v)),
    'cvx_highL': lambda u, v: max(0.0, min(1 - u, v)),
    'ccv_lowT': lambda u, v: min(1.0, max(u, v)),
    'ccv_lowR': lambda u, v: 1 - max(0.0, min(u, 1 - v)),
    'ccv_lowB': lambda u, v: 1 - max(0.0, min(u, v)),
    'ccv_lowL': lambda u, v: 1 - max(0.0, min(1 - u, v)),
}

def predicted_envelope(h, x):
    """min img_y over surface points whose img_x == x"""
    k = (x - 128) / 116.0  # u - v
    best = 1e9
    n = 60
    for i in range(n + 1):
        if k >= 0:
            u = k + (1 - k) * i / n
            v = u - k
        else:
            v = -k + (1 + k) * i / n
            u = v + k
        if not (0 <= u <= 1 and 0 <= v <= 1):
            continue
        y = 236 + (u + v) * 55 - 110 * h(u, v)
        best = min(best, y)
    return best

def measured_envelope(path, x):
    im = Image.open(path).convert('RGBA')
    px = im.load()
    w, hh = im.size
    out = []
    for xx in x:
        col = None
        for y in range(hh):
            if px[xx, y][3] > 60:
                col = y
                break
        out.append(col)
    return out

COLS = list(range(40, 217, 8))

def classify(pack, name, bias):
    path = os.path.join(BASE, pack, name + '.png')
    meas = measured_envelope(path, COLS)
    scores = {}
    for hname, h in HYP.items():
        pred = [predicted_envelope(h, x) + bias for x in COLS]
        sse = sum((m - p) ** 2 for m, p in zip(meas, pred) if m is not None)
        scores[hname] = math.sqrt(sse / len(COLS))
    ranked = sorted(scores.items(), key=lambda kv: kv[1])
    return ranked

def fit_bias():
    # use grass_center (flat cube) to estimate outline offset
    path = os.path.join(BASE, 'town', 'grass_center_N.png')
    meas = measured_envelope(path, COLS)
    pred = [predicted_envelope(HYP['flat'], x) for x in COLS]
    diffs = [m - p for m, p in zip(meas, pred) if m is not None]
    diffs.sort()
    return diffs[len(diffs) // 2]

if __name__ == '__main__':
    bias = fit_bias()
    print('outline bias (px):', bias)
    fams = sys.argv[2:] if len(sys.argv) > 2 else ['grass_slope', 'grass_slopeConvex', 'grass_slopeConcave']
    pack = sys.argv[1] if len(sys.argv) > 1 else 'town'
    for fam in fams:
        for s in 'NESW':
            r = classify(pack, f'{fam}_{s}', bias)
            top = ' | '.join(f'{n}:{v:.1f}' for n, v in r[:3])
            print(f'{fam}_{s}: {top}')
        print()
