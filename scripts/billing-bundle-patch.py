from pathlib import Path
import hashlib
root=Path(__file__).resolve().parents[1];docs=root/'docs'
def check(raw,expected):
 if hashlib.sha256(raw).hexdigest()!=expected:raise SystemExit('Source/output changed; do not apply this patch to a different release.')
source=(docs/'project-business.pdf-r1.js').read_bytes();check(source,'82e3dce64507d83f48dfafba870f6507251a87590b5035b28b8a1c6c456bd525')
new=source.decode().replace(' window.ToyaProjectBusiness={\n',' window.ToyaProjectBusiness={\n  // Navigation only. Creating a draft here does not save/issue it. The original\n  // editor, explicit approval, server authorization and version checks remain.\n  async openForBundle({siteId:target,documentId=\'\',kind:requested=\'invoice\',customer=null}={}){\n   if(![\'invoice\',\'progress\'].includes(requested)||!identity()||!allowed(requested)||busy||!discard())return false;\n   if(!mount())return false;const mine=identity();\n   if(!sites.some(s=>s.id===target))await refresh();\n   if(identity()!==mine||!sites.some(s=>s.id===target))return false;\n   editor=null;dirty=false;siteId=target;kind=requested;q(\'#pbSite\').value=target;\n   await loadSite();if(identity()!==mine||!siteLoaded)return false;\n   renderTabs();renderList();\n   if(documentId){const found=docs.find(d=>d.id===documentId&&d.kind===requested);if(!found)return false;openDocument(found.id);}\n   else{newDocument(requested);if(editor&&customer){editor.customer_name=String(customer.name||\'\').slice(0,160);editor.customer_address=String(customer.address||\'\').slice(0,500);renderEditor(false);}}\n   q(\'nav [data-page="homePage"]\')?.click();q(\'#pbEditor\')?.scrollIntoView({block:\'start\',behavior:\'smooth\'});return true;\n  },\n')
check(new.encode(),'62ab37bbb57e5513a3a7360f7271d8292dde8f68e6417f7e78a0f86acd6aada4');(docs/'project-business.bundle-r1.js').write_text(new)
index=(docs/'index.html').read_bytes();check(index,'767eea208b0de52bdc718fed2d5dd5ea293879623b0b8f693c93e1a70f2085b1')
s=index.decode().replace('project-business.pdf-r1.js?v=20260924-pdf1','project-business.bundle-r1.js?v=20261001-bundle-r1')
left,right=s.rsplit('\n</body>',1)
s=left+'\n<script src="billing-bundle.r1.js?v=20261001-bundle-r1"></script>\n<script src="billing-bundle-ui.r1.js?v=20261001-bundle-r1"></script>\n</body>'+right
check(s.encode(),'786a172a3813eec7a2f71cde7e4081e8c588516e3dd739234566cb7f95ee0e57');(docs/'index.html').write_text(s)
print('Guarded optional invoice-bundle entry and final loader references only.')
