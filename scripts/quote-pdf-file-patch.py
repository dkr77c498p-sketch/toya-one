from pathlib import Path
import hashlib
root=Path(__file__).resolve().parents[1]
def blob(data):return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
def one(s,a,b):
 assert s.count(a)==1,(s.count(a),a[:80])
 return s.replace(a,b,1)
p=root/'docs/project-business.js';assert blob(p.read_bytes())=='613c8a4eeb5a238dc36cf1f6f1dab76d616ecaf0'
s=p.read_text();start=s.index(' function preview(){');end=s.index('\n document.addEventListener(\'toya-site-renamed\'',start)
old=s[start:end];new=old
new=one(new,"  closeDocumentPreview?.();const opener=", "  const pdfOwner=identity();let pdfController=null;\n  closeDocumentPreview?.();const opener=")
new=one(new,'<button id="pbPrint" class="btn dark" type="button">印刷・PDF保存</button>', "'+(d.kind==='estimate'?'<button id=\"pbPdf\" class=\"btn dark\" type=\"button\">PDF保存・共有</button><button id=\"pbPrint\" class=\"btn light\" type=\"button\">印刷（従来）</button>':'<button id=\"pbPrint\" class=\"btn dark\" type=\"button\">印刷・PDF保存</button>')+'")
new=one(new, "'印刷画面でPDFに保存できます。下書きには「下書き」と表示します。'", "d.kind==='estimate'?'PDF保存・共有で「TOYAONE.pdf」を作成します。下書きの表示は残ります。従来の印刷では端末側のURLが付く場合があります。':'印刷画面でPDFに保存できます。下書きには「下書き」と表示します。'")
new=one(new,'closed=true;closeDocumentPreview=null;stopFit();','closed=true;pdfController?.dispose();closeDocumentPreview=null;stopFit();')
new=one(new,'  frame.srcdoc=E.printHTML(d);', '  const pdfHTML=E.printHTML(d);frame.srcdoc=pdfHTML;')
new=one(new,"  if(q('#pbPreviewConditions'))", "  if(d.kind==='estimate'){if(window.ToyaQuotePDF)pdfController=window.ToyaQuotePDF.mount({dialog,button:q('#pbPdf'),html:pdfHTML,isCurrent:()=>!closed&&identity()===pdfOwner});else q('#pbPdf').onclick=()=>alert('PDF作成機能を読み込めませんでした。入力を保存後、画面を更新してください。');}\n  if(q('#pbPreviewConditions'))")
s=s[:start]+new+s[end:]
assert s[:start]==p.read_text()[:start] and s[start+len(new):]==p.read_text()[end:]
(root/'docs/project-business.pdf-r1.js').write_text(s)
p=root/'docs/index.html';index=p.read_text();assert blob(p.read_bytes())=='956dc8a33341e8627c6007e4ea293c0ec2912ec4'
index=one(index,'<script src="project-business.js?v=20260919-contract-entry-v2"></script>','<script src="quote-pdf-export.r1.js?v=20260924-pdf1"></script>\n<script src="project-business.pdf-r1.js?v=20260924-pdf1"></script>')
p.write_text(index)
print('Only preview changes; original business module and every other function retained.')
