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
# below the table: the robe, then each leg and foot on its own, so no floor is caught between or beside them
robe = seg((1160, 1086, 1412, 1170), pos=[(1300, 1110), (1220, 1115), (1380, 1112), (1250, 1140), (1350, 1140)],
           neg=[(1300, 1168), (1168, 1168)])
lining = seg((1164, 1128, 1410, 1182), pos=[(1185, 1145), (1225, 1155), (1340, 1160), (1380, 1146), (1300, 1152)],
             neg=[(1262, 1180), (1300, 1180)])
legL = seg((1118, 1128, 1222, 1238), pos=[(1170, 1170), (1150, 1210), (1185, 1150)], neg=[(1125, 1150), (1215, 1215), (1125, 1236)])
legR = seg((1362, 1132, 1452, 1238), pos=[(1395, 1170), (1425, 1210), (1385, 1150)], neg=[(1445, 1145), (1368, 1225), (1450, 1236)])
def tidy(x, k=5):
    return np.asarray(Image.fromarray((x * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.MinFilter(k)), np.float32) / 255
lo = np.maximum(np.maximum(tidy(robe, 7), tidy(lining, 7)), np.maximum(tidy(legL), tidy(legR)))
m = np.maximum(up, lo)
m[905:1084] = 0                                                    # the tablecloth between body and feet is not him
M = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.GaussianBlur(.8))
M.save('/Users/f/Sites/foundation/src/masks/supper-christ.png')
show = Image.composite(im, Image.new('RGB', (W, H), (255, 40, 200)), M)
show.crop((1060, 560, 1520, 1260)).save('aiv/christ-sam.jpg'); print('ok')
