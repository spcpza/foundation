# Grows a fresco into a whole painting in two passes, so nothing looks pasted on:
#   1. one global outpaint: the model sees the entire enlarged canvas at once (coherent composition)
#   2. one unifying pass over everything except Michelangelo's figures (his bare plaster included),
#      so sky and ground share one surface and no frame edge survives
#   then the figures are laid back exactly, cut from the original along their own edges.
# usage: .venv/bin/python whole.py <day|night> <outdir> <seeds e.g. 1,2,3>
import sys, os, gc, torch, numpy as np
from collections import deque
from PIL import Image, ImageFilter
from diffusers import StableDiffusionXLInpaintPipeline

job, outdir, seeds = sys.argv[1], sys.argv[2], [int(s) for s in sys.argv[3].split(',')]
os.makedirs(outdir, exist_ok=True)
SRC = '/Users/f/Sites/foundation/src/'
NEG = ("bird, raven, crow, club, stick, weapon, tool, object, dots, spots, specks, petals, confetti, nude, naked, crowd, cherubs, angels, putti, flying babies, people, person, figure, man, woman, child, face, body, limbs, hands, "
       "frame, border, architecture, column, panel, text, signature, watermark, photo, modern, 3d render, cartoon, "
       "flat colours, vector, desert, seam, collage, split image, vignette, halo, oval, circle, planet")
if job == 'day':
    im = Image.open(SRC + 'michelangelo-adam.jpg').convert('RGB')
    im = im.crop((0, round(im.height * .035), im.width, im.height))
    im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
    W, H = 2000, round(im.height * 3.2); ox, oy = (W - im.width) // 2, round((H - im.height) * .45)
    PROMPT = ("Italian Renaissance fresco painting of an empty sky and landscape, pale luminous heavens, soft drifting "
              "clouds, a green grassy hillside and brown earth below, soft distant blue mountains, chalky matte fresco "
              "texture, muted warm colours, nobody")
    holes = [(0, .885, .175, 1.)]
else:
    im = Image.open(SRC + 'michelangelo-sun-moon.jpg').convert('RGB')
    im = im.resize((1100, round(im.height * 1100 / im.width)), Image.LANCZOS)
    W, H = round(im.width * 1.75), round(im.height * 2.8); ox, oy = round((W - im.width) * .52), round((H - im.height) * .5)
    PROMPT = ("Italian Renaissance fresco painting of an empty heavenly sky, pale luminous heavens, soft drifting clouds, "
              "warm golden light, chalky matte fresco texture, muted warm colours, nobody")
    holes = []

a = np.asarray(im, np.float32)
canvas = np.zeros((H, W, 3), np.float32); known = np.zeros((H, W), bool)
canvas[oy:oy + im.height, ox:ox + im.width] = a; known[oy:oy + im.height, ox:ox + im.width] = True
for u0, v0, u1, v1 in holes:
    known[oy + round(v0 * im.height):oy + round(v1 * im.height), ox + round(u0 * im.width):ox + round(u1 * im.width)] = False

# Michelangelo's figures (and Adam's hill): everything in the fresco that is not bare plaster
L = a.mean(2) / 255; sat = (a.max(2) - a.min(2)) / 255
cand = (sat < .13) & (L > .5)
bg = np.zeros_like(cand); q = deque()
h, w = cand.shape
for y in range(h):
    for x in (0, w - 1):
        if cand[y, x]: bg[y, x] = True; q.append((y, x))
for x in range(w):
    for y in (0, h - 1):
        if cand[y, x] and not bg[y, x]: bg[y, x] = True; q.append((y, x))
while q:
    y, x = q.popleft()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < h and 0 <= nx < w and cand[ny, nx] and not bg[ny, nx]: bg[ny, nx] = True; q.append((ny, nx))
# keep only the large shapes (the figures, Adam's hill); small stains and cracks in the plaster get repainted
keepf = ~bg; lab = np.zeros(keepf.shape, np.int32); n_ = 0; sizes = {}
for y0_ in range(h):
    for x0_ in range(w):
        if keepf[y0_, x0_] and not lab[y0_, x0_]:
            n_ += 1; lab[y0_, x0_] = n_; q2 = deque([(y0_, x0_)]); c_ = 0
            while q2:
                y_, x_ = q2.popleft(); c_ += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y_ + dy, x_ + dx
                    if 0 <= ny < h and 0 <= nx < w and keepf[ny, nx] and not lab[ny, nx]: lab[ny, nx] = n_; q2.append((ny, nx))
            sizes[n_] = c_
big = np.array([0] + [sizes[i] > h * w * .01 for i in range(1, n_ + 1)])
keepf = big[lab].astype(bool)
fig = np.zeros((H, W), np.float32); fig[oy:oy + h, ox:ox + w] = keepf.astype(np.float32)
fig[~known] = 0
edge = np.ones((H, W), np.float32); m_ = 70
yy0, xx0 = np.mgrid[0:H, 0:W]
dfr = np.minimum.reduce([xx0 - ox, ox + im.width - 1 - xx0, yy0 - oy, oy + im.height - 1 - yy0]).astype(np.float32)
fig *= np.clip(dfr / m_, 0, 1)
figm = Image.fromarray((fig * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(3))   # soft near the frame
Image.fromarray((fig * 255).astype(np.uint8)).save(f'{outdir}/{job}-figures.png')

if job == 'night':   # the sun: mirror Michelangelo's half of it to make it whole
    s = im.width / 925; cx, cy, r = ox + round(37 * s), oy, round(205 * s)
    yy, xx = np.mgrid[0:H, 0:W]
    disc = (xx - cx) ** 2 + (yy - cy) ** 2 < r * r
    up = disc & (yy < cy); my = np.clip(2 * cy - yy, 0, H - 1)
    src_ok = known[my, xx]
    canvas[up & src_ok] = canvas[my[up & src_ok], xx[up & src_ok]]; known |= up & src_ok
    lf = disc & (xx < ox); mx = np.clip(2 * cx - xx, 0, W - 1)
    ok2 = known[yy, mx] & lf
    canvas[ok2] = canvas[yy[ok2], mx[ok2]]; known |= ok2

if job == 'night':   # the moon sits on the fresco's right edge: mirror his half of it to make it whole
    mcx, mcy, mr = ox + .951 * im.width, oy + .318 * im.height, .134 * im.width
    yy, xx = np.mgrid[0:H, 0:W]
    beyond = ((xx - mcx) ** 2 + (yy - mcy) ** 2 < mr * mr) & ~known
    mx = np.clip(np.round(2 * mcx - xx), 0, W - 1).astype(int)
    ok3 = beyond & known[yy, mx]
    canvas[ok3] = canvas[yy[ok3], mx[ok3]]; known |= ok3
    # paint the moon whole, as he did: a pale disc with a soft grey rim, so nothing else is invented where God points
    dd = np.sqrt((xx - mcx) ** 2 + (yy - mcy) ** 2) / mr
    disc = dd < 1.0
    rng = np.random.default_rng(5); mott = np.asarray(Image.fromarray((rng.random((64, 64)) * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC), np.float32)[..., None] / 255
    moonc = np.array([236, 234, 222], np.float32) * (1 - .08 * dd[..., None] ** 2) * (.97 + .06 * mott)
    rim = np.clip(1 - np.abs(dd - .97) / .03, 0, 1)[..., None]
    moonc = moonc * (1 - rim * .3)
    canvas[disc] = moonc[disc]; known |= disc
    fig[(xx - mcx) ** 2 + (yy - mcy) ** 2 < mr * mr] = 1
    figm = Image.fromarray((fig * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(3))
def blurF(arr, rad):
    hh, ww = arr.shape; i_ = Image.fromarray(arr.astype(np.float32), 'F')
    return np.asarray(i_.resize((max(2, ww // rad), max(2, hh // rad)), Image.BOX).resize((ww, hh), Image.BILINEAR), np.float32)
# start the unknown from the nearest known colours, spread outward
base = canvas.copy(); have = known.copy(); wgt = known.astype(np.float32)
for rad in (16, 48, 140, 400, 1000):
    num = np.stack([blurF(canvas[..., c] * wgt, rad) for c in range(3)], -1); den = blurF(wgt, rad)[..., None]
    ok = (den[..., 0] > .02) & ~have; base[ok] = (num / np.maximum(den, 1e-4))[ok]; have |= ok
base[~have] = canvas[known].mean(0)
pre = np.where(known[..., None], canvas, np.asarray(Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(20)), np.float32))

pipe = StableDiffusionXLInpaintPipeline.from_pretrained("diffusers/stable-diffusion-xl-1.0-inpainting-0.1",
          torch_dtype=torch.float16, variant="fp16").to("mps")
pipe.enable_attention_slicing(); pipe.vae.enable_tiling()
sc = (1100 * 1100 / (W * H)) ** .5; gw, gh = round(W * sc / 8) * 8, round(H * sc / 8) * 8
def run(img, mask, strength, seed, steps=34):
    r = pipe(prompt=PROMPT, negative_prompt=NEG, image=img.resize((gw, gh), Image.LANCZOS), mask_image=mask.resize((gw, gh), Image.LANCZOS),
             width=gw, height=gh, num_inference_steps=steps, guidance_scale=7.5, strength=strength,
             generator=torch.Generator("cpu").manual_seed(seed)).images[0]
    gc.collect(); torch.mps.empty_cache()
    return np.asarray(r.resize((W, H), Image.LANCZOS), np.float32)

unk = Image.fromarray(((~known) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(31)).filter(ImageFilter.GaussianBlur(12))
inner = np.clip((dfr - 60) / 160, 0, 1) * known                                   # 0 at the frame edge -> 1 deep inside
keepw = np.maximum(np.asarray(figm, np.float32) / 255, inner).astype(np.float32)
keepm = Image.fromarray((keepw * 255).astype(np.uint8))
not_fig = Image.eval(keepm.filter(ImageFilter.MinFilter(1)).filter(ImageFilter.GaussianBlur(6)), lambda v: 255 - v)
fsoft = np.asarray(keepm.filter(ImageFilter.GaussianBlur(2)), np.float32)[..., None] / 255
for seed in seeds:
    g1 = run(Image.fromarray(pre.astype(np.uint8)), unk, 1.0, seed)
    u = np.asarray(unk, np.float32)[..., None] / 255
    step1 = np.where(known[..., None], canvas * (1 - u) + g1 * u, g1)
    # wipe the plaster's stains and cracks to clean plaster first, so the unifying pass has nothing to turn into things
    stain = np.zeros((H, W), bool); stain[oy:oy + h, ox:ox + w] = ~cand & ~keepf
    pale = np.zeros((H, W), np.float32); pale[oy:oy + h, ox:ox + w] = cand
    wpale = np.where(known, pale, 1.).astype(np.float32)
    num = np.stack([blurF(step1[..., c] * wpale, 24) for c in range(3)], -1); den = blurF(wpale, 24)[..., None]
    step1 = np.where(stain[..., None], num / np.maximum(den, 1e-3), step1)
    g2 = run(Image.fromarray(np.clip(step1, 0, 255).astype(np.uint8)), not_fig, 0.5, seed + 100, steps=40)
    final = g2 * (1 - fsoft) + canvas * fsoft                                   # his figures, exactly
    # trim any flat strip the model laid along the bottom or top
    rows = final.std(1).mean(1); good = np.where(rows > 6)[0]
    t0, t1 = good.min(), good.max()
    while t1 > H * .8 and final[t1 - 40:t1].std() < 9: t1 -= 40
    final = final[t0:t1 + 1]
    Image.fromarray(np.clip(final, 0, 255).astype(np.uint8)).save(f'{outdir}/{job}-{seed}.png')
    print('trim', t0, t1, flush=True)
    print('saved', f'{outdir}/{job}-{seed}.png', (W, H), 'fresco at', (ox, oy, im.width, im.height), flush=True)
