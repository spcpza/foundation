# Builds the two crops of Fred's painting around the light between the fingers.
# usage: python3 tools/crops.py <painting.jpg>   -> public/img/hands-{wide,tall}-{1600,900}.{webp,jpg}
# The light sits at u=.33 v=.43 of the full painting; the page centres on it (see LIGHT in app.js).
import sys
from PIL import Image, ImageEnhance
im = Image.open(sys.argv[1]).convert('RGB'); W, H = im.size
cx, cy = int(.33 * W), int(.43 * H)
crops = {
  'wide': (0, cy - int(.20 * H), W, cy + int(.16 * H)),
  'tall': (cx - int(.30 * W), cy - int(.28 * H), cx + int(.34 * W), cy + int(.25 * H)),
}
for name, box in crops.items():
  c = im.crop(box)
  print(name, c.size, 'light at', round((cx - box[0]) / c.size[0], 4), round((cy - box[1]) / c.size[1], 4))
  for w in (1600, 900):
    r = c.resize((w, round(c.size[1] * w / c.size[0])), Image.LANCZOS) if c.size[0] > w else c
    r.save(f'public/img/hands-{name}-{w}.webp', quality=80, method=6)
    r.save(f'public/img/hands-{name}-{w}.jpg', quality=82, optimize=True, progressive=True)
og = im.crop(crops['wide']).resize((1200, 630), Image.LANCZOS)
ImageEnhance.Brightness(og).enhance(.92).save('public/og.jpg', quality=84)
