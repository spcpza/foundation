"""Build 3D assets: depth (R = foreground depth, G = background depth) + inpainted background colour.
Usage: .venv/bin/python tools/prep3d.py <painting> <depth.npy | depth16.png> [upscaled painting]

Far-layer colour: multi-pass Telea + NS inpaint, then edge-aware fill from surrounding landscape
so gaps behind hands/robes look less like soft smudges at strong camera angles.
"""
import sys, os, subprocess, numpy as np, cv2
src, dnp = sys.argv[1], sys.argv[2]; up = sys.argv[3] if len(sys.argv) > 3 else None
out = 'public/img'; os.makedirs(out, exist_ok=True); os.makedirs('proof', exist_ok=True)
col = cv2.imread(src); H, W = col.shape[:2]
d = np.load(dnp).astype(np.float32) if dnp.endswith('.npy') else cv2.imread(dnp, -1).astype(np.float32) / 65535
GW, GH = 576, 1024
dg = cv2.resize(d, (GW, GH), interpolation=cv2.INTER_AREA)
# snap soft depth edges into clean steps so occlusion edges tear cleanly instead of rubber-stretching
k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
for _ in range(2):
    mn, mx = cv2.erode(dg, k), cv2.dilate(dg, k)
    snap = np.where(dg - mn > mx - dg, mx, mn)
    dg = np.where(mx - mn > 0.07, snap, dg).astype(np.float32)
dg = cv2.GaussianBlur(dg, (0, 0), 0.7)
# background depth: push near things back (min filter on "nearness") so the far layer extends behind edges
R = 18
bg = cv2.erode(dg, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2*R+1, 2*R+1)))
bg = cv2.GaussianBlur(bg, (0, 0), 8)
bg = np.minimum(bg, dg)
dep = np.zeros((GH, GW, 3), np.uint8)
dep[..., 2] = np.round(dg*255); dep[..., 1] = np.round(bg*255)  # BGR: R=fg, G=bg
cv2.imwrite('/tmp/depth3d.png', dep)
subprocess.run(['cwebp', '-quiet', '-lossless', '-z', '9', '/tmp/depth3d.png', '-o', f'{out}/depth.webp'], check=True)

# background colour: inpaint the band where the foreground was pushed back
hw, hh = W//2, H//2
small = cv2.resize(col, (hw, hh), interpolation=cv2.INTER_AREA)
diff = cv2.resize(dg - bg, (hw, hh), interpolation=cv2.INTER_LINEAR)
mask = (diff > 0.045).astype(np.uint8) * 255
mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)), iterations=2)

# seed: dilate known far pixels into the hole so Telea/NS have landscape colour to pull from
known = cv2.bitwise_not(mask)
far = cv2.bitwise_and(small, small, mask=known)
far_blur = cv2.GaussianBlur(far, (0, 0), 6)
# avoid dark zeros bleeding: fill hole with blurred far colour first
seed = small.copy()
hole = mask > 0
seed[hole] = far_blur[hole]

# coarse Telea, then NS for structure, then a light Telea polish
bgc = cv2.inpaint(seed, mask, 7, cv2.INPAINT_TELEA)
bgc = cv2.inpaint(bgc, mask, 5, cv2.INPAINT_NS)
bgc = cv2.inpaint(bgc, mask, 3, cv2.INPAINT_TELEA)
# mild bilateral so inpainted patches keep edges of lake/sky without looking smeared
bgc = cv2.bilateralFilter(bgc, 5, 40, 40)
# feather the seam: mix inpainted hole with lightly softened original around the rim
rim = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=2)
rim = cv2.subtract(rim, mask)
rim_f = (rim.astype(np.float32) / 255.0)[..., None]
soft = cv2.GaussianBlur(small, (0, 0), 1.5)
bgc = (bgc.astype(np.float32) * (1 - rim_f) + soft.astype(np.float32) * rim_f).astype(np.uint8)

cv2.imwrite('/tmp/bg.png', bgc)
cv2.imwrite('proof/bg-inpainted.jpg', bgc)
cv2.imwrite('proof/bg-mask.png', mask)
subprocess.run(['avifenc', '-q', '45', '-s', '4', '-j', 'all', '/tmp/bg.png', f'{out}/bg.avif'], check=True, capture_output=True)
subprocess.run(['cwebp', '-quiet', '-q', '65', '/tmp/bg.png', '-o', f'{out}/bg.webp'], check=True)
cv2.imwrite(f'{out}/bg.jpg', bgc, [cv2.IMWRITE_JPEG_QUALITY, 72])

# foreground colour for the 3D layer: upscaled if available, capped at 4096 tall (phone GPU texture limit).
# Without an upscaled source, keep any existing painting-3d.* so a bg/depth rebuild does not downgrade them.
if up or not os.path.exists(f'{out}/painting-3d.avif'):
    c3 = cv2.imread(up) if up else col
    th = min(4096, c3.shape[0]); tw = round(th * W / H)
    tw -= tw % 2
    c3 = cv2.resize(c3, (tw, th), interpolation=cv2.INTER_AREA)
    cv2.imwrite('/tmp/c3.png', c3)
    subprocess.run(['avifenc', '-q', '50', '-s', '4', '-j', 'all', '/tmp/c3.png', f'{out}/painting-3d.avif'], check=True, capture_output=True)
    subprocess.run(['cwebp', '-quiet', '-q', '70', '-m', '6', '/tmp/c3.png', '-o', f'{out}/painting-3d.webp'], check=True)
    cv2.imwrite(f'{out}/painting-3d.jpg', cv2.resize(c3, (1536, round(1536*th/tw)), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 74, cv2.IMWRITE_JPEG_PROGRESSIVE, 1])
    print('3d colour', tw, th)
else:
    print('3d colour kept (pass upscaled painting to rebuild)')
for f in sorted(os.listdir(out)): print(f, os.path.getsize(f'{out}/{f}'))
