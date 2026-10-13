# Makes a tall version of a painting for phones: the painting kept exactly, the sky continued above and the
# land below in one pass, colour-matched column band by column band, then a light pass across the seams.
import sys, gc, torch, numpy as np
from PIL import Image, ImageFilter
from diffusers import StableDiffusionXLInpaintPipeline
src, out, seed, top, bottom = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
im = Image.open(src).convert('RGB'); w, h = im.size; H = h + top + bottom; oy = top
a = np.asarray(im, np.float32); canvas = np.zeros((H, w, 3), np.float32); canvas[oy:oy + h] = a
canvas[:oy] = a[:1]; canvas[oy + h:] = a[-1:]
pre = Image.fromarray(canvas.astype(np.uint8)).filter(ImageFilter.GaussianBlur(30)); pre.paste(im, (0, oy))
known = np.zeros((H, w), np.uint8); known[oy:oy + h] = 255
mask = Image.fromarray(255 - known).filter(ImageFilter.MaxFilter(41)).filter(ImageFilter.GaussianBlur(14))
P = ("Renaissance oil painting in the manner of Michelangelo: above, a luminous blue morning sky with soft white and golden "
     "clouds; below, the Garden of Eden in morning light, green meadows of roses and wildflowers, leafy trees and cypresses, "
     "a winding path, rich harmonious colours, masterpiece")
N = "people, figure, person, face, body, angel, animal, text, signature, frame, border, photo, blurry, seam, split image"
pipe = StableDiffusionXLInpaintPipeline.from_pretrained("diffusers/stable-diffusion-xl-1.0-inpainting-0.1", torch_dtype=torch.float16, variant="fp16").to("mps")
pipe.enable_attention_slicing(); pipe.vae.enable_tiling()
sc = (1150 * 1150 / (w * H)) ** .5; gw, gh = round(w * sc / 8) * 8, round(H * sc / 8) * 8
def run(img, m, st, sd):
    r = pipe(prompt=P, negative_prompt=N, image=img.resize((gw, gh), Image.LANCZOS), mask_image=m.resize((gw, gh), Image.LANCZOS),
             width=gw, height=gh, num_inference_steps=40, guidance_scale=7, strength=st, generator=torch.Generator("cpu").manual_seed(sd)).images[0]
    gc.collect(); torch.mps.empty_cache(); return r.resize((w, H), Image.LANCZOS)
g1 = np.asarray(run(pre, mask, 1.0, seed), np.float32)
for x0 in range(0, w, 120):          # match each new band to the painting's colours in the same columns, near the seam
    xs = slice(x0, min(w, x0 + 240))
    for ys, ref in ((slice(0, oy), a[:260]), (slice(oy + h, H), a[-260:])):
        rmu, rsd = ref[:, xs].reshape(-1, 3).mean(0), ref[:, xs].reshape(-1, 3).std(0) + 1e-3
        blk = g1[ys, xs]; mu, sd = blk.reshape(-1, 3).mean(0), blk.reshape(-1, 3).std(0) + 1e-3
        g1[ys, x0:min(w, x0 + 120)] = (g1[ys, x0:min(w, x0 + 120)] - mu) / sd * (rsd * .7 + sd * .3) + rmu
g1 = Image.fromarray(np.clip(g1, 0, 255).astype(np.uint8))
step = Image.composite(g1, pre, mask)
band = np.zeros((H, w), np.uint8); band[oy - 90:oy + 90] = 255; band[oy + h - 90:oy + h + 90] = 255
band = Image.fromarray(band).filter(ImageFilter.GaussianBlur(30))
g2 = run(step, Image.fromarray(np.maximum(np.asarray(band), np.asarray(mask)).astype(np.uint8)), .5, seed + 1)
keep = Image.fromarray(known).filter(ImageFilter.MinFilter(121)).filter(ImageFilter.GaussianBlur(25))
g2.paste(Image.composite(im, g2.crop((0, oy, w, oy + h)), keep.crop((0, oy, w, oy + h))), (0, oy))
g2.save(out); print('saved', out, g2.size, 'painting at', oy, flush=True)
