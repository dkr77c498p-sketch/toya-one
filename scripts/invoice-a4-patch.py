"""A4 preview/export only. Versioned copies; no financial or account writes."""
from pathlib import Path
import hashlib
root=Path(__file__).resolve().parents[1]
def checked(name,digest):
    text=(root/name).read_text()
    assert hashlib.sha256(text.encode()).hexdigest()==digest,name+' changed; review first'
    return text
def once(text,old,new):
    assert text.count(old)==1,old[:100]
    return text.replace(old,new,1)
business=checked('docs/project-business.bundle-r1.js','62ab37bbb57e5513a3a7360f7271d8292dde8f68e6417f7e78a0f86acd6aada4')
ui=checked('docs/billing-bundle-ui.r1.js','a7fffa824515fbf1fb40d2b929706139c8ad2b6551b022ba25b773da0759c5bf')
index=checked('docs/index.html','fcfa87e762e9f5e06e2acc460e15703e37861810fb92061d1358a2b11c5768cb')
ui=once(ui,'async function renderHTML(bundle,isCurrent=()=>true){','async function renderHTML(bundle,isCurrent=()=>true,withCover=true){')
ui=once(ui,"   const i=bundle.issuer,issuer=","   if(withCover){\n   const i=bundle.issuer,issuer=")
ui=once(ui,"   for(let j=0;j<parsed.length;j++){","   }\n   for(let j=0;j<parsed.length;j++){")
ui=once(ui,'label=bundle.rows[j].document.document_number;',"label=bundle.rows[j].document.document_number||'下書き';")
ui=once(ui,'@page{size:A4;margin:0}','@page{size:A4 portrait;margin:0}')
ui=once(ui,'.te2-page:last-child{break-after:auto}', '.te2-page:last-child{break-after:auto;page-break-after:auto}')
# Reuse the same renderer/pagination/logo path, without a cover or issued-only
# bundle validation, when the existing single-document editor previews a draft.
single=""" async function renderSingleHTML(document,isCurrent=()=>true){
  if(!document||!['invoice','progress'].includes(document.kind)||!['draft','issued','void'].includes(document.status))throw Error('請求書の種類・状態を確認してください。');
  const d=JSON.parse(JSON.stringify(document));
  return renderHTML({rows:[{document:d}],issuer:d.issuer||{},customer_name:d.customer_name||'',customer_address:d.customer_address||''},isCurrent,false);
 }
"""
ui=once(ui,' async function preview(){',single+' async function preview(){')
ui=once(ui,',renderHTML});',',renderHTML,renderSingleHTML});')
# Use actual sheet bounds, never body.scrollHeight which may include the iframe
# viewport and feed its previous height back into the preview's next layout.
business=once(business,'    const height=Math.ceil(Math.max(body.scrollHeight,body.getBoundingClientRect().height));',"""    const sheets=[...body.querySelectorAll(':scope > .te2-page')];
    const height=sheets.length?Math.ceil(sheets[sheets.length-1].getBoundingClientRect().bottom+doc.defaultView.scrollY):Math.ceil(Math.max(body.scrollHeight,body.getBoundingClientRect().height));""")
start=business.index(' function preview(){')
end=business.index(" document.addEventListener('toya-site-renamed'",start)
new=r''' async function preview(){
  if(!editor||!allowed(editor.kind))return note('この書類は現在のプランでは利用できません。',true);
  let d;try{d=calculatedDocument().d;if(d.status==='draft')d.document_number=null;}catch(e){return note(e.message,true);}
  const pdfOwner=identity();let pdfController=null;
  closeDocumentPreview?.();const opener=document.activeElement,dialog=document.createElement('dialog');dialog.id='pbPreview';
  dialog.innerHTML='<div class="pb-preview-toolbar"><b>'+E.kinds[d.kind]+'プレビュー</b><div style="flex-wrap:wrap">'+ (d.kind==='estimate'&&d.status==='draft'?'<button id="pbPreviewConditions" class="btn light" type="button">見積条件を変更</button>':'')+'<button id="pbPdf" class="btn dark" type="button" disabled>PDF保存・共有</button><button id="pbPrint" class="btn light" type="button" disabled>印刷（従来）</button><button id="pbPreviewClose" class="btn light" type="button">閉じる</button></div></div><p class="note">'+(d.status==='draft'&&d.kind!=='estimate'?'今は下書きです。正式な請求書にするには、この画面を閉じて「下書きを保存」→「内容を確定・採番」を押してください。請求番号が付き、下書き表示が消えます。':'PDF保存・共有で「TOYAONE.pdf」を作成します。下書き・取消済みの表示は残ります。')+'</p><p id="pbPaperStatus" class="note" role="status">A4縦の用紙を準備しています…</p><div class="pb-preview-viewport" style="height:auto;max-height:70vh" tabindex="0" role="region" aria-label="書類のプレビュー"><div class="pb-preview-stage"><iframe title="書類の印刷プレビュー" scrolling="no" sandbox="allow-same-origin allow-modals"></iframe></div></div>';document.body.append(dialog);
  const frame=dialog.querySelector('iframe'),stopFit=fitDocumentPreview(frame);let closed=false;
  const valid=()=>!closed&&dialog.isConnected&&dialog.open&&identity()===pdfOwner;
  closeDocumentPreview=()=>{if(closed)return;closed=true;pdfController?.dispose();closeDocumentPreview=null;stopFit();if(dialog.open)dialog.close();dialog.remove();if(opener?.isConnected)opener.focus({preventScroll:true});};
  q('#pbPreviewClose',dialog).onclick=closeDocumentPreview;
  if(q('#pbPreviewConditions',dialog))q('#pbPreviewConditions',dialog).onclick=()=>{closeDocumentPreview();const fields=q('#pbReviewFields'),input=q('#pbEstimateConditions');if(fields)fields.open=true;if(input){input.scrollIntoView({block:'center'});input.focus({preventScroll:true});}};
  const close=closeDocumentPreview;dialog.addEventListener('close',close,{once:true});dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.showModal();
  try{
   let pdfHTML,exporter;
   if(d.kind==='estimate'){pdfHTML=E.printHTML(d);exporter=window.ToyaQuotePDF;}
   else{
    if(!window.ToyaBillingBundleUI?.renderSingleHTML)throw Error('A4請求書の表示機能を読み込めません。入力を保存後、画面を更新してください。');
    pdfHTML=await window.ToyaBillingBundleUI.renderSingleHTML(d,valid);exporter=window.ToyaBillingBundlePDF;
   }
   if(!valid())return;
   frame.onload=()=>{if(valid()){q('#pbPrint',dialog).disabled=false;q('#pbPaperStatus',dialog).textContent='A4縦（210 × 297 mm）／用紙全体を表示しています。';}};
   frame.srcdoc=pdfHTML;
   q('#pbPrint',dialog).onclick=()=>{if(valid()){frame.contentWindow.focus();frame.contentWindow.print();}};
   if(exporter){pdfController=exporter.mount({dialog,button:q('#pbPdf',dialog),html:pdfHTML,isCurrent:valid});q('#pbPdf',dialog).disabled=false;}
   else throw Error('PDF作成機能を読み込めませんでした。入力を保存後、画面を更新してください。');
  }catch(e){if(valid())q('#pbPaperStatus',dialog).textContent='プレビューを作成できませんでした：'+(e.message||e);}
 }
'''
business=business[:start]+new+business[end:]
index=once(index,'project-business.bundle-r1.js?v=20261001-bundle-r1','project-business.a4-r1.js?v=20261002-a4-r1')
index=once(index,'billing-bundle-ui.r1.js?v=20261001-bundle-r1','billing-bundle-ui.a4-r1.js?v=20261002-a4-r1')
for name,text in {'docs/project-business.a4-r1.js':business,'docs/billing-bundle-ui.a4-r1.js':ui,'docs/index.html':index}.items():
    target=root/name
    if name!='docs/index.html':assert not target.exists(),name
    target.write_text(text)
    print(name,hashlib.sha256(text.encode()).hexdigest())
