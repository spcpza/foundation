# Continues the "brain" of God's mantle downward as a nervous system: a spinal cord from the brain stem with branching
# nerves, sketched as crimson mantle-cloth, then painted in Michelangelo's manner. Works on the tall day picture.
import sys, gc, numpy as np
from PIL import Image, ImageDraw, ImageFilter
src, out = sys.argv[1], sys.argv[2]; paint = len(sys.argv) > 3 and sys.argv[3] == 'paint'
img = Image.open(src).convert('RGB'); W, H = img.size
rng = np.random.default_rng(7)
S = 4                                                    # draw supersampled for smooth edges
shape = Image.new('L', (W * S // 2, H * S // 2), 0); dl = ImageDraw.Draw(shape)
col = Image.new('RGB', shape.size, (0, 0, 0)); dc = ImageDraw.Draw(col)
k = S / 2
def stroke(pts, w0, w1, shade):
    n = len(pts)
    for i in range(n - 1):
        t = i / (n - 1); w = (w0 + (w1 - w0) * t) * k
        (xa, ya), (xb, yb) = pts[i], pts[i + 1]
        dl.line([(xa * k, ya * k), (xb * k, yb * k)], fill=255, width=max(1, int(w)))
        dl.ellipse([xb * k - w / 2, yb * k - w / 2, xb * k + w / 2, yb * k + w / 2], fill=255)
        c = tuple(int(v) for v in np.array([178, 66, 58]) * shade * (1.12 - .3 * t))
        dc.line([(xa * k, ya * k), (xb * k, yb * k)], fill=c, width=max(1, int(w)))
        dc.ellipse([xb * k - w / 2, yb * k - w / 2, xb * k + w / 2, yb * k + w / 2], fill=c)
def curve(x0, y0, ang, L, bend, n=40):
    pts = [(x0, y0)]; a = ang
    for i in range(n):
        a += bend / n + rng.normal(0, .025); x0 += np.cos(a) * L / n; y0 += np.sin(a) * L / n; pts.append((x0, y0))
    return pts
# the spinal cord
top, bot = 1585, H - 60
ys = np.linspace(top, bot, 120); xs = 1440 + 70 * np.sin((ys - top) / (bot - top) * 2.4) - 40 * (ys - top) / (bot - top)
cord = list(zip(xs, ys))[:int(.72 * 120)]; stroke(cord, 120, 70, 1.0)
cord = list(zip(xs, ys))
# nerves, as in the body: long plexus nerves at the shoulders (toward the arms), short ones between the ribs,
# the lumbar nerves, then the cord parting into the two great nerves of the legs
def pair(f, L, ang0, bend, w0, nb):
    j = int(f * 119); cx, cy = cord[j]
    for side in (-1, 1):
        ang = np.pi / 2 - side * ang0
        pts = curve(cx, cy, ang, L * rng.uniform(.9, 1.1), side * bend); stroke(pts, w0, 2.5, .92)
        for _ in range(nb):
            q = pts[int(rng.uniform(.3, .85) * len(pts))]
            bp = curve(q[0], q[1], ang + side * rng.uniform(.25, .7), L * rng.uniform(.25, .45), side * .6, 22); stroke(bp, w0 * .45, 4, .85)
pair(.05, 600, 1.42, 1.0, 46, 2)            # brachial plexus: out toward the arms, drooping
pair(.11, 520, 1.30, .9, 38, 2)
for f in np.linspace(.2, .5, 4):            # between the ribs
    pair(f, rng.uniform(220, 300), 1.15, .5, 24, 0)
pair(.58, 330, 1.0, .5, 28, 1)              # lumbar
pair(.64, 380, .9, .45, 30, 1)
# the cord parts into the two great nerves of the legs
j = int(.7 * 119); cx, cy = cord[j]
for side in (-1, 1):
    pts = curve(cx, cy, np.pi / 2 - side * .28, (H - 60 - cy) * 1.02, side * -.18, 50); stroke(pts, 70, 30, .95)
    for f in (.25, .5, .72):
        q = pts[int(f * len(pts))]
        bp = curve(q[0], q[1], np.pi / 2 - side * rng.uniform(.6, 1.0), rng.uniform(140, 240), side * .4, 22); stroke(bp, 18, 4, .85)
shape = shape.resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.2)); col = col.resize((W, H), Image.LANCZOS)
# light from the upper left: lit edge, shadowed edge
sh = np.asarray(shape, np.float32) / 255
gy, gx = np.gradient(np.asarray(shape.filter(ImageFilter.GaussianBlur(4)), np.float32))
lit = np.clip((-gx - gy) * .02, -1, 1)[..., None]
c = np.asarray(col, np.float32); c = c * (1 + .5 * lit) + 50 * np.clip(lit, 0, 1)
yy_, xx_ = np.mgrid[0:H, 0:W]
folds = .5 + .5 * np.sin(yy_ * .045 + xx_ * .02 + 3 * np.sin(yy_ * .006))
c = c * (.78 + .38 * folds[..., None])
a = np.asarray(img, np.float32)
sketch = a * (1 - sh[..., None]) + c * sh[..., None]
S_ = Image.fromarray(np.clip(sketch, 0, 255).astype(np.uint8))
S_.save(out.replace('.png', '-sketch.png')); S_.resize((486, round(486 * H / W))).save(out.replace('.png', '-sketch.jpg'), quality=85)
shape.save(out.replace('.png', '-mask.png'))
if paint:
    import torch
    from diffusers import StableDiffusionXLInpaintPipeline
    P = ("Michelangelo, Sistine Chapel ceiling fresco: God's great crimson mantle continuing downward as one long twisting length of heavy drapery, "
         "billowing folds branching off to either side and parting into two at the bottom, deep sculptural folds, strong light from the upper left, "
         "rose highlights and dark crimson shadows, monumental, buon fresco texture, masterpiece")
    N = "person, figure, hand, arm, face, body, ghost, transparent, see-through, blood, gore, medical illustration, text, blurry, cartoon, 3d render, photo"
    pipe = StableDiffusionXLInpaintPipeline.from_pretrained("diffusers/stable-diffusion-xl-1.0-inpainting-0.1", torch_dtype=torch.float16, variant="fp16").to("mps")
    pipe.enable_attention_slicing()
    mk = shape.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(2))
    res = np.asarray(S_, np.float32).copy(); acc = np.zeros((H, W, 1), np.float32); fine = np.zeros_like(res)
    ys0 = list(range(1450, H - 1024, 700)) + [H - 1024]; kk = 0
    for y0 in ys0:
        for x0 in (max(0, int(xs.mean()) - 512 - 380), max(0, int(xs.mean()) - 512 + 380)):
            x0 = min(W - 1024, x0)
            crop = S_.crop((x0, y0, x0 + 1024, y0 + 1024)); mc = mk.crop((x0, y0, x0 + 1024, y0 + 1024))
            r = pipe(prompt=P, negative_prompt=N, image=crop, mask_image=mc, width=1024, height=1024, num_inference_steps=40,
                     guidance_scale=7.5, strength=.42, generator=torch.Generator("cpu").manual_seed(40 + kk)).images[0]
            w = np.ones((1024, 1024), np.float32); ramp = np.linspace(0, 1, 160)
            w[:160] *= ramp[:, None]; w[-160:] *= ramp[::-1][:, None]; w[:, :160] *= ramp[None]; w[:, -160:] *= ramp[::-1][None]
            fine[y0:y0+1024, x0:x0+1024] += np.asarray(r, np.float32) * w[..., None]; acc[y0:y0+1024, x0:x0+1024] += w[..., None]
            kk += 1; gc.collect(); torch.mps.empty_cache(); print('tile', kk, flush=True)
    fm = np.where(acc > 1e-3, fine / np.maximum(acc, 1e-4), res)
    mm = np.asarray(mk, np.float32)[..., None] / 255
    final = res * (1 - mm) + fm * mm
    Image.fromarray(np.clip(final, 0, 255).astype(np.uint8)).save(out)
    Image.fromarray(np.clip(final, 0, 255).astype(np.uint8)).resize((486, round(486 * H / W))).save(out.replace('.png', '-s.jpg'), quality=85)
    print('saved', flush=True)
