# The phone Creation of Adam recomposed as Michelangelo would for a tall frame: the fresco lowered, heaven grown above
# it, and below only Adam's own earth: the dark green-umber hill with its blue-grey rim, sweeping down to the right.
import sys, gc, numpy as np, torch
from PIL import Image, ImageDraw, ImageFilter
from diffusers import StableDiffusionXLInpaintPipeline
D, seed = int(sys.argv[1]), int(sys.argv[2]); out = sys.argv[3]
old = np.asarray(Image.open('aiv/day-tall-before-illusion.png').convert('RGB'), np.float32); H, W = old.shape[:2]
fig0 = np.asarray(Image.open('/Users/f/Sites/foundation/src/masks/day-tall-figures-rift.png').convert('L').resize((W, H)), np.float32) / 255
N = np.zeros_like(old); N[D:] = old[:H - D]; fig = np.zeros((H, W), np.float32); fig[D:] = fig0[:H - D]
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32); rng = np.random.default_rng(seed)
# top: the old sky reflected upward as a starting point
N[:D] = N[D:2 * D][::-1]
# bottom: Adam's hill continued
def spline(pts, n=500):
    p = np.array(pts, np.float32); t = np.linspace(0, len(p) - 1, n); i = np.minimum(t.astype(int), len(p) - 2); f = (t - i)[:, None]
    f = f * f * (3 - 2 * f); return [tuple(q) for q in p[i] * (1 - f) + p[i + 1] * f]
y0 = 1600 + D
cont = spline([(-50, y0 - 40), (450, y0), (990, y0 - 10), (1300, y0 + 170), (1650, y0 + 390), (1990, y0 + 500)])
m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).polygon(cont + [(1990, H + 50), (-50, H + 50)], fill=255)
hill = np.asarray(m.filter(ImageFilter.GaussianBlur(3)), np.float32) / 255
rim = np.asarray(m.filter(ImageFilter.GaussianBlur(26)), np.float32) / 255; rim = np.clip(1 - np.abs(rim - .5) * 2.2, 0, 1) * (yy > y0 + 20)
DARK, UMBER, GREEN, BLUE, HAZE = map(lambda c: np.array(c, np.float32), ([78, 68, 48], [118, 104, 72], [118, 140, 86], [128, 140, 150], [214, 206, 184]))
v = np.clip((yy - y0) / 600, 0, 1)[..., None]; lr = np.clip(1 - xx / 1500, 0, 1)[..., None]
light = np.clip(np.sin(xx / 330 + yy / 520) * .5 + .5, 0, 1)[..., None] * lr     # broad lit planes, upper left
earth = (UMBER * (1 - v) + DARK * v) * (1 - light * .75) + GREEN * light * .75
earth += (rng.random((H, W, 1)) - .5) * 16
land = np.clip((yy - (1590 + D)) / 80, 0, 1) * (1 - np.asarray(Image.fromarray((fig * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.GaussianBlur(6)), np.float32) / 255)
bg = HAZE * (1 - np.clip((yy - y0) / 1500, 0, .3))[..., None] + (rng.random((H, W, 1)) - .5) * 8
S = bg * (1 - hill[..., None]) + earth * hill[..., None]
S = S * (1 - rim[..., None] * .8) + BLUE * rim[..., None] * .8
S = np.asarray(Image.fromarray(np.clip(S, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2)), np.float32)
N = N * (1 - land[..., None]) + S * land[..., None]
Image.fromarray(np.clip(N, 0, 255).astype(np.uint8)).resize((486, round(486 * H / W))).save(out.replace('.png', '-sketch.jpg'), quality=85)
pipe = StableDiffusionXLInpaintPipeline.from_pretrained("diffusers/stable-diffusion-xl-1.0-inpainting-0.1", torch_dtype=torch.float16, variant="fp16").to("mps")
pipe.enable_attention_slicing(); pipe.vae.enable_tiling()
gw, gh = 704, round(704 * H / W / 8) * 8
NEG = ("people, person, figure, body, face, nude, cherub, angel, bird, animal, tree, village, building, road, river, text, signature, "
       "writing, letters, watermark, frame, border, photo, 3d render, cartoon, airbrush, smooth gradient, blurry")
def run(img, mask, prompt, strength, sd):
    r = pipe(prompt=prompt, negative_prompt=NEG, image=Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).resize((gw, gh), Image.LANCZOS),
             mask_image=Image.fromarray((mask * 255).astype(np.uint8)).resize((gw, gh), Image.LANCZOS), width=gw, height=gh,
             num_inference_steps=36, guidance_scale=7.5, strength=strength, generator=torch.Generator("cpu").manual_seed(sd)).images[0]
    gc.collect(); torch.mps.empty_cache(); return np.asarray(r.resize((W, H), Image.LANCZOS), np.float32)
# heaven above: grown sky, clouds and light
top = np.clip((D + 120 - yy) / 160, 0, 1) * (1 - np.clip(fig * 4, 0, 1))
g = run(N, top, "High Renaissance fresco painting of the heavens: a deep blue sky with great luminous rolling clouds, warm light "
                "breaking through from above, chalky matte fresco texture, masterpiece", .97, seed)
N = N * (1 - top[..., None]) + g * top[..., None]
# Adam's earth below
g = run(N, land, "High Renaissance fresco painting, Sistine Chapel ceiling: a bare dark green and umber hillside of primordial earth "
                 "with a blue grey edge, simple monumental forms, pale sky beyond, chalky matte fresco texture with fine cracks, masterpiece",
        .68, seed + 1)
N = N * (1 - land[..., None]) + g * land[..., None]
F = Image.fromarray(np.clip(N, 0, 255).astype(np.uint8)); F.save(out)
F.resize((486, round(486 * H / W))).save(out.replace('.png', '-s.jpg'), quality=85)
print('saved', out, flush=True)
