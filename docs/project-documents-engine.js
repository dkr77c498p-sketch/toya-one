/* Integer-yen construction estimates and billing. No writes to revenue data. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ToyaProjectDocuments=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const kinds={estimate:'見積書',invoice:'請求書',progress:'出来高請求書'};
 const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const yen=n=>Number(n).toLocaleString('ja-JP')+'円';
 function scaled(raw,places,signed=false){
  const s=String(raw??'').trim(),re=new RegExp('^'+(signed?'-?':'')+'[0-9]+(?:\\.[0-9]{1,'+places+'})?$');
  if(!re.test(s))throw new Error('数量は小数3桁、単価は小数2桁までの数字で入力してください。');
  const negative=s[0]==='-',parts=s.replace(/^-/,'').split('.');
  return (negative?-1n:1n)*(BigInt(parts[0])*10n**BigInt(places)+BigInt((parts[1]||'').padEnd(places,'0')));
 }
 function floorDivide(n,d){return n>=0n?n/d:-((-n+d-1n)/d);}
 function lineAmount(quantity,price){
  const q=scaled(quantity,3),p=scaled(price,2,true);
  if(q<=0n||q>1000000000n||p>99999999999900n||p< -99999999999900n)throw new Error('数量または単価が範囲外です。');
  const n=floorDivide(q*p,100000n);if(n>999999999999n||n< -999999999999n)throw new Error('明細金額が大きすぎます。');return Number(n);
 }
 function total(items,taxRate=10){
  if(!Array.isArray(items)||items.length===0||items.length>200)throw new Error('明細を1〜200行で入力してください。');
  if(![0,8,10].includes(Number(taxRate)))throw new Error('税率を確認してください。');
  let subtotal=0,cost=0,missingCost=0;
  const lines=items.map((r,i)=>{
   if(!String(r.name||'').trim()||String(r.name).length>200||String(r.spec||'').length>500||String(r.unit||'').length>20)throw new Error((i+1)+'行目の品名・規格・単位を確認してください。');
   const amount=lineAmount(r.quantity,r.unitPrice);subtotal+=amount;
   let c=null;if(r.costPrice===null||r.costPrice===undefined||String(r.costPrice).trim()==='')missingCost++;
   else{if(scaled(r.costPrice,2)<0n)throw new Error('原価単価は0円以上で入力してください。');c=lineAmount(r.quantity,r.costPrice);cost+=c;}
   return {...r,amount,cost:c};
  });
  if(subtotal<0||subtotal>999999999999||cost>999999999999)throw new Error('合計金額を確認してください。');
  const tax=Number(BigInt(subtotal)*BigInt(taxRate)/100n);
  return {lines,subtotal,tax,total:subtotal+tax,cost:missingCost?null:cost,enteredCost:cost,missingCost,profit:missingCost?null:subtotal-cost};
 }
 function billed(documents){return documents.filter(d=>d.kind!=='estimate'&&d.status==='issued').reduce((n,d)=>n+Number(d.subtotal),0);}
 function progress(contract,cumulative,previous){
  const c=Number(contract),v=Number(cumulative),p=Number(previous);
  if(contract===null||contract===undefined||contract===''||!Number.isFinite(c)||c<0)throw new Error('先に請負金額を登録してください。');
  if(cumulative===null||cumulative===undefined||cumulative===''||!Number.isSafeInteger(v)||!Number.isSafeInteger(p)||p<0||v<=p||v>c)throw new Error('累計出来高は請求済額より大きく、請負金額以下で入力してください。');
  return {cumulative:v,previous:p,current:v-p,remaining:c-v};
 }
 function percentAmount(contract,percent){
  const p=scaled(percent,2);if(p<0n||p>10000n||contract===null||contract===undefined||contract==='')throw new Error('請負金額を登録し、出来高率を0〜100%で入力してください。');
  return Number(scaled(contract,2)*p/1000000n);
 }
 function draft(kind,site,issuer,date){
  return {site_id:site.id,site_name:site.name,kind,status:'draft',document_date:date,transaction_start:null,transaction_end:date,due_date:null,valid_until:null,customer_name:'',customer_address:'',subject:site.name,notes:'',issuer:{...issuer},items:[{name:'',spec:'',quantity:'1',unit:'式',unitPrice:'',costPrice:null}],tax_rate:10,cumulative_amount:null};
 }
 function estimateDetails(d){
  const p=d.estimate_snapshot,t=p?.calculation,e=escape;
  if(d.kind!=='estimate'||p?.entry_mode!=='quote'||!Array.isArray(p.groups)||!Array.isArray(t?.groups))return '';
  return p.groups.map((g,i)=>{const gt=t.groups[i];if(!gt?.active)return '';return '<section class="quote-detail"><div class="quote-detail-heading"><h2>工事内訳書</h2><b>'+e(d.issuer?.issuer_name||'')+'</b></div><p>'+e(d.site_name)+'</p><h3>'+e(g.name)+'</h3><table class="quote-breakdown"><thead><tr><th>名称</th><th>見積数量</th><th>単位</th><th>見積単価</th><th>見積金額</th><th>備考</th></tr></thead><tbody>'+g.quote_lines.map((r,j)=>r.excluded?'':'<tr><td>'+e(r.label)+'</td><td>'+e(r.quantity)+'</td><td>'+e(r.unit)+'</td><td>'+(r.quote_price===null||r.quote_price===undefined||r.quote_price===''?'':Number(r.quote_price).toLocaleString('ja-JP',{maximumFractionDigits:2}))+'</td><td>'+Number(gt.rows[j].amount).toLocaleString('ja-JP')+'</td><td>'+e(r.spec||'')+'</td></tr>').join('')+'<tr class="quote-group-total"><th colspan="4">'+e(g.name)+' 合計</th><td>'+Number(gt.price).toLocaleString('ja-JP')+'</td><td></td></tr></tbody></table></section>';}).join('');
 }
 function printHTML(d){
  const rows=total(d.items,d.tax_rate),e=escape,issuer=d.issuer||{},estimate=d.kind==='estimate';
  const title=kinds[d.kind]||'書類',status=d.status==='draft'?'下書き':d.status==='void'?'取消済み':'';
  const period=[d.transaction_start,d.transaction_end].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).join(' 〜 ');
  const nl=x=>e(x).replace(/\n/g,'<br>');
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+e(title+' '+(d.document_number||'下書き'))+'</title><style>'+printCSS+'</style></head><body><article class="document"><header><div class="document-title">'+e(title)+'</div><div class="number">'+(status?'<b class="draft">'+e(status)+'</b><br>':'')+'No. '+e(d.document_number||'未採番')+'<br>発行日 '+e(d.document_date)+'</div></header><section class="parties"><div class="recipient"><b>'+e(d.customer_name||'宛先未入力')+(/(?:御中|様)$/.test(d.customer_name||'')?'':' 御中')+'</b><p>'+nl(d.customer_address)+'</p></div><div class="issuer"><b>'+e(issuer.issuer_name||'発行者未入力')+'</b><p>'+nl(issuer.address)+(issuer.phone?'<br>TEL '+e(issuer.phone):'')+(issuer.registration_number?'<br>登録番号 '+e(issuer.registration_number):'')+'</p></div></section><p class="subject">件名：'+e(d.subject)+'</p><p>現場：'+e(d.site_name)+'</p>'+(d.site_address?'<p>工事住所：'+e(d.site_address)+'</p>':'')+'<div class="grand"><span>'+ (estimate?'御見積金額':'今回御請求金額')+'</span><strong>¥ '+Number(rows.total).toLocaleString('ja-JP')+'</strong><small>税込</small></div><div class="terms">'+(period?'取引日・工事期間：'+e(period)+'<br>':'')+(estimate&&d.valid_until?'見積有効期限：'+e(d.valid_until):'')+(!estimate&&d.due_date?'お支払期限：'+e(d.due_date):'')+'</div>'+(d.kind==='progress'?'<table class="progress"><tbody><tr><th>請負金額（税別）</th><td>'+yen(d.contract_amount)+'</td></tr><tr><th>累計出来高（税別）</th><td>'+yen(d.cumulative_amount)+'</td></tr><tr><th>前回までの請求額（税別）</th><td>'+yen(d.previous_billed)+'</td></tr><tr><th>今回請求額（税別）</th><td>'+yen(rows.subtotal)+'</td></tr></tbody></table>':'')+'<table class="lines"><thead><tr><th>品名・規格</th><th>数量</th><th>単位</th><th>単価</th><th>金額</th></tr></thead><tbody>'+rows.lines.map(r=>'<tr><td>'+e(r.name)+(r.spec?'<small>'+nl(r.spec)+'</small>':'')+'</td><td>'+e(r.quantity)+'</td><td>'+e(r.unit)+'</td><td>'+Number(r.unitPrice).toLocaleString('ja-JP',{maximumFractionDigits:2})+'</td><td>'+Number(r.amount).toLocaleString('ja-JP')+'</td></tr>').join('')+'</tbody></table><section class="totals"><table><tbody><tr><th>小計（税別）</th><td>'+yen(rows.subtotal)+'</td></tr><tr><th>'+ (Number(d.tax_rate)===0?'非課税・対象外':d.tax_rate+'%対象（税別）')+'</th><td>'+yen(rows.subtotal)+'</td></tr><tr><th>消費税 '+d.tax_rate+'%</th><td>'+yen(rows.tax)+'</td></tr><tr class="total"><th>合計（税込）</th><td>'+yen(rows.total)+'</td></tr></tbody></table></section>'+(!estimate&&issuer.bank_details?'<section class="bottom"><b>お振込先</b><p>'+nl(issuer.bank_details)+'</p></section>':'')+(d.notes?'<section class="bottom"><b>備考</b><p>'+nl(d.notes)+'</p></section>':'')+(Number(d.tax_rate)===8?'<p class="footnote">明細はすべて軽減税率（8%）対象です。</p>':'')+(d.status==='void'?'<p class="void">取消理由：'+e(d.void_reason)+'</p>':'')+estimateDetails(d)+'</article></body></html>';
 }
 const printCSS='.quote-detail{break-before:page}.quote-detail-heading{display:flex;justify-content:space-between;align-items:center}.quote-detail-heading h2{font-size:17pt}.quote-breakdown th,.quote-breakdown td{border:1px solid #222;padding:2mm 1mm;font-size:8pt}.quote-breakdown th:first-child{width:27%}.quote-breakdown th:nth-child(2){width:12%}.quote-breakdown th:nth-child(3){width:7%}.quote-breakdown th:nth-child(4){width:15%}.quote-breakdown th:nth-child(5){width:17%}.quote-breakdown th:last-child{width:22%}.quote-breakdown td{text-align:right}.quote-breakdown td:first-child,.quote-breakdown td:last-child{text-align:left}.quote-breakdown thead{display:table-header-group}.quote-group-total{background:#edf2ef;font-weight:700}@page{size:A4;margin:16mm 14mm;@bottom-right{content:counter(page)" / "counter(pages);font-size:8pt;color:#66716b}}*{box-sizing:border-box}body{margin:0;color:#172022;background:#fff;font-family:"Noto Sans CJK JP","Hiragino Kaku Gothic ProN",Meiryo,sans-serif;font-size:9.5pt;line-height:1.5}.document{max-width:182mm;margin:auto}header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #263934;padding-bottom:5mm}.document-title{font-size:23pt;font-weight:700;letter-spacing:.25em}.number{text-align:right;font-size:9pt}.draft{color:#9c4920}.parties{display:flex;justify-content:space-between;gap:10mm;margin:6mm 0 4mm}.recipient{width:54%;overflow-wrap:anywhere}.recipient>b{font-size:14pt}.issuer{width:42%;overflow-wrap:anywhere}.parties p{margin:1mm 0;font-size:9pt}.subject{font-weight:bold;margin-bottom:0}.grand{display:flex;align-items:baseline;gap:6mm;border-top:1px solid #263934;border-bottom:2px solid #263934;padding:3mm 0;margin:4mm 0}.grand strong{font-size:23pt;margin-left:auto;white-space:nowrap}.grand small{font-size:9pt}.terms{margin:4mm 0;font-size:9pt}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:2mm 2mm;border-bottom:1px solid #d6dcda;overflow-wrap:anywhere}thead{display:table-header-group}thead th{background:#edf2ef;font-weight:700;text-align:right;border-top:1px solid #263934;border-bottom:1px solid #263934}tr{break-inside:avoid}th:first-child,td:first-child{text-align:left}.lines th:first-child{width:44%}.lines th:nth-child(2){width:10%}.lines th:nth-child(3){width:9%}.lines th:nth-child(4){width:17%}.lines th:last-child{width:20%}.lines td{vertical-align:top;text-align:right}.lines td:first-child{text-align:left}.lines small{display:block;font-size:8pt;color:#4d5853}.progress{margin:5mm 0;font-size:9pt}.progress th,.progress td{padding:1mm 2mm}.progress th{width:65%;font-weight:400}.progress td{text-align:right}.totals{display:flex;justify-content:flex-end;margin-top:3mm;break-inside:avoid}.totals table{width:62%}.totals th{font-weight:400;width:58%}.totals td{text-align:right}.total{font-weight:700;background:#edf2ef}.bottom{border-top:1px solid #d6dcda;padding-top:3mm;margin-top:4mm;break-inside:avoid;overflow-wrap:anywhere}.bottom p{margin:1mm 0;white-space:normal}.footnote{font-size:8pt}.void{border:2px solid #a33;padding:3mm;color:#a33}@media screen{body{padding:15px}.grand strong{font-size:clamp(18px,4vw,30px)}}';
 return {kinds,escape,yen,lineAmount,total,billed,progress,percentAmount,draft,printHTML};
});
