# Extends the Last Supper's tablecloth down to the floor along the whole table, covering the feet beneath it,
# then carries the same change into the phone's tall version.
import gc, torch, numpy as np
from PIL import Image, ImageFilter
from diffusers import StableDiffusionXLInpaintPipeline
img = Image.open('/Users/f/Sites/foundation/src/grown/supper.png').convert('RGB'); W, H = img.size
X0, X1, Y0, Y1 = 115, 2465, 1078, 1262                     # table ends; cloth hem now; the floor line
a = np.asarray(img, np.float32).copy()
# start the hang from the cloth itself: its lower band stretched down, slowly shading toward the floor
band = a[Y0 - 60:Y0 - 8, X0:X1].mean(0)
for y in range(Y0 - 8, Y1):
    t = (y - Y0) / (Y1 - Y0)
    a[y, X0:X1] = band * (1 - .28 * t)
pre = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
m = np.zeros((H, W), np.float32); m[Y0 - 14:Y1 + 6, X0 - 6:X1 + 6] = 1
mask = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(5))
P = ("Leonardo da Vinci, The Last Supper fresco: the long white linen tablecloth hanging straight down to the floor in soft vertical "
     "folds and pleats, faded fresco texture, soft shadow at the hem, masterpiece")
N = "feet, legs, people, shoes, table legs, bench, wood, door, text, blurry"
pipe = StableDiffusionXLInpaintPipeline.from_pretrained("diffusers/stable-diffusion-xl-1.0-inpainting-0.1", torch_dtype=torch.float16, variant="fp16").to("mps")
pipe.enable_attention_slicing()
out = np.asarray(pre, np.float32).copy(); res = np.zeros_like(out); acc = np.zeros((H, W, 1), np.float32)
xs = list(range(X0 - 100, X1 - 924, 760)) + [X1 - 924]; k = 0
for x0 in xs:
    x0 = max(0, min(W - 1024, x0)); y0 = H - 1024
    crop = pre.crop((x0, y0, x0 + 1024, y0 + 1024)); mc = mask.crop((x0, y0, x0 + 1024, y0 + 1024))
    r = pipe(prompt=P, negative_prompt=N, image=crop, mask_image=mc, width=1024, height=1024, num_inference_steps=40,
             guidance_scale=7.5, strength=.95, generator=torch.Generator("cpu").manual_seed(31 + k)).images[0]
    w = np.ones((1024, 1024), np.float32); ramp = np.linspace(0, 1, 160)
    if x0 > 0: w[:, :160] *= ramp[None]
    if x0 + 1024 < W: w[:, -160:] *= ramp[::-1][None]
    res[y0:y0+1024, x0:x0+1024] += np.asarray(r, np.float32) * w[..., None]; acc[y0:y0+1024, x0:x0+1024] += w[..., None]
    k += 1; gc.collect(); torch.mps.empty_cache(); print('tile', k, flush=True)
fine = np.where(acc > 1e-3, res / np.maximum(acc, 1e-4), out)
mm = np.asarray(mask, np.float32)[..., None] / 255
final = np.asarray(img, np.float32) * (1 - mm) + fine * mm
F = Image.fromarray(np.clip(final, 0, 255).astype(np.uint8)); F.save('ls/supper-drape.png')
# the same change in the tall version (centre crop x 520..2080 scaled x1.282, pasted at y 900, cropped 50..1930 / 208..)
t = Image.open('/Users/f/Sites/foundation/src/grown/supper-tall.png').convert('RGB')
cc = F.crop((520, 0, 2080, H)).resize((2000, round(H * 2000 / 1560)), Image.LANCZOS)
mc = mask.crop((520, 0, 2080, H)).resize((2000, round(H * 2000 / 1560)), Image.LANCZOS)
big = Image.new('RGB', (2000, cc.height + 1650)); big.paste(cc, (0, 900)); bm = Image.new('L', big.size, 0); bm.paste(mc, (0, 900))
big = big.crop((50, 208, 1930, 208 + t.height)); bm = bm.crop((50, 208, 1930, 208 + t.height))
t.paste(big, (0, 0), bm); t.save('ls/supper-tall-drape.png')
F.crop((900, 820, 1700, 1355)).save('ls/drape-check.jpg'); print('saved', flush=True)
