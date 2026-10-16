import sys, gc, torch, numpy as np
from PIL import Image, ImageFilter
from diffusers import StableDiffusionXLInpaintPipeline
pipe = StableDiffusionXLInpaintPipeline.from_pretrained("diffusers/stable-diffusion-xl-1.0-inpainting-0.1", torch_dtype=torch.float16, variant="fp16").to("mps")
pipe.enable_attention_slicing()
P = "Leonardo da Vinci, The Last Supper fresco: a white linen tablecloth falling from the table edge to the floor in soft vertical folds, one continuous cloth, faded fresco texture, masterpiece"
N = "line, seam, edge, stripe, band, border, transparent, table legs, feet, text, blurry"
def run(path, out, x0, x1, y0, y1, tiles):
    im = Image.open(path).convert('RGB'); W, H = im.size
    m = Image.new('L', (W, H), 0); m.paste(255, (x0, y0, x1, y1)); m = m.filter(ImageFilter.GaussianBlur(12))
    for k, (tx, ty) in enumerate(tiles):
        crop = im.crop((tx, ty, tx + 1024, ty + 1024)); mc = m.crop((tx, ty, tx + 1024, ty + 1024))
        r = pipe(prompt=P, negative_prompt=N, image=crop, mask_image=mc, width=1024, height=1024, num_inference_steps=36,
                 guidance_scale=7.5, strength=.7, generator=torch.Generator("cpu").manual_seed(70 + k)).images[0]
        im.paste(r, (tx, ty), mc); gc.collect(); torch.mps.empty_cache(); print('tile', flush=True)
    im.save(out)
run('ls/supper-drape2.png', 'ls/supper-drape3.png', 100, 1050, 1050, 1135, [(0, 331), (300, 331)])
s = 2000 / 1560
run('ls/supper-tall-drape2.png', 'ls/supper-tall-drape3.png', 0, int((1050 - 520) * s - 50), int(1050 * s + 692), int(1135 * s + 692), [(0, int(1090 * s + 692) - 512)])
Image.open('ls/supper-drape3.png').crop((0, 820, 2600, 1355)).resize((1300, 268)).save('ls/drape3-full.jpg', quality=85)
Image.open('ls/supper-drape3.png').crop((100, 1000, 1100, 1200)).save('ls/drape3-z.jpg', quality=85); print('saved')
