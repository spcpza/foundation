# Tears the sky open around God's mantle (no model, so nothing is invented): a ragged dark lip, a seam of
# burning light, a glow thrown into the cloud, and cracks of light running out across the sky.
# Michelangelo's figures are untouched; only sky outside the mantle is painted.
import sys, numpy as np
from PIL import Image, ImageFilter
from collections import deque
src, sil, out = sys.argv[1], sys.argv[2], sys.argv[3]
img = Image.open(src).convert('RGB'); a = np.asarray(img, np.float32); H, W = a.shape[:2]
S = Image.open(sil).convert('L')
# fill holes, close gaps: the mantle as one shape
s = np.asarray(S) > 127
inv = ~s; seen = np.zeros_like(inv); q = deque()
for y in range(H):
    for x in (0, W - 1):
        if inv[y, x]: seen[y, x] = True; q.append((y, x))
for x in range(W):
    for y in (0, H - 1):
        if inv[y, x] and not seen[y, x]: seen[y, x] = True; q.append((y, x))
while q:
    y, x = q.popleft()
    for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
        ny, nx = y+dy, x+dx
        if 0 <= ny < H and 0 <= nx < W and inv[ny, nx] and not seen[ny, nx]: seen[ny, nx] = True; q.append((ny, nx))
s = ~seen
Sm = Image.fromarray((s * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(21)).filter(ImageFilter.MinFilter(21))
s = np.asarray(Sm) > 127
def blurF(arr, r):
    return np.asarray(Image.fromarray(arr.astype(np.float32), 'F').filter(ImageFilter.GaussianBlur(r)), np.float32) if False else \
        np.asarray(Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)), np.float32) / 255
rng = np.random.default_rng(4)
noise = np.asarray(Image.fromarray((rng.random((H // 16 + 1, W // 16 + 1)) * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC), np.float32) / 255
fine = np.asarray(Image.fromarray((rng.random((H // 5 + 1, W // 5 + 1)) * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC), np.float32) / 255
rag = noise * .7 + fine * .3
# soft distance from the mantle, perturbed so the edge tears raggedly
d1, d2, d3 = blurF(s, 18), blurF(s, 45), blurF(s, 120)
outside = ~s
lip = np.zeros((H, W), np.float32)
seam = np.clip(1 - np.abs(d1 - .3 - .25 * (rag - .5)) / .16, 0, 1) * outside            # the burning edge, hugging the mantle
glow = np.clip(d3 * 1.5, 0, 1) * outside
yy, xx = np.mgrid[0:H, 0:W]
keepout = np.clip((xx - 1120) / 140, 0, 1)                                    # leave God's arm and the hands in calm light
lip *= keepout; seam *= keepout; glow *= .4 + .6 * keepout
VOID = np.array([46, 16, 18], np.float32); FIRE = np.array([255, 222, 150], np.float32); WARM = np.array([255, 200, 130], np.float32)
o = a.copy()
o = o * (1 - glow[..., None] * .35) + WARM * glow[..., None] * .35
o = o * (1 - seam[..., None] * .9) + FIRE * seam[..., None] * .9
o = o * (1 - lip[..., None] * .92) + VOID * lip[..., None] * .92
# cracks of light running out from the seam across the sky
cr = np.zeros((H, W), np.float32)
ys, xs = np.where(seam > .6)
for k in range(9):
    i = rng.integers(len(xs)); x, y = float(xs[i]), float(ys[i])
    if x < 1300: continue
    gx, gy = np.gradient(d3)[1][int(y), int(x)], np.gradient(d3)[0][int(y), int(x)]
    ang = np.arctan2(-gy, -gx); n = int(rng.uniform(60, 170)); w = rng.uniform(1.4, 2.8)
    for t in range(n):
        ang += rng.normal(0, .12); x += np.cos(ang) * 2; y += np.sin(ang) * 2
        if not (0 <= x < W and 0 <= y < H) or s[int(y), int(x)]: break
        r = w * (1 - t / n * .85); y0_, y1_, x0_, x1_ = int(y - 6), int(y + 7), int(x - 6), int(x + 7)
        m = (xx[y0_:y1_, x0_:x1_] - x) ** 2 + (yy[y0_:y1_, x0_:x1_] - y) ** 2 < r * r
        cr[y0_:y1_, x0_:x1_][m] = np.maximum(cr[y0_:y1_, x0_:x1_][m], 1 - t / n * .7)
        if rng.random() < .015:                                               # a branch
            pass
cr = blurF(cr, 2) * outside
o = o * (1 - cr[..., None] * .55) + FIRE * cr[..., None] * .55
L_ = a.mean(2) / 255; sat_ = (a.max(2) - a.min(2)) / 255
FIG = np.asarray(Image.open('whole/day-figures.png').convert('L')) > 60          # Michelangelo's figures (robe, beard) are never the void
skyin = s & (sat_ < .17) & (L_ > .5) & ~FIG
vm = blurF(skyin.astype(np.float32), 3) * s
heart = np.clip(1 - blurF(s.astype(np.float32), 40), 0, 1)                    # 0 deep inside, 1 at the edge
voidc = VOID * (1 - heart[..., None] * .5) + np.array([130, 40, 30], np.float32) * heart[..., None] * .5
o = np.where(s[..., None], a * (1 - vm[..., None]) + voidc * vm[..., None], o)
o = np.where(FIG[..., None] & s[..., None], a, o)
Image.fromarray(np.clip(o, 0, 255).astype(np.uint8)).save(out)
Image.fromarray(np.clip(o, 0, 255).astype(np.uint8)).crop((860, 400, 2000, 1560)).resize((700, 712)).save(out.replace('.png', '-check.jpg'))
print('saved', out)
