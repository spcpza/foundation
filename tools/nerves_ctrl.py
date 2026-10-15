# A BOLD nervous system for the ControlNet: thick cord from the brain stem (bottom of God's mantle), brachial
# nerves fanning across the valley like arms, intercostals, and the two sciatic trunks splaying to the legs.
# Light rivers on dark land, so from afar the valley IS the nervous system.
import sys, numpy as np
from PIL import Image, ImageDraw, ImageFilter
W, H = 1944, 3209; S = 2; rng = np.random.default_rng(11)
L = Image.new('L', (W * S, H * S), 0); d = ImageDraw.Draw(L)
def stroke(pts, w0, w1):
    n = len(pts)
    for i in range(n - 1):
        t = i / (n - 1); w = max(2, (w0 + (w1 - w0) * t) * S); (xa, ya), (xb, yb) = pts[i], pts[i + 1]
        d.line([(xa * S, ya * S), (xb * S, yb * S)], fill=255, width=int(w)); d.ellipse([xb*S-w/2, yb*S-w/2, xb*S+w/2, yb*S+w/2], fill=255)
def curve(x0, y0, ang, Ln, bend, n=60, wob=.02):
    pts = [(x0, y0)]; a = ang
    for i in range(n):
        a += bend / n + rng.normal(0, wob); x0 += np.cos(a) * Ln / n; y0 += np.sin(a) * Ln / n; pts.append((x0, y0))
    return pts
top, hip = 1540, 2520
ys = np.linspace(top, hip, 120); u = (ys - top) / (hip - top)
xs = 1430 - 230 * u + 25 * np.sin(u * 5)
cord = list(zip(xs, ys)); stroke(cord, 95, 60)
def at(f): return cord[int(f * 119)]
def limb(f, Ln, ang0, bend, w0, nb, bl=.4):
    cx, cy = at(f)
    for side in (-1, 1):
        ang = np.pi / 2 - side * ang0; Lr = Ln * (1.0 if side < 0 else .75)
        pts = curve(cx, cy, ang, Lr, side * bend); stroke(pts, w0, w0 * .25)
        for _ in range(nb):
            q = pts[int(rng.uniform(.3, .8) * len(pts))]
            stroke(curve(q[0], q[1], ang + side * rng.uniform(.3, .8), Lr * rng.uniform(.25, bl), side * .5, 30), w0 * .45, 6)
for side, Ln in ((-1, 1150), (1, 620)):                                   # brachial: the arms, out and down, with hands
    cx, cy = at(.05); ang = np.pi / 2 - side * 1.38
    pts = curve(cx, cy, ang, Ln, side * .75, 70, .01); stroke(pts, 80, 34)
    pts2 = curve(*at(.12), ang + side * .12, Ln * .8, side * .7, 60, .01); stroke(pts2, 50, 20)
    ex, ey = pts[-1]; ea = np.arctan2(pts[-1][1] - pts[-6][1], pts[-1][0] - pts[-6][0])
    for k in range(5): stroke(curve(ex, ey, ea + (k - 2) * .28, 190, 0, 20), 24, 9)
for f in np.linspace(.25, .8, 5): limb(f, rng.uniform(220, 300), 1.1, .4, 34, 0, .5)   # intercostals
cx, cy = at(1.)
for side in (-1, 1):                                                        # sciatic trunks: the legs
    pts = curve(cx, cy, np.pi / 2 - side * .38, (H - cy) * 1.15, side * -.3, 60, .01); stroke(pts, 62, 26)
    for f in (.2, .45, .7):
        q = pts[int(f * len(pts))]
        stroke(curve(q[0], q[1], np.pi / 2 - side * rng.uniform(.6, 1.0), rng.uniform(200, 300), side * .4, 30), 22, 6)
    ex, ey = pts[-1]
    for k in range(4): stroke(curve(ex, min(ey, H - 40), np.pi / 2 - side * (k - 1.5) * .3, 120, 0, 16), 14, 5)
L = L.resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(5))
L.save('aiv/nerves-bold.png')
w = 160; h = round(H * w / W); L.resize((w, h)).resize((w * 2, h * 2)).save('aiv/nerves-bold-t.png')
