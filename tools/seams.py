# Heals vertical seams: repaints narrow strips across them at full resolution, tile by tile, so the clouds and
# waves run straight through. Also clears a signature the model invented at the bottom left.
import sys, gc, torch, numpy as np
from PIL import Image, ImageDraw, ImageFilter
from diffusers import StableDiffusionXLInpaintPipeline
src, out, xs = sys.argv[1], sys.argv[2], [int(v) for v in sys.argv[3].split(',')]
img = Image.open(src).convert('RGB'); W, H = img.size
m = Image.new('L', (W, H), 0); d = ImageDraw.Draw(m)
for x in xs: d.rectangle([x - 70, 0, x + 70, H], fill=255)
d.rectangle([0, H - 170, 420, H], fill=255); d.rectangle([820, H - 160, 1180, H], fill=255)   # invented signatures
m = m.filter(ImageFilter.GaussianBlur(18))
pipe = StableDiffusionXLInpaintPipeline.from_pretrained("diffusers/stable-diffusion-xl-1.0-inpainting-0.1", torch_dtype=torch.float16, variant="fp16").to("mps")
pipe.enable_attention_slicing()
P = "Ivan Aivazovsky oil painting, storm clouds lit with golden light, dark churning sea, warm golden sepia and umber palette, seamless, masterpiece"
N = "line, seam, edge, border, frame, panel, text, signature, letters, ship, boat, people, blurry"
tiles = [(x - 512, y) for x in xs for y in (0, (H - 1024) // 2, H - 1024)] + [(0, H - 1024), (500, H - 1024)]
for k, (x0, y0) in enumerate(tiles):
    x0 = max(0, min(W - 1024, x0)); y0 = max(0, min(H - 1024, y0))
    crop = img.crop((x0, y0, x0 + 1024, y0 + 1024)); mc = m.crop((x0, y0, x0 + 1024, y0 + 1024))
    if np.asarray(mc).max() < 10: continue
    r = pipe(prompt=P, negative_prompt=N, image=crop, mask_image=mc, width=1024, height=1024, num_inference_steps=36,
             guidance_scale=7, strength=.85, generator=torch.Generator("cpu").manual_seed(10 + k)).images[0]
    # feather the tile's own borders too, so one tile never ends in a hard line inside the next
    fe = np.ones((1024, 1024), np.float32); ramp = np.linspace(0, 1, 120)
    if y0 > 0: fe[:120] *= ramp[:, None]
    if y0 + 1024 < H: fe[-120:] *= ramp[::-1][:, None]
    if x0 > 0: fe[:, :120] *= ramp[None]
    if x0 + 1024 < W: fe[:, -120:] *= ramp[::-1][None]
    pm = Image.fromarray((np.asarray(mc, np.float32) * fe).astype(np.uint8))
    img.paste(r, (x0, y0), pm); gc.collect(); torch.mps.empty_cache()
    print('tile', k, flush=True)
img.save(out); print('saved', out, flush=True)
