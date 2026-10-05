/* Administrator-only delivery bundle: selected issued site invoices + progress
 * invoices, an exact-sum cover, and every original detail in one local PDF.
 * This module never saves, issues, cancels or duplicates an accounting record. */
(function(root){
 'use strict';
 if(root.ToyaBillingBundleUI||!root.ToyaBillingBundle||!root.ToyaProjectDocuments)return;
 const B=root.ToyaBillingBundle,E=root.ToyaProjectDocuments,q=(s,r=document)=>r.querySelector(s),e=B.esc,nl=x=>e(x).replace(/\n/g,'<br>');
 const assets=new URL('.',document.currentScript?.src||document.baseURI);
 const identity=()=>typeof cloudProfile!=='undefined'&&cloudProfile?.active===true&&cloudProfile.role==='admin'&&cloudProfile.company_id&&typeof cloudClient!=='undefined'&&cloudClient&&root.ToyaCompanyAccess?.allows('invoice')===true?cloudProfile.id+':'+cloudProfile.company_id:'';
 const monthNow=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,7);
 let owner='',card=null,data=null,loading=false,ticket=0,selected=new Map(),clients=[],clientKey='',month=monthNow(),allMonths=false,closePreview=null,printFormat='combined';
 const status=(text,error=false)=>{const x=q('#bbStatus');if(x){x.textContent=text;x.classList.toggle('bb-error',error);}};
 function clear(){ticket++;closePreview?.();owner='';data=null;loading=false;selected=new Map();clients=[];clientKey='';card?.remove();card=null;month=monthNow();allMonths=false;printFormat='combined';}
 function mount(){
  const id=identity();if(id!==owner){clear();owner=id;}if(!id)return false;if(card?.isConnected)return true;
  const target=q('#projectBusinessCard');if(!target)return false;
  card=document.createElement('section');card.id='billingBundleCard';card.className='card admin-home-only';
  card.innerHTML='<details id="bbOpen"><summary>複数現場をまとめて請求（出来高も一緒に）</summary><p class="note">同じ元請さんの確定済み請求を、現場ごとに並べた緑の請求書にまとめます。出来高は今回分だけ。元の請求番号・金額は残り、新たな請求や売上は登録しません。</p><div class="bb-grid"><div><label for="bbCustomer">元請さん（請求先）</label><select id="bbCustomer"><option value="">元請さんを選ぶ</option></select></div><div><label for="bbMonth">請求書の発行月</label><input id="bbMonth" type="month" value="'+month+'"></div></div><label class="bb-check"><input id="bbAllMonths" type="checkbox">すべての月を表示</label><button id="bbRefresh" class="btn light" type="button">請求書一覧を更新</button><p id="bbStatus" role="status" class="note"></p><div id="bbDocuments"></div><div class="bb-buttons"><button id="bbSelectAll" type="button" class="btn light">この一覧の確定分を選ぶ</button><button id="bbSelectNone" type="button" class="btn light">チェックを外す</button></div><label for="bbPrintFormat">請求書のまとめ方</label><select id="bbPrintFormat"><option value="combined">1枚にまとめる（現場別・出来高も一緒）</option><option value="attachments">合計表＋各現場の請求書（従来）</option></select><p class="note">行数・備考が多い場合はA4の次ページに続きます。消費税は元の各請求書の記載額を合計します。</p><div id="bbTotal" aria-live="polite"></div><p class="note">出来高は「累計」ではなく、前回までの請求を差し引いた今回分だけを合算します。入金済みかどうかは判定しないため、今回送付する書類だけを選んでください。</p><button id="bbPreview" type="button" class="btn lime bb-wide" disabled>まとめ請求を確認・PDFへ</button><details class="bb-new"><summary>まだ請求書を作っていない現場</summary><p class="note">上で元請さんを選び、下で現場と種類を選ぶと、通常の作成画面が開きます。各現場の書類を保存・確定してから、この一覧を更新してください。</p><label for="bbNewSite">この元請さんに請求する現場</label><select id="bbNewSite"><option value="">現場を選ぶ</option></select><div class="bb-buttons"><button id="bbNewInvoice" type="button" class="btn light">請求書を作成</button><button id="bbNewProgress" type="button" class="btn light">出来高請求を作成</button></div></details></details>';
  target.before(card);
  q('#bbOpen').addEventListener('toggle',()=>{if(q('#bbOpen').open&&!data&&!loading)refresh();});
  q('#bbRefresh').onclick=refresh;
  q('#bbPrintFormat').onchange=()=>{printFormat=q('#bbPrintFormat').value;ticket++;closePreview?.();};
  q('#bbCustomer').onchange=()=>{clientKey=q('#bbCustomer').value;selected.clear();closePreview?.();render();};
  q('#bbMonth').onchange=()=>{month=q('#bbMonth').value;selected.clear();closePreview?.();render();};
  q('#bbAllMonths').onchange=()=>{allMonths=q('#bbAllMonths').checked;q('#bbMonth').disabled=allMonths;selected.clear();closePreview?.();render();};
  q('#bbSelectAll').onclick=()=>{if(loading||!data)return;for(const d of candidates().filter(d=>d.status==='issued'))selected.set(d.id,B.stable(d));render();};
  q('#bbSelectNone').onclick=()=>{selected.clear();render();};q('#bbPreview').onclick=preview;
  q('#bbNewInvoice').onclick=()=>openSource('invoice');q('#bbNewProgress').onclick=()=>openSource('progress');
  if(!q('#bbStyles')){const s=document.createElement('style');s.id='bbStyles';s.textContent=uiCSS;document.head.append(s);}render();return true;
 }
 async function read(table,company,mine,t){
  const out=[];for(let offset=0;offset<100000;offset+=500){
   if(identity()!==mine||t!==ticket)throw new DOMException('会社が変わりました。','AbortError');
   let request=cloudClient.from(table).select('*').eq('company_id',company);
   if(table==='project_documents')request=request.in('kind',['invoice','progress']);
   if(table==='revenues')request=request.eq('revenue_type','contract');
   const r=await request.order('id').range(offset,offset+499);if(r.error)throw Error('一覧を読み込めませんでした：'+r.error.message);
   if(!Array.isArray(r.data)||r.data.some(x=>x.company_id!==company))throw Error('会社の書類を確認できません。');out.push(...r.data);if(r.data.length<500)return out;
  }throw Error('一覧の全件を確認できませんでした。途中の合計は表示しません。');
 }
 async function fetchData(mine,t){
  const company=cloudProfile.company_id,[documents,customers,sites,revenues]=await Promise.all(['project_documents','business_customers','sites','revenues'].map(table=>read(table,company,mine,t)));
  return {documents:B.unique(documents,company),customers,sites,revenues,company};
 }
 async function refresh(){
  if(!mount()||loading)return;const mine=owner,t=++ticket;loading=true;closePreview?.();status('請求書を確認しています…');controls();
  try{const next=await fetchData(mine,t);if(identity()!==mine||ticket!==t)return;data=next;let removed=0;for(const [id,v] of selected){const d=data.documents.find(d=>d.id===id);if(!d||d.status!=='issued'||B.stable(d)!==v){selected.delete(id);removed++;}}fillClients();status(removed?'更新・取消された書類のチェックを外しました。内容を確認してください。':'一覧を更新しました。今回まとめる書類にチェックを入れてください。');}
  catch(err){if(identity()===mine&&ticket===t){data=null;selected.clear();status(err.message,true);}}
  finally{if(identity()===mine&&ticket===t){loading=false;render();controls();}}
 }
 function fillClients(){
  const found=new Map();for(const c of data.customers.filter(c=>c.active!==false&&B.text(c.name))){const k=B.recipient(c);found.set(k,{key:k,name:c.name,address:c.address||''});}
  for(const d of data.documents.filter(d=>d.status!=='void'&&B.text(d.customer_name))){const k=B.recipient(d);if(!found.has(k))found.set(k,{key:k,name:d.customer_name,address:d.customer_address||''});}
  clients=[...found.values()].sort((a,b)=>a.name.localeCompare(b.name,'ja')||a.address.localeCompare(b.address,'ja'));
  if(!clients.some(c=>c.key===clientKey))clientKey='';
  const duplicateNames=new Set(clients.filter(c=>clients.filter(x=>x.name===c.name).length>1).map(c=>c.name));
  q('#bbCustomer').replaceChildren(new Option('元請さんを選ぶ',''),...clients.map(c=>new Option(c.name+(duplicateNames.has(c.name)?' ／ '+(c.address||'住所なし'):''),c.key)));q('#bbCustomer').value=clientKey;
  const current=q('#bbNewSite').value;q('#bbNewSite').replaceChildren(new Option('現場を選ぶ',''),...data.sites.filter(s=>s.name&&!['現場名をあとで変更','新しい現場','未登録現場'].includes(s.name)).sort((a,b)=>a.name.localeCompare(b.name,'ja')).map(s=>new Option(s.name+(s.completed_on?'（完工）':''),s.id)));q('#bbNewSite').value=current;
 }
 function candidates(){return !data||!clientKey?[]:data.documents.filter(d=>B.recipient(d)===clientKey&&['issued','draft'].includes(d.status)&&(allMonths||B.monthOK(month)&&d.document_date.slice(0,7)===month)).sort((a,b)=>a.site_name.localeCompare(b.site_name,'ja')||a.document_date.localeCompare(b.document_date));}
 function controls(){if(!card)return;for(const x of card.querySelectorAll('button,select,input'))x.disabled=loading||!data||(x.dataset.bbId&&data?.documents.find(d=>d.id===x.dataset.bbId)?.status!=='issued');q('#bbRefresh').disabled=loading;q('#bbMonth').disabled=loading||allMonths;const total=q('#bbTotal');q('#bbPreview').disabled=loading||total?.dataset.ready!=='true';}
 function render(){
  if(!card)return;const host=q('#bbDocuments');host.replaceChildren();
  const rows=candidates();if(data&&clientKey&&!rows.length)host.innerHTML='<p class="note">この発行月の請求書はありません。月を変えるか、下から請求書を作成してください。</p>';
  for(const d of rows){
   const row=document.createElement('div');row.className='bb-doc';const label=document.createElement('label');label.className='bb-check';const check=document.createElement('input');check.type='checkbox';check.dataset.bbId=d.id;check.checked=selected.has(d.id);check.disabled=d.status!=='issued'||loading;
   const detail=document.createElement('span');detail.innerHTML='<b>'+e(d.site_name)+'</b><small>'+e(d.kind==='progress'?'出来高請求':'請求書')+' ／ '+e(d.document_date)+' ／ '+e(d.document_number||'下書き')+'</small><strong>今回 '+B.yen(Number(d.total))+'（税込）</strong>'+(d.kind==='progress'?'<small>前回まで '+B.yen(Number(d.previous_billed))+' ／ 今回 '+B.yen(Number(d.subtotal))+'（税別）</small>':'')+'<small>支払期限 '+e(d.due_date||'未入力')+'</small>';
   label.append(check,detail);row.append(label);
   let b;try{b=B.balance(data.documents,data.revenues,d.site_id,data.company);}catch(err){b=null;}
   const info=document.createElement('p');info.className='note';info.textContent=b?'現場の請負総額 '+(b.contract===null?'未登録':B.yen(b.contract))+' ／ 請求済み '+B.yen(b.billed)+' ／ 未請求残 '+(b.remaining===null?'未確認':B.yen(b.remaining))+'（税別・全期間）':'現場の請負金額・請求済みを確認してください。';row.append(info);
   const open=document.createElement('button');open.type='button';open.className='btn light';open.textContent=d.status==='draft'?'下書きを開く・確定する':'元の請求書を開く';open.onclick=()=>openSource(d.kind,d);row.append(open);
   check.onchange=()=>{if(loading)return;if(check.checked)selected.set(d.id,B.stable(d));else selected.delete(d.id);closePreview?.();renderTotal();};host.append(row);
  }renderTotal();controls();
 }
 function renderTotal(){
  const total=q('#bbTotal');total.dataset.ready='false';
  if(!data||!selected.size){total.innerHTML='<p>今回まとめる請求書を選んでください。</p>';q('#bbPreview').disabled=true;return;}
  try{const b=B.bundle(data.documents,[...selected.keys()],data.company);total.innerHTML='<span>'+b.siteCount+'現場 ／ 請求書 '+b.ordinaryCount+'件・出来高 '+b.progressCount+'件</span><p>税別合計 <b>'+B.yen(b.subtotal)+'</b></p><p>各請求書の消費税合計 <b>'+B.yen(b.tax)+'</b></p><p class="bb-grand">ご請求合計 <b>'+B.yen(b.total)+'</b></p>';total.dataset.ready='true';}
  catch(err){total.innerHTML='<p class="bb-error">'+e(err.message)+'</p>';}
  q('#bbPreview').disabled=loading||total.dataset.ready!=='true';
 }
 async function openSource(kind,doc){
  if(loading||!data)return;const c=clients.find(c=>c.key===clientKey),siteId=doc?.site_id||q('#bbNewSite').value;
  if(!c||!siteId)return status('元請さんと現場を選んでください。',true);
  if(!root.ToyaProjectBusiness?.openForBundle)return status('請求書の作成画面を読み込めません。入力を保存後、画面を更新してください。',true);
  try{const ok=await root.ToyaProjectBusiness.openForBundle({siteId,documentId:doc?.id||'',kind,customer:c});if(!ok)status('請求書は開いていません。未保存の内容・現場・プランを確認してください。',true);}
  catch(err){status('請求書を開けませんでした：'+err.message,true);}
 }
 const paperCSS=`
 @page{size:A4 portrait;margin:0}html,body{margin:0!important;padding:0!important;width:210mm!important;min-width:0!important;background:white!important;color:#172019;-webkit-text-size-adjust:100%!important;text-size-adjust:100%!important}
 .te2-page{width:210mm;height:297mm;padding:9mm 8mm 12mm;box-sizing:border-box;position:relative;background:white;break-after:page;page-break-after:always;margin:0}.te2-page:last-child{break-after:auto;page-break-after:auto}.te2-frame{width:194mm;margin:0}.invoice-document{width:194mm!important;max-width:none!important;margin:0!important;box-shadow:none!important}.bb-paper-footer{position:absolute;bottom:4mm;left:8mm;right:8mm;font-size:7pt;color:#666;display:flex;justify-content:space-between}.bb-continuation{font-size:9pt;margin:1mm 0 5mm;padding-bottom:3mm;border-bottom:1px solid #42613b;overflow-wrap:anywhere}
 .bb-cover{font-family:'Noto Serif CJK JP','Yu Mincho',serif;font-size:9pt;line-height:1.5}.bb-cover h1{font-size:21pt;letter-spacing:.18em;margin:3mm 0 7mm;border-bottom:2px solid #42613b;padding-bottom:4mm}.bb-cover .bb-address{font-size:9pt;white-space:pre-wrap;overflow-wrap:anywhere}.bb-cover h2{font-size:14pt;margin:0 0 6mm;overflow-wrap:anywhere}.bb-cover .bb-issuer{font-size:8pt;text-align:right;white-space:pre-wrap;margin:3mm 0 7mm;overflow-wrap:anywhere}.bb-cover .bb-request-total{padding:4mm;border:1px solid #42613b;font-size:13pt;margin:5mm 0 7mm;display:flex;justify-content:space-between}.bb-cover-table{border-collapse:collapse;width:100%;table-layout:fixed}.bb-cover-table th,.bb-cover-table td{border:1px solid #777;padding:2mm;font-size:8pt;text-align:right;overflow-wrap:anywhere}.bb-cover-table th{background:#edf2ed;font-weight:bold}.bb-cover-table th:first-child,.bb-cover-table td:first-child{text-align:left;width:47%}.bb-cover-table small{display:block;font-size:7pt}.bb-cover .bb-disclaimer{font-size:8pt;margin:5mm 0;white-space:normal}.bb-cover .bb-sums{font-size:10pt;text-align:right;padding:4mm 0}.bb-cover .bb-sums p{margin:1mm 0}.bb-cover .bb-bank{font-size:9pt;white-space:pre-wrap;overflow-wrap:anywhere;border-top:1px solid #aaa;padding-top:3mm}.bb-cover .bb-tax-note{font-size:7pt;line-height:1.5;margin-top:3mm}
 `;
 const wait=(p,ms=15000)=>new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('書式の準備が時間切れになりました。もう一度お試しください。')),ms);Promise.resolve(p).then(x=>{clearTimeout(t);resolve(x)},err=>{clearTimeout(t);reject(err)});});
 async function renderHTML(bundle,isCurrent=()=>true,withCover=true,combined=false){
  const check=()=>{if(!isCurrent())throw new DOMException('画面またはログイン状態が変わりました。','AbortError');};check();
  if(combined&&!root.ToyaCombinedInvoice)throw Error('1枚の請求書にまとめる機能を読み込めません。画面を更新してください。');
  const parsed=combined?[root.ToyaCombinedInvoice.build(bundle)]:bundle.rows.map(r=>new DOMParser().parseFromString(E.printHTML(r.document),'text/html'));
  for(const doc of parsed){if(doc.querySelector('script,iframe,object,embed,form,input,button,video,audio,link'))throw Error('請求書の書式を確認してください。');}
  if(!root.ToyaInvoiceGreenFormat)throw Error('請求書の緑書式を読み込めません。入力を保存して画面を更新してください。');
  root.ToyaInvoiceGreenFormat.prepare(parsed);
  const styles=parsed.map(d=>[...d.querySelectorAll('style')].map(s=>s.textContent).join('\n'));const css=[...new Set(styles)].join('\n')+'\n'+paperCSS+'\n'+root.ToyaInvoiceGreenFormat.css;
  const frame=document.createElement('iframe');frame.sandbox='allow-same-origin';frame.style.cssText='position:fixed;left:-15000px;top:0;width:794px;height:1123px;border:0;pointer-events:none';frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
  const loaded=new Promise((resolve,reject)=>{frame.onload=resolve;frame.onerror=reject});frame.srcdoc='<!doctype html><html lang="ja"><head><meta charset="utf-8"><base href="'+e(assets.href)+'"><title>TOYAONE</title><style>'+css+'</style></head><body></body></html>';document.body.append(frame);
  try{
   await wait(loaded);check();const doc=frame.contentDocument;await wait(doc.fonts?.ready||Promise.resolve());
   const pages=[];let page,inner,label='請求合計表';
   function newPage(className=''){
    check();if(pages.length>=60)throw Error('PDFが60ページを超えます。選ぶ請求書を分けてください。');page=doc.createElement('section');page.className='te2-page';inner=doc.createElement('div');inner.className='te2-frame '+className;page.append(inner);doc.body.append(page);pages.push({page,label});return page;
   }
   const limit=()=>page.getBoundingClientRect().bottom-12*96/25.4;
   const fits=()=>inner.getBoundingClientRect().bottom<=limit()+.5;
   function element(html){const box=doc.createElement('template');box.innerHTML=html;return box.content.firstElementChild;}
   function nextInvoicePage(){newPage('invoice-document');inner.append(element('<div class="bb-continuation">'+e(label)+' ／ '+e(bundle.customer_name)+' 御中（続き）</div>'));}
   function appendBlock(node,next=nextInvoicePage){inner.append(node);if(fits())return;node.remove();next();inner.append(node);if(!fits())throw Error(label+'：長い見出し・備考が1ページに収まりません。個別の書類を確認してください。');}
   if(withCover&&!combined){
   const i=bundle.issuer,issuer=[i.issuer_name,i.address,i.registration_number?'登録番号 '+i.registration_number:'',i.phone?'TEL '+i.phone:''].filter(Boolean).join('\n');
   newPage('bb-cover');inner.innerHTML='<h1>請求合計表</h1><div class="bb-address">'+nl(bundle.customer_address)+'</div><h2>'+e(bundle.customer_name)+(/(?:御中|様)$/.test(bundle.customer_name)?'':' 御中')+'</h2><div class="bb-issuer">'+nl(issuer)+'</div><p>添付の各請求書を、下記の通りまとめてご案内申し上げます。</p><div class="bb-request-total"><span>ご請求合計（税込）</span><strong>'+B.yen(bundle.total)+'</strong></div>';
   if(!fits())throw Error('宛先・発行者情報が長すぎます。');
   function coverTable(){const t=element('<table class="bb-cover-table"><thead><tr><th>現場名・請求番号・支払期限</th><th>今回請求額<br>税別</th><th>消費税</th><th>今回請求額<br>税込</th></tr></thead><tbody></tbody></table>');inner.append(t);return t;}
   let table=coverTable();for(const r of bundle.rows){const d=r.document,row=element('<tr><td><b>'+e(d.site_name)+'</b><small>'+e(d.kind==='progress'?'出来高請求':'請求書')+' ／ '+e(d.document_number)+'</small><small>発行 '+e(d.document_date)+' ／ 支払期限 '+e(d.due_date)+'</small></td><td>'+B.yen(r.subtotal)+'</td><td>'+B.yen(r.tax)+'</td><td>'+B.yen(r.total)+'</td></tr>');q('tbody',table).append(row);if(!fits()){row.remove();newPage('bb-cover');inner.append(element('<h2>請求合計表（続き）</h2>'));table=coverTable();q('tbody',table).append(row);if(!fits())throw Error('合計表の現場名を確認してください。');}}
   const sums=element('<div><div class="bb-sums"><p>税別合計 '+B.yen(bundle.subtotal)+'</p><p>各請求書の消費税合計 '+B.yen(bundle.tax)+'</p><p><b>ご請求合計 '+B.yen(bundle.total)+'</b></p></div><p class="bb-disclaimer">この表は添付請求書の合計案内です。新たな請求の追加ではありません。各請求書と重ねてお支払いいただく必要はありません。</p><div class="bb-bank">'+nl(i.bank_details?'振込先：\n'+i.bank_details:'振込先・お支払条件は各請求書をご確認ください。')+'</div><p class="bb-tax-note">消費税は添付の各請求書に記載された金額の合計です。この表で税額の再計算はしていません。適格請求書等としての確認・保存は、添付の各請求書をご利用ください。</p></div>');appendBlock(sums,()=>{newPage('bb-cover');inner.append(element('<h2>請求合計表（合計・お支払先）</h2>'));});
   }
   for(let j=0;j<parsed.length;j++){
    check();const original=parsed[j].querySelector('.invoice-document');if(!original)throw Error('請求書の明細を確認できません。');label=combined?'請求書（複数現場・集約）':bundle.rows[j].document.document_number||'下書き';newPage('invoice-document');
    for(const source of [...original.children]){
     if(source.matches('.invoice-lines')){
      const template=doc.importNode(source,true);q('tbody',template)?.replaceChildren();let t=template.cloneNode(true);inner.append(t);
      for(const rawRow of source.querySelectorAll('tbody>tr')){const row=doc.importNode(rawRow,true);q('tbody',t).append(row);if(!fits()){row.remove();if(rawRow.classList.contains('invoice-blank'))continue;if(!q('tbody',t).children.length)t.remove();nextInvoicePage();t=template.cloneNode(true);inner.append(t);q('tbody',t).append(row);if(!fits())throw Error(label+'：明細1行が長すぎます。書類を確認してください。');}}
     }else appendBlock(doc.importNode(source,true));
    }
   }
   await wait(Promise.all([...doc.images].map(async img=>{const src=new URL(img.getAttribute('src')||'',assets);if(src.href!==new URL('toya-document-logo.svg',assets).href)throw Error('会社ロゴの参照先を確認してください。');img.src=new URL('billing-bundle-logo.r1.png',assets).href;await img.decode();if(!img.naturalWidth)throw Error('会社ロゴを確認できません。');})));await wait(doc.fonts?.ready||Promise.resolve());check();
   root.ToyaInvoiceGreenFormat.finish(doc,pages);
   for(let j=0;j<pages.length;j++){const p=pages[j],box=p.page.getBoundingClientRect(),body=q('.te2-frame',p.page);if(body.getBoundingClientRect().bottom>box.bottom-12*96/25.4+1)throw Error('文字の準備後にページからはみ出しました。個別の書類を確認してください。');const foot=element('<footer class="bb-paper-footer"><span>'+e(p.label)+'</span><span>'+(j+1)+' / '+pages.length+'</span></footer>');p.page.append(foot);}
   return '<!doctype html>'+doc.documentElement.outerHTML;
  }finally{frame.remove();}
 }
 async function renderSingleHTML(document,isCurrent=()=>true){
  if(!document||!['invoice','progress'].includes(document.kind)||!['draft','issued','void'].includes(document.status))throw Error('請求書の種類・状態を確認してください。');
  const d=JSON.parse(JSON.stringify(document));
  return renderHTML({rows:[{document:d}],issuer:d.issuer||{},customer_name:d.customer_name||'',customer_address:d.customer_address||''},isCurrent,false);
 }
 async function renderCombinedHTML(bundle,isCurrent=()=>true){return renderHTML(bundle,isCurrent,false,true);}
 async function preview(){
  if(!data||loading||!selected.size)return;const ids=[...selected.keys()],expected=B.bundle(data.documents,ids,data.company).fingerprint,mine=owner,t=++ticket;loading=true;controls();status('選んだ請求書の最新状態を確認しています…');
  try{
   const fresh=await fetchData(mine,t);if(identity()!==mine||ticket!==t)return;const b=B.bundle(fresh.documents,ids,fresh.company);if(b.fingerprint!==expected){data=fresh;selected.clear();fillClients();throw Error('選択後に請求書が更新されました。もう一度選んでください。');}
   const combined=printFormat==='combined';
   const html=await (combined?renderCombinedHTML:renderHTML)(b,()=>identity()===mine&&ticket===t);if(identity()!==mine||ticket!==t)return;
   closePreview?.();let disposed=false,pdf=null;const verifiedAt=Date.now(),dialog=document.createElement('dialog');dialog.id='bbPreviewDialog';dialog.innerHTML='<div class="bb-preview-toolbar"><b>'+ (combined?'請求書（複数現場）':'元請別まとめ請求') +'</b><div><button id="bbPDF" class="btn dark" type="button">PDF保存・共有</button><button id="bbClosePreview" class="btn light" type="button">閉じる</button></div></div><p class="note">'+(combined?'各現場の今回請求額を、1つの緑の請求書に並べています。元の請求番号と金額はそのままで、請求の追加登録・自動送信はしません。':'合計表と各現場の請求書を1つの「TOYAONE.pdf」にします。請求の追加登録・自動送信はしません。')+'</p><div class="pb-preview-viewport"><div class="bb-preview-stage"><iframe title="まとめ請求のプレビュー" sandbox="allow-same-origin"></iframe></div></div>';document.body.append(dialog);
   closePreview=()=>{if(disposed)return;disposed=true;pdf?.dispose();if(dialog.open)dialog.close();dialog.remove();root.removeEventListener('resize',fit);resizeObserver?.disconnect();closePreview=null;};const close=closePreview;
   const iframe=q('iframe',dialog),viewport=q('.pb-preview-viewport',dialog),stage=q('.bb-preview-stage',dialog),resizeObserver=root.ResizeObserver?new ResizeObserver(fit):null;resizeObserver?.observe(viewport);
   function fit(){if(disposed||!viewport.clientWidth)return;const pages=iframe.contentDocument?.querySelectorAll('.te2-page');if(!pages?.length)return;const first=pages[0].getBoundingClientRect(),last=pages[pages.length-1].getBoundingClientRect(),width=Math.ceil(first.width),height=Math.ceil(last.bottom-first.top),scale=Math.min(1,viewport.clientWidth/width);iframe.style.cssText='width:'+width+'px;height:'+height+'px;border:0;transform-origin:0 0;transform:scale('+scale+')';stage.style.height=Math.ceil(height*scale)+'px';stage.style.width=Math.min(width,viewport.clientWidth)+'px';viewport.style.height=Math.ceil(height*scale)+'px';}
   iframe.onload=()=>{fit();iframe.contentDocument?.fonts?.ready.then(fit);};iframe.srcdoc=html;
   q('#bbClosePreview',dialog).onclick=close;dialog.addEventListener('cancel',ev=>{ev.preventDefault();close();});dialog.addEventListener('close',close,{once:true});root.addEventListener('resize',fit);
   dialog.showModal();fit();
   if(!root.ToyaBillingBundlePDF)throw Error('PDF作成機能を読み込めません。画面を更新してください。');
   pdf=root.ToyaBillingBundlePDF.mount({dialog,button:q('#bbPDF',dialog),html,isCurrent:()=>!disposed&&identity()===mine&&ticket===t&&Date.now()-verifiedAt<10*60*1000});
   status('選択した'+b.rows.length+'件を確認しました。PDFの宛先と金額を確認して送ってください。');
  }catch(err){if(identity()===mine&&ticket===t){closePreview?.();status(err.message,true);}}
  finally{if(identity()===mine&&ticket===t){loading=false;render();controls();}}
 }
 const uiCSS=`#billingBundleCard summary{font-weight:900;cursor:pointer;padding:10px 0}#billingBundleCard .bb-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}#billingBundleCard select,#billingBundleCard input[type=month]{width:100%;min-width:0;box-sizing:border-box;font-size:16px;min-height:44px}#billingBundleCard .bb-check{display:flex;align-items:flex-start;gap:12px;min-height:44px}#billingBundleCard .bb-check input{width:22px!important;height:22px!important;min-height:22px!important;flex:0 0 22px;margin:5px 0}#billingBundleCard .bb-doc{padding:14px;border:1px solid #d4d8d3;border-radius:12px;margin:12px 0}#billingBundleCard .bb-doc span{min-width:0;overflow-wrap:anywhere}#billingBundleCard .bb-doc small,#billingBundleCard .bb-doc strong{display:block;margin-top:6px}#billingBundleCard .bb-doc small{font-weight:400;font-size:13px}#billingBundleCard .bb-buttons{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}#billingBundleCard .bb-buttons .btn{flex:1;min-width:120px}#billingBundleCard .bb-wide{width:100%}#bbTotal{border-radius:12px;background:#111;color:#fff;padding:16px;margin:12px 0}#bbTotal p{display:flex;justify-content:space-between;gap:10px;margin:8px 0;flex-wrap:wrap}#bbTotal b{color:var(--lime,#b8ff00)}#bbTotal .bb-grand{font-size:21px}#billingBundleCard .bb-error{color:#bd3026}#bbTotal .bb-error{color:#ffc1b8}#bbPreviewDialog{width:96vw;max-width:1050px;max-height:94vh;box-sizing:border-box;border:0;border-radius:14px;padding:14px;color:#111}#bbPreviewDialog::backdrop{background:rgba(0,0,0,.6)}#bbPreviewDialog .bb-preview-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}#bbPreviewDialog .bb-preview-toolbar>div{display:flex;gap:8px}#bbPreviewDialog .pb-preview-viewport{width:100%;max-height:67vh;overflow:auto;background:#eee;border:1px solid #ddd;position:relative}#bbPreviewDialog .bb-preview-stage{position:relative;margin:auto}#bbPreviewDialog iframe{display:block}@media(min-width:650px){#billingBundleCard .bb-grid{grid-template-columns:minmax(0,2fr) minmax(0,1fr)}}`;
 root.ToyaBillingBundleUI=Object.freeze({open(){if(!mount())return false;q('nav [data-page="homePage"]')?.click();q('#bbOpen').open=true;card.scrollIntoView({block:'start',behavior:'smooth'});if(!data&&!loading)refresh();return true;},renderHTML,renderSingleHTML,renderCombinedHTML});
 function start(){mount();document.addEventListener('toya-role-changed',mount);document.addEventListener('toya-project-document-changed',()=>{if(!owner)return;ticket++;loading=false;closePreview?.();data=null;selected.clear();if(card){render();status('書類が変わりました。「請求書一覧を更新」を押してください。');controls();}});setInterval(()=>{if(identity()!==owner||!card?.isConnected)mount();},1000);}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,1200),{once:true});else setTimeout(start,1200);
})(window);
