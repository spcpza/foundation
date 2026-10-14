# Adds Renaissance detail to the phone's bare-earth ground: rock outcrops, earth strata, tufts, stones, at full resolution.
import sys, gc, torch, numpy as np
from PIL import Image, ImageFilter
from diffusers import StableDiffusionXLInpaintPipeline
seed, out = int(sys.argv[1]), sys.argv[2]
img = Image.open('/Users/f/Sites/foundation/src/grown/day-tall.png').convert('RGB'); W, H = img.size
fig = Image.open('/Users/f/Sites/foundation/src/masks/day-tall-figures-rift.png').convert('L').resize((W, H))
yy, xx = np.mgrid[0:H, 0:W]
m = np.clip((yy - 1600) / 120., 0, 1) * (1 - np.asarray(fig.filter(ImageFilter.MaxFilter(21)).filter(ImageFilter.GaussianBlur(8)), np.float32) / 255)
P = ("Leonardo da Vinci and Michelangelo, Renaissance landscape detail: weathered sandstone rock outcrops with cracks and ledges, "
     "layered earth strata of ochre and umber, tufts of dry grass and small plants, scattered pebbles and stones, a few sparse shrubs, "
     "receding misty valley with distant blue mountains, finely drawn, sharp painterly detail, muted earthy fresco palette, masterpiece")
N = ("people, figure, face, body, animal, flowers, roses, garden, path, road, houses, village, bright saturated colours, storybook, "
     "cartoon, illustration, 3d render, photo, text, frame, border, blurry, smooth, plain, empty")
pipe = StableDiffusionXLInpaintPipeline.from_pretrained("diffusers/stable-diffusion-xl-1.0-inpainting-0.1", torch_dtype=torch.float16, variant="fp16").to("mps")
pipe.enable_attention_slicing()
base = np.asarray(img, np.float32); res = np.zeros_like(base); acc = np.zeros((H, W, 1), np.float32)
ys = list(range(1500, H - 1024, 600)) + [H - 1024]; k = 0
for y0 in ys:
    for x0 in (0, (W - 1024) // 2, W - 1024):
        crop = img.crop((x0, y0, x0 + 1024, y0 + 1024))
        st = .62 if y0 > 2000 else .5
        r = pipe(prompt=P, negative_prompt=N, image=crop, mask_image=Image.new('L', (1024, 1024), 255), width=1024, height=1024,
                 num_inference_steps=36, guidance_scale=7.5, strength=st, generator=torch.Generator("cpu").manual_seed(seed + k)).images[0]
        w = np.ones((1024, 1024), np.float32); ramp = np.linspace(0, 1, 200)
        if y0 > 1500: w[:200] *= ramp[:, None]
        if y0 + 1024 < H: w[-200:] *= ramp[::-1][:, None]
        if x0 > 0: w[:, :200] *= ramp[None]
        if x0 + 1024 < W: w[:, -200:] *= ramp[::-1][None]
        res[y0:y0+1024, x0:x0+1024] += np.asarray(r, np.float32) * w[..., None]; acc[y0:y0+1024, x0:x0+1024] += w[..., None]
        k += 1; gc.collect(); torch.mps.empty_cache(); print('tile', k, flush=True)
fine = np.where(acc > 1e-3, res / np.maximum(acc, 1e-4), base)
final = base * (1 - m[..., None]) + fine * m[..., None]
Image.fromarray(np.clip(final, 0, 255).astype(np.uint8)).save(out)
Image.fromarray(np.clip(final, 0, 255).astype(np.uint8)).resize((486, 802)).save(out.replace('.png', '-s.jpg'), quality=85)
print('saved', flush=True)
