# Repaints one face in a painting, at full resolution, so it holds up close.
import sys, gc, torch, numpy as np
from PIL import Image, ImageDraw, ImageFilter
from diffusers import StableDiffusionXLInpaintPipeline
src, out, cx, cy, rx, ry, seed = sys.argv[1], sys.argv[2], *map(int, sys.argv[3:8])
prompt = sys.argv[8]
img = Image.open(src).convert('RGB'); W, H = img.size
m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255); m = m.filter(ImageFilter.GaussianBlur(16))
x0, y0 = max(0, min(W - 768, cx - 384)), max(0, min(H - 768, cy - 384))
crop = img.crop((x0, y0, x0 + 768, y0 + 768)).resize((1024, 1024), Image.LANCZOS); mc = m.crop((x0, y0, x0 + 768, y0 + 768)).resize((1024, 1024))
pipe = StableDiffusionXLInpaintPipeline.from_pretrained("diffusers/stable-diffusion-xl-1.0-inpainting-0.1", torch_dtype=torch.float16, variant="fp16").to("mps")
pipe.enable_attention_slicing()
r = pipe(prompt=prompt, negative_prompt="eyes closed, sleeping, bowed head, deformed face, extra face, blurry, ugly, distorted, text",
         image=crop, mask_image=mc, width=1024, height=1024, num_inference_steps=40, guidance_scale=7.5, strength=.72,
         generator=torch.Generator("cpu").manual_seed(seed)).images[0].resize((768, 768), Image.LANCZOS)
img.paste(r, (x0, y0), m.crop((x0, y0, x0 + 768, y0 + 768))); img.save(out)
img.crop((cx - 250, cy - 200, cx + 250, cy + 200)).save(out.replace('.png', '-face.jpg')); print('saved', out, flush=True)
