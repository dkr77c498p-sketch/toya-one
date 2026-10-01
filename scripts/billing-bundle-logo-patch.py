"""Preserve the original SVG logo crop as a PNG only for combined invoice PDFs.
No business records, shared PDF code, accounting, login or report code changes.
"""
from pathlib import Path
import base64, hashlib, io, json, xml.etree.ElementTree as ET
from PIL import Image
root=Path(__file__).resolve().parents[1];docs=root/'docs'
def checked(path,sha):
    raw=path.read_bytes()
    assert hashlib.sha256(raw).hexdigest()==sha, str(path)+' changed; stop instead of overwriting'
    return raw
svg=checked(docs/'toya-document-logo.svg','203bc025d00a288f6979f09f5fc34c56e062a390041142997680019964beab16')
xml=ET.fromstring(svg);assert xml.attrib['viewBox']=='340 100 615 665'
picture=xml.find('{http://www.w3.org/2000/svg}image');uri=picture.get('{http://www.w3.org/1999/xlink}href')
assert uri.startswith('data:image/jpeg;base64,')
with Image.open(io.BytesIO(base64.b64decode(uri.split(',',1)[1],validate=True))) as image:
    assert image.size==(1277,902)
    image.crop((340,100,955,765)).save(docs/'billing-bundle-logo.r1.png',optimize=True)
# A namespaced copy: the shared quotation PDF exporter remains byte-identical.
source=checked(docs/'quote-pdf-export.r1.js','16e661a30c2b3e49f213e3ed1162eb0f93bf1d7e1a8a6d20f0b552b71f411351').decode()
assert source.count('ToyaQuotePDF')==2 and source.count('toya-document-logo.svg')==1
pdf=source.replace('ToyaQuotePDF','ToyaBillingBundlePDF').replace('toya-document-logo.svg','billing-bundle-logo.r1.png').replace('見積書','請求書').replace('同じ見積','同じ請求')
pdf='/* Bundle-only PNG logo compatibility; original quotation exporter unchanged. */\n'+pdf
(docs/'billing-bundle-pdf.r1.js').write_text(pdf)
ui=checked(docs/'billing-bundle-ui.r1.js','5c8dbabc8b689d452c0ae4d376d45bc654b9b288ada03ee42da2a9bdcbcdf634').decode()
assert ui.count('root.ToyaQuotePDF')==2 and ui.count('img.src=src.href;await img.decode();')==1
ui=ui.replace('root.ToyaQuotePDF','root.ToyaBillingBundlePDF').replace('img.src=src.href;await img.decode();',"img.src=new URL('billing-bundle-logo.r1.png',assets).href;await img.decode();")
(docs/'billing-bundle-ui.r1.js').write_text(ui)
index=checked(docs/'index.html','786a172a3813eec7a2f71cde7e4081e8c588516e3dd739234566cb7f95ee0e57').decode()
needle='<script src="billing-bundle-ui.r1.js?v=20261001-bundle-r1"></script>';assert index.count(needle)==1
index=index.replace(needle,'<script src="billing-bundle-pdf.r1.js?v=20261001-bundle-pdf-r1"></script>\n'+needle)
(docs/'index.html').write_text(index)
test=checked(root/'tests/billing-bundle-browser.py','42954fa6779afca10afa95329c5886712d619cf65b67817b572abeb2a7afeb3f').decode()
needle="  if url=='http://localhost/toya-document-logo.svg':return r.fulfill(path=str(base/'toya-document-logo.svg'),content_type='image/svg+xml')"
assert test.count(needle)==1
test=test.replace(needle,needle+"\n  if url=='http://localhost/billing-bundle-logo.r1.png':return r.fulfill(path=str(base/'billing-bundle-logo.r1.png'),content_type='image/png')")
(root/'tests/billing-bundle-browser.py').write_text(test)
files=['docs/index.html','docs/billing-bundle.r1.js','docs/billing-bundle-ui.r1.js','docs/billing-bundle-pdf.r1.js','docs/billing-bundle-logo.r1.png','docs/project-business.bundle-r1.js']
manifest={name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in files}
out=root/'test-output/billing-bundle';out.mkdir(exist_ok=True,parents=True)
(out/'release-hashes.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
