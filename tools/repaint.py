# Repaints a whole picture as one painting (the current image only as the starting composition), then a
# close-up pass on the main figure for the face and hands. No pixel is pasted back, so there are no seams.
# usage: .venv/bin/python repaint.py <night|day> <in.png> <outdir> <seeds> [strength]
import sys, os, gc, torch, numpy as np
from PIL import Image, ImageFilter
from diffusers import StableDiffusionXLInpaintPipeline

job, src, outdir, seeds = sys.argv[1], sys.argv[2], sys.argv[3], [int(s) for s in sys.argv[4].split(',')]
strength = float(sys.argv[5]) if len(sys.argv) > 5 else .6
os.makedirs(outdir, exist_ok=True)
img = Image.open(src).convert('RGB'); W, H = img.size
if job == 'night':
    PROMPT = ("Michelangelo, Sistine Chapel fresco: God the Father with flowing white hair and long white beard, in a rose "
              "and crimson robe, arms flung wide, creating the great golden sun and the pale silver moon, an even soft "
              "glory of warm light around his whole figure and his head, two small cherubs beside him, floating in the "
              "deep dark blue starry heavens, dramatic, majestic, chalky fresco texture, masterpiece")
    FOCUS = (250, 650, 1800, 2000)          # the region holding God, for the close-up pass (x0, y0, x1, y1)
    FPROMPT = ("Michelangelo fresco, close-up of God the Father: noble powerful face, flowing white hair and beard, "
               "strong hands, rose robe with deep folds, cherubs, soft glory of light, dark blue heavens, masterpiece")
else:
    PROMPT = ("Michelangelo, Sistine Chapel fresco, The Creation of Adam: Adam reclining on a green hillside reaching up, "
              "God the Father with white hair and beard in a rose robe borne by angels in a red mantle, their fingers "
              "almost touching with light between them, luminous sky with soft clouds, below the Garden of Eden with "
              "trees, a winding path and wildflowers, chalky fresco texture, masterpiece")
    FOCUS = (0, 500, 2000, 1500)
    FPROMPT = ("Michelangelo fresco, The Creation of Adam, Adam and God the Father, noble faces, strong hands, fingers almost "
               "touching, masterpiece")
NEG = ("extra people, crowd, extra limbs, extra fingers, deformed hands, deformed face, distorted, mutated, ugly, blurry, "
       "text, signature, watermark, frame, border, photo, 3d render, cartoon, landscape, mountains, sea"
       if job == 'night' else
       "extra people, crowd, extra limbs, extra fingers, deformed hands, deformed face, distorted, mutated, ugly, blurry, "
       "text, signature, watermark, frame, border, photo, 3d render, cartoon")

pipe = StableDiffusionXLInpaintPipeline.from_pretrained("diffusers/stable-diffusion-xl-1.0-inpainting-0.1",
          torch_dtype=torch.float16, variant="fp16").to("mps")
pipe.enable_attention_slicing(); pipe.vae.enable_tiling()

def paint(image, prompt, strength, seed, area=1150):
    w, h = image.size; sc = (area * area / (w * h)) ** .5; gw, gh = round(w * sc / 8) * 8, round(h * sc / 8) * 8
    m = Image.new('L', (gw, gh), 255)
    r = pipe(prompt=prompt, negative_prompt=NEG, image=image.resize((gw, gh), Image.LANCZOS), mask_image=m, width=gw, height=gh,
             num_inference_steps=40, guidance_scale=7.5, strength=strength, generator=torch.Generator("cpu").manual_seed(seed)).images[0]
    gc.collect(); torch.mps.empty_cache()
    return r.resize((w, h), Image.LANCZOS)

for seed in seeds:
    whole = paint(img, PROMPT, strength, seed)
    whole.save(f'{outdir}/{job}-{seed}-whole.png')
    # the close-up: the figure region at full resolution, gently, feathered back in
    x0, y0, x1, y1 = FOCUS
    crop = whole.crop((x0, y0, x1, y1))
    det = paint(crop, FPROMPT, .38, seed + 7, area=1100)
    fm = Image.new('L', crop.size, 0); fm.paste(255, (60, 60, crop.size[0] - 60, crop.size[1] - 60))
    fm = fm.filter(ImageFilter.GaussianBlur(40))
    out = whole.copy(); out.paste(det, (x0, y0), fm)
    out.save(f'{outdir}/{job}-{seed}.png')
    print('saved', f'{outdir}/{job}-{seed}.png', flush=True)
