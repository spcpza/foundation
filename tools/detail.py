# Repaints the lower half of the phone's day picture at full resolution, tile by tile, for finer detail.
import gc, torch, numpy as np
from PIL import Image
from diffusers import StableDiffusionXLInpaintPipeline
src = '/Users/f/Sites/foundation/src/grown/day-tall.png'
img = Image.open(src).convert('RGB'); W, H = img.size; Y0 = 1660
P = ("High Renaissance oil painting in the manner of Michelangelo and Leonardo: the Garden of Eden in morning light, finely painted "
     "rocks and warm earth, leafy trees with detailed foliage, wildflowers and roses, a winding path into the valley, sharp painterly "
     "detail, sculptural forms, rich warm palette, masterpiece")
N = "people, figure, face, body, animal, text, signature, frame, border, blurry, soft, smooth, 3d render, photo, cartoon"
pipe = StableDiffusionXLInpaintPipeline.from_pretrained("diffusers/stable-diffusion-xl-1.0-inpainting-0.1", torch_dtype=torch.float16, variant="fp16").to("mps")
pipe.enable_attention_slicing()
out = np.asarray(img, np.float32).copy(); acc = np.zeros((H, W, 1), np.float32); res = np.zeros((H, W, 3), np.float32)
xs = [0, W - 1024]; ys = list(range(Y0, H - 1024, 640)) + [H - 1024]
k = 0
for y0 in ys:
    for x0 in xs:
        crop = img.crop((x0, y0, x0 + 1024, y0 + 1024))
        r = pipe(prompt=P, negative_prompt=N, image=crop, mask_image=Image.new('L', (1024, 1024), 255), width=1024, height=1024,
                 num_inference_steps=36, guidance_scale=7, strength=.48, generator=torch.Generator("cpu").manual_seed(20 + k)).images[0]
        w = np.ones((1024, 1024), np.float32); ramp = np.linspace(0, 1, 160)
        w[:160] *= ramp[:, None]; w[-160:] *= ramp[::-1][:, None]; w[:, :160] *= ramp[None]; w[:, -160:] *= ramp[::-1][None]
        if x0 == 0: w[:, :160] = np.maximum(w[:, :160], 1e-3) ** 0 * w[:, 160:161]
        if x0 + 1024 >= W: w[:, -160:] = w[:, -161:-160]
        if y0 + 1024 >= H: w[-160:] = w[-161:-160]
        res[y0:y0+1024, x0:x0+1024] += np.asarray(r, np.float32) * w[..., None]; acc[y0:y0+1024, x0:x0+1024] += w[..., None]
        k += 1; gc.collect(); torch.mps.empty_cache(); print('tile', k, flush=True)
new = res / np.maximum(acc, 1e-4)
blend = np.clip((np.arange(H) - Y0) / 260., 0, 1)[:, None, None] * (acc > 1e-3)        # fade in below Adam's hill
final = out * (1 - blend) + new * blend
Image.fromarray(np.clip(final, 0, 255).astype(np.uint8)).save('aiv/day-tall-detail.png'); print('saved', flush=True)
