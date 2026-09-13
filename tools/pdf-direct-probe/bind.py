"""Bind the probe's one image paint to its sole PDF draw; reject other documents."""
import hashlib
import json
import sys
from pathlib import Path
from pypdf import PdfReader
from pypdf.generic import ContentStream

folder = Path(sys.argv[1])
meta = json.loads((folder / 'capture-metadata.json').read_text())['metadata']
pdf = folder / 'baseline.pdf'
r = PdfReader(pdf)
assert len(r.pages) == 1, 'Probe must have one page'
p = r.pages[0]
ops = ContentStream(p.get_contents(), r).operations
stack, matrix, draws = [], [1, 0, 0, 1, 0, 0], []
def compose(m, n):
    a,b,c,d,e,f=m; A,B,C,D,E,F=n
    return [a*A+c*B,b*A+d*B,a*C+c*D,b*C+d*D,a*E+c*F+e,b*E+d*F+f]
for i,(args,op) in enumerate(ops):
    if op == b'q': stack.append(matrix[:])
    elif op == b'Q': matrix = stack.pop()
    elif op == b'cm': matrix = compose(matrix, list(map(float,args)))
    elif op == b'Do': draws.append((i,str(args[0]),matrix[:]))
assert len(draws) == 1, 'Require exactly one image draw, not a size match'
index,name,ctm=draws[0]
resources=p['/Resources']['/XObject']
assert len(resources) == 1, 'Unexpected extra resources'
ref=resources.raw_get(name); obj=ref.get_object()
assert obj['/Subtype'] == '/Image', 'Forms outside this experiment'
# The isolated paint occupies exactly the page, with its original crop.
a,b,tx=meta['paint']['imageTransform'][0]; c,d,ty=meta['paint']['imageTransform'][1]
assert b == 0 and c == 0 and a > 0 and d > 0
w,h=meta['width'],meta['height']
expected=[w/a,0,0,h/d,-w*tx/a,h-h*(1-ty)/d]
assert max(abs(x-y) for x,y in zip(ctm,expected)) < 0.001, (ctm,expected)
assert list(map(float,p.mediabox)) == [0,0,w,h]
mask=obj['/SMask']; assert mask['/BitsPerComponent']==8 and mask['/ColorSpace']=='/DeviceGray'
assert len(mask.get_data())==int(mask['/Width'])*int(mask['/Height']) and set(mask.get_data())=={255}
assert obj['/ColorSpace'][0]=='/ICCBased' and obj['/ColorSpace'][1].get_object()['/N']==3
binding={ 'pdfSha256':hashlib.sha256(pdf.read_bytes()).hexdigest(), 'page':0,
 'resource':name, 'objectNumber':ref.idnum, 'operationIndex':index, 'ctm':ctm,
 'expectedCtm':expected, 'width':int(obj['/Width']), 'height':int(obj['/Height']),
 'imageSha256':hashlib.sha256(obj._data).hexdigest(),
 'sourceSha256':hashlib.sha256((folder/'source.bin').read_bytes()).hexdigest(),
 'nodeId':meta['nodeId'], 'fillIndex':meta['fillIndex'], 'imageHash':meta['imageHash'],
 'scope':'one isolated opaque image paint; RGB color compatibility independently inspected'}
(folder/'figma.jpg').write_bytes(obj._data)
(folder/'binding.json').write_text(json.dumps(binding,indent=2))
print(json.dumps(binding,indent=2))
