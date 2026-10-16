# Paints out small flaws in a finished painting: a mask of shapes, repainted with a prompt, feathered in.
import sys, gc, torch, numpy as np
from PIL import Image, ImageDraw, ImageFilter
from diffusers import StableDiffusionXLInpaintPipeline
src, out = sys.argv[1], sys.argv[2]
img = Image.open(src).convert('RGB'); W, H = img.size
m = Image.new('L', (W, H), 0); d = ImageDraw.Draw(m)
d.ellipse([585, 1100, 700, 1215], fill=255)                                                   # a wing-tip left of his head   # the wings behind his shoulder
d.line([(585, 385), (895, 995)], fill=255, width=44)                                                     # a thin dark line across the sky
m = m.filter(ImageFilter.GaussianBlur(10))
x0, y0, x1, y1 = 450, 300, 1700, 1400                      # work at full resolution in this window
crop = img.crop((x0, y0, x1, y1)); mc = m.crop((x0, y0, x1, y1))
pipe = StableDiffusionXLInpaintPipeline.from_pretrained("diffusers/stable-diffusion-xl-1.0-inpainting-0.1", torch_dtype=torch.float16, variant="fp16").to("mps")
pipe.enable_attention_slicing()
w, h = crop.size; sc = (1024 * 1024 / (w * h)) ** .5; gw, gh = round(w * sc / 8) * 8, round(h * sc / 8) * 8
r = pipe(prompt="Michelangelo fresco, deep dark blue night sky with soft glory of light, God's rose mantle on his shoulder, masterpiece",
         negative_prompt="wings, feathers, angel, bird, line, rope, string, stick, text, extra limbs",
         image=crop.resize((gw, gh)), mask_image=mc.resize((gw, gh)), width=gw, height=gh, num_inference_steps=40,
         guidance_scale=7.5, strength=.99, generator=torch.Generator("cpu").manual_seed(4)).images[0].resize((w, h), Image.LANCZOS)
outimg = img.copy(); outimg.paste(r, (x0, y0), mc); outimg.save(out)
outimg.crop((450, 300, 1700, 1400)).resize((625, 550)).save(out.replace('.png', '-check.jpg'))
print('fixed', out)
