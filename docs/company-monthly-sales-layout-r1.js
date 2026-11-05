/* TOYA One home finance layout: monthly sales, cumulative sales, cost and profit. */
(() => {
 'use strict';
 if(window.__toyaMonthlySalesLayoutR1)return;
 window.__toyaMonthlySalesLayoutR1=true;
 const get=(selector,root=document)=>root.querySelector(selector);
 let timer=null,observer=null;
 const schedule=()=>{clearTimeout(timer);timer=setTimeout(apply,0);};
 const setText=(element,text)=>{if(element&&element.textContent!==text)element.textContent=text;};
 function monthParts(card){
  const value=get('#cmMonth',card)?.value||'';
  const match=/^(\d{4})-(\d{2})$/.exec(value);
  if(!match)return {label:'対象月',number:''};
  return {label:match[1]+'年'+Number(match[2])+'月',number:String(Number(match[2]))};
 }
 function metric(card,id){return get(id,card)?.closest('.cm-metrics>div')||null;}
 function apply(){
  const card=get('#companyMonthlySummary');
  if(!card)return;
  const metrics=get('.cm-metrics',card);
  if(!metrics)return;
  const {label,number}=monthParts(card);
  const contract=metric(card,'#cmActiveContract');
  const monthly=metric(card,'#cmContract');
  const invoice=metric(card,'#cmSales');
  const cost=metric(card,'#cmCost');
  const profit=metric(card,'#cmProfit');
  const cumulative=metric(card,'#cmCumulative');
  if(contract)contract.hidden=true;
  if(invoice)invoice.hidden=true;
  for(const element of [monthly,cumulative,cost,profit])if(element)element.hidden=false;
  const wanted=[monthly,cumulative,cost,profit].filter(Boolean);
  const visible=[...metrics.children].filter(element=>!element.hidden);
  if(visible.length!==wanted.length||visible.some((element,index)=>element!==wanted[index]))wanted.forEach(element=>metrics.append(element));
  setText(get('#cmTitle',card),(get('#cmMonth',card)?.value||'')===new Date(Date.now()+9*60*60*1000).toISOString().slice(0,7)?'今月の売上・合計・原価・利益':'月別の売上・合計・原価・利益');
  setText(get('#cmCurrentProgressLabel',card),label+'の売上');
  setText(cumulative?.querySelector('span'),label+'までの売上合計');
  setText(get('#cmCurrentCostLabel',card),label+'の原価');
  setText(get('#cmCurrentProfitLabel',card),label+'の利益');
  if(number)setText(get('#cmProgressOpen',card),number+'月の売上を入力');
  const info=get('#cmCumulativeInfo',card);
  if(info&&!/確認できません/.test(info.textContent)){
   const detail=info.textContent.includes(' 内訳：')?' '+info.textContent.slice(info.textContent.indexOf('内訳：')):'';
   setText(info,label+'までの売上合計です。未入力の月は含みません。'+detail);
  }
  const explanation=get('#cmContractInfo',card);
  if(explanation&&explanation.textContent)setText(explanation,'その月の売上 − その月の原価 ＝ その月の利益です。売上合計は選択月までの累計で、月の売上へ重ねて足しません。');
  for(const siteCard of card.querySelectorAll('.cm-site-card')){
   for(const span of siteCard.querySelectorAll('span')){
    if(span.textContent==='今月出来高')setText(span,label+'の売上');
    else if(span.textContent==='今月原価')setText(span,label+'の原価');
    else if(span.textContent==='今月利益')setText(span,label+'の利益');
   }
  }
  card.dataset.monthlySalesLayout='r1';
 }
 function start(){
  apply();
  if(!observer&&document.body){observer=new MutationObserver(schedule);observer.observe(document.body,{subtree:true,childList:true,characterData:true});}
  document.addEventListener('change',event=>{if(event.target?.id==='cmMonth')schedule();});
  for(const name of ['toya-project-document-changed','toya-site-project-profile-saved','toya-site-lifecycle-changed','toya-site-renamed'])document.addEventListener(name,schedule);
  window.addEventListener('pageshow',schedule);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
