# Second pass on the tablecloth's two ends, so the whole table hangs evenly to the floor like the middle.
import gc, torch, numpy as np
from PIL import Image, ImageFilter
from diffusers import StableDiffusionXLInpaintPipeline
img = Image.open('ls/supper-drape.png').convert('RGB'); W, H = img.size
Y0, Y1 = 1078, 1262
a = np.asarray(img, np.float32).copy()
mid = a[Y0:Y1, 1000:1500]                                       # the good middle: tile it across the ends as the start
for x0 in list(range(115, 1000, 500)) + list(range(1500, 2465, 500)):
    w = min(500, 2465 - x0, (1000 - x0) if x0 < 1000 else 500)
    a[Y0:Y1, x0:x0 + w] = mid[:, :w]
pre = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
m = np.zeros((H, W), np.float32); m[Y0 - 10:Y1 + 6, 109:1010] = 1; m[Y0 - 10:Y1 + 6, 1490:2471] = 1
mask = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(4))
P = ("Leonardo da Vinci, The Last Supper fresco: the long white linen tablecloth hanging straight down to the floor in soft vertical "
     "folds, opaque cloth, even hem just above the floor, faded fresco texture, masterpiece")
N = "transparent, see-through, table legs, bench, feet, legs, people, wood, door, text, blurry, ghost"
pipe = StableDiffusionXLInpaintPipeline.from_pretrained("diffusers/stable-diffusion-xl-1.0-inpainting-0.1", torch_dtype=torch.float16, variant="fp16").to("mps")
pipe.enable_attention_slicing()
out = np.asarray(pre, np.float32).copy()
for k, x0 in enumerate((0, 1576)):
    y0 = H - 1024
    crop = pre.crop((x0, y0, x0 + 1024, y0 + 1024)); mc = mask.crop((x0, y0, x0 + 1024, y0 + 1024))
    r = pipe(prompt=P, negative_prompt=N, image=crop, mask_image=mc, width=1024, height=1024, num_inference_steps=40,
             guidance_scale=8, strength=.75, generator=torch.Generator("cpu").manual_seed(51 + k)).images[0]
    mm = np.asarray(mc, np.float32)[..., None] / 255
    out[y0:y0+1024, x0:x0+1024] = out[y0:y0+1024, x0:x0+1024] * (1 - mm) + np.asarray(r, np.float32) * mm
    gc.collect(); torch.mps.empty_cache(); print('tile', k + 1, flush=True)
F = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)); F.save('ls/supper-drape2.png')
t = Image.open('/Users/f/Sites/foundation/src/grown/supper-tall.png').convert('RGB')
cc = F.crop((520, 0, 2080, H)).resize((2000, round(H * 2000 / 1560)), Image.LANCZOS)
dm = Image.new('L', (W, H), 0); dm.paste(255, (109, Y0 - 14, 2471, Y1 + 6)); dm = dm.filter(ImageFilter.GaussianBlur(4))
mc2 = dm.crop((520, 0, 2080, H)).resize((2000, round(H * 2000 / 1560)), Image.LANCZOS)
big = Image.new('RGB', (2000, cc.height + 1650)); big.paste(cc, (0, 900)); bm = Image.new('L', big.size, 0); bm.paste(mc2, (0, 900))
big = big.crop((50, 208, 1930, 208 + t.height)); bm = bm.crop((50, 208, 1930, 208 + t.height))
t.paste(big, (0, 0), bm); t.save('ls/supper-tall-drape2.png')
F.crop((0, 820, 2600, 1355)).resize((1300, 268)).save('ls/drape2-full.jpg', quality=85); print('saved', flush=True)
