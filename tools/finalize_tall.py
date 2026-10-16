# Finishes nt-3b into src/grown/day-tall.png: model edge rows, fresco plaster grain in the new earth, a stray cloud wisp.
import numpy as np
from PIL import Image, ImageFilter
D = 800
a = np.asarray(Image.open('/Users/f/outpaint/aiv/nt-3b.png').convert('RGB'), np.float32).copy(); H, W = a.shape[:2]
a[:50] = a[50:100][::-1]; a[-30:] = a[-60:-30][::-1]
fr = Image.open('/Users/f/Sites/foundation/src/michelangelo-adam.jpg').convert('L').crop((560, 40, 1680, 560))
fr = np.asarray(fr.resize((W, round(fr.height * W / fr.width))), np.float32)
hp = fr - np.asarray(Image.fromarray(fr.astype(np.uint8)).filter(ImageFilter.GaussianBlur(6)), np.float32)
tile = np.vstack([hp, hp[:, ::-1], hp[::-1], hp[::-1, ::-1]])
fig = np.asarray(Image.open('/Users/f/Sites/foundation/src/masks/day-tall-figures-rift.png').convert('L'), np.float32) / 255
y0 = 1600 + D - 100
k = np.zeros((H, W), np.float32); k[y0:] = np.clip((np.arange(H - y0) / 100.), 0, 1)[:, None]
k *= 1 - np.clip(np.asarray(Image.fromarray((fig * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.GaussianBlur(6)), np.float32) / 255 * 3, 0, 1)
g = np.zeros((H, W), np.float32); g[y0:] = tile[:H - y0]; a += (g * k * .5)[..., None]
# the wisp under the cloud tip: pale pixels that are not the cloud body -> sky blue
br = a[..., 2] - a[..., 0]; bx = (slice(1200, 1360), slice(660, 920))
wisp = np.zeros(a.shape[:2], bool); wisp[bx] = ((br > 5) & (br < 85))[bx]      # pale blue: neither sky (very blue) nor cloud (warm)
m = np.asarray(Image.fromarray((wisp * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(3)), np.float32) / 255
blue = a[1350:1380, 700:900].reshape(-1, 3).mean(0)
a = a * (1 - m[..., None]) + blue * m[..., None]
Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save('/Users/f/Sites/foundation/src/grown/day-tall.png')
Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).crop((600, 1180, 1000, 1380)).resize((800, 400)).save('/Users/f/outpaint/aiv/wisp.png')
# the old grey patch on the cloud tip -> the cloud's colour just right of it
a = np.asarray(Image.open('/Users/f/Sites/foundation/src/grown/day-tall.png').convert('RGB'), np.float32).copy()
c = a[1236:1262, 772:790].reshape(-1, 3).mean(0)
k = np.zeros(a.shape[:2], np.float32); k[1234:1262, 736:768] = 1
k = np.asarray(Image.fromarray((k * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(4)), np.float32) / 255
k *= (a[..., 2] - a[..., 0] < 60)                                    # never over sky
a = a * (1 - k[..., None]) + c * k[..., None]
Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save('/Users/f/Sites/foundation/src/grown/day-tall.png')
# a thin cloud tail reaching into open sky: one big stroke lands on it and paints a lone white blade
a = np.asarray(Image.open('/Users/f/Sites/foundation/src/grown/day-tall.png').convert('RGB'), np.float32).copy()
br = a[..., 2] - a[..., 0]; t = np.zeros(a.shape[:2], np.float32)
t[1095:1195, 360:540] = (br[1095:1195, 360:540] < 90)
t[1095:1195, 500:540] *= np.linspace(1, 0, 40)[None, :]               # fade into the cloud body
t = np.asarray(Image.fromarray((t * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(3)), np.float32) / 255
sky = a[1200:1240, 360:540].reshape(-1, 3).mean(0)
a = a * (1 - t[..., None]) + sky * t[..., None]
Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save('/Users/f/Sites/foundation/src/grown/day-tall.png')
Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).crop((300, 1050, 600, 1250)).resize((600, 400)).save('/Users/f/outpaint/aiv/speck.png')
# a lone sweep stroke from the left cloud lands out in the blue at ~(502,1308); give the cloud a rising curl there
a = np.asarray(Image.open('/Users/f/Sites/foundation/src/grown/day-tall.png').convert('RGB'), np.float32).copy()
Hh, Ww = a.shape[:2]; yy, xx = np.mgrid[0:Hh, 0:Ww].astype(np.float32)
col = a[1440:1470, 400:440].reshape(-1, 3).mean(0)
w = np.zeros((Hh, Ww), np.float32)
for t in np.linspace(0, 1, 40):                                       # a curl from the bulge up and to the right
    cx, cy = 460 + 90 * t + 20 * np.sin(t * 3), 1430 - 150 * t; r = 46 * (1 - .55 * t)
    w = np.maximum(w, np.clip(1 - np.hypot(xx - cx, (yy - cy) * 1.3) / r, 0, 1))
w = np.asarray(Image.fromarray((w * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(10)), np.float32) / 255
w = np.clip(w * 1.5, 0, .9)
shade = np.clip((yy - 1300) / 160, 0, 1)[..., None] * .12                 # lit above, a little cooler below
c = col * (1.04 - shade) + np.array([10, 14, 24.]) * shade
a = a * (1 - w[..., None]) + c * w[..., None]
Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save('/Users/f/Sites/foundation/src/grown/day-tall.png')
Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).crop((300, 1200, 700, 1520)).save('/Users/f/outpaint/aiv/curl.png')
