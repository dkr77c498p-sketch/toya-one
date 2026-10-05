/* Combine existing issued site invoices on the approved green sheet.
 * Read-only re-presentation, not new issuance. Retains each source invoice's
 * number, dates, tax and current claim; does not write any account or ledger. */
(function(root){
 'use strict';
 const node=typeof module==='object'&&module.exports;
 const B=node?require('./billing-bundle.r1.js'):root.ToyaBillingBundle;
 const E=node?require('./project-documents-engine.quote5-r3.js'):root.ToyaProjectDocuments;
 const text=v=>String(v??'').trim();
 const copy=v=>JSON.parse(JSON.stringify(v));
 const issuerFields=['issuer_name','registration_number','bank_details','address','postal_code','representative','phone','fax','logo_key'];
 function model(input){
  if(!Array.isArray(input?.rows)||!input.rows.length)throw Error('まとめる請求書を選択してください。');
  const documents=input.rows.map(r=>r.document),company=documents[0]?.company_id;
  const b=B.bundle(documents,documents.map(d=>d.id),company);
  if(input.fingerprint!==b.fingerprint||input.subtotal!==b.subtotal||input.tax!==b.tax||input.total!==b.total)throw Error('選択した請求書が変わりました。一覧を更新してください。');
  const key=i=>JSON.stringify(issuerFields.map(k=>text(i?.[k])));
  if(documents.some(d=>key(d.issuer)!==key(b.issuer)))throw Error('会社情報・振込先の記載が異なります。「合計表＋各現場の請求書」を選んで原本を確認してください。');
  const dates=[...new Set(documents.map(d=>d.document_date))].sort();
  const dues=[...new Set(documents.map(d=>d.due_date))].sort();
  return {...b,issuer:copy(b.issuer),dateFrom:dates[0],dateTo:dates.at(-1),due:dues.length===1?dues[0]:null,
   lines:b.rows.map(r=>{const d=r.document;return {id:d.id,site_id:d.site_id,site_name:d.site_name,subject:d.subject||'',number:d.document_number,issued:d.document_date,start:d.transaction_start||'',end:d.transaction_end,due:d.due_date,kind:d.kind,rate:Number(d.tax_rate),subtotal:r.subtotal,tax:r.tax,total:r.total,notes:d.notes||'',codes:[...new Set(d.items.map(i=>text(i.code)).filter(Boolean))]};})};
 }
 const css=`
 .invoice-document .ci-source{font-size:7.2pt;line-height:1.4;display:block;overflow-wrap:anywhere}
 .invoice-document .ci-item-kind{color:#006528;font-size:8pt;font-weight:600;display:block}
 .invoice-document .invoice-lines .ci-remarks{font-size:7pt;line-height:1.45;font-weight:400}
 .invoice-document .ci-notice{font-size:6.5pt;line-height:1.4;margin:1.4mm 0 0;overflow-wrap:anywhere}
 .invoice-document .ci-source-notes{font-size:7pt;line-height:1.4;margin:2mm 0 0;overflow-wrap:anywhere}
 .invoice-document .ci-source-notes p{margin:1mm 0;white-space:pre-wrap}
 .invoice-document .invoice-tax-detail{white-space:normal}
 `;
 function build(input){
  const m=model(input),first=m.rows[0].document;
  // The engine supplies only the familiar header and table structure. All
  // aggregate money cells below are filled from verified source sums, never
  // by rounding the combined subtotal again. This object is never persisted.
  const view={...copy(first),kind:'invoice',status:'issued',document_number:'',document_date:m.dateTo,
   transaction_start:null,transaction_end:null,due_date:m.due,subject:'',site_name:'',notes:'',tax_rate:0,
   items:m.lines.map(x=>({name:x.site_name,quantity:'1',unit:'式',unitPrice:String(x.subtotal),costPrice:null}))};
  const doc=new DOMParser().parseFromString(E.printHTML(view),'text/html');
  const must=s=>{const el=doc.querySelector(s);if(!el)throw Error('請求書の書式が変わりました。画面を更新してください。');return el;};
  const el=(tag,value,cls)=>{const n=doc.createElement(tag);if(value!==undefined)n.textContent=value;if(cls)n.className=cls;return n;};
  const money=n=>Number(n).toLocaleString('ja-JP');
  const dates=m.dateFrom===m.dateTo?m.dateTo.replace(/-/g,'/'):[m.dateFrom,m.dateTo].map(d=>d.replace(/-/g,'/')).join(' 〜 ');
  must('.invoice-date').textContent='原本発行日 '+dates;
  must('.invoice-grand strong').textContent=money(m.total);
  const terms=must('.invoice-recipient-terms');if(!m.due)terms.replaceChildren(el('div','お支払期限：各明細の記載日','invoice-terms'));
  const project=must('.invoice-project');project.replaceChildren(el('div',m.siteCount+'現場分'+(m.progressCount?' ／ 出来高は今回請求分のみ':'')),el('div','原本 '+m.rows.length+'件の集約表示','invoice-meta'));
  const tbody=must('.invoice-lines tbody');tbody.replaceChildren();
  for(const x of m.lines){
   const row=el('tr',undefined,'invoice-item');row.dataset.ciSource=x.id;
   const name=el('td'),label=el('div',x.site_name);name.append(label);
   const codes=x.codes.filter(c=>!x.site_name.includes(c));if(codes.length)name.append(el('small',codes.join(' ／ '),'ci-source'));
   if(text(x.subject)&&text(x.subject)!==text(x.site_name))name.append(el('small',x.subject,'ci-source'));
   if(x.kind==='progress')name.append(el('span','出来高（今回分）','ci-item-kind'));
   const period=[x.start,x.end].filter((d,j,a)=>d&&a.indexOf(d)===j).join(' 〜 ');
   name.append(el('small','工事期間：'+period,'ci-source'));
   const remark=el('td',undefined,'ci-remarks');remark.append(el('span',x.number,'ci-source'));
   remark.append(el('span',(x.rate===0?'非課税・対象外':x.rate+'%'+(x.rate===8?'（軽減）':''))+' ／ 税 '+money(x.tax)+'円','ci-source'));
   if(!m.due)remark.append(el('span','期限 '+x.due,'ci-source'));
   if(m.dateFrom!==m.dateTo)remark.append(el('span','発行 '+x.issued,'ci-source'));
   row.append(name,el('td','1'),el('td','式'),el('td',''),el('td',money(x.subtotal)),remark);tbody.append(row);
  }
  const cells=must('.invoice-totals tbody tr').querySelectorAll('td:not([aria-hidden="true"])');
  if(cells.length!==3)throw Error('合計欄の書式を確認してください。');
  [m.subtotal,m.tax,m.total].forEach((n,j)=>cells[j].textContent=money(n));
  must('.invoice-tax-detail').textContent=Object.entries(m.taxBuckets).sort((a,b)=>Number(b[0])-Number(a[0])).map(([rate,v])=>(rate==='0'?'非課税・対象外':rate+'%対象'+(rate==='8'?'（軽減）':''))+'（税抜） '+money(v.subtotal)+'円 ／ 消費税額 '+money(v.tax)+'円').join('　｜　');
  const final=must('.invoice-final');final.append(el('p','記載の請求番号の集約表示です。原本と重複したご請求ではありません。消費税は原本ごとの記載額の合計です。各原本と併せて保管してください。','ci-notice'));
  const grouped=new Map();for(const x of m.lines)if(text(x.notes)){const key=text(x.notes);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(x.number);}
  for(const [note,numbers] of grouped){const section=el('section',undefined,'invoice-notes ci-source-notes');section.append(el('b','備考（'+numbers.join('・')+'）'),el('p',note));must('.invoice-document').append(section);}
  doc.head.append(el('style',css));return doc;
 }
 const api=Object.freeze({model,build,css});if(node)module.exports=api;else root.ToyaCombinedInvoice=api;
})(typeof window==='undefined'?globalThis:window);
