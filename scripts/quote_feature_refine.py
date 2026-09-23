from pathlib import Path
r=Path(__file__).resolve().parents[1]/'docs'
def patch(name,old,new):
 p=r/name;s=p.read_text();assert s.count(old)==1,(name,s.count(old),old[:90]);p.write_text(s.replace(old,new,1))
patch('estimate-auto-builder.js',"other:0,pending:0,directPending:0};", "other:0,pending:0,directPending:0,pendingKinds:{}};")
patch('estimate-auto-builder.js',"if(!a.complete){result.pending++;if(kind==='direct')result.directPending++;continue;}", "if(!a.complete){result.pending++;result.pendingKinds[kind]=true;if(kind==='direct')result.directPending++;continue;}")
patch('estimate-auto-builder.js',"if(found.length){const x=found[0];x.r.excluded=false;groups[x.i].quote_layout_version=1;return {groups,groupIndex:x.i,rowIndex:x.j};}","""if(found.length){
   const x=found[0];
   // Opening a pre-existing discount must preserve its amount, not turn a
   // positive adjustment into a hidden discount or change a unit-price basis.
   if(kind==='discount'&&x.r.discount_input!==true){
    const a=Quote.quoteLine(x.r).amount;
    if(a!==null&&a>0)throw Error('既存の「値引き」がプラス金額です。明細の金額を先に確認してください。');
    if(a===null&&(x.r.quote_price||x.r.quote_amount))throw Error('既存の値引きの数量・単位・金額を先に確認してください。');
    Object.assign(x.r,{charge_kind:'discount',discount_input:true,quantity:'1',unit:'式',quote_price:'',amount_mode:true,quote_amount:a===null?'':String(a)});
   }
   x.r.excluded=false;groups[x.i].quote_layout_version=1;return {groups,groupIndex:x.i,rowIndex:x.j};
  }""")
patch('estimate-auto-builder.js',"r.charge_kind='overhead';r.overhead_mode=mode;r.amount_mode=true;r.quote_price='';", "r.charge_kind='overhead';r.overhead_mode=mode;r.amount_mode=true;r.quantity='1';r.unit='式';r.quote_price='';")
patch('estimate-plan-admin.js',"data-quote-charge=\"overhead\">諸経費を自動計算", "data-quote-charge=\"overhead\">諸経費（自動／手入力）")
patch('estimate-plan-admin.js',"yen(sum.direct)","(sum.pendingKinds.direct?'未入力あり':yen(sum.direct))")
patch('estimate-plan-admin.js',"yen(sum.transport)","(sum.pendingKinds.transport?'未入力':yen(sum.transport))")
patch('estimate-plan-admin.js',"yen(sum.overhead)","(sum.pendingKinds.overhead?'未入力':yen(sum.overhead))")
patch('estimate-plan-admin.js',"yen(sum.discount)","(sum.pendingKinds.discount?'未入力':yen(sum.discount))")
patch('estimate-plan-admin.js',"<p class=\"note\">値引き・買取はマイナスで入力できます。</p>", "<p class=\"note\">'+(discount?'値引き額は正の金額で入力します。見積ではマイナスにして差し引きます。':'値引き・買取はマイナスで入力できます。')+'</p>")
patch('project-documents-engine.js',"  const adjustments=adjust.flatMap(x=>(x.g.quote_lines||[]).filter(r=>!r.excluded).map(dataRow));", """  const adjustmentLines=adjust.flatMap(x=>(x.g.quote_lines||[]).filter(r=>!r.excluded));
  if(layoutV1){
   const order=r=>({transport:0,welfare:1,overhead:2,discount:3})[r.charge_kind]??(/回送/.test(r.label)?0:/法定福利/.test(r.label)?1:/諸経費/.test(r.label)?2:/値引/.test(r.label)?3:1);
   adjustmentLines.sort((a,b)=>order(a)-order(b));
  }
  const adjustments=adjustmentLines.map(dataRow);""")
print('Quote-specific refinements applied.')
p=r/'estimate-auto-builder.js';s=p.read_text();start=s.index(' function percentRows(groups,raw){');end=s.index('\n // QUOTE-OPTIONS-V1',start)
s=s[:start]+r''' function percentRows(groups,raw){
  if(raw?.kind==='custom')return groups;
  const target=groups.find(g=>/諸経費|福利/.test(g.name));if(!target)return groups;
  const v1=groups.some(g=>g.quote_layout_version===1),summary=v1?quoteSummary(groups):null;
  let base=v1?summary.direct:0;
  if(!v1)for(const g of groups)for(const r of g.quote_lines||[]){if(r.excluded||r.auto_percent)continue;const q=num(r.quantity),p=Number(r.quote_price);if(q&&Number.isFinite(p))base+=Math.floor(q*p);}
  // Keep generated rows at their current indices. Removing then appending them
  // would let the next DOM gather write the welfare fields into the overhead row.
  for(const [label,key] of [['法定福利費','welfare_rate'],['諸経費','overhead_rate']]){
   const explicit=key==='overhead_rate'&&groups.some(g=>(g.quote_lines||[]).some(r=>r.charge_kind==='overhead'));
   const previous=(target.quote_lines||[]).filter(r=>r.auto_percent===key);
   if(previous.length>1)throw Error('自動計算の費目が重複しています。明細を確認してください。');
   if(explicit){if(previous.some(r=>!r.excluded))throw Error('諸経費が複数あります。明細を確認してください。');continue;}
   const rate=Number(raw?.[key]);
   if(!Number.isFinite(rate)||rate<=0){if(previous[0])previous[0].excluded=true;continue;}
   let r=previous[0];
   if(!r){r=line(label,1,'式','', '',{amount_mode:true,quote_amount:'',auto_percent:key});target.quote_lines.push(r);}
   r.quote_amount=v1&&summary.directPending?'':String(Math.floor(base*rate/100));r.spec='直接工事費 '+rate+'%';
   if(v1&&key==='overhead_rate')Object.assign(r,{charge_kind:'overhead',auto_percent:'quote_overhead_v1',overhead_mode:'rate',overhead_rate:String(raw[key])});
  }
  if(v1)updateQuoteCharges(groups);
  return groups;
 }
''' +s[end:];p.write_text(s)
