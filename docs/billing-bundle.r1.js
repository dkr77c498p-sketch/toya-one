/* Read-only billing delivery bundle. Original issued invoices remain the only
 * accounting records. No invoice issuance, tax recalculation across documents,
 * storage, network calls or revenue writes are performed by this engine. */
(function(root){
 'use strict';
 const node=typeof module==='object'&&module.exports;
 const E=node?require('./project-documents-engine.quote5-r3.js'):root.ToyaProjectDocuments;
 const text=v=>String(v??'').trim();
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const yen=n=>Number(n).toLocaleString('ja-JP')+'円';
 const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);
 const money=v=>{if(v===null||v===undefined||typeof v==='boolean'||text(v)==='')throw Error('請求金額を確認できません。');const n=Number(v);if(!Number.isSafeInteger(n)||n<0||n>999999999999)throw Error('請求金額の範囲を確認してください。');return n;};
 const add=(a,b)=>{const n=a+b;if(!Number.isSafeInteger(n)||n>999999999999)throw Error('合計金額が上限を超えています。');return n;};
 const dateOK=v=>/^20\d\d-(0[1-9]|1[0-2])-\d{2}$/.test(text(v))&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 const monthOK=v=>/^20\d\d-(0[1-9]|1[0-2])$/.test(text(v));
 // Keep distinct addresses/names separate. Do not infer client identity from a
 // similar name, company suffix, whitespace removal or the site's current name.
 const recipient=d=>JSON.stringify([text(d.customer_name??d.name),text(d.customer_address??d.address)]);
 const issuerKey=d=>JSON.stringify(['issuer_name','registration_number','bank_details','address'].map(k=>text(d.issuer?.[k])));
 function unique(documents,company){
  if(!company||!Array.isArray(documents))throw Error('会社の請求書一覧を最後まで読み込んでください。');
  const out=new Map();for(const d of documents){if(!d?.id||d.company_id!==company)throw Error('別会社の書類はまとめられません。');if(out.has(d.id)&&stable(out.get(d.id))!==stable(d))throw Error('読込中に請求書が変わりました。更新してください。');out.set(d.id,d);}return [...out.values()];
 }
 function verify(d){
  if(!['invoice','progress'].includes(d.kind)||d.status!=='issued'||!text(d.document_number)||!d.issued_at||!d.updated_at||!d.site_id)throw Error('確定済みの請求書・出来高請求書だけを選択してください。');
  if(!text(d.customer_name)||!text(d.issuer?.issuer_name)||!dateOK(d.document_date)||!dateOK(d.transaction_end)||!dateOK(d.due_date)||d.transaction_start&&!dateOK(d.transaction_start)||d.transaction_start&&d.transaction_start>d.transaction_end)throw Error('宛先・発行者・取引期間・支払期限を確認してください。');
  const t=E.total(d.items,d.tax_rate),subtotal=money(d.subtotal),tax=money(d.tax_amount),total=money(d.total);
  if(!subtotal||t.subtotal!==subtotal||t.tax!==tax||t.total!==total)throw Error(d.document_number+'：保存済み金額と明細が一致しません。まとめずに原本を確認してください。');
  const prior=money(d.previous_billed),contract=d.contract_amount==null?null:money(d.contract_amount);
  if(d.kind==='progress'&&(money(d.cumulative_amount)-prior!==subtotal||contract===null||d.cumulative_amount>contract))throw Error(d.document_number+'：出来高の累計・前回請求・今回分を確認してください。');
  return {document:d,subtotal,tax,total,previous:prior,contract,remaining:contract===null?null:contract-prior-subtotal};
 }
 function bundle(documents,ids,company){
  const all=unique(documents,company);if(!Array.isArray(ids)||!ids.length||ids.length>30||new Set(ids).size!==ids.length)throw Error('請求書を重複なしで1〜30件選んでください。');
  const selected=ids.map(id=>{const d=all.find(x=>x.id===id);if(!d)throw Error('選択した請求書が見つかりません。更新してください。');return d;}).sort((a,b)=>a.site_name.localeCompare(b.site_name,'ja')||a.document_date.localeCompare(b.document_date)||a.document_number.localeCompare(b.document_number));
  const first=selected[0];if(selected.some(d=>recipient(d)!==recipient(first)))throw Error('宛先名または住所が異なる請求書は、別々にまとめてください。');
  if(selected.some(d=>issuerKey(d)!==issuerKey(first)))throw Error('発行者・登録番号・振込先・住所が異なります。個別の請求書を確認してください。');
  if(new Set(selected.map(d=>d.document_number)).size!==selected.length)throw Error('同じ請求番号が重複しています。');
  const rows=selected.map(verify),taxBuckets={};let subtotal=0,tax=0,total=0;
  for(const r of rows){subtotal=add(subtotal,r.subtotal);tax=add(tax,r.tax);total=add(total,r.total);const rate=String(r.document.tax_rate);if(!taxBuckets[rate])taxBuckets[rate]={subtotal:0,tax:0};taxBuckets[rate].subtotal=add(taxBuckets[rate].subtotal,r.subtotal);taxBuckets[rate].tax=add(taxBuckets[rate].tax,r.tax);}
  return {rows,subtotal,tax,total,taxBuckets,customer_name:first.customer_name,customer_address:first.customer_address,issuer:JSON.parse(JSON.stringify(first.issuer)),ids:selected.map(d=>d.id),fingerprint:stable(selected),siteCount:new Set(selected.map(d=>d.site_id)).size,ordinaryCount:selected.filter(d=>d.kind==='invoice').length,progressCount:selected.filter(d=>d.kind==='progress').length};
 }
 function balance(documents,revenues,siteId,company){
  const ds=unique(documents,company).filter(d=>d.site_id===siteId&&['invoice','progress'].includes(d.kind)&&d.status==='issued');
  if(!Array.isArray(revenues)||revenues.some(r=>r.company_id!==company))throw Error('請負金額の会社情報を確認してください。');
  const contracts=revenues.filter(r=>r.site_id===siteId&&r.revenue_type==='contract');if(contracts.length>1)throw Error('現場の請負金額が重複しています。');
  const contract=contracts.length?money(contracts[0].amount):null,prior=ds.reduce((n,d)=>add(n,money(d.subtotal)),0);return {contract,billed:prior,remaining:contract===null?null:contract-prior};
 }
 const api={text,esc,yen,stable,recipient,issuerKey,unique,verify,bundle,balance,dateOK,monthOK};
 if(node)module.exports=Object.freeze(api);else root.ToyaBillingBundle=Object.freeze(api);
})(typeof window==='undefined'?globalThis:window);
