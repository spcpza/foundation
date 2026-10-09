import cv2, numpy as np
im=cv2.imread('/workspace/family-site/ref-image.png')
b,g,r=[im[...,i].astype(int) for i in range(3)]
# bright saturated red strokes (arrows), distinct from darker crimson cloak
m=((r>150)&(g<90)&(b<90)&(r-g>110)&(r-b>100)).astype(np.uint8)*255
# keep only connected components that are near a strong-red core
core=((r>195)&(g<60)&(b<60)).astype(np.uint8)
n,lab,st,_=cv2.connectedComponentsWithStats(m,8)
keep=np.zeros_like(m)
for i in range(1,n):
    comp=lab==i
    if core[comp].sum()>3: keep[comp]=255
keep=cv2.dilate(keep,np.ones((3,3),np.uint8),iterations=3)
cv2.imwrite('proof/arrow-mask.png',keep)
out=cv2.inpaint(im,keep,7,cv2.INPAINT_TELEA)
cv2.imwrite('src/painting-clean.png',out)
print('mask px',(keep>0).sum())
