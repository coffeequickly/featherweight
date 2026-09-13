"""Compare already rendered probe PDFs. Uniform-window SSIM is a diagnostic, not a release gate."""
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from pypdf import PdfReader
p=Path(sys.argv[1])
def rgb(name): return np.array(Image.open(p/(name+'.png')).convert('RGB'),dtype=np.float64)
def gray(a): return a@np.array([0.299,0.587,0.114])
def mean11(a):
 s=np.pad(a,((1,0),(1,0))).cumsum(0).cumsum(1)
 return (s[11:,11:]-s[:-11,11:]-s[11:,:-11]+s[:-11,:-11])/121
def ssim(x,y):
 x,y=gray(x),gray(y); mx,my=mean11(x),mean11(y)
 vx,vy=mean11(x*x)-mx*mx,mean11(y*y)-my*my; cov=mean11(x*y)-mx*my
 return float(np.mean(((2*mx*my+6.5025)*(2*cov+58.5225))/((mx*mx+my*my+6.5025)*(vx+vy+58.5225))))
ref=rgb('reference'); base=rgb('baseline'); results=[]
base_reader=PdfReader(p/'baseline.pdf'); base_content=base_reader.pages[0].get_contents().get_data()
for name in ['baseline','noop']+[f'direct-q{q}' for q in [60,70,76,80,85,90,98]]:
 a=rgb(name); error=a-ref
 r=PdfReader(p/(name+'.pdf')); page=r.pages[0]; obj=page['/Resources']['/XObject']['/X1']
 assert page.get_contents().get_data()==base_content, name+' changed content/CTM'
 assert obj['/Width']==1440 and obj['/Height']==1920
 rmse=float(np.sqrt(np.mean(error*error)))
 results.append({'name':name,'pdfBytes':(p/(name+'.pdf')).stat().st_size,'jpegBytes':len(obj._data),
 'rmseToReference':rmse,'psnrToReference':float(20*np.log10(255/rmse)),'ssimToReference':ssim(ref,a),
 'meanRgbDeltaFromBaseline':(a-base).mean((0,1)).tolist(),
 'maxPixelDeltaFromBaseline':float(np.abs(a-base).max())})
print(json.dumps(results,indent=2));(p/'comparison.json').write_text(json.dumps(results,indent=2))
# Full-frame views and three detailed crops; generated from PDF renders, never retouched.
names=['reference','baseline','direct-q76','direct-q80']
boxes=[(100,100,400,400),(480,120,780,420),(810,120,1110,420)]
canvas=Image.new('RGB',(1200,1160),'white');draw=ImageDraw.Draw(canvas)
for col,name in enumerate(names):
 im=Image.open(p/(name+'.png')).convert('RGB')
 draw.text((col*300+8,8),name,fill='black')
 canvas.paste(im.resize((285,150)),(col*300+8,35))
 for row,box in enumerate(boxes):canvas.paste(im.crop(box),(col*300,210+row*310))
canvas.save(p/'comparison.png')
