# Restores Michelangelo's own two hands (God's firm, Adam's languid) into the redrawn Creation of Adam,
# cut along the skin so none of his cracked plaster comes along, then lightly harmonised.
import gc, torch, numpy as np
from PIL import Image, ImageDraw, ImageFilter
from diffusers import StableDiffusionXLInpaintPipeline
day = Image.open('/Users/f/Sites/foundation/src/grown/day.png').convert('RGB'); W, H = day.size
src = Image.open('/Users/f/Sites/foundation/src/michelangelo-adam.jpg').convert('RGB')
src = src.crop((0, round(src.height * .035), src.width, src.height)).resize((1600, 701), Image.LANCZOS)
OX, OY = 200, 694                                  # where the fresco sat when the day was grown and redrawn
s = np.asarray(src, np.float32); L = s.mean(2) / 255; sat = (s.max(2) - s.min(2)) / 255
skin = ((sat > .12) | (L < .45)).astype(np.uint8) * 255   # not the pale plaster
reg = Image.new('L', src.size, 0); d = ImageDraw.Draw(reg)
d.ellipse([440, 225, 640, 345], fill=255)           # Adam's wrist and hand
d.ellipse([590, 240, 760, 345], fill=255)           # God's hand and wrist
m = Image.fromarray(np.minimum(np.asarray(reg), skin)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(2.5))
out = day.copy(); out.paste(src, (OX, OY), m)
# harmonise the hands and the air around them into the new paint, gently
x0, y0 = OX + 330, OY + 30
crop = out.crop((x0, y0, x0 + 512, y0 + 512)).resize((1024, 1024), Image.LANCZOS)
hm = Image.new('L', (W, H), 0); hm.paste(Image.fromarray(np.asarray(reg)), (OX, OY)); hm = hm.filter(ImageFilter.MaxFilter(21)).filter(ImageFilter.GaussianBlur(10))
mc = hm.crop((x0, y0, x0 + 512, y0 + 512)).resize((1024, 1024))
pipe = StableDiffusionXLInpaintPipeline.from_pretrained("diffusers/stable-diffusion-xl-1.0-inpainting-0.1", torch_dtype=torch.float16, variant="fp16").to("mps")
pipe.enable_attention_slicing()
r = pipe(prompt="Michelangelo, The Creation of Adam: God's hand reaching with index finger firmly extended, Adam's hand hanging limp and languid from the wrist, almost touching, luminous sky between, oil painting, masterpiece",
         negative_prompt="clasped hands, touching, extra fingers, deformed hands, cracks, plaster, blurry",
         image=crop, mask_image=mc, width=1024, height=1024, num_inference_steps=40, guidance_scale=7, strength=.3,
         generator=torch.Generator("cpu").manual_seed(2)).images[0].resize((512, 512), Image.LANCZOS)
out.paste(r, (x0, y0), hm.crop((x0, y0, x0 + 512, y0 + 512)))
out.save('aiv/day-hands.png'); out.crop((OX + 380, OY + 180, OX + 820, OY + 400)).resize((880, 440)).save('aiv/hands-check.jpg'); print('ok')
