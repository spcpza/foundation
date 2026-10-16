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
NEG = ("mountains, land, ground, sea, water, horizon, landscape, bird, raven, crow, club, stick, weapon, tool, object, petals, confetti, nude, naked, crowd, cherubs, angels, putti, flying babies, people, person, figure, man, woman, child, face, body, limbs, hands, "
       "frame, border, architecture, column, panel, text, signature, watermark, photo, modern, 3d render, cartoon, "
       "flat colours, vector, desert, seam, collage, split image, vignette, halo, oval, circle, planet")
if job == 'day':
    im = Image.open(SRC + 'michelangelo-adam.jpg').convert('RGB')
    im = im.crop((0, round(im.height * .035), im.width, im.height))
    im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
    W, H = 2000, 3400; ox, oy = (W - im.width) // 2, round((H - im.height) * .42)
    PROMPT = ("Renaissance fresco landscape painting in morning light: blue sky with soft white clouds, distant blue "
              "mountains, green rolling hills with dark leafy trees, a winding silver river, meadows of small flowers, "
              "chalky matte fresco texture, harmonious colours, no people")
    holes = [(0, .885, .175, 1.)]
else:
    im = Image.open(SRC + 'michelangelo-sun-moon.jpg').convert('RGB')
    im = im.resize((1100, round(im.height * 1100 / im.width)), Image.LANCZOS)
    W, H = round(im.width * 1.75), 3300; ox, oy = round((W - im.width) * .54), round((H - im.height) * .4)
    PROMPT = ("Renaissance fresco painting of the heavens at night: deep dark blue sky full of small stars, swirling "
              "clouds touched with golden light and silver moonlight, endless sky in every direction, chalky matte fresco "
              "texture, deep blues, gold and silver, no people, no land")
    NEG_EXTRA = True
    holes = []

a = np.asarray(im, np.float32)
canvas = np.zeros((H, W, 3), np.float32); known = np.zeros((H, W), bool)
canvas[oy:oy + im.height, ox:ox + im.width] = a; known[oy:oy + im.height, ox:ox + im.width] = True
for u0, v0, u1, v1 in holes:
    known[oy + round(v0 * im.height):oy + round(v1 * im.height), ox + round(u0 * im.width):ox + round(u1 * im.width)] = False

# Michelangelo's figures (and Adam's hill): everything in the fresco that is not bare plaster
L = a.mean(2) / 255; sat = (a.max(2) - a.min(2)) / 255
cand = (sat < .13) & (L > .5)
# bare plaster = large pale, smooth regions (a painted border can stop a flood from the edge, so judge by size)
def components(mask_):
    lab_ = np.zeros(mask_.shape, np.int32); sz = [0]; hh_, ww_ = mask_.shape
    for y0_ in range(hh_):
        for x0_ in range(ww_):
            if mask_[y0_, x0_] and not lab_[y0_, x0_]:
                n2 = len(sz); lab_[y0_, x0_] = n2; qq = deque([(y0_, x0_)]); c2 = 0
                while qq:
                    y_, x_ = qq.popleft(); c2 += 1
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = y_ + dy, x_ + dx
                        if 0 <= ny < hh_ and 0 <= nx < ww_ and mask_[ny, nx] and not lab_[ny, nx]: lab_[ny, nx] = n2; qq.append((ny, nx))
                sz.append(c2)
    return lab_, np.array(sz)
h, w = cand.shape
labc, szc = components(cand)
bg = (szc > h * w * .02)[labc] & cand
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
fig *= np.clip(dfr / (m_ * 2), 0, 1)                                   # fade over a wider band, so edges get continued
figm = Image.fromarray((fig * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(3))   # soft near the frame
Image.fromarray((fig * 255).astype(np.uint8)).save(f'{outdir}/{job}-figures.png')

if job == 'night':   # the sun: mirror Michelangelo's half of it to make it whole
    s = im.width / 925; cx, cy, r = ox + round(37 * s), oy, round(205 * s)
    yy, xx = np.mgrid[0:H, 0:W]
    disc = (xx - cx) ** 2 + (yy - cy) ** 2 < r * r
    sun_disc = disc.copy()
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
    fig[sun_disc] = 1                                                          # and the sun is his too: keep it
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

def underpaint():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32); rng = np.random.default_rng(11)
    nz = np.asarray(Image.fromarray((rng.random((H // 40 + 2, W // 40 + 2)) * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC), np.float32) / 255
    out = np.zeros((H, W, 3), np.float32)
    if job == 'night':
        t = (yy / H)[..., None]
        out[:] = np.array([8, 14, 50]) * (1 - t) + np.array([16, 26, 74]) * t
        out *= .8 + .4 * nz[..., None]
        sx, sy = ox + 37 * im.width / 925, oy                                              # light spreading from the sun
        glow = np.exp(-((xx - sx) ** 2 + (yy - sy) ** 2) / (2 * (.22 * W) ** 2))[..., None]
        out = out * (1 - glow * .5) + np.array([120, 90, 50]) * glow * .5
        for k in range(9):                                                                # great clouds catching the light
            cx_, cy_ = rng.random() * W, rng.random() * H; r_ = (.08 + .1 * rng.random()) * W
            cl = np.exp(-(((xx - cx_) / (r_ * 1.8)) ** 2 + ((yy - cy_) / r_) ** 2))[..., None] * (.4 + .6 * nz[..., None])
            out = out * (1 - cl * .55) + np.array([70, 80, 120]) * cl * .55
        star = rng.random((H, W)) > .9982
        out[star] = [240, 236, 210]
    else:
        hz = oy + .36 * im.height                                                         # the far mountains behind Adam
        t = np.clip(yy / hz, 0, 1)[..., None]
        out[:] = np.array([70, 120, 190]) * (1 - t) + np.array([220, 225, 215]) * t
        mt = hz - .035 * H * (.5 + .5 * np.sin(xx / W * 9 + 2))
        out[(yy > mt)] = [120, 140, 180]
        hl = hz + .05 * H + 30 * np.sin(xx / W * 6)
        land = yy > hl
        g = np.array([92, 128, 62]) + np.array([40, 30, 10]) * nz[..., None]
        out[land] = g[land] * (1 - .25 * np.clip((yy[land] - hl[land]) / H, 0, 1))[..., None]
        rc = W * (.62 + .18 * np.sin((yy - hl) / H * 6))                                  # a river winding toward us
        rw = 20 + .06 * (yy - hl)
        out[land & (np.abs(xx - rc) < rw)] = [190, 205, 215]
        for k in range(26):                                                              # tree masses on the hills
            tx, ty = rng.random() * W, hl[0, 0] + (.05 + rng.random() * .5) * (H - hl[0, 0])
            r = 25 + 60 * (ty - hl[0, 0]) / H * 2
            out[((xx - tx) ** 2 + ((yy - ty) * 1.3) ** 2 < r * r)] = [40, 70, 38]
    return np.asarray(Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(22)), np.float32)

pipe = StableDiffusionXLInpaintPipeline.from_pretrained("diffusers/stable-diffusion-xl-1.0-inpainting-0.1",
          torch_dtype=torch.float16, variant="fp16").to("mps")
pipe.enable_attention_slicing(); pipe.vae.enable_tiling()
sc = (1150 * 1150 / (W * H)) ** .5; gw, gh = round(W * sc / 8) * 8, round(H * sc / 8) * 8
def run(img, mask, strength, seed, steps=34):
    r = pipe(prompt=PROMPT, negative_prompt=NEG, image=img.resize((gw, gh), Image.LANCZOS), mask_image=mask.resize((gw, gh), Image.LANCZOS),
             width=gw, height=gh, num_inference_steps=steps, guidance_scale=7.5, strength=strength,
             generator=torch.Generator("cpu").manual_seed(seed)).images[0]
    gc.collect(); torch.mps.empty_cache()
    return np.asarray(r.resize((W, H), Image.LANCZOS), np.float32)

unk = Image.fromarray(((~known) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(31)).filter(ImageFilter.GaussianBlur(12))
inner = np.clip((dfr - 60) / 160, 0, 1) * known                                   # 0 at the frame edge -> 1 deep inside
keepw = (np.asarray(figm, np.float32) / 255).astype(np.float32)                    # only his figures are kept exactly
keepm = Image.fromarray((keepw * 255).astype(np.uint8))
not_fig = Image.eval(keepm.filter(ImageFilter.MinFilter(1)).filter(ImageFilter.GaussianBlur(6)), lambda v: 255 - v)
fsoft = np.asarray(keepm.filter(ImageFilter.GaussianBlur(2)), np.float32)[..., None] / 255
for seed in seeds:
    sketch = underpaint()
    pre2 = np.where(known[..., None], canvas, sketch)
    g1 = run(Image.fromarray(np.clip(pre2, 0, 255).astype(np.uint8)), unk, 0.93, seed)
    u = np.asarray(unk, np.float32)[..., None] / 255
    step1 = np.where(known[..., None], canvas * (1 - u) + g1 * u, g1)
    # wipe the plaster's stains and cracks to clean plaster first, so the unifying pass has nothing to turn into things
    # his bare plaster takes on the world's tone (at night: the night sky), so the unifying pass paints it as part of it
    plas = (known.astype(np.float32) * (1 - np.asarray(figm.filter(ImageFilter.GaussianBlur(3)), np.float32) / 255))[..., None]   # every non-figure pixel in the frame
    wout = (~known).astype(np.float32)                                  # the new world's colour, carried in from outside the frame
    tone = np.zeros_like(g1); got = np.zeros((H, W), bool)
    for rad in (80, 200, 500, 1200):                                     # reach further until there is sky to borrow
        den_o = blurF(wout, rad); ok_ = (den_o > .03) & ~got
        num_o = np.stack([blurF(g1[..., c] * wout, rad) for c in range(3)], -1)
        tone[ok_] = (num_o / np.maximum(den_o, 1e-3)[..., None])[ok_]; got |= ok_
    tone[~got] = g1[~known].mean(0)
    k_ = 1.0 if job == 'night' else .45
    rng2 = np.random.default_rng(seed); grain = (rng2.random((H, W, 1)) - .5) * 14          # the sky's own grain, so it is not a flat patch
    step1 = step1 * (1 - plas * k_) + (tone + grain) * plas * k_
    # the model likes to paint a frame line where the old frame was: cover a band either side of it with sky before unifying
    if job == 'night':
        band = (np.abs(dfr) < 48) & (np.asarray(figm, np.float32) < 128)
        bsoft = np.asarray(Image.fromarray((band * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(10)), np.float32)[..., None] / 255
        step1 = step1 * (1 - bsoft) + (tone + grain) * bsoft
    stain = np.zeros((H, W), bool); stain[oy:oy + h, ox:ox + w] = ~cand & ~keepf
    pale = np.zeros((H, W), np.float32); pale[oy:oy + h, ox:ox + w] = cand
    wpale = np.where(known, pale, 1.).astype(np.float32)
    num = np.stack([blurF(step1[..., c] * wpale, 24) for c in range(3)], -1); den = blurF(wpale, 24)[..., None]
    step1 = np.where(stain[..., None], np.where(den > .05, num / np.maximum(den, 1e-3), step1), step1)
    if os.environ.get('DEBUG'):
        Image.fromarray(np.clip(step1, 0, 255).astype(np.uint8)).resize((W // 4, H // 4)).save(f'{outdir}/dbg-step1.jpg')
        not_fig.resize((W // 4, H // 4)).save(f'{outdir}/dbg-notfig.jpg')
        Image.fromarray(np.clip(g1, 0, 255).astype(np.uint8)).resize((W // 4, H // 4)).save(f'{outdir}/dbg-g1.jpg')
        print('debug saved', flush=True); sys.exit(0)
    g2 = run(Image.fromarray(np.clip(step1, 0, 255).astype(np.uint8)), not_fig, 0.72 if job == 'night' else 0.5, seed + 100, steps=40)
    # near the figures the old plaster held cracks the model liked to turn into things: there, take only g2's smooth tone
    smooth = np.stack([blurF(g2[..., c], 28) for c in range(3)], -1)
    near = (inner * (1 - fsoft[..., 0]))[..., None] * (0. if job == 'night' else 1.)   # at night the heavens run unbroken through the old frame
    g2 = g2 * (1 - near) + smooth * near
    final = g2 * (1 - fsoft) + canvas * fsoft                                   # his figures, exactly
    # trim any flat strip the model laid along the bottom or top
    rows = final.std(1).mean(1); good = np.where(rows > 6)[0]
    t0, t1 = good.min(), good.max()
    while t1 > H * .8 and final[t1 - 40:t1].std() < 9: t1 -= 40
    final = final[t0:t1 + 1]
    Image.fromarray(np.clip(final, 0, 255).astype(np.uint8)).save(f'{outdir}/{job}-{seed}.png')
    print('trim', t0, t1, flush=True)
    print('saved', f'{outdir}/{job}-{seed}.png', (W, H), 'fresco at', (ox, oy, im.width, im.height), flush=True)
