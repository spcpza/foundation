# A double image: the land below God, painted so that from afar its light and dark form the nervous system
# continuing from his brain-shaped mantle, while up close it is only a river valley, streams and ridges.
import sys, gc, torch, numpy as np
from PIL import Image, ImageFilter
from diffusers import StableDiffusionXLInpaintPipeline
seed, strength, out = int(sys.argv[1]), float(sys.argv[2]), sys.argv[3]
img = Image.open('aiv/ground-detail.png').convert('RGB'); W, H = img.size
nv = Image.open('aiv/nerves-light-mask.png').convert('L').resize((W, H))
fig = Image.open('/Users/f/Sites/foundation/src/masks/day-tall-figures-rift.png').convert('L').resize((W, H))
yy, xx = np.mgrid[0:H, 0:W]
# the hidden figure as light: the cord a wide river, the nerves streams; wider and softer the farther down (closer to us)
n1 = np.asarray(nv.filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.GaussianBlur(10)), np.float32) / 255
n2 = np.asarray(nv.filter(ImageFilter.MaxFilter(41)).filter(ImageFilter.GaussianBlur(30)), np.float32) / 255
light = np.clip(n1 * .8 + n2 * .5, 0, 1)
a = np.asarray(img, np.float32)
land = np.clip((yy - 1600) / 140., 0, 1) * (1 - np.asarray(fig.filter(ImageFilter.MaxFilter(21)).filter(ImageFilter.GaussianBlur(8)), np.float32) / 255)
shade = a * (.72 + .0 * light[..., None])                                         # the land a little darker
water = np.array([214, 210, 190], np.float32)                                      # water catching the sky
guide = shade * (1 - light[..., None]) + water * light[..., None]
init = a * (1 - land[..., None]) + guide * land[..., None]
I = Image.fromarray(np.clip(init, 0, 255).astype(np.uint8))
I.resize((486, round(486 * H / W))).save(out.replace('.png', '-guide.jpg'), quality=85)
P = ("High Renaissance landscape painting seen from above: a great river winding down a valley, branching into many streams and "
     "tributaries that catch the pale light of the sky, dark earthen ridges and fields between them, small trees along the banks, "
     "misty distance, muted earthy palette, Leonardo da Vinci, Michelangelo, masterpiece")
N = "people, figure, body, face, anatomy, nerves, veins, red, glowing, lightning, text, frame, border, blurry, cartoon, 3d render, photo"
pipe = StableDiffusionXLInpaintPipeline.from_pretrained("diffusers/stable-diffusion-xl-1.0-inpainting-0.1", torch_dtype=torch.float16, variant="fp16").to("mps")
pipe.enable_attention_slicing(); pipe.vae.enable_tiling()
mask = Image.fromarray((land * 255).astype(np.uint8))
gw, gh = 832, round(832 * H / W / 8) * 8
r = pipe(prompt=P, negative_prompt=N, image=I.resize((gw, gh), Image.LANCZOS), mask_image=mask.resize((gw, gh), Image.LANCZOS),
         width=gw, height=gh, num_inference_steps=40, guidance_scale=7.5, strength=strength, generator=torch.Generator("cpu").manual_seed(seed)).images[0]
g = np.asarray(r.resize((W, H), Image.LANCZOS), np.float32)
gc.collect(); torch.mps.empty_cache(); print('global', flush=True)
# full-resolution detail, tile by tile, gently
step = Image.fromarray(np.clip(init * (1 - land[..., None]) + g * land[..., None], 0, 255).astype(np.uint8))
res = np.zeros((H, W, 3), np.float32); acc = np.zeros((H, W, 1), np.float32); k = 0
for y0 in list(range(1500, H - 1024, 700)) + [H - 1024]:
    for x0 in (0, W - 1024):
        rr = pipe(prompt=P, negative_prompt=N, image=step.crop((x0, y0, x0 + 1024, y0 + 1024)), mask_image=Image.new('L', (1024, 1024), 255),
                  width=1024, height=1024, num_inference_steps=32, guidance_scale=7, strength=.3, generator=torch.Generator("cpu").manual_seed(seed + 9 + k)).images[0]
        w = np.ones((1024, 1024), np.float32); ramp = np.linspace(0, 1, 180)
        if y0 > 1500: w[:180] *= ramp[:, None]
        if y0 + 1024 < H: w[-180:] *= ramp[::-1][:, None]
        if x0 > 0: w[:, :180] *= ramp[None]
        if x0 + 1024 < W: w[:, -180:] *= ramp[::-1][None]
        res[y0:y0+1024, x0:x0+1024] += np.asarray(rr, np.float32) * w[..., None]; acc[y0:y0+1024, x0:x0+1024] += w[..., None]
        k += 1; gc.collect(); torch.mps.empty_cache(); print('tile', k, flush=True)
fine = np.where(acc > 1e-3, res / np.maximum(acc, 1e-4), np.asarray(step, np.float32))
final = a * (1 - land[..., None]) + fine * land[..., None]
F = Image.fromarray(np.clip(final, 0, 255).astype(np.uint8)); F.save(out)
F.resize((486, round(486 * H / W))).save(out.replace('.png', '-s.jpg'), quality=85)
F.resize((120, round(120 * H / W))).resize((486, round(486 * H / W)), Image.NEAREST).save(out.replace('.png', '-far.jpg'), quality=85)
print('saved', flush=True)
