"""Add the approved invoice paper layout without changing any stored business data."""
from pathlib import Path
import hashlib
p=Path('docs')
s=(p/'billing-bundle-ui.a4-r1.js').read_text()
assert hashlib.sha256(s.encode()).hexdigest()=='0d96b2c6f1bd483745c6f8fc9b514e3e9a8a07075fb5f024540cd5840a457ead', 'Original invoice renderer changed; review before applying'
needle="  const styles=parsed.map(d=>[...d.querySelectorAll('style')].map(s=>s.textContent).join('\\n'));const css=[...new Set(styles)].join('\\n')+'\\n'+paperCSS;"
replacement="  if(!root.ToyaInvoiceGreenFormat)throw Error('請求書の緑書式を読み込めません。入力を保存して画面を更新してください。');\n  root.ToyaInvoiceGreenFormat.prepare(parsed);\n"+needle.replace("+'\\n'+paperCSS;","+'\\n'+paperCSS+'\\n'+root.ToyaInvoiceGreenFormat.css;")
assert s.count(needle)==1
s=s.replace(needle,replacement)
needle='   for(let j=0;j<pages.length;j++){const p=pages[j],box=p.page.getBoundingClientRect()'
assert s.count(needle)==1
s=s.replace(needle,'   root.ToyaInvoiceGreenFormat.finish(doc,pages);\n'+needle)
h=(p/'index.html').read_text()
assert hashlib.sha256(h.encode()).hexdigest()=='ecb10a7dc6ac2501a1f51cd223320878d1b026bd8ae62b14a8466fd690e93943','Application entry changed; review before applying'
old='<script src="billing-bundle-ui.a4-r1.js?v=20261002-a4-r1"></script>'
new='<script src="invoice-green-format.r1.js?v=20261005-green-r1"></script>\n<script src="billing-bundle-ui.green-r1.js?v=20261005-green-r1"></script>'
assert h.count(old)==1
h=h.replace(old,new)
expected={'invoice-green-format.r1.js':'f3bf5c4e9b69baf376d48690170a15e87b3f4d478f062e373cb69fe13791e2af','billing-bundle-ui.green-r1.js':'774ecc84924cac9e512f3ee456d0f8de5fc6e298a4116f83e25476aa0c638638','index.html':'f8699edaaf2a3b4c48593ec56d8f8d6aa920028f71d26c8559b8d085700be1d2'}
outputs={'invoice-green-format.r1.js':(p/'invoice-green-format.r1.js').read_text(),'billing-bundle-ui.green-r1.js':s,'index.html':h}
for name,text in outputs.items():assert hashlib.sha256(text.encode()).hexdigest()==expected[name],name
assert not (p/'billing-bundle-ui.green-r1.js').exists(),'Do not overwrite an existing reviewed renderer'
(p/'billing-bundle-ui.green-r1.js').write_text(s)
(p/'index.html').write_text(h)
print('Applied only green invoice format and one loader replacement; source business modules unchanged.')
