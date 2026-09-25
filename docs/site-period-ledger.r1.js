/* Site month/lifetime ledger. Pure, read-only calculations; reuses the production cost engine.
 * Monthly progress is counted once. Orders and invoices are never added to that revenue.
 */
(function(root){
 'use strict';
 const node=typeof module==='object'&&module.exports;
 const S=node?require('./site-financial-summary.js'):root.ToyaSiteCostSummaryEngine;
 const copy=x=>JSON.parse(JSON.stringify(x));
 const list=x=>Array.isArray(x)?x:[];
 const text=x=>String(x??'').trim();
 const monthOK=x=>typeof x==='string'&&/^(20\d\d|21\d\d)-(0[1-9]|1[0-2])$/.test(x);
 const dateOK=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&monthOK(x.slice(0,7))&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
 const add=(a,b)=>{const n=Math.round(a*100)+Math.round(b*100);if(!Number.isSafeInteger(n))throw Error('合計金額が上限を超えています。');return n/100;};
 const sum=rows=>rows.reduce(add,0);
 const money=x=>{if(x==null||text(x)===''||typeof x==='boolean')return null;const n=Number(x);return Number.isFinite(n)&&n>=0&&n<=999999999999?Math.round(n*100)/100:null;};
 function stable(x){if(Array.isArray(x))return '['+x.map(stable).join(',')+']';if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}';return JSON.stringify(x);}
 function unique(rows,key,company){
  if(!Array.isArray(rows))throw Error('全件の読込が完了していません。');const seen=new Map();
  for(const r of rows){if(!r||r.company_id!==company||!r[key])throw Error('会社・記録の識別情報を確認できません。');if(seen.has(r[key])&&stable(seen.get(r[key]))!==stable(r))throw Error('読込中に記録が変わりました。更新してください。');seen.set(r[key],r);}
  return [...seen.values()];
 }
 function sources(){if(!S)throw Error('原価計算を読み込めませんでした。');return [
  ['sites','sites','id,name,status,completed_on',null,'id'],
  ...S.sources.map(x=>[...x,'id']),
  ['profiles','site_project_profiles','*',null,'site_id'],
  ['documents','project_documents','id,site_id,kind,status,document_date,subtotal,updated_at','document_date','id']
 ];}
 function prepare(input,company,complete){
  if(complete!==true||!company)throw Error('全件の読込が完了していません。');const out={};
  for(const [key,,,dateField,idField] of sources()){
   out[key]=unique(input[key],idField,company);
   if(dateField&&out[key].some(r=>!dateOK(r[dateField])))throw Error('集計日付を確認できない記録があります。');
  }return out;
 }
 function phases(value){
  if(value==null)return [];if(!Array.isArray(value)||value.length>48)throw Error('月別売上の内訳を確認してください。');
  return value.map((r,i)=>{
   const amount=money(r?.amount);
   if(!r||!text(r.label)||!monthOK(r.target_month)||amount===null||!Number.isSafeInteger(amount)||!['planned','complete'].includes(r.status))throw Error((i+1)+'行目の月別売上を確認してください。');
   return {...copy(r),amount,work_kind:['base','addition'].includes(r.work_kind)?r.work_kind:'unclassified'};
  });
 }
 function monthsBetween(first,last){
  if(!monthOK(first)||!monthOK(last))throw Error('集計月を確認してください。');const out=[];let [y,m]=first.split('-').map(Number);
  while(y+'-'+String(m).padStart(2,'0')<=last){out.push(y+'-'+String(m).padStart(2,'0'));if(out.length>240)throw Error('集計期間が20年を超えています。日付を確認してください。');m++;if(m===13){y++;m=1;}}
  return out;
 }
 function analyze(input,siteId,{companyId,complete,asOfMonth}={}){
  if(!monthOK(asOfMonth))throw Error('現在の集計月を確認してください。');
  const data=prepare(input,companyId,complete),site=data.sites.find(s=>s.id===siteId);if(!site)throw Error('この会社の現場を選んでください。');
  const profile=data.profiles.find(r=>r.site_id===siteId)||null,entries=phases(profile?.contract_breakdown);
  const orders=data.revenues.filter(r=>r.site_id===siteId&&r.revenue_type==='contract');
  if(orders.length>1)throw Error('請負金額が重複しています。');const contract=orders[0]||null,contractAmount=contract?money(contract.amount):null;
  if(contract&&contractAmount===null)throw Error('請負金額を確認できません。');
  // No contract is provided to the cost engine: its contract-based sales are not used here.
  const costs=S.analyze({...data,revenues:[]},site),byMonth=new Map();
  for(const d of costs.days){if(!dateOK(d.date))throw Error('原価の日付を確認してください。');const m=d.date.slice(0,7);if(!byMonth.has(m))byMonth.set(m,{cost:0,outgoing:0,days:0});const c=byMonth.get(m);c.cost=add(c.cost,d.subtotal);c.outgoing=add(c.outgoing,d.revenue||0);c.days++;}
  const docs=data.documents.filter(d=>d.site_id===siteId&&['invoice','progress'].includes(d.kind)&&d.status==='issued');
  if(docs.some(d=>money(d.subtotal)===null))throw Error('請求書の税別金額を確認してください。');
  const monthSet=new Set([...byMonth.keys(),...entries.map(r=>r.target_month),...docs.map(d=>d.document_date.slice(0,7))]);
  if(site.completed_on){if(!dateOK(site.completed_on))throw Error('完工日を確認してください。');monthSet.add(site.completed_on.slice(0,7));}
  const sorted=[...monthSet].sort(),months=sorted.length?monthsBetween(sorted[0],sorted.at(-1)):[];
  let cumulativeKnown=0,cumulativeCost=0,cumulativeRevenueMissing=false,cumulativeCostMissing=false,hasRevenue=false;
  const rows=months.map(month=>{
   const part=entries.filter(r=>r.target_month===month),c=byMonth.get(month),revenue=part.length?sum(part.map(r=>r.amount)):null;
   const cost=c?c.cost:null,invoice=sum(docs.filter(d=>d.document_date.startsWith(month)).map(d=>money(d.subtotal))),future=month>asOfMonth;
   const activity=!!c||part.length>0||docs.some(d=>d.document_date.startsWith(month));
   const notes=costs.warnings.filter(w=>String(w).startsWith(month));
   if(!future&&activity){if(revenue===null)cumulativeRevenueMissing=true;else{cumulativeKnown=add(cumulativeKnown,revenue);hasRevenue=true;}if(cost===null)cumulativeCostMissing=true;else cumulativeCost=add(cumulativeCost,cost);}
   return {month,entries:part,revenue,cost,invoice,activity,future,provisional:part.some(r=>r.status==='planned'),warnings:notes,
    outgoing:c?.outgoing||0,profit:revenue!==null&&cost!==null?add(revenue,-cost):null,
    cumulativeRevenue:!future&&hasRevenue&&!cumulativeRevenueMissing?cumulativeKnown:null,cumulativeKnown:future?null:cumulativeKnown,
    cumulativeCost:future?null:cumulativeCost,cumulativeProfit:!future&&hasRevenue&&!cumulativeRevenueMissing&&!cumulativeCostMissing?add(cumulativeKnown,-cumulativeCost):null};
  });
  const past=rows.filter(r=>!r.future&&r.activity),knownRevenue=sum(past.map(r=>r.revenue||0)),knownCost=sum(past.map(r=>r.cost||0));
  const missingRevenue=past.filter(r=>r.revenue===null).length,missingCost=past.filter(r=>r.cost===null).length;
  const revenue=past.some(r=>r.revenue!==null)&&!missingRevenue?knownRevenue:null,cost=past.some(r=>r.cost!==null)?knownCost:null;
  const orderedProgress=sum(entries.map(r=>r.amount)),overContract=contractAmount!==null&&orderedProgress>contractAmount;
  const remainder=contractAmount===null?null:add(contractAmount,-orderedProgress);
  const warnings=costs.warnings.filter(w=>!monthOK(String(w).slice(0,7))||String(w).slice(0,7)<=asOfMonth);
  const totals={revenue,cost,profit:revenue!==null&&cost!==null&&!missingCost?add(revenue,-cost):null,knownRevenue,knownCost,
   missingRevenue,missingCost,invoice:sum(past.map(r=>r.invoice)),provisional:past.some(r=>r.provisional),warnings,
   outgoing:sum(past.map(r=>r.outgoing)),futureRevenue:sum(rows.filter(r=>r.future).map(r=>r.revenue||0)),
   base:sum(entries.filter(r=>r.target_month<=asOfMonth&&r.work_kind==='base').map(r=>r.amount)),
   additions:sum(entries.filter(r=>r.target_month<=asOfMonth&&r.work_kind==='addition').map(r=>r.amount)),
   unclassified:sum(entries.filter(r=>r.target_month<=asOfMonth&&r.work_kind==='unclassified').map(r=>r.amount))};
  return {site,profile,contract,contractAmount,rows,totals,entries,overContract,remainder,orderedProgress,asOfMonth,
   periodStart:months[0]||'',periodEnd:months.at(-1)||'',completed:!!site.completed_on,
   costScopeNote:'日報・保存済み調整額の入力済み原価。未計上費用や会社共通経費は別確認。'};
 }
 function draftProfile(profile,contract,rows,contractValue){
  const raw=text(contractValue),amount=money(raw);
  if(!/^\d+$/.test(raw)||amount===null||!Number.isSafeInteger(amount))throw Error('本工事と追加工事を含む請負総額を、0円以上の整数で入力してください。');
  const normalized=phases(rows);
  for(const r of normalized){if(r.label.length>160||text(r.notes).length>1000)throw Error('工事名は160文字、備考は1000文字以内です。');}
  if(sum(normalized.map(r=>r.amount))>amount)throw Error('月別売上の合計が請負総額を超えています。本工事・追加工事の総額と二重入力を確認してください。');
  const data={...(profile?copy(profile):{}),contract_breakdown:normalized};
  // Unknown profile fields and phase metadata are preserved. The existing RPC validates
  // both timestamps and updates the profile and contract atomically when explicitly saved.
  return {p_expected_updated_at:profile?.updated_at||null,p_expected_contract_updated_at:contract?.updated_at||null,p_contract_amount:amount,p_profile:data};
 }
 const api=Object.freeze({sources,prepare,analyze,draftProfile,phases,monthsBetween,monthOK,money,add,stable});
 if(node)module.exports=api;else root.ToyaSitePeriodLedger=api;
})(typeof window!=='undefined'?window:globalThis);
