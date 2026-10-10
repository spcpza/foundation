import torch, numpy as np, sys
from PIL import Image
from spandrel import ModelLoader
torch.set_num_threads(8)
m = ModelLoader().load_from_file('tools/models/RealESRGAN_x2plus.pth').eval()
im = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(np.float32)/255
H, W, _ = im.shape; T = 256; P = 16; s = 2
out = np.zeros((H*s, W*s, 3), np.float32)
with torch.no_grad():
    for y in range(0, H, T):
        for x in range(0, W, T):
            y0, x0 = max(0, y-P), max(0, x-P); y1, x1 = min(H, y+T+P), min(W, x+T+P)
            t = torch.from_numpy(im[y0:y1, x0:x1]).permute(2,0,1)[None]
            r = m(t)[0].permute(1,2,0).clamp(0,1).numpy()
            ty1, tx1 = min(H, y+T), min(W, x+T)
            out[y*s:ty1*s, x*s:tx1*s] = r[(y-y0)*s:(ty1-y0)*s, (x-x0)*s:(tx1-x0)*s]
        print('row', y, flush=True)
Image.fromarray((out*255+0.5).astype(np.uint8)).save(sys.argv[2])
print('done', out.shape)
