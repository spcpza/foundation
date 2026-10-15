# The double image, properly: the land below God painted as an ordinary Renaissance landscape, while a ControlNet
# (QR-monster) holds the nervous system in its light and dark, so it appears from afar.
import sys, gc, torch, numpy as np
from PIL import Image, ImageFilter
from diffusers import StableDiffusionXLControlNetInpaintPipeline, ControlNetModel
scale, seed, out = float(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
img = Image.open('aiv/ground-detail.png').convert('RGB'); W, H = img.size
nv = Image.open(sys.argv[4] if len(sys.argv) > 4 else 'aiv/nerves-bold.png').convert('L').resize((W, H))
fig = Image.open('/Users/f/Sites/foundation/src/masks/day-tall-figures-rift.png').convert('L').resize((W, H))
yy, xx = np.mgrid[0:H, 0:W]
land = np.clip((yy - 1600) / 140., 0, 1) * (1 - np.asarray(fig.filter(ImageFilter.MaxFilter(21)).filter(ImageFilter.GaussianBlur(8)), np.float32) / 255)
# the hidden figure: thick, soft, on mid grey (what this ControlNet reads best)
sh = np.asarray(nv.filter(ImageFilter.GaussianBlur(4)), np.float32) / 255
ctrl = (85 + 160 * np.clip(sh, 0, 1)) * (yy > 1560) + 128 * (yy <= 1560)
ctrl = Image.fromarray(ctrl.astype(np.uint8)).convert('RGB')
cn = ControlNetModel.from_pretrained('/Users/f/outpaint/models/qr-monster-fp16', torch_dtype=torch.float16)
pipe = StableDiffusionXLControlNetInpaintPipeline.from_pretrained("diffusers/stable-diffusion-xl-1.0-inpainting-0.1", controlnet=cn,
          torch_dtype=torch.float16, variant="fp16").to("mps")
pipe.enable_attention_slicing(); pipe.vae.enable_tiling()
P = ("High Renaissance landscape painting, Leonardo da Vinci: a vast valley seen from above, a winding river with many branching "
     "streams, ridges and ravines, rocks, small trees along the banks, fields, misty distance, muted earthy palette, fine detail, masterpiece")
N = "signature, writing, inscription, letters, people, figure, body, face, nerves, anatomy, veins, glowing, neon, text, frame, border, blurry, cartoon, 3d render, photo"
gw, gh = 704, round(704 * H / W / 8) * 8
# the shape painted in first, as pale streams over the land, so the model paints over it rather than from noise
ai = np.asarray(img, np.float32); stream = np.array([212, 205, 180], np.float32)
k = (np.clip(sh, 0, 1) * float(sys.argv[6] if len(sys.argv) > 6 else .75) * land)[..., None]
img = Image.fromarray(np.clip(ai * (1 - k) + stream * k, 0, 255).astype(np.uint8))
mask = Image.fromarray((land * 255).astype(np.uint8))
r = pipe(prompt=P, negative_prompt=N, image=img.resize((gw, gh), Image.LANCZOS), mask_image=mask.resize((gw, gh), Image.LANCZOS),
         control_image=ctrl.resize((gw, gh), Image.LANCZOS), width=gw, height=gh, num_inference_steps=30, guidance_scale=7.5,
         strength=float(sys.argv[5]) if len(sys.argv) > 5 else .8, controlnet_conditioning_scale=scale, control_guidance_end=.85,
         generator=torch.Generator("cpu").manual_seed(seed)).images[0]
g = np.asarray(r.resize((W, H), Image.LANCZOS), np.float32)
a = np.asarray(Image.open('aiv/ground-detail.png').convert('RGB'), np.float32)
final = a * (1 - land[..., None]) + g * land[..., None]
F = Image.fromarray(np.clip(final, 0, 255).astype(np.uint8)); F.save(out)
F.resize((486, round(486 * H / W))).save(out.replace('.png', '-s.jpg'), quality=85)
F.resize((97, round(97 * H / W))).filter(ImageFilter.GaussianBlur(1)).resize((486, round(486 * H / W))).save(out.replace('.png', '-far.jpg'), quality=85)
print('saved', out, flush=True)
