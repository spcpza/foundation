# Prepares Leonardo's Last Supper: repaints the 17th-century doorway cut through the bottom of the wall
# (and the damaged bottom edge) so the scene is whole, at working resolution 2600 wide.
import gc, torch, numpy as np
from PIL import Image, ImageDraw, ImageFilter
from diffusers import StableDiffusionXLInpaintPipeline
Image.MAX_IMAGE_PIXELS = None
im = Image.open('ls/supper.jpg').convert('RGB'); im = im.resize((2600, round(im.height * 2600 / im.width)), Image.LANCZOS)
W, H = im.size
m = Image.new('L', (W, H), 0); d = ImageDraw.Draw(m)
d.rectangle([int(W * .345), int(H * .735), int(W * .625), H], fill=255)          # the doorway and its arch, up to the cloth's hem
d.rectangle([0, int(H * .945), W, H], fill=255)                                 # damaged bottom edge
m = m.filter(ImageFilter.GaussianBlur(10))
pipe = StableDiffusionXLInpaintPipeline.from_pretrained("diffusers/stable-diffusion-xl-1.0-inpainting-0.1", torch_dtype=torch.float16, variant="fp16").to("mps")
pipe.enable_attention_slicing()
P = ("Leonardo da Vinci, The Last Supper fresco: the long white tablecloth hanging straight down to below the table edge in soft folds, beneath it the dark "
     "wooden trestle legs of the table, the bare feet of the apostles and of Christ, the plain floor of the room in shadow, "
     "faded fresco texture, masterpiece")
N = "door, doorway, arch, archway, opening, niche, window, wooden frame, box, stone frame, wall, text, people standing, blurry"
for x0 in (int(W * .28), int(W * .48)):
    for y0 in (H - 1024,):
        x0c = min(W - 1024, x0); crop = im.crop((x0c, y0, x0c + 1024, y0 + 1024)); mc = m.crop((x0c, y0, x0c + 1024, y0 + 1024))
        r = pipe(prompt=P, negative_prompt=N, image=crop, mask_image=mc, width=1024, height=1024, num_inference_steps=40,
                 guidance_scale=7.5, strength=.99, generator=torch.Generator("cpu").manual_seed(5)).images[0]
        im.paste(r, (x0c, y0), mc); gc.collect(); torch.mps.empty_cache(); print('tile', x0c, flush=True)
for x0 in range(0, W, 900):                                                        # the bottom edge, all along
    x0c = min(W - 1024, x0); crop = im.crop((x0c, H - 1024, x0c + 1024, H)); mc = m.crop((x0c, H - 1024, x0c + 1024, H))
    if np.asarray(mc)[:, :].max() < 10: continue
    r = pipe(prompt=P, negative_prompt=N, image=crop, mask_image=mc, width=1024, height=1024, num_inference_steps=36,
             guidance_scale=7.5, strength=.95, generator=torch.Generator("cpu").manual_seed(6)).images[0]
    fe = np.ones((1024, 1024), np.float32); ramp = np.linspace(0, 1, 100)
    if x0c > 0: fe[:, :100] *= ramp[None]
    if x0c + 1024 < W: fe[:, -100:] *= ramp[::-1][None]
    im.paste(r, (x0c, H - 1024), Image.fromarray((np.asarray(mc, np.float32) * fe).astype(np.uint8))); gc.collect(); torch.mps.empty_cache()
im.save('ls/supper-fixed.png'); im.crop((int(W*.3), int(H*.6), int(W*.68), H)).save('ls/door-check.jpg'); print('saved', im.size, flush=True)
