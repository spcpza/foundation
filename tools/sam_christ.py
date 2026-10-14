# Cuts Christ out of the Last Supper with Segment Anything: box + positive/negative points per region.
import torch, numpy as np
from PIL import Image, ImageFilter
from transformers import SamModel, SamProcessor
im = Image.open('/Users/f/Sites/foundation/src/grown/supper.png').convert('RGB'); W, H = im.size
model = SamModel.from_pretrained("facebook/sam-vit-large").to("mps").eval(); proc = SamProcessor.from_pretrained("facebook/sam-vit-large")
def seg(box, pos, neg):
    x0, y0, x1, y1 = box; crop = im.crop(box)
    pts = [[(x - x0, y - y0) for x, y in pos + neg]]; lab = [[1] * len(pos) + [0] * len(neg)]
    inp = proc(crop, input_points=[pts], input_labels=[lab], input_boxes=[[[10, 10, x1 - x0 - 10, y1 - y0 - 10]]], return_tensors="pt")
    inp = {k: (v.float().to("mps") if v.dtype == torch.float64 else v.to("mps")) for k, v in inp.items()}
    with torch.no_grad(): out = model(**inp, multimask_output=True)
    masks = proc.image_processor.post_process_masks(out.pred_masks.cpu(), inp["original_sizes"].cpu(), inp["reshaped_input_sizes"].cpu())[0][0]
    sc = out.iou_scores.cpu()[0, 0]; i = int(sc.argmax()); print(box, [round(float(v), 3) for v in sc], 'pick', i)
    full = np.zeros((H, W), np.float32); full[y0:y1, x0:x1] = masks[i].numpy().astype(np.float32); return full
up = seg((1080, 570, 1510, 910),
         pos=[(1290, 640), (1300, 700), (1180, 800), (1240, 820), (1380, 800), (1330, 760), (1130, 880), (1450, 880), (1270, 610)],
         neg=[(1220, 620), (1350, 620), (1205, 700), (1405, 700), (1430, 740), (1300, 905), (1180, 905), (1110, 760), (1480, 820)])
lo = seg((1100, 1084, 1460, 1250),
         pos=[(1300, 1110), (1220, 1120), (1380, 1120), (1150, 1210), (1420, 1200), (1250, 1150), (1350, 1150)],
         neg=[(1290, 1200), (1110, 1110), (1450, 1110), (1290, 1240), (1200, 1240)])
# the robe hem: close the model's holes in the faded blue, then fill any hole fully enclosed
from collections import deque
L = Image.fromarray((lo * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(11)).filter(ImageFilter.MinFilter(11))
lb = np.asarray(L) > 127
inv = ~lb; seen = np.zeros_like(inv); q = deque()
for y in range(H):
    for x in (0, W - 1):
        if inv[y, x]: seen[y, x] = True; q.append((y, x))
for x in range(W):
    for y in (0, H - 1):
        if inv[y, x] and not seen[y, x]: seen[y, x] = True; q.append((y, x))
while q:
    y, x = q.popleft()
    for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
        ny, nx = y+dy, x+dx
        if 0 <= ny < H and 0 <= nx < W and inv[ny, nx] and not seen[ny, nx]: seen[ny, nx] = True; q.append((ny, nx))
lo = (~seen).astype(np.float32)
m = np.maximum(up, lo)
m[905:1084] = 0                                                    # the tablecloth between body and feet is not him
M = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.GaussianBlur(.8))
M.save('/Users/f/Sites/foundation/src/masks/supper-christ.png')
show = Image.composite(im, Image.new('RGB', (W, H), (255, 40, 200)), M)
show.crop((1060, 560, 1520, 1260)).save('aiv/christ-sam.jpg'); print('ok')
