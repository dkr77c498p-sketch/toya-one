/* Original estimate quantities. Never mixed into daily-report costs or sales. */
(() => {
 'use strict';
 const node=typeof module==='object'&&module.exports;
 const C=node?require('./estimate-plan-engine.js'):window.ToyaEstimatePlan;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const blank=v=>v===null||v===undefined||String(v).trim()==='';
 const money=v=>blank(v)?'空欄':Number(v).toLocaleString('ja-JP',{maximumFractionDigits:2})+'円';
 function summary(sheet){const lines=sheet.groups.flatMap(g=>g.lines);return {rows:lines.length,quantities:lines.filter(r=>!blank(r.quantity)).length,blankQuantities:lines.filter(r=>blank(r.quantity)).length};}
 function label(r){return [r.section,r.label,r.notes].filter(Boolean).join(' ／ ');}
 function referenceNote(r){return [blank(r.quantity)?'数量未入力':'',blank(r.quoted_amount)?'金額空欄':'',Number(r.quoted_amount)<0?'元見積の控除':'',r.source_page?'原本 '+r.source_page+'ページ':''].filter(Boolean).join(' / ');}
 function table(group,prices=false){
  return '<div class="eq-scroll"><table class="eq-table"><thead><tr><th>工事項目・品目</th><th>見積数量</th><th>単位</th>'+(prices?'<th>元見積単価</th><th>元見積金額</th>':'')+'</tr></thead><tbody>'+group.lines.map(r=>'<tr><th>'+esc(label(r))+'<small>'+esc(referenceNote(r))+'</small></th><td class="'+(blank(r.quantity)?'eq-blank':'')+'">'+(blank(r.quantity)?'空欄':esc(r.quantity))+'</td><td>'+esc(r.unit||'空欄')+'</td>'+(prices?'<td>'+money(r.quoted_unit_price)+'</td><td class="'+(Number(r.quoted_amount)<0?'eq-credit':'')+'">'+money(r.quoted_amount)+'</td>':'')+'</tr>').join('')+'</tbody></table></div>';
 }
 function fromSheet(sheet,site){
  if(!site?.id)throw new Error('数量を使う現場を選んでください。');
  const p=C.draft(site);
  p.title=site.name+' 見積積算';p.customer_name=sheet.customer_name||'';
  p.quote_notes=(sheet.source_summary?.conditions||[]).join('\n');
  p.internal_notes=('数量取込元：'+sheet.title+' / '+sheet.source_filename+' / '+(sheet.document_date||'日付未記載')+'\n原本ID：'+sheet.id+'\n元見積の単価・金額は原価単価に転記していません。数量・工事条件・単価を今回の工事に合わせて確認してください。諸経費・値引きは原本の参考欄に残します。\n'+(sheet.warnings||[]).join('\n')).slice(0,3000);
  p.groups=sheet.groups.map(g=>({name:g.name,lines:g.lines.filter(r=>!['allowance','adjustment'].includes(r.row_kind)).map(r=>({
   category:/回送/.test(r.label)?'transport':/処分|産業廃棄物/.test(r.label)?'waste':'other',
   label:label(r).slice(0,200),quantity:blank(r.quantity)?'':String(r.quantity),multiplier:'1',unit:r.unit||'',unit_price:'',
   source_quantity_sheet_id:sheet.id,source_page:r.source_page,source_quantity:r.quantity,source_unit:r.source_unit||r.unit,
   source_quoted_unit_price:r.quoted_unit_price,source_quoted_amount:r.quoted_amount
  }))})).filter(g=>g.lines.length);
  C.calculate(p);return p;
 }
 function printHTML(sheet){
  const s=summary(sheet);
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>見積数量の積算表</title><style>@page{size:A4;margin:12mm;@bottom-right{content:counter(page);font-size:8pt}}body{font-family:"Noto Sans CJK JP",Meiryo,sans-serif;color:#18261e;font-size:9pt;line-height:1.4}h1{font-size:19pt;margin:0 0 3mm}h2{font-size:12pt;margin:5mm 0 2mm;break-after:avoid}header{border-bottom:2px solid #283f30;padding-bottom:3mm}header p{margin:1mm 0}.eq-table{width:100%;border-collapse:collapse;table-layout:fixed;break-inside:auto}.eq-table th,.eq-table td{border-bottom:1px solid #d5dcd6;padding:1.6mm;text-align:right;overflow-wrap:anywhere}.eq-table th:first-child{width:54%;text-align:left}.eq-table th:nth-child(2){width:12%}.eq-table th:nth-child(3){width:8%}.eq-table thead{display:table-header-group;background:#edf2ee;break-after:avoid}.eq-group-note{break-after:avoid}.eq-table tr{break-inside:avoid}small{display:block;color:#626d60;font-size:7.5pt;font-weight:normal}.eq-blank,.eq-credit,.eq-warning{color:#975610}.eq-warning{white-space:pre-wrap}footer{border-top:1px solid #849080;margin-top:4mm;padding-top:3mm;font-size:8pt;overflow-wrap:anywhere}</style></head><body><header><h1>見積数量の積算表</h1><p>'+esc(sheet.title)+'</p><p>'+esc(sheet.customer_name)+' ／ '+esc(sheet.site_address)+'</p><p>元見積日 '+esc(sheet.document_date||'未記載')+' ／ 数量記載 '+s.quantities+'行 ／ 数量空欄 '+s.blankQuantities+'行</p><p>元見積の数量です。施工実績数量・原価への加算はしていません。</p></header>'+sheet.groups.map(g=>'<h2>'+esc(g.name)+'</h2>'+(g.notes?'<p class="eq-group-note">'+esc(g.notes)+'</p>':'')+table(g)).join('')+((sheet.warnings||[]).length?'<h2>原本の確認事項</h2><p class="eq-warning">'+sheet.warnings.map(esc).join('\n')+'</p>':'')+'<footer>取込元：'+esc(sheet.source_filename)+'<br>数量の空欄は0に補完していません。面積・体積・重量は相互換算せず、同じ数量でも施工・運搬・処分の行を別に残しています。</footer></body></html>';
 }
 const engine={summary,label,table,fromSheet,printHTML};
 if(node){module.exports=engine;return;}window.ToyaEstimateQuantities=Object.freeze(engine);
 const q=s=>document.querySelector(s);
 const identity=()=>typeof cloudProfile!=='undefined'&&cloudProfile?.active===true&&cloudProfile.role==='admin'&&cloudProfile.company_id&&typeof cloudClient!=='undefined'&&cloudClient?cloudProfile.id+':'+cloudProfile.company_id:'';
 const busy=()=>window.ToyaEstimatePlanUI?.isBusy()||window.ToyaProjectBusiness?.isBusy();
 let owner='',host=null,sheets=[],selected='',ticket=0,running=false,siteOptions='';
 const note=s=>{if(q('#eqStatus'))q('#eqStatus').textContent=s;};
 function clear(){owner='';ticket++;host=null;running=false;sheets=[];selected='';siteOptions='';q('#epQuantitySheets')?.replaceChildren();q('#eqPreview')?.remove();}
 function mount(){
  const me=identity();if(!me){if(owner)clear();return false;}if(owner&&owner!==me)clear();
  const target=q('#epQuantitySheets');if(!target)return false;owner=me;
  if(host===target&&q('#eqSource'))return true;host=target;
  host.innerHTML='<section class="eq-card"><h3>見積書から取り込んだ数量表</h3><p class="note">工事項目・数量・単位を保存済みです。確認する見積書を選んでください。</p><p id="eqStatus" class="note" role="status" aria-live="polite"></p><label for="eqSource">見積書・数量表</label><select id="eqSource"><option value="">読み込み中…</option></select><button id="eqReload" class="btn light pb-wide" type="button">数量表を更新</button><div id="eqDetail"></div></section>';
  q('#eqSource').onchange=()=>{selected=q('#eqSource').value;render();};q('#eqReload').onclick=refresh;refresh();return true;
 }
 async function refresh(){
  if(!identity()||running||busy()||!host?.isConnected)return;const mine=owner,t=++ticket,company=cloudProfile.company_id;running=true;sheets=[];q('#eqDetail').innerHTML='';q('#eqSource').disabled=true;q('#eqReload').disabled=true;note('見積数量を読み込み中…');
  try{
   const rows=[];for(let from=0;from<100000;from+=500){
    const r=await cloudClient.from('estimate_quantity_sheets').select('*').eq('company_id',company).order('id').range(from,from+499);
    if(t!==ticket||identity()!==mine)return;if(r.error)throw r.error;rows.push(...(r.data||[]));if((r.data||[]).length<500)break;if(from===99500)throw new Error('全件を読み込めませんでした。');
   }
   sheets=rows.sort((a,b)=>(b.document_date||'').localeCompare(a.document_date||'')||a.title.localeCompare(b.title,'ja'));
   if(!sheets.some(s=>s.id===selected))selected=sheets[0]?.id||'';
   q('#eqSource').innerHTML=sheets.length?sheets.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.title)+'</option>').join(''):'<option value="">保存された数量表はありません</option>';q('#eqSource').value=selected;
   note(sheets.length+'件の数量表を保存済みです。数量記載 '+sheets.reduce((n,s)=>n+summary(s).quantities,0)+'行。');render();
  }catch(e){if(t===ticket&&identity()===mine){sheets=[];q('#eqDetail').innerHTML='';q('#eqSource').innerHTML='<option value="">読み込めませんでした</option>';note('読み込みできませんでした：'+e.message);}}
  finally{if(t===ticket&&identity()===mine){running=false;q('#eqSource').disabled=false;q('#eqReload').disabled=false;}}
 }
 function updateSites(){
  if(!q('#eqTarget'))return;const sites=window.ToyaEstimatePlanUI?.getSites?.()||[],options=sites.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+(s.completed_on?'（完工済み）':'')+'</option>').join('');
  if(options!==siteOptions){const old=q('#eqTarget').value;siteOptions=options;q('#eqTarget').innerHTML='<option value="">数量を使う現場を選択</option>'+options;q('#eqTarget').value=old||q('#epSite')?.value||'';}
  q('#eqUse').disabled=busy()||!q('#eqTarget').value;
 }
 function render(){
  const sheet=sheets.find(s=>s.id===selected);if(!sheet){q('#eqDetail').innerHTML='';return;}const s=summary(sheet);
  q('#eqDetail').innerHTML='<h3>'+esc(sheet.title)+'</h3><p class="note">'+esc(sheet.customer_name)+'<br>'+esc(sheet.site_address)+'<br>元見積日 '+esc(sheet.document_date||'未記載')+' ／ 数量記載 '+s.quantities+'行</p>'+((sheet.warnings||[]).length?'<div class="eq-warning">'+sheet.warnings.map(x=>'<p>'+esc(x)+'</p>').join('')+'</div>':'')+sheet.groups.map((g,i)=>'<details class="eq-group" '+(i===0?'open':'')+'><summary>'+esc(g.name)+'（'+g.lines.length+'行）</summary>'+(g.notes?'<p class="note">'+esc(g.notes)+'</p>':'')+table(g)+'</details>').join('')+'<details><summary>元見積の金額・条件を確認</summary><p class="note">参考金額 '+money(sheet.source_summary?.quoted_total)+'（'+esc(sheet.source_summary?.tax_label||'原本表記')+'）。日報の原価・請負売上へは加算しません。</p>'+sheet.groups.map(g=>'<h4>'+esc(g.name)+'</h4>'+table(g,true)).join('')+'<p class="note">'+(sheet.source_summary?.conditions||[]).map(esc).join('<br>')+'</p></details><button id="eqPrint" type="button" class="btn light pb-wide">この数量表を印刷・PDF</button><details class="eq-reuse"><summary>この数量を現場の積算へ使う</summary><p class="note">数量を入力済みの積算に引き継ぎ、今回の工事に合わせて変更できます。原価単価は登録単価などから設定してください。</p><label for="eqTarget">数量を使う現場</label><select id="eqTarget"></select><button id="eqUse" type="button" class="btn dark pb-wide" disabled>この数量で積算を開く</button><p class="note">元見積の諸経費・値引きは参考欄に残し、今回の積算で設定します。</p></details><p class="note eq-source">取込元：'+esc(sheet.source_filename)+'</p>';
  siteOptions='';updateSites();q('#eqTarget').onchange=updateSites;q('#eqTarget').onfocus=updateSites;
  q('#eqUse').onclick=()=>{if(busy()||!identity())return;try{const site=(window.ToyaEstimatePlanUI?.getSites?.()||[]).find(s=>s.id===q('#eqTarget').value);const draft=fromSheet(sheet,site);if(window.ToyaEstimatePlanUI?.useQuantity(draft))note('数量を積算へ引き継ぎました。工事条件と原価単価を確認して保存してください。');}catch(e){note(e.message);}};
  q('#eqPrint').onclick=()=>preview(sheet);
 }
 function preview(sheet){
  if(!identity()||busy())return;q('#eqPreview')?.remove();const dialog=document.createElement('dialog');dialog.id='eqPreview';dialog.innerHTML='<div class="pb-preview-toolbar"><b>見積数量の積算表</b><div><button id="eqPrintNow" type="button" class="btn dark">印刷・PDF保存</button><button id="eqClosePrint" type="button" class="btn light">閉じる</button></div></div><iframe title="見積数量の印刷プレビュー" sandbox="allow-same-origin allow-modals"></iframe>';document.body.append(dialog);const frame=dialog.querySelector('iframe');frame.srcdoc=printHTML(sheet);q('#eqPrintNow').onclick=()=>{frame.contentWindow.focus();frame.contentWindow.print();};q('#eqClosePrint').onclick=()=>{dialog.close();dialog.remove();};dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
 }
 const start=()=>{mount();document.addEventListener('click',e=>{if(e.target.closest('nav [data-page]'))mount();});document.addEventListener('visibilitychange',()=>{if(!document.hidden)mount();});setInterval(()=>{if(owner!==identity()||!host?.isConnected)mount();if(identity())updateSites();},1000);};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,1300),{once:true});else setTimeout(start,1300);
})();
