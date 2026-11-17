/* Read-only monthly revenue resolver. Never writes invoices, contracts or profiles.
 * Explicit monthly totals take priority. An issued invoice is an automatic source
 * only when its work period belongs to one month, never simply its issue month. */
(function(root){
 'use strict';
 const list=x=>Array.isArray(x)?x:[],text=x=>String(x??'').trim();
 const fields='id,site_id,kind,status,document_number,document_date,transaction_start,transaction_end,subtotal,previous_billed,cumulative_amount,contract_amount,issued_at,updated_at';
 const monthOK=x=>typeof x==='string'&&/^(20\d\d|21\d\d)-(0[1-9]|1[0-2])$/.test(x);
 const dayOK=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&monthOK(x.slice(0,7))&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
 const money=x=>{if(x==null||typeof x==='boolean'||text(x)==='')return null;const n=Number(x);return Number.isSafeInteger(n)&&n>=0&&n<=999999999999?n:null;};
 const add=(a,b)=>{const n=Math.round(a*100)+Math.round(b*100);if(!Number.isSafeInteger(n))throw Error('売上合計が上限を超えています。');return n/100;};
 const stable=x=>Array.isArray(x)?'['+x.map(stable).join(',')+']':x&&typeof x==='object'?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}':JSON.stringify(x);
 const issued=d=>!!d&&['invoice','progress'].includes(d.kind)&&d.status==='issued';
 function workMonth(d){
  if(!issued(d)||!dayOK(d.transaction_end))return null;
  if(d.transaction_start&&(!dayOK(d.transaction_start)||d.transaction_start>d.transaction_end||d.transaction_start.slice(0,7)!==d.transaction_end.slice(0,7)))return null;
  return d.transaction_end.slice(0,7);
 }
 function dedupe(documents,company){
  const seen=new Map();for(const d of list(documents)){
   if(!d?.id||company&&d.company_id!==company)throw Error('請求書の会社・識別番号を確認してください。');
   if(seen.has(d.id)&&stable(seen.get(d.id))!==stable(d))throw Error('読込中に請求書が変わりました。更新してください。');seen.set(d.id,d);
  }return [...seen.values()];
 }
 function validInvoice(d){
  const n=money(d.subtotal);if(n===null||!text(d.document_number)||!d.issued_at||!d.updated_at)return false;
  if(d.kind==='progress'){
   const prior=money(d.previous_billed),cumulative=money(d.cumulative_amount),contract=money(d.contract_amount);
   if(prior===null||cumulative===null||cumulative-prior!==n||contract===null||cumulative>contract)return false;
  }return true;
 }
 function resolve(documents,rawPhases,siteId,month,company){
  if(!siteId||!monthOK(month))throw Error('売上の現場・対象月を確認してください。');
  const docs=dedupe(documents,company).filter(d=>d.site_id===siteId&&issued(d));
  const applicable=docs.filter(d=>workMonth(d)===month),invalid=applicable.filter(d=>!validInvoice(d));
  const ambiguous=docs.filter(d=>!workMonth(d)&&((dayOK(d.transaction_start)&&dayOK(d.transaction_end)&&d.transaction_start<=month+'-31'&&d.transaction_end>=month+'-01')||dayOK(d.document_date)&&d.document_date.startsWith(month)));
  const notes=[];if(invalid.length)notes.push('確定請求の金額・状態を確認してください。');if(ambiguous.length)notes.push('工事月が不明、または複数月にまたがる請求があります。月別売上を入力してください。');
  const printedElsewhere=docs.filter(d=>dayOK(d.document_date)&&d.document_date.startsWith(month)&&workMonth(d)&&workMonth(d)!==month);
  if(printedElsewhere.length)notes.push('この月に発行した請求のうち、別の工事月の分は今月売上に加算していません。');
  const common={notes,documents:applicable,otherMonthInvoices:printedElsewhere,ambiguous,invoiceCount:applicable.length,automatic:false,provisional:false};
  if(rawPhases!=null&&!Array.isArray(rawPhases))return {...common,amount:null,source:'invalid',notes:[...notes,'月別売上の保存内容を確認してください。']};
  const part=list(rawPhases).filter(p=>p?.target_month===month);
  if(part.length){
   if(part.some(p=>money(p.amount)===null||!['planned','complete'].includes(p.status)))return {...common,amount:null,source:'invalid',notes:[...notes,'月別売上の金額・状態を確認してください。']};
   const amount=part.reduce((s,p)=>add(s,money(p.amount)),0);
   const billed=applicable.filter(validInvoice).reduce((s,d)=>add(s,money(d.subtotal)),0);
   if(billed>amount)notes.push('手入力の月別売上が、この工事月の確定請求額より少なくなっています。手入力を優先しています。');
   return {...common,notes,amount,source:'manual',provisional:part.some(p=>p.status==='planned')};
  }
  if(invalid.length||ambiguous.length)return {...common,amount:null,source:'needs-allocation'};
  if(applicable.length)return {...common,amount:applicable.reduce((s,d)=>add(s,money(d.subtotal)),0),source:'invoice',automatic:true,provisional:true};
  return {...common,amount:null,source:'missing'};
 }
 const api=Object.freeze({fields,monthOK,dayOK,money,add,issued,workMonth,dedupe,validInvoice,resolve});
 if(typeof module==='object'&&module.exports)module.exports=api;else root.ToyaMonthlyRevenue=api;
})(typeof window==='undefined'?globalThis:window);
