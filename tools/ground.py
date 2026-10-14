# Repaints the ground of the phone's day picture as Michelangelo's world: bare primordial earth, sculptural slopes,
# muted ochre / umber / grey-green, a pale distant plain; the figures untouched. One global pass, then full-res refinement.
import sys, gc, torch, numpy as np
from PIL import Image, ImageFilter
from diffusers import StableDiffusionXLInpaintPipeline
seed = int(sys.argv[1]); out = sys.argv[2]
img = Image.open('/Users/f/Sites/foundation/src/grown/day-tall.png').convert('RGB'); W, H = img.size
fig = Image.open('/Users/f/Sites/foundation/src/masks/day-tall-figures-rift.png').convert('L').resize((W, H))
yy, xx = np.mgrid[0:H, 0:W]
m = np.clip((yy - 1560) / 90., 0, 1)                                       # everything below Adam's hill
m = np.maximum(m, np.clip((yy - 1430) / 90., 0, 1) * np.clip((xx - 1000) / 120., 0, 1))   # and the ground beneath God
m *= 1 - np.asarray(fig.filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.GaussianBlur(6)), np.float32) / 255
mask = Image.fromarray((m * 255).astype(np.uint8))
# start from the current ground, blurred and quieted: keep its light, lose its storybook details
base = img.filter(ImageFilter.GaussianBlur(28))
bn = np.asarray(base, np.float32); l = bn.mean(2, keepdims=True); bn = l + (bn - l) * .55
bn = bn * np.array([1.0, .96, .86]) 
init = Image.composite(Image.fromarray(np.clip(bn, 0, 255).astype(np.uint8)), img, mask)
P = ("Michelangelo, Sistine Chapel ceiling fresco: the bare primordial earth on the day of creation, sculptural sweeping slopes of "
     "ochre and umber earth, grey-green rock, a few sparse dark tufts, a pale misty plain stretching to soft distant hills, "
     "monumental and quiet, muted earthy fresco palette, chalky buon fresco texture, masterpiece")
N = ("flowers, roses, garden, path, road, trees, forest, bushes, houses, village, people, figure, animal, bright colours, saturated, "
     "storybook, children's book, cartoon, illustration, fantasy, 3d render, photo, text, frame, border")
pipe = StableDiffusionXLInpaintPipeline.from_pretrained("diffusers/stable-diffusion-xl-1.0-inpainting-0.1", torch_dtype=torch.float16, variant="fp16").to("mps")
pipe.enable_attention_slicing(); pipe.vae.enable_tiling()
gw, gh = 832, round(832 * H / W / 8) * 8
r = pipe(prompt=P, negative_prompt=N, image=init.resize((gw, gh), Image.LANCZOS), mask_image=mask.resize((gw, gh), Image.LANCZOS),
         width=gw, height=gh, num_inference_steps=40, guidance_scale=7.5, strength=.9, generator=torch.Generator("cpu").manual_seed(seed)).images[0]
g1 = np.asarray(r.resize((W, H), Image.LANCZOS), np.float32)
mm = (m)[..., None]
step = np.asarray(img, np.float32) * (1 - mm) + g1 * mm
gc.collect(); torch.mps.empty_cache(); print('global', flush=True)
# full-resolution refinement, tile by tile, inside the same mask
res = np.zeros((H, W, 3), np.float32); acc = np.zeros((H, W, 1), np.float32)
s_img = Image.fromarray(np.clip(step, 0, 255).astype(np.uint8))
ys = list(range(1380, H - 1024, 700)) + [H - 1024]; k = 0
for y0 in ys:
    for x0 in (0, W - 1024):
        crop = s_img.crop((x0, y0, x0 + 1024, y0 + 1024))
        rr = pipe(prompt=P, negative_prompt=N, image=crop, mask_image=Image.new('L', (1024, 1024), 255), width=1024, height=1024,
                  num_inference_steps=32, guidance_scale=7, strength=.32, generator=torch.Generator("cpu").manual_seed(seed + 10 + k)).images[0]
        w = np.ones((1024, 1024), np.float32); ramp = np.linspace(0, 1, 180)
        if y0 > 1380: w[:180] *= ramp[:, None]
        if y0 + 1024 < H: w[-180:] *= ramp[::-1][:, None]
        if x0 > 0: w[:, :180] *= ramp[None]
        if x0 + 1024 < W: w[:, -180:] *= ramp[::-1][None]
        res[y0:y0+1024, x0:x0+1024] += np.asarray(rr, np.float32) * w[..., None]; acc[y0:y0+1024, x0:x0+1024] += w[..., None]
        k += 1; gc.collect(); torch.mps.empty_cache(); print('tile', k, flush=True)
fine = np.where(acc > 1e-3, res / np.maximum(acc, 1e-4), step)
final = np.asarray(img, np.float32) * (1 - mm) + fine * mm
Image.fromarray(np.clip(final, 0, 255).astype(np.uint8)).save(out)
Image.fromarray(np.clip(final, 0, 255).astype(np.uint8)).resize((486, 802)).save(out.replace('.png', '-s.jpg'), quality=85)
print('saved', out, flush=True)
