from pathlib import Path
import hashlib
root=Path(__file__).resolve().parents[1]
def sha(b):return hashlib.sha256(b).hexdigest()
src=root/'docs/billing-bundle-ui.green-r1.js';raw=src.read_bytes()
assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()=='ddb1358db478a143825ffbb85d0dac173c426350'
s=raw.decode()
def replace(a,b):
 global s
 assert s.count(a)==1,(a[:80],s.count(a));s=s.replace(a,b,1)
replace("month=monthNow(),allMonths=false,closePreview=null;","month=monthNow(),allMonths=false,closePreview=null,printFormat='combined';")
replace("card=null;month=monthNow();allMonths=false;}","card=null;month=monthNow();allMonths=false;printFormat='combined';}")
replace('同じ元請さんの確定済み請求書を選び、合計表＋各現場の明細を1つのPDFにします。新しい請求の登録・送信は行いません。','同じ元請さんの確定済み請求を、現場ごとに並べた緑の請求書にまとめます。出来高は今回分だけ。元の請求番号・金額は残り、新たな請求や売上は登録しません。')
replace('<div id="bbTotal" aria-live="polite"></div>','<label for="bbPrintFormat">請求書のまとめ方</label><select id="bbPrintFormat"><option value="combined">1枚にまとめる（現場別・出来高も一緒）</option><option value="attachments">合計表＋各現場の請求書（従来）</option></select><p class="note">行数・備考が多い場合はA4の次ページに続きます。消費税は元の各請求書の記載額を合計します。</p><div id="bbTotal" aria-live="polite"></div>')
replace("q('#bbRefresh').onclick=refresh;","q('#bbRefresh').onclick=refresh;\n  q('#bbPrintFormat').onchange=()=>{printFormat=q('#bbPrintFormat').value;ticket++;closePreview?.();};")
replace('async function renderHTML(bundle,isCurrent=()=>true,withCover=true){','async function renderHTML(bundle,isCurrent=()=>true,withCover=true,combined=false){')
replace("const parsed=bundle.rows.map(r=>new DOMParser().parseFromString(E.printHTML(r.document),'text/html'));","if(combined&&!root.ToyaCombinedInvoice)throw Error('1枚の請求書にまとめる機能を読み込めません。画面を更新してください。');\n  const parsed=combined?[root.ToyaCombinedInvoice.build(bundle)]:bundle.rows.map(r=>new DOMParser().parseFromString(E.printHTML(r.document),'text/html'));")
replace('if(withCover){','if(withCover&&!combined){')
replace("label=bundle.rows[j].document.document_number||'下書き';","label=combined?'請求書（複数現場・集約）':bundle.rows[j].document.document_number||'下書き';")
replace('async function preview(){',"async function renderCombinedHTML(bundle,isCurrent=()=>true){return renderHTML(bundle,isCurrent,false,true);}\n async function preview(){")
replace("const html=await renderHTML(b,()=>identity()===mine&&ticket===t);","const combined=printFormat==='combined';\n   const html=await (combined?renderCombinedHTML:renderHTML)(b,()=>identity()===mine&&ticket===t);")
replace("<b>元請別まとめ請求</b>","<b>'+ (combined?'請求書（複数現場）':'元請別まとめ請求') +'</b>")
replace('合計表と各現場の請求書を1つの「TOYAONE.pdf」にします。請求の追加登録・自動送信はしません。',"'+(combined?'各現場の今回請求額を、1つの緑の請求書に並べています。元の請求番号と金額はそのままで、請求の追加登録・自動送信はしません。':'合計表と各現場の請求書を1つの「TOYAONE.pdf」にします。請求の追加登録・自動送信はしません。')+'");
# Stable full-paper preview bounds rather than the iframe's expanding scrollHeight.
replace("function fit(){if(disposed)return;const scale=Math.min(1,viewport.clientWidth/794),height=iframe.contentDocument?.body?.scrollHeight||1123;iframe.style.cssText='width:794px;height:'+height+'px;border:0;transform-origin:0 0;transform:scale('+scale+')';stage.style.height=Math.ceil(height*scale)+'px';stage.style.width=Math.ceil(794*scale)+'px';}","function fit(){if(disposed||!viewport.clientWidth)return;const pages=iframe.contentDocument?.querySelectorAll('.te2-page');if(!pages?.length)return;const first=pages[0].getBoundingClientRect(),last=pages[pages.length-1].getBoundingClientRect(),width=Math.ceil(first.width),height=Math.ceil(last.bottom-first.top),scale=Math.min(1,viewport.clientWidth/width);iframe.style.cssText='width:'+width+'px;height:'+height+'px;border:0;transform-origin:0 0;transform:scale('+scale+')';stage.style.height=Math.ceil(height*scale)+'px';stage.style.width=Math.min(width,viewport.clientWidth)+'px';viewport.style.height=Math.ceil(height*scale)+'px';}")
replace("dialog.remove();root.removeEventListener('resize',fit);closePreview=null;","dialog.remove();root.removeEventListener('resize',fit);resizeObserver?.disconnect();closePreview=null;")
replace("stage=q('.bb-preview-stage',dialog);","stage=q('.bb-preview-stage',dialog),resizeObserver=root.ResizeObserver?new ResizeObserver(fit):null;resizeObserver?.observe(viewport);")
replace('renderHTML,renderSingleHTML});','renderHTML,renderSingleHTML,renderCombinedHTML});')
# Keep the existing audited renderHTML API as the previous cover+attachments mode.
dst=root/'docs/billing-bundle-ui.combined-r1.js';dst.write_text(s)
p=root/'docs/index.html';b=p.read_bytes()
assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()=='67849b21e806e72f147428ada881a7c4322471fa','index changed; review before applying'
h=b.decode();a='<script src="billing-bundle-ui.green-r1.js?v=20261005-green-r1"></script>';assert h.count(a)==1
h=h.replace(a,'<script src="billing-combined-sheet.r1.js?v=20261005-combined-r1"></script>\n<script src="billing-bundle-ui.combined-r1.js?v=20261005-combined-r1"></script>');p.write_text(h)
print('Display-only combined sheet prepared. No financial modules or records changed.')
for p in [dst,root/'docs/billing-combined-sheet.r1.js',root/'docs/index.html']:print(p.name,sha(p.read_bytes()))
