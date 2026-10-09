"""Swap the painting: .venv/bin/python tools/build_images.py <source image>
Writes public/img/painting-{small,full}.{avif,webp,jpg}, public/og.jpg, and updates
index.html (width/height + blurred placeholder). Camera path is chosen by aspect in app.js."""
import sys, subprocess, base64, io, re, os
from PIL import Image
src = sys.argv[1]
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
pub = os.path.join(root, 'public'); img_dir = os.path.join(pub, 'img'); os.makedirs(img_dir, exist_ok=True)
for f in os.listdir(img_dir):
    if f.startswith('painting-'): os.remove(os.path.join(img_dir, f))
a = Image.open(src).convert('RGB'); W, H = a.size
portrait = H > W
small_w = 720 if portrait else 1000
sizes = [(small_w, 'small'), (W, 'full')]
tmp = '/tmp/_painting'
srcset = {}
for w, tag in sizes:
    im = a if w == W else a.resize((w, round(H * w / W)), Image.LANCZOS)
    png = f'{tmp}-{tag}.png'; im.save(png)
    base = os.path.join(img_dir, f'painting-{tag}')
    im.save(base + '.jpg', quality=80, optimize=True, progressive=True)
    subprocess.run(['cwebp', '-quiet', '-q', '72', '-m', '6', png, '-o', base + '.webp'], check=True)
    subprocess.run(['avifenc', '-q', '52', '-s', '4', '-j', 'all', png, base + '.avif'], check=True, capture_output=True)
    srcset[tag] = w
# og image 1200x630, centred on the upper-middle (hands) region
ow = W; oh = round(W * 630 / 1200)
cy = round(H * (0.42 if portrait else 0.5)); y0 = max(0, min(H - oh, cy - oh // 2))
a.crop((0, y0, ow, y0 + oh)).resize((1200, 630), Image.LANCZOS).save(os.path.join(pub, 'og.jpg'), quality=78, optimize=True, progressive=True)
t = a.resize((18, round(18 * H / W)) if portrait else (32, round(32 * H / W)), Image.LANCZOS)
b = io.BytesIO(); t.save(b, 'JPEG', quality=60)
lqip = 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()
p = os.path.join(pub, 'index.html'); h = open(p).read()
h = re.sub(r"background-image:url\('[^']*'\)", f"background-image:url('{lqip}')", h)
h = re.sub(r'(<img id="painting"[^>]*?)width="\d+" height="\d+"', rf'\1width="{W}" height="{H}"', h)
for ext in ('avif', 'webp', 'jpg'):
    h = re.sub(rf'/img/painting-[\w]+\.{ext} (\d+)w, /img/painting-[\w]+\.{ext} (\d+)w',
               f'/img/painting-small.{ext} {srcset["small"]}w, /img/painting-full.{ext} {srcset["full"]}w', h)
h = re.sub(r'src="/img/painting-[\w]+\.jpg"', 'src="/img/painting-full.jpg"', h)
h = re.sub(r'sizes="[^"]*"', 'sizes="' + ('(orientation: portrait) 60vh, 56vh' if portrait else '(orientation: portrait) 400vw, 100vw') + '"', h)
open(p, 'w').write(h)
print(W, H, 'portrait' if portrait else 'landscape', len(b.getvalue()), 'B placeholder')
for f in sorted(os.listdir(img_dir)): print(f, os.path.getsize(os.path.join(img_dir, f)))
