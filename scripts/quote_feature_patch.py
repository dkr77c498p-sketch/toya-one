from pathlib import Path
root=Path(__file__).resolve().parents[1]
def replace_one(s, old, new):
    if s.count(old)!=1: raise RuntimeError(f'Expected one patch target, got {s.count(old)}: {old[:130]}')
    return s.replace(old,new,1)
def load(n): return (root/'docs'/n).read_text()
def save(n,s): (root/'docs'/n).write_text(s)
# Keep monetary calculation compatible with the current server. Adjustments are
# ordinary quote lines, so no database migration or auth/daily-report edits.
s=load('estimate-plan-engine.js')
s=replace_one(s,"if(r.excluded!==undefined", "if(r.item_no!=null&&(typeof r.item_no!=='string'||r.item_no.length>12))throw new Error('項目No.は12文字以内で入力してください。');\n  if(r.excluded!==undefined")
s=replace_one(s,"count+=g.quote_lines.length;costCount", "if(g.item_no!=null&&(typeof g.item_no!=='string'||g.item_no.length>12))throw new Error('工事項目No.は12文字以内で入力してください。');\n   count+=g.quote_lines.length;costCount")
s=replace_one(s,"return {label:'',spec:'',quantity:'1',unit:'式',quote_price:'',quote_amount:null,excluded:false};", "return {item_no:'',label:'',spec:'',quantity:'1',unit:'式',quote_price:'',quote_amount:null,excluded:false};")
s=replace_one(s,".map(name=>({name,quote_lines:[],lines:[]}))", ".map((name,i)=>({name,item_no:i<4?String.fromCharCode(65+i):'',quote_layout_version:1,quote_lines:[],lines:[]}))")
# Internal quote sheets also retain the editable item number.
s=replace_one(s,"<tr><th>品名</th><th>数量</th>","<tr><th>項目No.</th><th>品名</th><th>数量</th>")
s=replace_one(s,"'<tr><td>'+e(r.label)+'</td><td>'+e(r.quantity)","'<tr><td>'+e(r.item_no||'')+'</td><td>'+e(r.label)+'</td><td>'+e(r.quantity)")
save('estimate-plan-engine.js',s)

s=load('estimate-auto-builder.js')
s=replace_one(s,"factory(require('./estimate-concrete-engine.js'))","factory(require('./estimate-concrete-engine.js'),require('./estimate-plan-engine.js'))")
s=replace_one(s,"factory(root.ToyaConcreteEstimate);","factory(root.ToyaConcreteEstimate,root.ToyaEstimatePlan);")
s=replace_one(s,"function(Concrete){","function(Concrete,Quote){")
s=replace_one(s,"({name,quote_lines:quote_lines.filter", "({name,quote_layout_version:1,quote_lines:quote_lines.filter")
# Do not assume a default overhead rate for new quotes; older saved inputs retain theirs.
s=replace_one(s,"overhead_rate:'2'","overhead_rate:''")
# A new slate-removal row no longer silently combines removal with disposal.
s=replace_one(s,"line('アスベスト含有スレート撤去・処分',a.slate_m2,'㎡','')","line('アスベスト含有スレート撤去',a.slate_m2,'㎡','', '運搬費・処分費は別行で入力')")
# Existing percentage rows are preserved unless they are the legacy auto rows.
s=replace_one(s,".filter(r=>!r.auto_percent);", ".filter(r=>!['overhead_rate','welfare_rate'].includes(r.auto_percent));")
s=replace_one(s,"const rate=Number(raw?.[key]);if(Number.isFinite(rate)&&rate>0)","const rate=Number(raw?.[key]);if(key==='overhead_rate'&&groups.some(g=>(g.quote_lines||[]).some(r=>r.charge_kind==='overhead')))continue;if(Number.isFinite(rate)&&rate>0)")
helpers=r'''
 // QUOTE-OPTIONS-V1: pure quote helpers. Never writes or reads application data.
 const copyQuote=x=>JSON.parse(JSON.stringify(x));
 const keyQuote=s=>String(s??'').normalize('NFKC').replace(/[\s　]/g,'');
 const chargeKind=r=>r.charge_kind||({ '重機回送費':'transport','回送費':'transport','諸経費':'overhead','値引き':'discount','値引':'discount','法定福利費':'welfare' }[keyQuote(r.label)]||'');
 function quoteSummary(groups){
  const result={direct:0,transport:0,overhead:0,discount:0,welfare:0,other:0,pending:0,directPending:0};
  for(const g of groups)for(const r of g.quote_lines||[]){
   if(r.excluded)continue;
   const a=Quote.quoteLine(r),kind=chargeKind(r)||(/諸経費|福利|値引/.test(g.name)?'other':'direct');
   if(!a.complete){result.pending++;if(kind==='direct')result.directPending++;continue;}
   result[kind]=(result[kind]||0)+a.amount;
   if(!Number.isSafeInteger(result[kind])||Math.abs(result[kind])>999999999999)throw Error('見積金額が大きすぎます。');
  }
  return result;
 }
 function rateBasisPoints(value){
  const text=String(value??'').trim();if(!text)return null;
  if(!/^\d+(?:\.\d{1,2})?$/.test(text))throw Error('諸経費率は0以上・小数2桁までで入力してください。');
  const [a,b='']=text.split('.'),n=BigInt(a)*100n+BigInt(b.padEnd(2,'0'));
  if(n>100000n)throw Error('諸経費率は1000%以下で入力してください。');return n;
 }
 function updateQuoteCharges(groups){
  const autos=groups.flatMap(g=>(g.quote_lines||[])).filter(r=>!r.excluded&&r.auto_percent==='quote_overhead_v1');
  if(!autos.length)return groups;
  // Invalidate the last computed amount first, so an invalid rate cannot be saved
  // with the stale, apparently valid amount left from the previous input.
  for(const r of autos){r.quote_amount='';r.quote_price='';r.amount_mode=true;}
  if(autos.length!==1||groups.flatMap(g=>g.quote_lines||[]).filter(r=>!r.excluded&&chargeKind(r)==='overhead').length!==1)
   throw Error('諸経費が複数あります。自動計算と手入力を重複させないでください。');
  const r=autos[0],rate=rateBasisPoints(r.overhead_rate),summary=quoteSummary(groups);
  if(rate===null||summary.directPending){r.spec='諸経費率または直接工事費の入力待ち';return groups;}
  if(summary.direct<0)throw Error('諸経費の計算対象がマイナスです。直接工事費を確認してください。');
  const value=BigInt(summary.direct)*rate/10000n;
  if(value>999999999999n)throw Error('諸経費が大きすぎます。');
  r.quote_amount=String(value);r.spec='直接工事費 '+summary.direct.toLocaleString('ja-JP')+'円 × '+String(r.overhead_rate)+'%（1円未満切捨て）';
  return groups;
 }
 function ensureQuoteCharge(input,kind){
  if(!['transport','overhead','discount'].includes(kind))throw Error('追加する項目を確認してください。');
  const groups=copyQuote(input),found=[];
  groups.forEach((g,i)=>(g.quote_lines||[]).forEach((r,j)=>{if(chargeKind(r)===kind)found.push({i,j,r});}));
  if(found.length>1)throw Error('同じ費目が複数あります。既存の明細を確認してください。');
  if(found.length){const x=found[0];x.r.excluded=false;groups[x.i].quote_layout_version=1;return {groups,groupIndex:x.i,rowIndex:x.j};}
  if(groups.reduce((n,g)=>n+(g.quote_lines||[]).length,0)>=300)throw Error('明細は300行までです。');
  let i=groups.findIndex(g=>/諸経費|値引/.test(g.name));
  if(i<0){if(groups.length>=100)throw Error('工事項目は100件までです。');i=groups.length;groups.push({name:'回送費・諸経費・値引き',item_no:'',quote_layout_version:1,quote_lines:[],lines:[]});}
  const r={...Quote.blankQuoteLine(),charge_kind:kind,label:({transport:'重機回送費',overhead:'諸経費',discount:'値引き'})[kind],amount_mode:true,quote_amount:''};
  if(kind==='overhead')Object.assign(r,{auto_percent:'quote_overhead_v1',overhead_rate:'',overhead_mode:'rate'});
  if(kind==='discount')r.discount_input=true;
  groups[i].quote_layout_version=1;groups[i].quote_lines.push(r);
  return {groups,groupIndex:i,rowIndex:groups[i].quote_lines.length-1};
 }
 function setQuoteOverheadMode(input,i,j,mode){
  if(!['rate','amount'].includes(mode))throw Error('諸経費の入力方法を確認してください。');
  const groups=copyQuote(input),r=groups[i]?.quote_lines?.[j];if(!r||chargeKind(r)!=='overhead')throw Error('諸経費の明細を確認してください。');
  const current=Quote.quoteLine(r).amount;
  r.charge_kind='overhead';r.overhead_mode=mode;r.amount_mode=true;r.quote_price='';
  if(mode==='rate'){
   const old=groups.find(g=>g.auto_input)?.auto_input?.overhead_rate;
   r.overhead_rate=r.overhead_rate??(r.auto_percent==='overhead_rate'?old:'');r.auto_percent='quote_overhead_v1';r.quote_amount='';
  }else{delete r.auto_percent;r.quote_amount=current==null?'':String(current);}
  groups[i].quote_layout_version=1;return updateQuoteCharges(groups);
 }
 function addSeparateWaste(input,i,j){
  const groups=copyQuote(input),source=groups[i]?.quote_lines?.[j];
  if(!source||source.excluded||!String(source.label||'').trim())throw Error('撤去する品名を先に入力してください。');
  if(/運搬|処分|買取/.test(source.label)||chargeKind(source))throw Error('撤去の明細から追加してください。運搬・処分込みの明細は先に名称と単価を分けてください。');
  if(source.separate_waste_v1&&groups.some(g=>(g.quote_lines||[]).some(r=>r.waste_source_v1===source.separate_waste_v1)))throw Error('この明細の運搬費・処分費は追加済みです。');
  if(groups.reduce((n,g)=>n+(g.quote_lines||[]).length,0)>298)throw Error('明細は300行までです。');
  let target=groups.findIndex(g=>/産業廃棄物/.test(g.name));
  if(target<0){if(groups.length>=100)throw Error('工事項目は100件までです。');target=groups.length;groups.push({name:'産業廃棄物処理工事',item_no:'C',quote_layout_version:1,quote_lines:[],lines:[]});}
  // Units are not converted implicitly (e.g. slate m² must not become waste m³).
  const unit=String(source.unit||'').normalize('NFKC'),same=/^(m3|t|kg)$/.test(unit),quantity=same?source.quantity:'',u=same?source.unit:'m³';
  const links=new Set(groups.flatMap(g=>g.quote_lines||[]).flatMap(r=>[r.separate_waste_v1,r.waste_source_v1]).filter(Boolean));
  let serial=1;while(links.has('quote-waste-'+serial))serial++;
  const link='quote-waste-'+serial;source.separate_waste_v1=link;groups[i].quote_layout_version=1;
  for(const label of ['産業廃棄物運搬費','産業廃棄物処分費'])groups[target].quote_lines.push({...Quote.blankQuoteLine(),label,quantity,unit:u,spec:source.label,quote_price:'',waste_source_v1:link});
  groups[target].quote_layout_version=1;
  return {groups,groupIndex:target,rowIndex:groups[target].quote_lines.length-2};
 }
'''
s=replace_one(s," return {TSUBO,structureRates,Concrete,defaults,normalize,build,percentRows,round};",helpers+"\n return {TSUBO,structureRates,Concrete,defaults,normalize,build,percentRows,round,chargeKind,quoteSummary,rateBasisPoints,updateQuoteCharges,ensureQuoteCharge,setQuoteOverheadMode,addSeparateWaste};")
save('estimate-auto-builder.js',s)

# UI patches are quote-editor scoped. No home/auth/navigation changes.
s=load('estimate-plan-admin.js')
s=replace_one(s,"<div id=\"epTotals\" aria-live=\"polite\"></div><button id=\"epCreateQuote\"", "<div class=\"ep-charge-shortcuts\"><h3>重機回送費・諸経費・値引き</h3><div class=\"pb-actions\"><button type=\"button\" class=\"btn light\" data-quote-charge=\"transport\">重機回送費</button><button type=\"button\" class=\"btn light\" data-quote-charge=\"overhead\">諸経費を自動計算</button><button type=\"button\" class=\"btn light\" data-quote-charge=\"discount\">値引きを入力</button></div><p class=\"note\">同じ項目がある場合は、その明細を開きます。諸経費率は見積ごとに指定できます。</p></div><div id=\"epTotals\" aria-live=\"polite\"></div><button id=\"epCreateQuote\"")
s=replace_one(s,"  bindAutoBuilder();",r'''  bindAutoBuilder();
  host.querySelectorAll('[data-quote-charge]').forEach(b=>b.onclick=()=>{
   try{gather();const next=A.ensureQuoteCharge(plan.groups,b.dataset.quoteCharge);plan.groups=next.groups;dirty=true;renderSimpleGroups(next.groupIndex);updateTotals();
    const r=plan.groups[next.groupIndex].quote_lines[next.rowIndex];focusInput('#'+(r.auto_percent==='quote_overhead_v1'?'epOverheadRate':'epQuotePrice')+next.groupIndex+'_'+next.rowIndex);
   }catch(e){note(e.message,true);}
  });''')
s=replace_one(s,"['アスベスト含有スレート撤去・処分','㎡']","['アスベスト含有スレート撤去','㎡']")
s=replace_one(s,"['木くず処分','m³'],['コンクリート処分','m³'],['混合廃棄物処分','m³'],['産業廃棄物運搬費','m³']", "['産業廃棄物運搬費','m³'],['産業廃棄物処分費','m³'],['木くず処分費','m³'],['コンクリート処分費','m³'],['混合廃棄物処分費','m³']")
# Visible item number on every detail row.
s=replace_one(s,"'<div class=\"ep-quote-row\" data-quote-row=\"'+j+'\"><div class=\"ep-quote-head\">'+field('品名'", "'<div class=\"ep-quote-row\" data-quote-row=\"'+j+'\">'+field('項目No.','epNo'+i+'_'+j,r.item_no||'','text','data-quote-key=\"item_no\" inputmode=\"numeric\" maxlength=\"12\" placeholder=\"例：1・2・3\"')+quoteOverheadControls(r,i,j)+'<div class=\"ep-quote-head\">'+field('品名'")
s=replace_one(s,"<button type=\"button\" class=\"btn danger ep-small\" data-delete-quote=\"'+i+','+j+'\">この行を削除</button></details></div>'", "<button type=\"button\" class=\"btn danger ep-small\" data-delete-quote=\"'+i+','+j+'\">この行を削除</button></details>'+(!A.chargeKind(r)&&!/運搬|処分|買取/.test(r.label)?'<button type=\"button\" class=\"btn light pb-wide\" data-separate-waste=\"'+i+','+j+'\">運搬費・処分費を別行で追加</button>':'')+'</div>'")
controls=r'''
 function quoteOverheadControls(r,i,j){
  if(A.chargeKind(r)!=='overhead')return '';
  const auto=r.auto_percent==='quote_overhead_v1';
  return '<label for="epOverheadMode'+i+'_'+j+'">諸経費の計算方法</label><select id="epOverheadMode'+i+'_'+j+'" data-overhead-mode="'+i+','+j+'"><option value="amount" '+(!auto?'selected':'')+'>金額を直接入力</option><option value="rate" '+(auto?'selected':'')+'>直接工事費 × 率で自動計算</option></select>'+(auto?field('諸経費率（%）','epOverheadRate'+i+'_'+j,r.overhead_rate??'','number','data-quote-key="overhead_rate" min="0" max="1000" step="0.01" inputmode="decimal"')+'<p class="note">回送費・諸経費・法定福利費・値引きは計算対象に含めません。1円未満は切り捨てます。金属買取など直接工事費の控除は反映します。</p>':'');
 }
'''
s=replace_one(s," function simpleCostRow(",controls+"\n function simpleCostRow(")
s=replace_one(s,"<div class=\"ep-group-name\">'+field('工事項目名（内訳書の見出し）'", "<div class=\"ep-group-name\">'+field('工事項目No.','epGroupNo'+i,g.item_no??((String(g.name).match(/^[A-ZＡ-Ｚ]/)||[''])[0]),'text','data-group-number=\"'+i+'\" maxlength=\"12\" placeholder=\"例：A・1\"')+field('工事項目名（内訳書の見出し）'")
s=replace_one(s,"return {...g,name:q('[data-group-name]',el).value,quote_lines:","return {...g,item_no:q('[data-group-number]',el).value,name:q('[data-group-name]',el).value,quote_lines:")
# Hook helpers in rendered rows. Disabled computed fields cannot override rates.
needle="  host.querySelectorAll('[data-add-quote]').forEach"
new=r'''  host.querySelectorAll('[data-overhead-mode]').forEach(sel=>{
   sel.oninput=e=>e.stopPropagation();sel.onchange=e=>{e.stopPropagation();try{gather();const [i,j]=sel.dataset.overheadMode.split(',').map(Number);plan.groups=A.setQuoteOverheadMode(plan.groups,i,j,sel.value);dirty=true;renderSimpleGroups(i);updateTotals();}catch(error){note(error.message,true);}};
  });
  host.querySelectorAll('[data-separate-waste]').forEach(b=>b.onclick=()=>{
   if(!confirm('撤去の明細を残し、運搬費と処分費を別行で追加します。\n既存の撤去単価が運搬・処分込みなら、撤去のみの単価へ調整してください。追加する2行の単価は空欄です。'))return;
   try{gather();const [i,j]=b.dataset.separateWaste.split(',').map(Number),next=A.addSeparateWaste(plan.groups,i,j);plan.groups=next.groups;dirty=true;renderSimpleGroups(next.groupIndex);updateTotals();focusInput('#epQty'+next.groupIndex+'_'+next.rowIndex);}catch(error){note(error.message,true);}
  });
  plan.groups.forEach((g,i)=>g.quote_lines.forEach((r,j)=>{if(r.auto_percent!=='quote_overhead_v1'||r.excluded)return;const input=q('#epQuotePrice'+i+'_'+j);if(input)input.readOnly=true;const fixed=q('[data-quote-fixed="'+i+','+j+'"]');if(fixed)fixed.disabled=true;}));
'''+needle
s=replace_one(s,needle,new)
# Recalculate using stored rate before saving, but do not change old unmarked quotes.
s=replace_one(s,"plan.tax_rate=Number(q('#epTax').value);plan.groups=gatherSimpleGroups();", "plan.tax_rate=Number(q('#epTax').value);plan.groups=gatherSimpleGroups();A.updateQuoteCharges(plan.groups);")
s=replace_one(s,"}}const t=C.calculate(plan);complete=t.complete;", "}A.updateQuoteCharges(plan.groups);plan.groups.forEach((g,i)=>g.quote_lines.forEach((r,j)=>{if(r.auto_percent==='quote_overhead_v1'){const input=q('#epQuotePrice'+i+'_'+j);if(input)input.value=r.quote_amount;const spec=q('#epSpec'+i+'_'+j);if(spec)spec.value=r.spec;}}));}const t=C.calculate(plan);complete=t.complete;")
# Explicit totals follow the supplied TOYA form; no second addition of charges.
s=replace_one(s," function updateSimpleTotals(t){\n  q('#epTotals').innerHTML=", " function updateSimpleTotals(t){\n  const sum=A.quoteSummary(plan.groups),extra='<div class=\"pb-metrics\"><div><small>直接工事費</small><b>'+yen(sum.direct)+'</b></div><div><small>重機回送費</small><b>'+yen(sum.transport)+'</b></div><div><small>諸経費</small><b>'+yen(sum.overhead)+'</b></div><div><small>値引き（税別）</small><b>'+yen(sum.discount)+'</b></div></div>';\n  q('#epTotals').innerHTML=extra+")
save('estimate-plan-admin.js',s)

# The customer-facing form: use numbers without modifying archived monetary values.
s=load('project-documents-engine.js')
s=replace_one(s,"letter:(String(g.name).match(/^[A-ZＡ-Ｚ]/)||[''])[0]", "letter:g.item_no??(String(g.name).match(/^[A-ZＡ-Ｚ]/)||[''])[0]")
s=replace_one(s,"const dataRow=r=>{const label=shownLabel(r),spec=shownSpec(r),lines=Math.max(wrapped(label,10.5),wrapped(spec,10.5));return row(['',e(label)","const dataRow=r=>{const label=shownLabel(r),spec=shownSpec(r),lines=Math.max(wrapped(label,10.5),wrapped(spec,10.5),wrapped(r.item_no||'',4));return row([e(r.item_no||''),e(label)")
s=replace_one(s,"const t=p.calculation||{},groups=p.groups||[],calc=t.groups||[],amount=r=>r.amount_mode?Number(r.quote_amount||0):lineAmount(r.quantity,r.quote_price);", "const t=p.calculation||{},groups=p.groups||[],calc=t.groups||[],amount=r=>r.quote_amount!==null&&r.quote_amount!==undefined&&String(r.quote_amount).trim()!==''?Number(r.quote_amount):lineAmount(r.quantity,r.quote_price);")
# For v1 quotes partition adjustment rows, rather than counting a mixed group twice.
old="  const directGroups=active.filter(x=>!/(諸経費|福利|値引)/.test(x.g.name)),adjust=active.filter(x=>/(諸経費|福利|値引)/.test(x.g.name)),direct=directGroups.reduce((s,x)=>s+x.total,0);"
new=r'''  const layoutV1=groups.some(g=>g.quote_layout_version===1);
  const isAdjustment=(g,r)=>!!r.charge_kind||/^(?:重機回送費|回送費|諸経費|値引き?|法定福利費)$/.test(String(r.label||'').normalize('NFKC').replace(/[\s　]/g,''))||/(諸経費|福利|値引)/.test(g.name);
  const directGroups=layoutV1?active.map(x=>{const rs=(x.g.quote_lines||[]).filter(r=>!r.excluded&&!isAdjustment(x.g,r));return {...x,g:{...x.g,quote_lines:rs},total:rs.reduce((n,r)=>n+amount(r),0)};}).filter(x=>x.g.quote_lines.length):active.filter(x=>!/(諸経費|福利|値引)/.test(x.g.name));
  const adjust=layoutV1?active.map(x=>({...x,g:{...x.g,quote_lines:(x.g.quote_lines||[]).filter(r=>!r.excluded&&isAdjustment(x.g,r))}})).filter(x=>x.g.quote_lines.length):active.filter(x=>/(諸経費|福利|値引)/.test(x.g.name));
  const direct=directGroups.reduce((s,x)=>s+x.total,0);'''
# Only the exact V2 target exists with this indentation/text.
s=replace_one(s,old,new)
save('project-documents-engine.js',s)
print('Applied quote-only changes; no login, daily-report, database or entrypoint files edited.')
