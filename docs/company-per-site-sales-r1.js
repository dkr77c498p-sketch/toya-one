/* TOYA One: selected-month and current cumulative sales/cost/profit for each selected site. */
(() => {
 'use strict';
 if(window.__toyaPerSiteSalesR1)return;
 window.__toyaPerSiteSalesR1=true;
 const norm=value=>String(value??'').normalize('NFKC').replace(/[\s　]/g,'');
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const yen=value=>value==null?'未入力':Number(value).toLocaleString('ja-JP',{maximumFractionDigits:2})+'円';
 const currentMonth=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,7);
 const identity=()=>typeof cloudProfile!=='undefined'&&cloudProfile?.active===true&&cloudProfile.role==='admin'&&cloudProfile.company_id&&typeof cloudClient!=='undefined'&&cloudClient?cloudProfile.id+':'+cloudProfile.company_id:'';
 let timer=null,observer=null,token=0,cacheKey='',loading=false,error='',summaryMap=new Map(),fullData=null,fullDataOwner='',fullDataPromise=null;
 const schedule=(delay=24)=>{clearTimeout(timer);timer=setTimeout(apply,delay);};
 function selectedMonth(card){
  const value=card.querySelector('#cmMonth')?.value||currentMonth();
  const match=/^(\d{4})-(\d{2})$/.exec(value);
  return match?{value,label:match[1]+'年'+Number(match[2])+'月',short:Number(match[2])+'月'}:{value:currentMonth(),label:'対象月',short:'対象月'};
 }
 function selectedSites(card){
  const result=[];
  for(const label of card.querySelectorAll('#cmSiteChoices label')){
   const input=label.querySelector('input[type=checkbox]');
   if(!input?.checked||!input.dataset.siteId)continue;
   const name=[...label.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join('').trim()||label.textContent.trim();
   if(name)result.push({id:input.dataset.siteId,name});
  }
  return result;
 }
 function fallbackRows(card){
  const result=new Map();
  for(const siteCard of card.querySelectorAll('#cmBreakdown .cm-site-card')){
   const name=siteCard.querySelector('h3')?.textContent?.trim();if(!name)continue;
   const values={};
   for(const line of siteCard.querySelectorAll(':scope>div')){
    const label=line.querySelector('span')?.textContent?.trim()||'',value=line.querySelector('b')?.textContent?.trim()||'';
    if(/出来高|売上/.test(label)&&!/請負総額|残金|合計/.test(label))values.sales=value;
    if(/原価/.test(label))values.cost=value;
    if(/利益/.test(label))values.profit=value;
   }
   result.set(norm(name),{sales:values.sales||'未入力',cost:values.cost||'記録なし',profit:values.profit||'売上未入力'});
  }
  return result;
 }
 function ensureStyle(){
  if(document.getElementById('cmPerSiteSalesStyle'))return;
  const style=document.createElement('style');style.id='cmPerSiteSalesStyle';style.textContent=`
#companyMonthlySummary[data-per-site-sales="r2"]>.cm-metrics,
#companyMonthlySummary[data-per-site-sales="r2"]>#cmCumulativeInfo,
#companyMonthlySummary[data-per-site-sales="r2"] #cmBreakdown .cm-site-cards{display:none!important}
#cmPerSiteSales{margin:14px 0}
#cmPerSiteSales>h3{font-size:18px;margin:0 0 10px}
.cm-ps-card{border:2px solid #d8dfcf;border-radius:15px;padding:14px;margin:12px 0;background:#fff}
.cm-ps-card>h3{margin:0 0 12px;font-size:18px;overflow-wrap:anywhere}
.cm-ps-group-title{font-size:13px;font-weight:900;margin:12px 0 7px;color:#4e5748}
.cm-ps-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.cm-ps-grid>div{background:#111;color:#fff;border-radius:14px;padding:14px 12px;min-width:0}
.cm-ps-grid span{display:block;color:#ddd;font-size:13px;line-height:1.5}
.cm-ps-grid strong{display:block;color:var(--lime,#b8ff00);font-size:clamp(19px,5vw,27px);line-height:1.45;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.cm-ps-note{font-size:12px;color:#666;line-height:1.7;margin:10px 2px 0}
.cm-ps-months{margin-top:12px;border-top:1px solid #d9ded4;padding-top:5px}
.cm-ps-months>summary{font-weight:900;padding:11px 0;cursor:pointer}
.cm-ps-month{border:1px solid #d9ded4;border-radius:11px;padding:10px;margin:8px 0;background:#fafafa}
.cm-ps-month>b{display:block;margin-bottom:6px}
.cm-ps-month-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;font-size:12px}
.cm-ps-month-grid span{overflow-wrap:anywhere}
.cm-ps-actions{display:grid;grid-template-columns:1fr;gap:8px;margin-top:12px}
@media(max-width:390px){.cm-ps-grid{grid-template-columns:1fr 1fr}.cm-ps-month-grid{grid-template-columns:1fr}}
@media(max-width:340px){.cm-ps-grid{grid-template-columns:1fr}}
@media print{#cmPerSiteSales{display:none!important}}
`;document.head.append(style);
 }
 async function readSource(def,company,mine){
  const [key,table,fields,,id]=def,rows=[];
  for(let offset=0;offset<100000;offset+=500){
   if(identity()!==mine)throw Error('ログイン状態が変わりました。');
   const query=cloudClient.from(table).select(fields==='*'?'*':'company_id,'+fields).eq('company_id',company).order(id).range(offset,offset+499);
   let timeout;const response=await Promise.race([query,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('全期間集計の読み込みが時間切れになりました。')),30000);})]).finally(()=>clearTimeout(timeout));
   if(response.error)throw Error(table+'：'+response.error.message);
   if(!Array.isArray(response.data)||response.data.some(row=>row.company_id!==company))throw Error('会社の記録を確認できません。');
   rows.push(...response.data);if(response.data.length<500)return [key,rows];
  }
  throw Error('全件を取得できませんでした。途中の合計は表示しません。');
 }
 async function ensureFullData(){
  const mine=identity(),company=typeof cloudProfile!=='undefined'?cloudProfile.company_id:'';
  if(!mine||!company)throw Error('管理者としてログインし直してください。');
  if(fullData&&fullDataOwner===mine)return fullData;
  if(fullDataPromise&&fullDataOwner===mine)return fullDataPromise;
  fullDataOwner=mine;
  fullDataPromise=(async()=>{
   let engine=window.ToyaSitePeriodLedger;
   if(!engine){await new Promise(resolve=>setTimeout(resolve,1600));engine=window.ToyaSitePeriodLedger;}
   if(!engine)throw Error('月別・工事全体の集計を読み込めません。');
   const entries=await Promise.all(engine.sources().map(def=>readSource(def,company,mine)));
   if(identity()!==mine)throw Error('ログイン状態が変わりました。');
   fullData=engine.prepare(Object.fromEntries(entries),company,true);return fullData;
  })();
  try{return await fullDataPromise;}finally{fullDataPromise=null;}
 }
 function currentTotals(summary,m){
  if(!summary)return {sales:loading?'全期間集計中…':error||'未集計',cost:loading?'全期間集計中…':error||'未集計',profit:loading?'全期間集計中…':error||'未集計',note:''};
  const t=summary.totals,rows=summary.rows.filter(row=>!row.future&&row.month<=m.value&&row.activity);
  const hasSales=rows.some(row=>row.revenue!==null),hasCost=rows.some(row=>row.cost!==null);
  const salesValue=summary.completed&&summary.contractAmount!==null?summary.contractAmount:t.knownRevenue;
  const costValue=t.knownCost;
  let profitText='未計算';
  if(!summary.overContract&&t.lifetimeProfit!==null)profitText=yen(t.lifetimeProfit);
  else if(hasSales&&hasCost)profitText=yen(t.knownRevenue-t.knownCost)+(t.missingRevenue||t.missingCost?'（入力済み分）':'');
  else if(!hasSales&&hasCost)profitText='売上未入力';
  else if(hasSales&&!hasCost)profitText='原価未確認';
  const notes=[];
  if(t.missingRevenue)notes.push('売上未入力の月 '+t.missingRevenue+'件');
  if(t.missingCost)notes.push('原価記録のない月 '+t.missingCost+'件');
  if(summary.overContract)notes.push('月別売上の合計が請負総額を超過');
  return {sales:hasSales||summary.completed?yen(salesValue):'未登録',cost:hasCost?yen(costValue):'記録なし',profit:profitText,note:notes.join('／')};
 }
 function monthRows(summary,m){
  if(!summary)return '';
  const rows=summary.rows.filter(row=>!row.future&&row.month<=m.value&&row.activity);
  return rows.map(row=>{
   const profit=row.profit==null?(row.revenue==null?'売上未入力':'原価未確認'):yen(row.profit);
   const [year,month]=row.month.split('-');
   // Cumulative fields are produced by the read-only ledger. Never replace
   // missing revenue with zero or double-count issued invoices / contracts.
   const runningRevenue=row.cumulativeRevenue==null?(row.cumulativeKnown>0?yen(row.cumulativeKnown)+'（入力済み分）':'未入力あり'):yen(row.cumulativeRevenue);
   const runningCost=row.cumulativeCost==null?'記録なし':yen(row.cumulativeCost);
   const runningProfit=row.cumulativeProfit==null?'未確定':yen(row.cumulativeProfit);
   return '<div class="cm-ps-month"><b>'+esc(year+'年'+Number(month)+'月')+'</b><div class="cm-ps-month-grid"><span>月売上：'+esc(row.revenue==null?'未入力':yen(row.revenue))+'</span><span>月原価：'+esc(row.cost==null?'記録なし':yen(row.cost))+'</span><span>月利益：'+esc(profit)+'</span></div><div class="cm-ps-month-grid" style="margin-top:8px;padding-top:8px;border-top:1px solid #ddd"><span>ここまでの売上：'+esc(runningRevenue)+'</span><span>ここまでの原価：'+esc(runningCost)+'</span><span>ここまでの利益：'+esc(runningProfit)+'</span></div></div>';
  }).join('')||'<p class="cm-ps-note">この現場の月別記録はまだありません。</p>';
 }
 async function loadSummaries(sites,m){
  const key=identity()+':'+m.value+':'+sites.map(site=>site.id).sort().join(',');
  if(!sites.length){cacheKey=key;summaryMap=new Map();loading=false;error='';return;}
  if(key===cacheKey&&(loading||summaryMap.size||error))return;
  cacheKey=key;summaryMap=new Map();error='';loading=true;const mine=++token;schedule();
  try{
   const engine=window.ToyaSitePeriodLedger||await new Promise(resolve=>setTimeout(()=>resolve(window.ToyaSitePeriodLedger),1600));
   if(!engine)throw Error('月別・工事全体の集計を読み込めません。');
   const data=await ensureFullData();
   const results=sites.map(site=>engine.analyze(data,site.id,{companyId:cloudProfile.company_id,complete:true,asOfMonth:m.value}));
   if(mine!==token||key!==cacheKey)return;
   summaryMap=new Map(results.map(result=>[result.site.id,result]));
  }catch(e){if(mine===token&&key===cacheKey)error=String(e.message||e);}
  finally{if(mine===token&&key===cacheKey){loading=false;schedule();}}
 }
 function renderCard(site,fallback,summary,m){
  const monthRow=summary?.rows?.find(row=>row.month===m.value)||null;
  const monthSales=summary?(monthRow?.revenue==null?'未入力':yen(monthRow.revenue)):(fallback.sales||'未入力');
  const monthCost=summary?(monthRow?.cost==null?'記録なし':yen(monthRow.cost)):(fallback.cost||'記録なし');
  const monthProfit=summary?(monthRow?.profit==null?(monthRow?.revenue==null?'売上未入力':'原価未確認'):yen(monthRow.profit)):(fallback.profit||'売上未入力');
  const totals=currentTotals(summary,m),currentLabel=m.value===currentMonth()?'現在':m.short+'まで';
  return '<article class="cm-ps-card" data-site-id="'+esc(site.id)+'"><h3>'+esc(site.name)+'</h3><div class="cm-ps-group-title">'+esc(m.label)+'の月別</div><div class="cm-ps-grid"><div><span>'+esc(m.short)+'の売上</span><strong>'+esc(monthSales)+'</strong></div><div><span>'+esc(m.short)+'の原価</span><strong>'+esc(monthCost)+'</strong></div><div><span>'+esc(m.short)+'の利益</span><strong>'+esc(monthProfit)+'</strong></div></div><div class="cm-ps-group-title">'+esc(currentLabel)+'の現場合計</div><div class="cm-ps-grid"><div><span>'+esc(currentLabel)+'の売上合計</span><strong>'+esc(totals.sales)+'</strong></div><div><span>'+esc(currentLabel)+'の原価合計</span><strong>'+esc(totals.cost)+'</strong></div><div><span>'+esc(currentLabel)+'の利益</span><strong>'+esc(totals.profit)+'</strong></div></div>'+(totals.note?'<p class="cm-ps-note">'+esc(totals.note)+'</p>':'')+'<details class="cm-ps-months"><summary>月ごとの売上・原価・利益を見る</summary>'+monthRows(summary,m)+'</details><div class="cm-ps-actions"><button type="button" class="btn light" data-cm-site-open="'+esc(site.id)+'">月別売上を入力・変更</button></div></article>';
 }
 function apply(){
  const card=document.querySelector('#companyMonthlySummary');if(!card)return;
  if(card.dataset.perSiteSales!=='r2')card.dataset.perSiteSales='r2';
  ensureStyle();
  const sites=selectedSites(card),m=selectedMonth(card),fallback=fallbackRows(card);
  let host=card.querySelector('#cmPerSiteSales');
  if(!host){host=document.createElement('section');host.id='cmPerSiteSales';const note=card.querySelector('#cmSelectionNote');(note||card.querySelector('#cmSiteFilter'))?.after(host);}
  if(!host)return;
  void loadSummaries(sites,m);
  const html='<h3>各現場の月別・現在合計</h3>'+(sites.length?sites.map(site=>renderCard(site,fallback.get(norm(site.name))||{},summaryMap.get(site.id),m)).join(''):'<p class="cm-ps-note">集計する現場を選んでください。</p>');
  if(host.dataset.signature!==html){
   const openIds=new Set([...host.querySelectorAll('.cm-ps-card')].filter(node=>node.querySelector('.cm-ps-months')?.open).map(node=>node.dataset.siteId));
   host.innerHTML=html;host.dataset.signature=html;
   host.querySelectorAll('.cm-ps-card').forEach(node=>{if(openIds.has(node.dataset.siteId))node.querySelector('.cm-ps-months').open=true;});
   host.querySelectorAll('[data-cm-site-open]').forEach(button=>button.onclick=()=>window.ToyaSitePeriodUI?.open({siteId:button.dataset.cmSiteOpen,month:m.value,edit:true}));
  }
  const oldCards=card.querySelector('#cmBreakdown .cm-site-cards'),oldHeading=oldCards?.previousElementSibling;
  if(oldHeading?.tagName==='H3')oldHeading.style.setProperty('display','none','important');
  card.querySelector('.cm-metrics')?.style.setProperty('display','none','important');
  card.querySelector('#cmCumulativeInfo')?.style.setProperty('display','none','important');
  oldCards?.style.setProperty('display','none','important');
  const title=card.querySelector('#cmTitle');if(title&&title.textContent!=='各現場の月別・現在合計・利益')title.textContent='各現場の月別・現在合計・利益';
  const explanation=card.querySelector('#cmContractInfo');if(explanation)explanation.textContent='各現場を月ごとに確認し、選択月までの売上合計・原価合計・現在利益を表示します。未入力の月は勝手に0円へしません。';
 }
 function invalidate(){cacheKey='';summaryMap=new Map();error='';loading=false;fullData=null;fullDataOwner='';fullDataPromise=null;token++;schedule();}
 function start(){
  apply();
  if(!observer&&document.body){observer=new MutationObserver(schedule);observer.observe(document.body,{subtree:true,childList:true,characterData:true});}
  document.addEventListener('change',event=>{if(event.target?.matches('#cmMonth,#cmSiteChoices input')){cacheKey='';summaryMap=new Map();error='';loading=false;token++;schedule();}});
  document.addEventListener('click',event=>{if(event.target?.matches('#cmRefresh,#cmAutoSelect,#cmPastSitesToggle'))invalidate();});
  for(const name of ['toya-site-project-profile-saved','toya-project-document-changed','toya-site-lifecycle-changed','toya-site-renamed'])document.addEventListener(name,invalidate);
  window.addEventListener('pageshow',schedule);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
