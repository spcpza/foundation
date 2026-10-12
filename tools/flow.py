# Prepares a fresco for the brush engine: a web copy of the picture, and a "flow" map that tells
# each brushstroke which way to travel (along Michelangelo's forms) and how small a brush to use.
# usage: python3 tools/flow.py <src.jpg> <name> <max width>
#   -> public/img/<name>.webp   (the picture)
#   -> public/img/<name>-flow.webp  R,G = cos/sin of twice the stroke angle, B = coherence (>.5) or plaster (<.5), A = detail
# Sources (public domain, Wikimedia Commons): Michelangelo, "The Creation of the Sun and Moon" (cropped to God, the sun and the moon) and
# "The Creation of Adam" (Sistine Chapel ceiling, 1508-12).
import sys
import numpy as np
from PIL import Image

src, name, maxw = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(src).convert('RGB')
if im.width > maxw: im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
im.save(f'public/img/{name}.webp', quality=82, method=6)

def blur(a, s):
    r = int(3 * s); k = np.exp(-np.arange(-r, r + 1) ** 2 / (2 * s * s)); k /= k.sum()
    a = np.apply_along_axis(lambda v: np.convolve(np.pad(v, r, mode='edge'), k, 'valid'), 0, a)
    return np.apply_along_axis(lambda v: np.convolve(np.pad(v, r, mode='edge'), k, 'valid'), 1, a)

fw = round(720 * min(1, im.width / im.height))     # flow map: at most 720 px on its long side
small = im.resize((fw, round(im.height * fw / im.width)), Image.LANCZOS)
L = np.asarray(small, dtype=np.float32).mean(2) / 255
L = blur(L, 1.0)
gx = np.zeros_like(L); gy = np.zeros_like(L)
gx[:, 1:-1] = (L[:, 2:] - L[:, :-2]) / 2; gy[1:-1, :] = (L[2:, :] - L[:-2, :]) / 2
jxx, jxy, jyy = blur(gx * gx, 3.5), blur(gx * gy, 3.5), blur(gy * gy, 3.5)
phi = 0.5 * np.arctan2(2 * jxy, jxx - jyy)        # gradient orientation
theta = phi + np.pi / 2                            # strokes run ALONG the forms
theta = -theta                                     # image y is down, canvas y is up
tr = jxx + jyy; det = np.sqrt((jxx - jyy) ** 2 + 4 * jxy ** 2)
coh = np.where(tr > 1e-7, det / (tr + 1e-7), 0) ** 0.5
mag = blur(np.sqrt(gx * gx + gy * gy), 2.0)
detail = np.clip(mag / np.percentile(mag, 97), 0, 1) ** 0.7
# the bare plaster behind the figures: pale, unsaturated, smooth, and connected to the picture's edge
# (a robe's pale highlight is never connected to the edge, so it stays a robe)
rgb = np.asarray(small, dtype=np.float32) / 255
sat = rgb.max(2) - rgb.min(2)
cand = (sat < .13) & (L > .55) & (detail < .45)
from collections import deque
bgm = np.zeros_like(cand); q = deque()
H, Wd = cand.shape
for y in range(H):
    for x in (0, Wd - 1):
        if cand[y, x] and not bgm[y, x]: bgm[y, x] = True; q.append((y, x))
for x in range(Wd):
    for y in (0, H - 1):
        if cand[y, x] and not bgm[y, x]: bgm[y, x] = True; q.append((y, x))
while q:
    y, x = q.popleft()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < H and 0 <= nx < Wd and cand[ny, nx] and not bgm[ny, nx]: bgm[ny, nx] = True; q.append((ny, nx))
plaster = np.clip(blur(bgm.astype(np.float32), 2.0) * 1.3 - .15, 0, 1)
print('plaster', round(float(plaster.mean()), 2))
# B: coherence in the upper half, plaster in the lower (B < .5 means plaster, by how much)
B = np.where(plaster > .5, .5 - .5 * plaster, .5 + .5 * coh)
out = np.stack([np.cos(2 * theta) * .5 + .5, np.sin(2 * theta) * .5 + .5, B, detail], 2)
Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)).save(f'public/img/{name}-flow.webp', lossless=True, quality=100, method=6, exact=True)
print(name, im.size, 'flow', small.size)
