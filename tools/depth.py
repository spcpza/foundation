import torch, numpy as np, sys
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForDepthEstimation
torch.set_num_threads(4)
name = sys.argv[3] if len(sys.argv) > 3 else 'depth-anything/Depth-Anything-V2-Large-hf'
proc = AutoImageProcessor.from_pretrained(name); model = AutoModelForDepthEstimation.from_pretrained(name).eval()
im = Image.open(sys.argv[1]).convert('RGB')
# run at a higher resolution than default for crisper edges (multiple of 14)
inp = proc(images=im, return_tensors='pt', size={'height': 1022, 'width': 574}, keep_aspect_ratio=False, do_resize=True)
with torch.no_grad():
    d = model(**inp).predicted_depth[0]
d = torch.nn.functional.interpolate(d[None,None], size=(im.height, im.width), mode='bicubic', align_corners=False)[0,0].numpy()
lo, hi = np.percentile(d, 1), np.percentile(d, 99.5)
d = np.clip((d-lo)/(hi-lo), 0, 1)   # 1 = near, 0 = far
np.save(sys.argv[2], d.astype(np.float32))
Image.fromarray((d*255).astype(np.uint8)).save(sys.argv[2].replace('.npy','.png'))
Image.fromarray(np.round(d*65535).astype(np.uint16)).save(sys.argv[2].replace('.npy','16.png'))  # lossless, small enough to commit
print('ok', d.shape)
