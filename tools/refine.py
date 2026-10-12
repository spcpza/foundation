# Refines a grown painting without starting over: (1) melt the old plaster around the figures into the
# world's own colour and repaint everything but the figures as one surface; (2) populate a region of it.
# usage: .venv/bin/python refine.py <in.png> <figures.png> <out.png> <seed>
import sys, gc, torch, numpy as np
from PIL import Image, ImageFilter
from diffusers import StableDiffusionXLInpaintPipeline

src, figp, out, seed = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
img = np.asarray(Image.open(src).convert('RGB'), np.float32); H, W = img.shape[:2]
fig = np.asarray(Image.open(figp).convert('L').resize((W, H)), np.float32) / 255
fig = np.asarray(Image.fromarray((fig * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(5)), np.float32) / 255
NEG = ("people, person, figure, man, woman, child, face, body, nude, cherub, angel, bird, animal close-up, frame, border, "
       "text, signature, letters, watermark, photo, modern, 3d render, cartoon, flat colours, vector, seam, collage")
STYLE = "Renaissance fresco painting, chalky matte fresco texture, soft harmonious colours, rich detail"

def blurF(a, rad):
    h, w = a.shape; i_ = Image.fromarray(a.astype(np.float32), 'F')
    return np.asarray(i_.resize((max(2, w // rad), max(2, h // rad)), Image.BOX).resize((w, h), Image.BILINEAR), np.float32)

pipe = StableDiffusionXLInpaintPipeline.from_pretrained("diffusers/stable-diffusion-xl-1.0-inpainting-0.1",
          torch_dtype=torch.float16, variant="fp16").to("mps")
pipe.enable_attention_slicing(); pipe.vae.enable_tiling()
sc = (1150 * 1150 / (W * H)) ** .5; gw, gh = round(W * sc / 8) * 8, round(H * sc / 8) * 8
def run(im, mask, prompt, strength, sd):
    r = pipe(prompt=prompt, negative_prompt=NEG, image=Image.fromarray(np.clip(im, 0, 255).astype(np.uint8)).resize((gw, gh), Image.LANCZOS),
             mask_image=mask.resize((gw, gh), Image.LANCZOS), width=gw, height=gh, num_inference_steps=40, guidance_scale=7.5,
             strength=strength, generator=torch.Generator("cpu").manual_seed(sd)).images[0]
    gc.collect(); torch.mps.empty_cache()
    return np.asarray(r.resize((W, H), Image.LANCZOS), np.float32)

# the pale old plaster: bright, unsaturated, not figure, near the figures
L = img.mean(2) / 255; sat = (img.max(2) - img.min(2)) / 255
pale = ((sat < .14) & (L > .62)).astype(np.float32) * (1 - fig)
near = blurF(fig, 120) > .02
pale *= near
pale = np.asarray(Image.fromarray((pale * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(14)), np.float32) / 255
# the world's colour there, carried in from what is not pale
w_ = 1 - np.clip(pale * 2, 0, 1); tone = np.zeros_like(img); got = np.zeros((H, W), bool)
for rad in (60, 160, 400):
    den = blurF(w_, rad); ok = (den > .05) & ~got
    num = np.stack([blurF(img[..., c] * w_, rad) for c in range(3)], -1)
    tone[ok] = (num / np.maximum(den, 1e-3)[..., None])[ok]; got |= ok
tone[~got] = img[w_ > .5].mean(0)
rng = np.random.default_rng(seed); grain = (rng.random((H, W, 1)) - .5) * 12
k = (pale * .75)[..., None]
step = img * (1 - k) + (tone + grain) * k
notfig = Image.fromarray(((1 - fig) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(4))
p1 = "the sky and the land around them, soft clouds, luminous light, " + STYLE
g = run(step, notfig, p1, .5, seed)
fs = np.asarray(Image.fromarray((fig * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2)), np.float32)[..., None] / 255
g = g * (1 - fs) + img * fs
Image.fromarray(np.clip(g, 0, 255).astype(np.uint8)).save(out.replace('.png', '-blend.png'))
print('blended', flush=True)
# populate the land below the figures: trees, meadows, a river, flowers
yy = np.mgrid[0:H, 0:W][0].astype(np.float32)
land = ((yy > H * .5) & (img.mean(2) < 200)).astype(np.float32) * (1 - np.clip(blurF(fig, 30) * 3, 0, 1))
lm = Image.fromarray((land * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(24))
p2 = ("green rolling hills of the garden of Eden with full leafy trees, olive and cypress trees, meadows of wild flowers, "
      "a winding river shining in the light, paths, distant blue hills, " + STYLE)
g2 = run(g, lm, p2, .62, seed + 50)
g2 = g2 * (1 - fs) + img * fs
Image.fromarray(np.clip(g2, 0, 255).astype(np.uint8)).save(out)
print('saved', out, flush=True)
