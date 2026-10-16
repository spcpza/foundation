# Widens Aivazovsky's "Chaos" for wide screens: his canvas kept exactly in the middle, the storm clouds and
# the sea continued to either side in one pass, then a light unifying pass across the seams.
import sys, gc, torch, numpy as np
from PIL import Image, ImageFilter
from diffusers import StableDiffusionXLInpaintPipeline
src, out, seed = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(src).convert('RGB'); w, h = im.size
W = round(h * 1.9); ox = (W - w) // 2
a = np.asarray(im, np.float32); canvas = np.zeros((h, W, 3), np.float32); canvas[:, ox:ox + w] = a
# start the sides from his edge colours, stretched and blurred
canvas[:, :ox] = a[:, :1]; canvas[:, ox + w:] = a[:, -1:]
pre = Image.fromarray(canvas.astype(np.uint8)).filter(ImageFilter.GaussianBlur(30)); pre.paste(im, (ox, 0))
known = np.zeros((h, W), np.uint8); known[:, ox:ox + w] = 255
mask = Image.fromarray(255 - known).filter(ImageFilter.MaxFilter(41)).filter(ImageFilter.GaussianBlur(14))
P = ("Ivan Aivazovsky oil painting, Chaos The Creation: vast storm clouds lit with golden light from above, dark billowing "
     "clouds, the dark churning sea below with light glittering on the waves, warm golden sepia and umber palette, old varnished canvas, romantic seascape, masterpiece")
N = "grey, cold blue, daylight, ship, sailing ship, boat, mast, people, figure, land, rocks, buildings, text, signature, frame, border, photo, blurry, seam, split image"
pipe = StableDiffusionXLInpaintPipeline.from_pretrained("diffusers/stable-diffusion-xl-1.0-inpainting-0.1", torch_dtype=torch.float16, variant="fp16").to("mps")
pipe.enable_attention_slicing(); pipe.vae.enable_tiling()
sc = (1150 * 1150 / (W * h)) ** .5; gw, gh = round(W * sc / 8) * 8, round(h * sc / 8) * 8
def run(img, m, st, sd):
    r = pipe(prompt=P, negative_prompt=N, image=img.resize((gw, gh), Image.LANCZOS), mask_image=m.resize((gw, gh), Image.LANCZOS),
             width=gw, height=gh, num_inference_steps=40, guidance_scale=7, strength=st, generator=torch.Generator("cpu").manual_seed(sd)).images[0]
    gc.collect(); torch.mps.empty_cache(); return r.resize((W, h), Image.LANCZOS)
g1 = run(pre, mask, 1.0, seed)
# keep his canvas exactly, except a band either side of each seam that is repainted lightly
band = np.zeros((h, W), np.uint8); band[:, ox - 90:ox + 90] = 255; band[:, ox + w - 90:ox + w + 90] = 255
band = Image.fromarray(band).filter(ImageFilter.GaussianBlur(30))
# match the new sides to his palette, row band by row band (sky to sea), so it is one painting, not three panels
g1a = np.asarray(g1, np.float32); ref = a
for y0 in range(0, h, 120):
    ys = slice(y0, min(h, y0 + 240))
    rmu, rsd = ref[ys].reshape(-1, 3).mean(0), ref[ys].reshape(-1, 3).std(0) + 1e-3
    for xs in (slice(0, ox), slice(ox + w, W)):
        blk = g1a[ys, xs]; mu, sd = blk.reshape(-1, 3).mean(0), blk.reshape(-1, 3).std(0) + 1e-3
        g1a[y0:min(h, y0 + 120), xs] = (g1a[y0:min(h, y0 + 120), xs] - mu) / sd * (rsd * .85 + sd * .15) + rmu
g1 = Image.fromarray(np.clip(g1a, 0, 255).astype(np.uint8))
step = Image.composite(g1, pre, mask)
g2 = run(step, Image.fromarray(np.maximum(np.asarray(band), np.asarray(mask)).astype(np.uint8)), .5, seed + 1)
keep = Image.fromarray(known).filter(ImageFilter.MinFilter(121)).filter(ImageFilter.GaussianBlur(25))
final = Image.composite(im.crop((0, 0, w, h)), g2.crop((ox, 0, ox + w, h)), keep.crop((ox, 0, ox + w, h)))
g2.paste(final, (ox, 0)); g2.save(out); print('saved', out, g2.size, 'canvas at', ox, flush=True)
