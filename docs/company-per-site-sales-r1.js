/* TOYA One: show monthly sales, cumulative sales, monthly cost and profit for each selected site. */
(() => {
 'use strict';
 if(window.__toyaPerSiteSalesR1)return;
 window.__toyaPerSiteSalesR1=true;
 const norm=value=>String(value??'').normalize('NFKC').replace(/[\s　]/g,'');
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const yen=value=>Number(value).toLocaleString('ja-JP',{maximumFractionDigits:2})+'円';
 const setText=(element,text)=>{if(element&&element.textContent!==text){element.textContent=text;return true;}return false;};
 const setHidden=(element,value)=>{if(element&&element.hidden!==value){element.hidden=value;return true;}return false;};
 let timer=null,observer=null;
 const schedule=()=>{clearTimeout(timer);timer=setTimeout(apply,16);};
 function month(card){
  const value=card.querySelector('#cmMonth')?.value||'';
  const match=/^(\d{4})-(\d{2})$/.exec(value);
  return match?{value,label:match[1]+'年'+Number(match[2])+'月',short:Number(match[2])+'月'}:{value:'',label:'対象月',short:'対象月'};
 }
 function rows(card){
  const result=new Map();
  for(const siteCard of card.querySelectorAll('#cmBreakdown .cm-site-card')){
   const name=siteCard.querySelector('h3')?.textContent?.trim();
   if(!name)continue;
   const values={};
   for(const line of siteCard.querySelectorAll(':scope>div')){
    const label=line.querySelector('span')?.textContent?.trim()||'';
    const value=line.querySelector('b')?.textContent?.trim()||'';
    if(/出来高|売上/.test(label)&&!/請負総額|残金|合計/.test(label))values.sales=value;
    if(/原価/.test(label))values.cost=value;
    if(/利益/.test(label))values.profit=value;
   }
   result.set(norm(name),{name,sales:values.sales||'未入力',cost:values.cost||'記録なし',profit:values.profit||'売上未入力'});
  }
  return result;
 }
 function cumulative(card){
  const result=new Map();
  for(const p of card.querySelectorAll('#cmBreakdown details p')){
   const text=p.textContent.trim();
   const match=/^(.*) ／ (\d{4}-\d{2})：(-?[\d,]+(?:\.\d+)?)円/.exec(text);
   if(!match)continue;
   const key=norm(match[1]),amount=Number(match[3].replace(/,/g,''));
   if(!Number.isFinite(amount))continue;
   result.set(key,(result.get(key)||0)+amount);
  }
  return result;
 }
 function selected(card){
  const result=[];
  for(const label of card.querySelectorAll('#cmSiteChoices label')){
   const input=label.querySelector('input[type=checkbox]');
   if(!input?.checked)continue;
   const name=[...label.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join('').trim()||label.textContent.trim();
   if(name)result.push(name);
  }
  return result;
 }
 function ensureStyle(){
  if(document.getElementById('cmPerSiteSalesStyle'))return;
  const style=document.createElement('style');style.id='cmPerSiteSalesStyle';style.textContent=`
#cmPerSiteSales{margin:14px 0}
#cmPerSiteSales>h3{font-size:17px;margin:0 0 10px}
.cm-ps-card{border:2px solid #d8dfcf;border-radius:15px;padding:14px;margin:12px 0;background:#fff}
.cm-ps-card>h3{margin:0 0 12px;font-size:18px;overflow-wrap:anywhere}
.cm-ps-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.cm-ps-grid>div{background:#111;color:#fff;border-radius:14px;padding:14px 12px;min-width:0}
.cm-ps-grid span{display:block;color:#ddd;font-size:13px;line-height:1.5}
.cm-ps-grid strong{display:block;color:var(--lime,#b8ff00);font-size:clamp(20px,5vw,28px);line-height:1.5;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.cm-ps-note{font-size:12px;color:#666;line-height:1.7;margin:10px 2px 0}
@media(max-width:360px){.cm-ps-grid{grid-template-columns:1fr}}
@media print{#cmPerSiteSales{display:none!important}}
`;document.head.append(style);
 }
 function apply(){
  const card=document.querySelector('#companyMonthlySummary');
  if(!card)return;
  const siteNames=selected(card),siteRows=rows(card),totals=cumulative(card),m=month(card);
  let host=card.querySelector('#cmPerSiteSales');
  if(!host){host=document.createElement('section');host.id='cmPerSiteSales';const note=card.querySelector('#cmSelectionNote');(note||card.querySelector('#cmSiteFilter'))?.after(host);}
  if(!host)return;
  ensureStyle();
  const siteHTML=siteNames.map(name=>{
   const row=siteRows.get(norm(name))||{sales:'未入力',cost:'記録なし',profit:'売上未入力'};
   const sales=row.sales==='未確定'?'未入力':row.sales;
   const cost=row.cost==='未確定'?'記録なし':row.cost;
   const profit=row.profit==='未確定'?(sales==='未入力'?'売上未入力':'原価未確認'):row.profit;
   const total=totals.has(norm(name))?yen(totals.get(norm(name))):'未登録';
   return '<article class="cm-ps-card"><h3>'+esc(name)+'</h3><div class="cm-ps-grid"><div><span>'+esc(m.short)+'の売上</span><strong>'+esc(sales)+'</strong></div><div><span>売上合計</span><strong>'+esc(total)+'</strong></div><div><span>'+esc(m.short)+'の原価</span><strong>'+esc(cost)+'</strong></div><div><span>'+esc(m.short)+'の利益</span><strong>'+esc(profit)+'</strong></div></div><p class="cm-ps-note">売上合計は'+esc(m.label)+'までに登録された、この現場だけの累計です。</p></article>';
  }).join('');
  const html='<h3>各現場の売上・原価・利益</h3>'+(siteHTML||'<p class="cm-ps-note">集計する現場を選んでください。</p>');
  if(host.dataset.signature!==html){host.innerHTML=html;host.dataset.signature=html;}
  setHidden(card.querySelector('.cm-metrics'),true);
  setHidden(card.querySelector('#cmCumulativeInfo'),true);
  const oldCards=card.querySelector('#cmBreakdown .cm-site-cards');
  setHidden(oldCards,true);
  const oldHeading=oldCards?.previousElementSibling;
  if(oldHeading?.tagName==='H3')setHidden(oldHeading,true);
  setText(card.querySelector('#cmTitle'),'各現場の月別売上・売上合計・原価・利益');
  setText(card.querySelector('#cmContractInfo'),'現場ごとに、その月の売上・売上合計・原価・利益を表示します。売上合計は選択月までの累計で、その月の売上へ重ねて足しません。');
  if(card.dataset.perSiteSales!=='r1')card.dataset.perSiteSales='r1';
 }
 function start(){
  apply();
  if(!observer&&document.body){observer=new MutationObserver(schedule);observer.observe(document.body,{subtree:true,childList:true,characterData:true});}
  document.addEventListener('change',event=>{if(event.target?.matches('#cmMonth,#cmSiteChoices input'))schedule();});
  document.addEventListener('click',event=>{if(event.target?.matches('#cmRefresh,#cmAutoSelect,#cmPastSitesToggle'))schedule();});
  window.addEventListener('pageshow',schedule);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
