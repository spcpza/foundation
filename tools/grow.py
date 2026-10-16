# Grows a fresco into a whole painting, a window at a time, so every new stretch is painted with
# plenty of Michelangelo's own work in view (no "sticker on paper").
# usage: .venv/bin/python grow.py <job> <out.png>      jobs: day | night
#   day   = The Creation of Adam, grown to a master that serves a 16:9 screen and a tall phone
#   night = The Creation of the Sun and Moon (cropped to God, sun, moon), likewise
import sys, gc, torch, numpy as np
from PIL import Image, ImageFilter
from diffusers import StableDiffusionXLInpaintPipeline

job, out = sys.argv[1], sys.argv[2]
SRC = '/Users/f/Sites/foundation/src/'
NEG = ("cherubs, angels, putti, flying babies, people, person, figure, man, woman, child, baby, cherub, angel, putto, face, body, limbs, hands, "
       "frame, border, architecture, column, cornice, text, signature, watermark, photo, modern, blurry, "
       "seam, collage, split image, vignette, halo, oval, circle")
STYLE = "Michelangelo, Sistine Chapel ceiling fresco, buon fresco, High Renaissance, soft matte fresco colours, empty landscape and sky, masterpiece"

if job == 'day':
    im = Image.open(SRC + 'michelangelo-adam.jpg').convert('RGB')
    im = im.crop((0, round(im.height * .035), im.width, im.height))           # the frame's edge along the top
    im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
    W, H = 2000, round(im.height * 2.9)                                        # room for a phone's height, and sides
    ox, oy = (W - im.width) // 2, round((H - im.height) * .5)
    PROMPT = {'top': "pale luminous heavens, soft drifting clouds, warm plaster-coloured sky",
              'bottom': "earthen hillside, green grass and ochre earth, rocks, the ground beneath the sky",
              'left': "Adam's green hillside, distant soft blue mountains, pale sky",
              'right': "pale luminous heavens, soft clouds, warm plaster-coloured sky"}
    holes = [(0, .885, .175, 1.)]                                               # a fragment of another figure
else:
    im = Image.open(SRC + 'michelangelo-sun-moon.jpg').convert('RGB')
    im = im.resize((1100, round(im.height * 1100 / im.width)), Image.LANCZOS)
    W, H = round(im.width * 1.75), round(im.height * 2.55)
    ox, oy = round((W - im.width) * .52), round((H - im.height) * .55)
    PROMPT = {'top': "pale luminous heavens, soft clouds, the light of the great golden sun",
              'bottom': "soft clouds of heaven, pale luminous sky",
              'left': "pale luminous heavens, soft clouds, the great golden sun",
              'right': "pale luminous heavens, soft clouds, the pale moon"}
    holes = []

canvas = np.zeros((H, W, 3), np.float32); known = np.zeros((H, W), bool)
a = np.asarray(im, np.float32)
canvas[oy:oy + im.height, ox:ox + im.width] = a; known[oy:oy + im.height, ox:ox + im.width] = True
for u0, v0, u1, v1 in holes:
    known[oy + round(v0 * im.height):oy + round(v1 * im.height), ox + round(u0 * im.width):ox + round(u1 * im.width)] = False

if job == 'night':
    # the sun: Michelangelo painted its lower half; mirror his rings up to make it whole
    s = im.width / 955
    cx, cy, r = ox + round(37 * s), oy, round(205 * s)
    for y in range(max(0, cy - r), cy):
        for x in range(max(0, cx - r), min(W, cx + r)):
            if (x - cx) ** 2 + (y - cy) ** 2 < r * r:
                my = 2 * cy - y
                if my < H and known[my, x]: canvas[y, x] = canvas[my, x]; known[y, x] = True
    # and the part of the sun beyond the fresco's left edge, mirrored across its centre
    for y in range(max(0, cy - r), min(H, cy + r)):
        for x in range(max(0, cx - r), ox):
            if (x - cx) ** 2 + (y - cy) ** 2 < r * r:
                mx = 2 * cx - x
                if 0 <= mx < W and known[y, mx]: canvas[y, x] = canvas[y, mx]; known[y, x] = True

pipe = StableDiffusionXLInpaintPipeline.from_pretrained("diffusers/stable-diffusion-xl-1.0-inpainting-0.1",
          torch_dtype=torch.float16, variant="fp16").to("mps")
pipe.enable_attention_slicing(); pipe.vae.enable_tiling()
gen = torch.Generator("cpu").manual_seed(7)

def blurF(a, rad):
    # a wide soft blur for float images: shrink, then grow back smoothly
    h, w = a.shape; im_ = Image.fromarray(a.astype(np.float32), 'F')
    small = im_.resize((max(2, w // rad), max(2, h // rad)), Image.BOX)
    return np.asarray(small.resize((w, h), Image.BILINEAR), np.float32)

def step(x0, y0, side, win=1024):
    """Paint the unknown pixels in one window, matching tones to the known paint beside them."""
    global canvas, known
    x0 = int(min(max(0, x0), W - win)); y0 = int(min(max(0, y0), H - win))
    kn = known[y0:y0 + win, x0:x0 + win]
    if kn.all(): return
    img = canvas[y0:y0 + win, x0:x0 + win].copy()
    # start the holes from the nearest known colours (spread outward ring by ring), softly blurred
    base = img.copy(); have = kn.copy()
    w = kn.astype(np.float32)
    for rad in (16, 48, 140, 400):
        num = np.stack([blurF(img[..., c] * w, rad) for c in range(3)], -1)
        den = blurF(w, rad)[..., None]
        ok = (den[..., 0] > .02) & ~have
        base[ok] = (num / np.maximum(den, 1e-4))[ok]; have |= ok
    base[~have] = img[kn].mean(0)
    base = np.where(kn[..., None], img, np.asarray(Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(12)), np.float32))
    mask = Image.fromarray(((~kn) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(25)).filter(ImageFilter.GaussianBlur(8))
    res = pipe(prompt=f"{STYLE}, {PROMPT[side]}", negative_prompt=NEG,
               image=Image.fromarray(base.astype(np.uint8)), mask_image=mask, width=win, height=win,
               num_inference_steps=30, guidance_scale=7.5, strength=0.99, generator=gen).images[0]
    r = np.asarray(res, np.float32)
    # match the new paint's tone to the known paint along the seam
    edge = np.asarray(Image.fromarray((kn * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(49)), bool) & ~kn
    ring = np.asarray(Image.fromarray((~kn * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(49)), bool) & kn
    if edge.sum() > 100 and ring.sum() > 100:
        mu_r, sd_r = r[edge].mean(0), r[edge].std(0) + 1e-3
        mu_k, sd_k = img[ring].mean(0), img[ring].std(0) + 1e-3
        r = np.where(~kn[..., None], (r - mu_r) / sd_r * (sd_k * .5 + sd_r * .5) + mu_k, r)
    soft = np.asarray(mask, np.float32)[..., None] / 255
    soft = np.where(kn[..., None], soft * .7, 1.)                          # new paint; a narrow blend into the old edge
    canvas[y0:y0 + win, x0:x0 + win] = img * (1 - soft) + np.clip(r, 0, 255) * soft
    known[y0:y0 + win, x0:x0 + win] = True
    gc.collect(); torch.mps.empty_cache()
    Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8)).save(out.replace('.png', '-progress.jpg'), quality=85)
    print('painted', side, x0, y0, flush=True)

# grow out from the fresco: holes first, then the sides, then the bands above and below, a window at a time
if holes and job == 'day':
    step(ox - 200, oy + im.height - 900, 'bottom')
WIN, ST = 1024, 640
for side in ('left', 'right'):
    while True:
        cols = np.where(known.any(0))[0]
        if side == 'left' and cols.min() <= 0: break
        if side == 'right' and cols.max() >= W - 1: break
        xk = cols.min() if side == 'left' else cols.max()
        for y in range(max(0, oy - 200), min(H, oy + im.height + 200) - WIN // 3, ST):
            step(xk - WIN + 380 if side == 'left' else xk - 380, y, side)
for side in ('top', 'bottom'):
    while True:
        rows = np.where(known.all(1))[0]
        if side == 'top' and (known[0].all()): break
        if side == 'bottom' and (known[-1].all()): break
        yk = np.where(known.any(1))[0].min() if side == 'top' else np.where(known.any(1))[0].max()
        # first row that is not fully known on that side
        for x in list(range(0, W - WIN, ST)) + [W - WIN]:
            step(x, yk - WIN + 380 if side == 'top' else yk - 380, side)
        if side == 'top' and known[:yk].all(): pass
Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8)).save(out)
print('saved', out, (W, H), 'fresco at', (ox, oy, im.width, im.height), flush=True)
