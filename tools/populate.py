# Populates a painting's land the way a painter blocks in: dab tree masses and flower colour onto the hillside,
# then let the model paint them into trees and meadows. Also wipes small dark specks out of the bright sky.
# usage: .venv/bin/python populate.py <in.png> <figures.png> <out.png> <seed>
import sys, gc, torch, numpy as np
from PIL import Image, ImageFilter
from diffusers import StableDiffusionXLInpaintPipeline

src, figp, out, seed = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
img = np.asarray(Image.open(src).convert('RGB'), np.float32); H, W = img.shape[:2]
fig = np.asarray(Image.open(figp).convert('L').resize((W, H)), np.float32) / 255
rng = np.random.default_rng(seed)

def blurF(a, rad):
    h, w = a.shape; i_ = Image.fromarray(a.astype(np.float32), 'F')
    return np.asarray(i_.resize((max(2, w // rad), max(2, h // rad)), Image.BOX).resize((w, h), Image.BILINEAR), np.float32)

# 1. specks: small dark spots in bright sky (not figures) -> the local sky colour
L = img.mean(2)
local = blurF(L, 24)
speck = (L < local - 22) & (local > 150) & (fig < .05)
speck = np.asarray(Image.fromarray((speck * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7)), np.float32) / 255 > .5
sm = np.stack([blurF(img[..., c] * (~speck), 20) / np.maximum(blurF((~speck).astype(np.float32), 20), 1e-3) for c in range(3)], -1)
img[speck] = sm[speck]
print('specks wiped', int(speck.sum()), flush=True)

# 2. the land: below the middle, darker than the sky, away from the figures
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
land = (yy > H * .48) & (L < 185) & (blurF(fig, 30) < .02)
landf = np.asarray(Image.fromarray((land * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(9)), np.float32) / 255 > .5
sketch = img.copy()
for _ in range(70):                                                    # tree masses: dark greens, bigger near us
    tx, ty = rng.random() * W, H * (.5 + .5 * rng.random())
    if not landf[int(min(ty, H - 1)), int(min(tx, W - 1))]: continue
    r = 18 + 70 * (ty - H * .5) / (H * .5) * (.6 + .6 * rng.random())
    d = ((xx - tx) / r) ** 2 + ((yy - ty) / (r * 1.15)) ** 2
    blob = (d < 1) & landf
    shade = np.clip(1 - (yy - (ty - r)) / (2 * r), 0, 1)[..., None]        # lit from above
    col = np.array([38, 72, 34]) + np.array([60, 70, 30]) * shade
    sketch[blob] = (col * (.85 + .3 * rng.random()))[blob]
    trunk = (np.abs(xx - tx) < r * .1) & (yy > ty + r * .6) & (yy < ty + r * 1.5) & landf
    sketch[trunk] = [70, 50, 35]
for _ in range(900):                                                   # flowers in the near meadows
    fx, fy = rng.random() * W, H * (.72 + .28 * rng.random())
    if not landf[int(min(fy, H - 1)), int(min(fx, W - 1))]: continue
    rr = 4 + 6 * rng.random(); dot = ((xx - fx) ** 2 + (yy - fy) ** 2 < rr * rr)
    sketch[dot] = [[220, 60, 50], [240, 210, 80], [235, 235, 225], [150, 110, 200]][rng.integers(4)]
sketch = np.asarray(Image.fromarray(np.clip(sketch, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3)), np.float32)

pipe = StableDiffusionXLInpaintPipeline.from_pretrained("diffusers/stable-diffusion-xl-1.0-inpainting-0.1",
          torch_dtype=torch.float16, variant="fp16").to("mps")
pipe.enable_attention_slicing(); pipe.vae.enable_tiling()
sc = (1150 * 1150 / (W * H)) ** .5; gw, gh = round(W * sc / 8) * 8, round(H * sc / 8) * 8
mask = Image.fromarray((landf * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(16))
r = pipe(prompt=("Renaissance fresco painting of the garden of Eden: green hills with full leafy trees and cypresses, meadows "
                 "of wild flowers, soft light, chalky matte fresco texture, rich detail"),
         negative_prompt="people, figure, face, body, animal close-up, text, signature, letters, watermark, frame, border, photo, "
                         "3d render, cartoon, flat colours, vector, blurry, mud, smear",
         image=Image.fromarray(sketch.astype(np.uint8)).resize((gw, gh), Image.LANCZOS), mask_image=mask.resize((gw, gh), Image.LANCZOS),
         width=gw, height=gh, num_inference_steps=40, guidance_scale=8, strength=.7,
         generator=torch.Generator("cpu").manual_seed(seed)).images[0]
g = np.asarray(r.resize((W, H), Image.LANCZOS), np.float32)
m = np.asarray(mask, np.float32)[..., None] / 255
fs = np.asarray(Image.fromarray((fig * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2)), np.float32)[..., None] / 255
final = (img * (1 - m) + g * m) * (1 - fs) + img * fs
Image.fromarray(np.clip(final, 0, 255).astype(np.uint8)).save(out)
Image.fromarray(np.clip(sketch, 0, 255).astype(np.uint8)).resize((W // 3, H // 3)).save(out.replace('.png', '-sketch.jpg'))
print('saved', out, flush=True)
