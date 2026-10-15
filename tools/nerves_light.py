# The nervous system continuing from the brain-shaped mantle, drawn as fine threads of gold light
# (like the burning edge of the rift and the lightning around God). Draws on the tall day picture.
import sys, numpy as np
from PIL import Image, ImageDraw, ImageFilter
src, out = sys.argv[1], sys.argv[2]
img = Image.open(src).convert('RGB'); W, H = img.size
rng = np.random.default_rng(7); S = 2
L = Image.new('L', (W * S, H * S), 0); d = ImageDraw.Draw(L)
def stroke(pts, w0, w1, lum=255):
    n = len(pts)
    for i in range(n - 1):
        t = i / (n - 1); w = max(1, (w0 + (w1 - w0) * t) * S)
        (xa, ya), (xb, yb) = pts[i], pts[i + 1]
        d.line([(xa * S, ya * S), (xb * S, yb * S)], fill=int(lum * (1 - .35 * t)), width=int(w))
def curve(x0, y0, ang, Ln, bend, n=48):
    pts = [(x0, y0)]; a = ang
    for i in range(n):
        a += bend / n + rng.normal(0, .03); x0 += np.cos(a) * Ln / n; y0 += np.sin(a) * Ln / n; pts.append((x0, y0))
    return pts
top, bot = 1585, H - 60
ys = np.linspace(top, bot, 160); xs = 1440 + 70 * np.sin((ys - top) / (bot - top) * 2.4) - 40 * (ys - top) / (bot - top)
cord = list(zip(xs, ys)); stroke(cord[:int(.72 * 160)], 11, 7)
def pair(f, Ln, ang0, bend, w0, nb):
    cx, cy = cord[int(f * 159)]
    for side in (-1, 1):
        ang = np.pi / 2 - side * ang0
        pts = curve(cx, cy, ang, Ln * rng.uniform(.9, 1.1), side * bend); stroke(pts, w0, .8)
        for _ in range(nb):
            q = pts[int(rng.uniform(.3, .85) * len(pts))]
            stroke(curve(q[0], q[1], ang + side * rng.uniform(.25, .7), Ln * rng.uniform(.25, .45), side * .6, 24), w0 * .5, .6, 220)
pair(.05, 640, 1.42, 1.1, 5, 5); pair(.10, 560, 1.30, 1.0, 4.5, 4)
for f in np.linspace(.17, .52, 7): pair(f, rng.uniform(190, 280), 1.15, .45, 2.6, 1)
pair(.58, 330, 1.0, .5, 3.5, 2); pair(.64, 380, .9, .45, 3.5, 2)
cx, cy = cord[int(.7 * 159)]
for side in (-1, 1):
    pts = curve(cx, cy, np.pi / 2 - side * .28, (H - 60 - cy) * 1.02, side * -.18, 60); stroke(pts, 7, 2.5)
    for f in (.25, .5, .72):
        q = pts[int(f * len(pts))]
        stroke(curve(q[0], q[1], np.pi / 2 - side * rng.uniform(.6, 1.0), rng.uniform(140, 240), side * .4, 24), 2.4, .6, 220)
L = L.resize((W, H), Image.LANCZOS)
c = np.asarray(L, np.float32) / 255
g1 = np.asarray(L.filter(ImageFilter.GaussianBlur(5)), np.float32) / 255
g2 = np.asarray(L.filter(ImageFilter.GaussianBlur(18)), np.float32) / 255
g3 = np.asarray(L.filter(ImageFilter.GaussianBlur(60)), np.float32) / 255
a = np.asarray(img, np.float32)
gold = np.array([255, 200, 115], np.float32); white = np.array([255, 249, 232], np.float32)
o = a + gold * (g3[..., None] * .5 + g2[..., None] * .9 + g1[..., None] * .9) * .5
o = o * (1 - c[..., None]) + white * c[..., None]
Image.fromarray(np.clip(o, 0, 255).astype(np.uint8)).save(out)
L.save(out.replace('.png', '-mask.png'))
Image.fromarray(np.clip(o, 0, 255).astype(np.uint8)).resize((486, round(486 * H / W))).save(out.replace('.png', '-s.jpg'), quality=85)
Image.fromarray(np.clip(o, 0, 255).astype(np.uint8)).crop((900, 1450, 1944, 2650)).resize((700, 805)).save(out.replace('.png', '-z.jpg'), quality=85)
