/* Planned construction costs. Kept separate from actual costs and billing. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ToyaEstimatePlan=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const categories={labor:'人工',equipment:'重機',vehicle:'車両',attachment:'アタッチメント',tool:'小型機械・工具',fuel:'燃料',waste:'処分費',transport:'回送費',material:'材料',subcontract:'外注',other:'その他'};
 const MAX=999999999999n;
 const blank=x=>x===null||x===undefined||String(x).trim()==='';
 const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const yen=x=>x===null?'未入力':Number(x).toLocaleString('ja-JP')+'円';
 function number(raw,places,max,label,positive=false){
  if(blank(raw))return null;
  const s=String(raw).trim();
  if(!new RegExp('^[0-9]+(?:\\.[0-9]{1,'+places+'})?$').test(s))throw new Error(label+'は小数'+places+'桁までの数字で入力してください。');
  const parts=s.split('.'),scale=10n**BigInt(places),n=BigInt(parts[0])*scale+BigInt((parts[1]||'').padEnd(places,'0'));
  if(n>BigInt(max)*scale||(positive&&n===0n))throw new Error(label+'の範囲を確認してください。');
  return n;
 }
 function bounded(n){if(n>MAX)throw new Error('積算金額が大きすぎます。');return n;}
 function line(row){
  if(!row||typeof row!=='object'||Array.isArray(row)||!Object.hasOwn(categories,row.category))throw new Error('費目を選んでください。');
  if(String(row.label||'').length>200||String(row.unit||'').length>20||['source_table','source_id','source_updated_at'].some(k=>String(row[k]||'').length>100))throw new Error('品名・単位を確認してください。');
  const q=number(row.quantity,3,1000000,'数量',true),m=number(row.multiplier,3,1000000,'日数・回数',true),p=number(row.unit_price,2,999999999999,'単価');
  const complete=!blank(row.label)&&!blank(row.unit)&&q!==null&&m!==null&&p!==null;
  return {complete,amount:complete?Number(bounded(q*m*p/100000000n)):null};
 }
 function calculate(plan){
  const groups=plan.groups;
  if(!Array.isArray(groups)||groups.length>100)throw new Error('工事項目は100件までです。');
  let count=0,pending=groups.length?0:1,direct=0n;
  const rows=groups.map(g=>{
   if(!g||typeof g!=='object'||Array.isArray(g)||String(g.name||'').length>200||!Array.isArray(g.lines))throw new Error('工事項目を確認してください。');
   count+=g.lines.length;if(count>300)throw new Error('内訳は合計300行までです。');
   let missing=blank(g.name)?1:0,cost=0n;if(!g.lines.length)missing++;
   for(const r of g.lines){const a=line(r);if(a.complete)cost+=BigInt(a.amount);else missing++;}
   pending+=missing;direct+=cost;
   return {name:String(g.name||''),cost:Number(cost),missing,overhead:null,price:null};
  });
  bounded(direct);
  const oh=number(plan.overhead_percent,2,1000,'諸経費率'),mark=number(plan.markup_percent,2,1000,'利益上乗せ率'),override=number(plan.quote_amount_override,2,999999999999,'見積額');
  if(override!==null&&override%100n!==0n)throw new Error('見積額は1円単位で入力してください。');
  if(oh===null)pending++;if(mark===null)pending++;
  if(![0,8,10].includes(Number(plan.tax_rate)))throw new Error('税率を確認してください。');
  const result={complete:pending===0,pending,known_cost:Number(direct),overhead:null,total_cost:null,markup:null,price:null,profit:null,tax:null,total:null,groups:rows,quote_items:[]};
  if(pending)return result;
  const overhead=bounded(direct*oh/10000n),cost=bounded(direct+overhead),markup=bounded(cost*mark/10000n),price=bounded(override===null?cost+markup:override/100n),tax=price*BigInt(plan.tax_rate)/100n;
  let cumulative=0n,previousOH=0n,previousPrice=0n;
  const denominator=direct||BigInt(rows.length);
  for(const r of rows){
   cumulative+=direct?BigInt(r.cost):1n;
   const ohTotal=overhead*cumulative/denominator,priceTotal=price*cumulative/denominator;
   r.overhead=Number(ohTotal-previousOH);r.price=Number(priceTotal-previousPrice);previousOH=ohTotal;previousPrice=priceTotal;
   result.quote_items.push({name:r.name,spec:'',quantity:'1',unit:'式',unitPrice:String(r.price),costPrice:String(r.cost+r.overhead)});
  }
  return Object.assign(result,{overhead:Number(overhead),total_cost:Number(cost),markup:Number(markup),price:Number(price),profit:Number(price-cost),tax:Number(tax),total:Number(price+tax)});
 }
 function blankLine(){return {category:'labor',label:'',quantity:'1',multiplier:'1',unit:'人日',unit_price:''};}
 function draft(site){return {site_id:site.id,title:site.name+' 積算',customer_name:'',customer_address:'',internal_notes:'',quote_notes:'',overhead_percent:null,markup_percent:null,quote_amount_override:null,tax_rate:10,groups:[{name:'',lines:[blankLine()]}],source_plan_id:null};}
 function duplicate(plan,site){const p=JSON.parse(JSON.stringify(plan));return {...draft(site),...p,id:undefined,company_id:undefined,created_at:undefined,updated_at:undefined,calculation:undefined,source_plan_id:plan.id||null,site_id:site.id,title:site.name+' 積算（複製）'};}
 function printHTML(plan,siteName){
  const t=calculate(plan),e=escape;
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>積算表 '+e(plan.title)+'</title><style>@page{size:A4 landscape;margin:14mm;@bottom-right{content:counter(page);font-size:9pt}}*{box-sizing:border-box}body{font-family:"Noto Sans CJK JP",Meiryo,sans-serif;font-size:9pt;line-height:1.3;color:#19211c}h1{font-size:21pt;margin:0}header{border-bottom:3px solid #283f30;padding-bottom:4mm}header p{margin:2mm 0}h2{font-size:12pt;margin:4mm 0 2mm;break-after:avoid}table{border-collapse:collapse;width:100%;table-layout:fixed}thead{display:table-header-group}th,td{border-bottom:1px solid #ccc;padding:1.5mm;text-align:right;overflow-wrap:anywhere}th{background:#edf2ef}th:first-child,td:first-child{text-align:left;width:13%}th:nth-child(2),td:nth-child(2){text-align:left;width:30%}tr{break-inside:avoid}footer{margin-top:5mm;border-top:2px solid #283f30;padding-top:4mm;break-inside:avoid}.summary{font-size:11pt;line-height:1.5}.note{white-space:pre-wrap;overflow-wrap:anywhere}.pending{color:#925419;font-weight:bold}</style></head><body><header><h1>積算表 <small>社内用</small></h1><p>'+e(plan.title)+'</p><p>現場：'+e(siteName)+' ／ 宛先：'+e(plan.customer_name)+'</p><p>税別の予定原価・見積額'+(t.complete?'':' ／ 積算途中')+'</p></header>'+plan.groups.map((g,i)=>'<section><h2>'+e(g.name||'工事項目未入力')+'　小計 '+yen(t.groups[i].cost)+(t.groups[i].missing?'（未入力あり）':'')+'</h2><table><thead><tr><th>費目</th><th>品名・内容</th><th>数量</th><th>日数・時間・回数</th><th>単位</th><th>単価</th><th>金額</th></tr></thead><tbody>'+g.lines.map(r=>'<tr><td>'+e(categories[r.category])+'</td><td>'+e(r.label)+'</td><td>'+e(r.quantity)+'</td><td>'+e(r.multiplier)+'</td><td>'+e(r.unit)+'</td><td>'+(blank(r.unit_price)?'未入力':Number(r.unit_price).toLocaleString('ja-JP',{maximumFractionDigits:2}))+'</td><td>'+yen(line(r).amount)+'</td></tr>').join('')+'</tbody></table></section>').join('')+'<footer><div class="summary">直接工事費 '+yen(t.known_cost)+' ／ 諸経費 '+yen(t.overhead)+' ／ 原価合計 '+yen(t.total_cost)+'<br>見積額（税別） '+yen(t.price)+' ／ 見込利益 '+yen(t.profit)+'<br>消費税 '+yen(t.tax)+' ／ 見積額（税込） '+yen(t.total)+'</div>'+(!t.complete?'<p class="pending">未入力 '+t.pending+'か所。入力済みの原価のみ集計しています。</p>':'')+'<p>諸経費率 '+e(plan.overhead_percent??'未入力')+'% ／ 利益上乗せ率 '+e(plan.markup_percent??'未入力')+'% ／ 見積額の調整 '+(blank(plan.quote_amount_override)?'なし':yen(plan.quote_amount_override))+'</p><p class="note">'+e(plan.internal_notes)+'</p></footer></body></html>';
 }
 return {categories,line,calculate,blankLine,draft,duplicate,printHTML};
});
