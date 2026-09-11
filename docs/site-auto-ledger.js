/* Automatic, read-only cost ledger. Uses the same accounting rules as site totals. */
(() => {
 'use strict';
 const node=typeof module==='object'&&module.exports;
 const S=node?require('./site-financial-summary.js'):window.ToyaSiteCostSummaryEngine;
 const C=node?require('./estimate-plan-engine.js'):window.ToyaEstimatePlan;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const yen=n=>n===null||n===undefined?'—':Number(n).toLocaleString('ja-JP',{maximumFractionDigits:2})+'円';
 const round=n=>Math.round((n+Number.EPSILON)*100)/100;
 const costNames={labor:'人件費・常用費（交通費込）',vehicle:'車両使用料',equipment:'重機使用料',attachments:'アタッチメント',tools:'小型機械・工具',fuel:'燃料・油脂',waste:'処分費',transport:'回送費',other:'材料・その他'};
 function build(data){
  if(!S)throw new Error('原価計算を読み込めませんでした。画面を更新してください。');
  return (data.sites||[]).map(site=>{try{return {site,result:S.analyze(data,site),error:null};}catch(e){return {site,result:null,error:e.message};}})
   .sort((a,b)=>(a.site.status==='active'?0:1)-(b.site.status==='active'?0:1)||a.site.name.localeCompare(b.site.name,'ja'));
 }
 function totals(rows){
  const eligible=rows.filter(r=>!r.error&&r.result.hasData&&r.result.sales!==null);
  return {count:eligible.length,excluded:rows.length-eligible.length,cost:round(eligible.reduce((n,r)=>n+r.result.subtotal,0)),sales:round(eligible.reduce((n,r)=>n+r.result.sales,0)),profit:round(eligible.reduce((n,r)=>n+r.result.profit,0)),partial:eligible.some(r=>r.result.partial)};
 }
 function phase(row){return row.site.completed_on?'完工済み':row.site.status!=='active'?'過去・未整理':row.result?.hasData?'施工中':'日報待ち';}
 function state(row){if(row.error)return '集計要確認';const r=row.result;if(!r.hasData)return '記録なし';if(r.contractAmount===null)return '請負金額未登録';return r.partial?'要確認 '+r.warnings.length+'件':'自動集計';}
 function costRows(r){return Object.entries(costNames).map(([key,label])=>{const c=r.categories[key],e=r.expenses[key];return {key,label,value:c?c.value:e.value,present:c?c.savedDays>0||c.autoDates.length>0:e.count>0,note:c?'自動 '+c.autoDates.length+'日 / 保存額 '+c.savedDays+'日':e.count+'件'+(e.missing?' / 金額未入力 '+e.missing+'件':'')};});}
 function fromActual(row,at){
  if(row.error||!row.result?.hasData)throw new Error('日報または保存済み費用がある現場を選んでください。');
  const r=row.result,p=C.draft(row.site),lines=costRows(r).filter(c=>c.present).map(c=>{
   if(c.value<0)throw new Error('マイナス調整を含むため、見積用の費用を確認してください。');
   return {category:({attachments:'attachment',tools:'tool'}[c.key]||c.key),label:c.label+'（実績参考）',quantity:'1',multiplier:'1',unit:'式',unit_price:String(c.value)};
  });
  if(r.partial)lines.push({category:'other',label:'要確認費用（実績内訳を確認）',quantity:'1',multiplier:'1',unit:'式',unit_price:''});
  p.title=row.site.name;p.groups=[{name:row.site.name+' 工事',lines}];
  p.quote_amount_override=r.contractAmount;
  p.internal_notes=('実績参考：'+row.site.name+' / '+at+' / 日報 '+r.reportCount+'件。取込後の実績変更はこの見積積算へ自動反映しません。施工条件・数量・見積額は見積先に合わせて確認してください。\n'+r.warnings.join('\n')).slice(0,3000);
  return p;
 }
 function tableHTML(rows,interactive=false){
  const cell=(label,text)=>'<td data-label="'+label+'">'+text+'</td>';
  return '<div class="al-table-wrap"><table class="al-table"><thead><tr><th>現場</th><th>請負金額</th><th>売上合計</th><th>原価（入力済み）</th><th>概算利益</th><th>確認</th></tr></thead><tbody>'+rows.map(row=>{
   const r=row.result,available=r?.hasData&&!row.error;
   return '<tr><th scope="row">'+esc(row.site.name)+'<small>'+esc(phase(row))+(row.site.completed_on?' '+esc(row.site.completed_on):'')+'</small></th>'+cell('請負金額',row.error?'—':yen(r.contractAmount))+cell('売上合計',row.error?'—':yen(r.sales))+cell('原価（入力済み）',available?yen(r.subtotal):row.error?'集計不可':'記録なし')+cell('概算利益',available?'<span class="'+(r.profit<0?'al-negative':'')+'">'+yen(r.profit)+'</span>':'—')+cell('確認',esc(state(row))+(interactive?'<button class="btn light" type="button" data-al-site="'+esc(row.site.id)+'">内訳</button>':''))+'</tr>';
  }).join('')+'</tbody></table></div>';
 }
 function dayTable(r){return '<div class="al-table-wrap"><table class="al-day-table"><thead><tr><th>日付</th>'+Object.values(costNames).map(label=>'<th>'+esc(label)+'</th>').join('')+'<th>小計</th></tr></thead><tbody>'+r.days.map(d=>'<tr><th>'+esc(d.date)+'</th>'+Object.keys(costNames).map(k=>'<td>'+yen(d[k])+'</td>').join('')+'<td>'+yen(d.subtotal)+'</td></tr>').join('')+'</tbody></table></div>';}
 function printHTML(rows,at,selected){
  const shown=selected?rows.filter(row=>row.site.id===selected):rows;if(!shown.length)throw new Error('集計する現場がありません。');
  const t=totals(shown),detail=selected?shown[0]:null,r=detail?.result;
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>現場自動積算表</title><style>@page{size:A4 landscape;margin:10mm;@bottom-right{content:counter(page);font-size:8pt}}body{font-family:"Noto Sans CJK JP",Meiryo,sans-serif;color:#1a2820;font-size:9pt;line-height:1.4}h1{font-size:22pt;margin:0}h2{font-size:13pt;break-after:avoid;margin:4mm 0 2mm}header{border-bottom:3px solid #263f32;padding-bottom:3mm}header p{margin:2mm 0}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}th,td{text-align:right;border-bottom:1px solid #ccd4ce;padding:2mm;overflow-wrap:anywhere}thead th{background:#edf2ee}th:first-child{text-align:left;width:24%}td:first-child{text-align:left}tr{break-inside:avoid}small{display:block;font-size:8pt;font-weight:normal}.al-negative{color:#a82720}.al-summary{border-top:2px solid #263f32;margin-top:4mm;padding-top:3mm}.al-warning{color:#8b5311;white-space:pre-wrap}.al-day-table{font-size:7pt}.al-day-table th:first-child{width:12%}.al-day-table th,.al-day-table td{padding:1.2mm .8mm}.al-cost-table th:first-child{width:55%}.al-cost-table{width:100%}h1 small{display:inline;margin-left:4mm}.al-cost-table th,.al-cost-table td{padding:0.8mm 2mm;font-size:8.5pt}</style></head><body><header><h1>現場自動積算表 <small>社内用・全期間</small></h1><p>'+esc(at)+'時点の日報・登録単価・保存済み調整額を集計</p><p>未記録の費用は含みません。概算利益には要確認分が残る場合があります。</p></header>'+tableHTML(shown)+(t.count&&!selected?'<div class="al-summary">日報・費用と請負金額が揃う '+t.count+'現場の合計：売上 '+yen(t.sales)+' ／ 原価 '+yen(t.cost)+' ／ 概算利益 '+yen(t.profit)+(t.partial?'（要確認あり）':'')+(t.excluded?' ／ 比較対象外 '+t.excluded+'現場':'')+'</div>':'')+(detail?.error?'<p class="al-warning">'+esc(detail.error)+'</p>':'')+(r?.hasData?'<h2>'+esc(detail.site.name)+' 費用別内訳</h2><table class="al-cost-table"><thead><tr><th>費目</th><th>原価</th><th>記録</th></tr></thead><tbody>'+costRows(r).map(c=>'<tr><th>'+esc(c.label)+'</th><td>'+(c.present?yen(c.value):'記録なし')+'</td><td>'+esc(c.note)+'</td></tr>').join('')+'</tbody></table><h2>日別内訳</h2>'+dayTable(r)+(r.warnings.length?'<h2>要確認の記録</h2><p class="al-warning">'+r.warnings.map(esc).join('<br>')+'</p>':''):'')+'</body></html>';
 }
 const engine={build,totals,phase,state,costRows,fromActual,tableHTML,printHTML};
 if(node){module.exports=engine;return;}
 window.ToyaAutomaticLedgerEngine=Object.freeze(engine);
 const q=(s,r=document)=>r.querySelector(s);
 const identity=()=>typeof cloudProfile!=='undefined'&&cloudProfile?.role==='admin'&&cloudProfile.active===true&&cloudProfile.company_id&&typeof cloudClient!=='undefined'&&cloudClient?cloudProfile.id+':'+cloudProfile.company_id:'';
 const busy=()=>window.ToyaEstimatePlanUI?.isBusy()||window.ToyaProjectBusiness?.isBusy();
 const visible=()=>q('#homePage')?.classList.contains('active')&&!document.hidden;
 let owner='',rows=[],stamp='',ticket=0,running=false,timer,host=null;
 const status=s=>{if(q('#alStatus'))q('#alStatus').textContent=s;};
 function clear(){owner='';rows=[];stamp='';ticket++;running=false;clearTimeout(timer);if(host?.isConnected)host.innerHTML='';host=null;if(q('#epActualDetail'))q('#epActualDetail').innerHTML='';q('#alPreview')?.remove();}
 function mount(){
  if(!identity()){if(owner)clear();return false;}if(owner&&owner!==identity())clear();
  const target=q('#epActualLedger');if(!target)return false;owner=identity();if(host===target&&q('#alRows'))return true;host=target;
  target.innerHTML='<div class="pb-actions"><button id="alRefresh" class="btn dark" type="button">日報から再集計</button><button id="alPrintAll" class="btn light" type="button" disabled>一覧を印刷・PDF</button></div><p id="alStatus" class="note" role="status" aria-live="polite">日報・費用を読み込み中…</p><div id="alRows"></div>';
  q('#alRefresh').onclick=()=>refresh();q('#alPrintAll').onclick=()=>print(false);q('#epSite')?.addEventListener('change',renderDetail);schedule();return true;
 }
 function schedule(){clearTimeout(timer);timer=setTimeout(()=>{if(visible())refresh();},250);}
 async function read(table,fields,company,t,mine){
  const out=[];for(let offset=0;offset<100000;offset+=500){if(t!==ticket||identity()!==mine)throw new Error('ログイン状態が変わりました。');const r=await cloudClient.from(table).select(fields).eq('company_id',company).order('id').range(offset,offset+499);if(r.error)throw new Error(table+'：'+r.error.message);out.push(...(r.data||[]));if((r.data||[]).length<500)return out;}throw new Error('全件を読み込めませんでした。途中の合計は表示していません。');
 }
 async function refresh(){
  if(!mount()||running||busy())return;const mine=owner,t=++ticket,company=cloudProfile.company_id;running=true;rows=[];stamp='';q('#alRows').innerHTML='';q('#epActualDetail').innerHTML='';q('#alRefresh').disabled=true;q('#alPrintAll').disabled=true;status('全現場の日報・原価・請負金額を自動集計中…');
  try{
   if(!S?.sources)throw new Error('原価計算の更新が必要です。画面を再読み込みしてください。');
   const definitions=[['sites','sites','id,name,status,completed_on'],...S.sources];
   const values=await Promise.allSettled(definitions.map(([,table,fields])=>read(table,fields,company,t,mine)));
   if(t!==ticket||identity()!==mine)return;
   if(busy()){schedule();return;}
   const failed=values.filter(r=>r.status==='rejected');if(failed.length)throw new Error(failed.map(r=>r.reason.message).join(' / '));
   const data=Object.fromEntries(definitions.map(([name],i)=>[name,values[i].value]));rows=build(data);window.ToyaEstimatePlanUI?.updateSites(data.sites);stamp=new Date().toLocaleString('ja-JP');render();renderDetail();
  }catch(e){if(t===ticket&&identity()===mine){rows=[];q('#alRows').innerHTML='';q('#epActualDetail').innerHTML='';status('集計できませんでした：'+e.message);}}
  finally{if(t===ticket&&identity()===mine){running=false;q('#alRefresh').disabled=false;q('#alPrintAll').disabled=!rows.length;}}
 }
 function render(){
  const total=totals(rows);
  q('#alRows').innerHTML=rows.length?tableHTML(rows,true)+(total.count?'<p class="al-aggregate">日報・費用と請負金額が揃う '+total.count+'現場の合計<br>売上 '+yen(total.sales)+' ／ 原価 '+yen(total.cost)+' ／ 概算利益 '+yen(total.profit)+(total.partial?'（要確認あり）':'')+(total.excluded?'<br>比較対象外 '+total.excluded+'現場（記録なし・請負未登録・集計エラー）':'')+'</p>':''):'<p class="note">現場を登録すると、日報と費用が自動でここに集まります。</p>';
  q('#alRows').querySelectorAll('[data-al-site]').forEach(b=>b.onclick=()=>{if(busy())return;const select=q('#epSite');if(![...select.options].some(o=>o.value===b.dataset.alSite)){status('現場一覧を読み込み中です。少し待って内訳を開いてください。');return;}select.value=b.dataset.alSite;select.dispatchEvent(new Event('change',{bubbles:true}));q('#epActualDetail').scrollIntoView({block:'start',behavior:'smooth'});});
  status('全 '+rows.length+'現場を自動集計しました。'+stamp+' 更新。費用の再入力・積算表の作成操作は不要です。');
 }
 function renderDetail(){
  const box=q('#epActualDetail');if(!box)return;const row=rows.find(r=>r.site.id===q('#epSite')?.value);if(!row){box.innerHTML='';return;}
  if(row.error){box.innerHTML='<p class="al-alert">'+esc(row.site.name)+'：'+esc(row.error)+'</p>';return;}
  const r=row.result;
  box.innerHTML='<section class="al-detail"><h3>'+esc(row.site.name)+' の自動積算</h3><p class="note">全期間 ／ 日報 '+r.reportCount+'件 ／ '+esc(phase(row))+'</p>'+(r.hasData?'<div class="pb-metrics"><div><small>売上合計（税別）</small><b>'+yen(r.sales)+'</b></div><div><small>原価（入力済み）</small><b>'+yen(r.subtotal)+'</b></div><div><small>概算利益</small><b class="'+(r.profit<0?'al-negative':'')+'">'+yen(r.profit)+'</b></div></div><p class="note">'+(r.partial?'要確認の費用があるため暫定値です。':'登録単価と日報に基づく概算です。')+' 未記録の費用は含みません。'+(r.contractAmount===null?' 請負金額を登録すると利益も表示します。':'')+'</p><table class="al-costs"><tbody>'+costRows(r).map(c=>'<tr><th>'+esc(c.label)+'<small>'+esc(c.note)+'</small></th><td>'+ (c.present?yen(c.value):'記録なし')+'</td></tr>').join('')+'</tbody></table><details><summary>日別の自動積算（'+r.days.length+'日）</summary>'+dayTable(r)+'</details>'+(r.warnings.length?'<details><summary>要確認の記録（'+r.warnings.length+'件）</summary><div class="al-alert">'+r.warnings.map(x=>'<p>'+esc(x)+'</p>').join('')+'</div></details>':''):'<p class="al-alert">日報・保存済み費用がまだありません。日報が入ると自動で積算します。記録がない費用を0円とは扱いません。</p>')+'<div class="pb-actions"><button id="alReview" class="btn light" type="button">請負金額・原価を確認</button><button id="alPrintSite" class="btn light" type="button">この現場を印刷・PDF</button></div>'+(r.hasData?'<button id="alUseActual" class="btn light pb-wide" type="button">この実績を見積の参考に使う</button>':'')+'</section>';
  q('#alReview').onclick=()=>{if(busy())return;const select=q('#siteSummarySelect');if(!select)return;if(![...select.options].some(o=>o.value===row.site.name))select.add(new Option(row.site.name,row.site.name));select.value=row.site.name;select.dispatchEvent(new Event('change',{bubbles:true}));const mode=q('#sfMode');if(mode){mode.value='all';mode.dispatchEvent(new Event('change',{bubbles:true}));}q('#sfRefresh')?.click();q('#siteSummaryCard')?.scrollIntoView({block:'start',behavior:'smooth'});};
  q('#alPrintSite').onclick=()=>print(true);
  if(q('#alUseActual'))q('#alUseActual').onclick=()=>{try{window.ToyaEstimatePlanUI?.useActual(fromActual(row,stamp));}catch(e){status(e.message);}};
 }
 function print(single){
  if(running||busy()||!rows.length)return;const html=printHTML(rows,stamp,single?q('#epSite').value:null);q('#alPreview')?.remove();const dialog=document.createElement('dialog');dialog.id='alPreview';dialog.innerHTML='<div class="pb-preview-toolbar"><b>自動積算表（社内用）</b><div><button id="alPrintNow" class="btn dark" type="button">印刷・PDF保存</button><button id="alClosePrint" class="btn light" type="button">閉じる</button></div></div><iframe title="自動積算表の印刷プレビュー" sandbox="allow-same-origin allow-modals"></iframe>';document.body.append(dialog);const frame=dialog.querySelector('iframe');frame.srcdoc=html;q('#alPrintNow').onclick=()=>{frame.contentWindow.focus();frame.contentWindow.print();};q('#alClosePrint').onclick=()=>{dialog.close();dialog.remove();};dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
 }
 const start=()=>{mount();document.addEventListener('click',e=>{if(e.target.closest('nav [data-page="homePage"]')){mount();schedule();}});document.addEventListener('visibilitychange',()=>{if(visible()){mount();schedule();}});window.addEventListener('pageshow',()=>{mount();schedule();});document.addEventListener('toya-shared-sites-updated',()=>{mount();schedule();});document.addEventListener('toya-site-lifecycle-changed',()=>{mount();schedule();});setInterval(()=>{if(identity()!==owner||(!host?.isConnected&&identity()))mount();},1000);setInterval(()=>{if(visible()&&identity()&&!running)schedule();},60000);};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,1200),{once:true});else setTimeout(start,1200);
})();
