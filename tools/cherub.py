import sys, gc, torch, numpy as np
from PIL import Image, ImageDraw, ImageFilter
from diffusers import StableDiffusionXLInpaintPipeline
img = Image.open('aiv/day-tall-2.png').convert('RGB').crop((14, 300, 1986, 3620))   # inside the painted frame, with margin
W, H = img.size
cx, cy = 1437 - 14, 683 - 300
m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).ellipse([cx - 140, cy - 90, cx + 140, cy + 90], fill=255); m = m.filter(ImageFilter.GaussianBlur(14))
x0, y0 = max(0, cx - 512), max(0, cy - 512)
crop = img.crop((x0, y0, x0 + 1024, y0 + 1024)); mc = m.crop((x0, y0, x0 + 1024, y0 + 1024))
pipe = StableDiffusionXLInpaintPipeline.from_pretrained("diffusers/stable-diffusion-xl-1.0-inpainting-0.1", torch_dtype=torch.float16, variant="fp16").to("mps")
pipe.enable_attention_slicing()
r = pipe(prompt="soft white and golden clouds in a luminous blue sky, Renaissance oil painting", negative_prompt="cherub, angel, figure, person, bird",
         image=crop, mask_image=mc, width=1024, height=1024, num_inference_steps=36, guidance_scale=7, strength=.99,
         generator=torch.Generator("cpu").manual_seed(3)).images[0]
img.paste(r, (x0, y0), mc); img.save('aiv/day-tall-final.png')
img.crop((cx - 300, cy - 200, cx + 300, cy + 200)).save('aiv/cherub-check.jpg'); print('ok', img.size)
