from pathlib import Path
from pypdf import PdfReader
from pypdf.generic import IndirectObject
from PIL import Image
import numpy as np,io,json,subprocess,concurrent.futures,sys
source=Path(sys.argv[1]); output=Path(sys.argv[2]); p=output.parent
a=PdfReader(source); b=PdfReader(output)
records=json.loads((output.with_suffix('.json')).read_text())['records']
def normal(value):
 if isinstance(value,IndirectObject):return ('ref',value.idnum,value.generation)
 if isinstance(value,dict):return {k:normal(v) for k,v in value.items()}
 if isinstance(value,list):return [normal(v) for v in value]
 return value
for row in records:
 x=IndirectObject(row['object'],0,a).get_object();y=IndirectObject(row['object'],0,b).get_object()
 assert normal(x)==normal(y), row['object']
 assert np.array_equal(np.array(Image.open(io.BytesIO(x._data))),np.array(Image.open(io.BytesIO(y._data)))),row['object']
 if '/SMask' in x:assert x['/SMask'].get_data()==y['/SMask'].get_data()
 if x['/ColorSpace'][0]=='/ICCBased':assert x['/ColorSpace'][1].get_object().get_data()==y['/ColorSpace'][1].get_object().get_data()
print(f'{len(records)} JPEGs: decoded pixels, dictionaries, alpha masks and ICC identical',flush=True)
assert len(a.pages)==len(b.pages)
for i,(x,y) in enumerate(zip(a.pages,b.pages)):
 assert x.get_contents().get_data()==y.get_contents().get_data(),i
 assert x.mediabox==y.mediabox,i
 assert x.extract_text()==y.extract_text(),i
print(f'{len(a.pages)} page content streams, text and media boxes identical',flush=True)
for folder in ['portfolio-base','portfolio-lossless']: (p/folder).mkdir(exist_ok=True)
def render(args): subprocess.run(['pdftoppm','-r','72','-png',args[0],args[1]],check=True,stderr=subprocess.PIPE)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 list(pool.map(render,[(str(source),str(p/'portfolio-base/page')),(str(output),str(p/'portfolio-lossless/page'))]))
for x in (p/'portfolio-base').glob('page-*.png'):
 y=p/'portfolio-lossless'/x.name
 assert np.array_equal(np.array(Image.open(x)),np.array(Image.open(y))), x.name
print(f'{len(a.pages)} pages at 72dpi: zero differing pixels',flush=True)
report=json.loads((output.with_suffix('.json')).read_text());report['validation']={'decodedJpegsIdentical':len(records),'pageStreamsIdentical':len(a.pages),'renderDpi':72,'pagesPixelIdentical':len(a.pages)}
(output.with_suffix('.json')).write_text(json.dumps(report,indent=2))
