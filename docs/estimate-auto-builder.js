(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./estimate-concrete-engine.js'),require('./estimate-plan-engine.js'));else root.ToyaEstimateAuto=factory(root.ToyaConcreteEstimate,root.ToyaEstimatePlan);})(typeof window==='object'?window:globalThis,function(Concrete,Quote){
 'use strict';
 const TSUBO=3.305785;
 const round=(n,d=2)=>String(Math.round((Number(n)||0)*10**d)/10**d);
 const num=x=>{const n=Number(x);return Number.isFinite(n)&&n>0?n:0;};
 const line=(label,quantity,unit,price,spec='',extra={})=>({label,spec,quantity:round(quantity,3),unit,quote_price:price===null||price===undefined?'':String(price),quote_amount:null,excluded:false,...extra});
 const group=(name,quote_lines,auto)=>({name,quote_layout_version:1,quote_lines:quote_lines.filter(r=>r.quantity_pending||num(r.quantity)>0),lines:[],...(auto?{auto_input:auto}:{})});
 const structureRates={
  // Waste factors are the company's 300 m2 standard sheet divided by 300.
  wood:{label:'木造',inside:1650,upper:2270,foundation:10800,slab:4500,waste:{haul:129.7/300,concrete:60/300,wood:52.3/300,glass:23.1/300,plastic:3.2/300,paper:5.4/300,board:10.4/300,rubble:25.3/300,metal:2.4/300,mixed:10/300},wasteRates:{haul:2190,concreteHaul:2200,wood:12000,glass:8500,plastic:8500,paper:10000,board:22000,concrete:4000,rubble:9500,metal:-37000,mixed:18500}},
  lightSteel:{label:'軽量鉄骨造',inside:2150,upper:3900,foundation:11000,slab:7000,waste:{haul:124.3/300,concrete:75/300,wood:48.7/300,glass:16.5/300,plastic:7.9/300,paper:7.5/300,board:14.4/300,rubble:19.5/300,metal:9/300,mixed:10/300},wasteRates:{haul:7000,concreteHaul:2200,wood:15000,glass:9500,plastic:9500,paper:10000,board:25000,concrete:4000,rubble:9500,metal:-37000,mixed:18500}},
  steel:{label:'鉄骨造',inside:2150,upper:3900,foundation:11000,slab:7000,waste:{haul:119.5/300,concrete:165/300,wood:48.7/300,glass:16.5/300,plastic:7.9/300,paper:7.5/300,board:14.4/300,rubble:19.5/300,metal:21/300,mixed:5/300},wasteRates:{haul:7000,concreteHaul:2200,wood:15000,glass:9500,plastic:9500,paper:10000,board:25000,concrete:4000,rubble:9500,metal:-37000,mixed:18500}},
  rc:{label:'RC造',inside:2150,upper:3900,foundation:10800,slab:4500,waste:{haul:88.3/300,concrete:120/300,wood:11.2/300,glass:17.1/300,plastic:8.6/300,paper:7.5/300,board:14.4/300,rubble:19.5/300,metal:14.4/300,mixed:10/300},wasteRates:{haul:7000,concreteHaul:2200,wood:15000,glass:9500,plastic:9500,paper:10000,board:25000,concrete:4000,rubble:9500,metal:-37000,mixed:18500}}
 };
 function defaults(){return {kind:'wood',custom_name:'',use:'residential',area_basis:'gross',area_m2:'',area_tsubo:'',floors:'1',upper_method:'ground',elevated_m2:'',elevated_price:'',concrete_scope:'whole',concrete_mode:'reference',concrete_quantity:'',concrete_unit:'t',concrete_price_basis:'t',concrete_haul_price:'',concrete_disposal_price:'',scaffold_m2:'',sound_m2:'',mesh_m2:'',foundation_m3:'',slab_m3:'',asbestos_samples:'',slate_m2:'',exterior_m2:'',garden_m3:'',plants_m3:'',cb_m2:'',residual_m3:'',grading_m2:'',sandbag_m:'',internal_m2:'',internal_wall_m2:'',overhead_rate:'5',welfare_rate:null};}
 function normalize(raw={}){const d={...defaults(),...raw};if(num(d.area_m2))d.area_tsubo=round(num(d.area_m2)/TSUBO,2);else if(String(d.area_m2??'').trim()===''&&num(d.area_tsubo))d.area_m2=round(num(d.area_tsubo)*TSUBO,2);return d;}
 function build(raw){
  const a=normalize(raw);
  if(a.kind==='custom'){
   const name=String(a.custom_name||'').trim();
   if(!name||name.length>200)throw new Error('工事の種類を1〜200文字で入力してください。');
   a.custom_name=name;
   return {input:a,groups:[group(name,[line(name,'','','','',{quantity:'',quantity_pending:true})],a)]};
  }
  const m2=Concrete.grossArea(a),interior=a.kind==='interior',r=structureRates[a.kind]||(a.kind==='src'?{label:'SRC造',inside:'',upper:'',foundation:'',slab:''}:structureRates.wood),internal=num(a.internal_m2)||(interior?m2:0),wall=num(a.internal_wall_m2);
  const concrete=Concrete.estimate(a);a.concrete_reference=concrete;
  const temporary=[line('散水費',m2?1:0,'式',15000,'散水手間のみ'),line('養生足場',a.scaffold_m2,'㎡',800),line('防音シート張り',a.sound_m2,'㎡',700),line('養生メッシュシート張り',a.mesh_m2,'㎡',300),line('アスベスト含有調査',a.asbestos_samples,'検体',35000),line('アスベスト含有スレート撤去',a.slate_m2,'㎡','', '運搬費・処分費は別行で入力')];
  const demolition=[];
  if(m2&&!interior){
   const elevated=a.upper_method==='elevated'?(Concrete.nonnegative(a.elevated_m2,'階上解体の対象面積')??m2):0;
   if(elevated>m2)throw new Error('階上解体の対象面積は建物延床面積以下で入力してください。');
   demolition.push(line(r.label+' 内部解体',m2,'㎡',r.inside),line(r.label+' 上屋解体',m2-elevated,'㎡',r.upper,'延床面積から階上解体の対象面積を除いた面積'),line(r.label+' 階上解体',elevated,'㎡',a.elevated_price,'階上解体の対象面積。工法・揚重などの条件を単価に反映'));
  }
  demolition.push(line('基礎コンクリート解体',a.foundation_m3,'m³',r.foundation,'入力数量・実体積（図面・現場で確認）'),line('土間コンクリート解体',a.slab_m3,'m³',r.slab),line('外構撤去',a.exterior_m2,'㎡',''),line('庭石撤去',a.garden_m3,'m³',''),line('植栽撤去',a.plants_m3,'m³',''),line('CB撤去',a.cb_m2,'㎡',''),line('内部残置物撤去',a.residual_m3,'m³',10000));
  if(internal)demolition.push(line('内部床撤去',internal,'㎡',750,'階数 '+Math.max(1,Math.round(num(a.floors)||1))+'階'),line('内部床下地撤去',internal,'㎡',750),line('内部天井撤去',internal,'㎡',600),line('内部天井下地撤去',internal,'㎡',400));
  if(wall)demolition.push(line('内部壁撤去',wall,'㎡',500),line('内部壁下地撤去',wall,'㎡',250));
  const based='従来の300㎡参考表から面積比例（現場確認が必要）',w=r.waste,wr=r.wasteRates,waste=m2&&!interior&&w?[line('産業廃棄物運搬費（コンクリート以外）',m2*w.haul,'m³',wr.haul,based),line('木くず処分費',m2*w.wood,'m³',wr.wood,based),line('ガラス・陶磁器くず処分費',m2*w.glass,'m³',wr.glass,based),line('廃プラスチック処分費',m2*w.plastic,'m³',wr.plastic,based),line('紙・繊維くず処分費',m2*w.paper,'m³',wr.paper,based),line('石膏ボード処分費',m2*w.board,'m³',wr.board,based),line('がれき類処分費',m2*w.rubble,'m³',wr.rubble,based),line('金属くず買取控除',m2*w.metal,'t',wr.metal,'37円/kg／'+based),line('混合廃棄物処分費',m2*w.mixed,'m³',wr.mixed,based)]:[];
  if(!concrete.skip&&concrete.quantity!==0){
   const spec=concrete.source?`${concrete.label}／延床${m2}㎡×${concrete.factor_kg_m2}kg/㎡÷1000。${concrete.description}（1999年・n=${concrete.sample_count}）。建物全体の参考値、基礎・土間の別加算なし。`:concrete.quantity===null?concrete.reason:'現場の拾い数量／'+concrete.description;
   const extra=concrete.quantity===null?{quantity:'',quantity_pending:true}:{},priceMatches=a.concrete_price_basis===(concrete.volume_basis||'t');
   waste.push(line('コンクリート運搬費',concrete.quantity,concrete.unit,priceMatches?a.concrete_haul_price:'',spec,extra),line('コンクリート処分費',concrete.quantity,concrete.unit,priceMatches?a.concrete_disposal_price:'',spec,extra));
  }
  const other=[line('解体跡整地',a.grading_m2,'㎡',500),line('土嚢積み',a.sandbag_m,'m',1000)];
  const groups=[group('A 仮設工事',temporary,a),group('B 解体工事',demolition),group('C 産業廃棄物処理工事',waste),group('D その他工事',other),group('E 回送費・諸経費・値引き',[])];
  return {input:a,groups};
 }
 function percentRows(groups,raw){
  if(raw?.kind==='custom')return groups;
  const target=groups.find(g=>/諸経費|福利/.test(g.name));if(!target)return groups;
  const v1=groups.some(g=>g.quote_layout_version===1),summary=v1?quoteSummary(groups):null;
  let base=v1?summary.direct:0;
  if(!v1)for(const g of groups)for(const r of g.quote_lines||[]){if(r.excluded||r.auto_percent)continue;const q=num(r.quantity),p=Number(r.quote_price);if(q&&Number.isFinite(p))base+=Math.floor(q*p);}
  // Keep generated rows at their current indices. Removing then appending them
  // would let the next DOM gather write the welfare fields into the overhead row.
  // Statutory welfare is deferred: never infer it from direct-work cost.
  // Previously saved welfare lines remain untouched, including their exclusions.
  for(const [label,key] of [['諸経費','overhead_rate']]){
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

 // QUOTE-OPTIONS-V1: pure quote helpers. Never writes or reads application data.
 const copyQuote=x=>JSON.parse(JSON.stringify(x));
 const keyQuote=s=>String(s??'').normalize('NFKC').replace(/[\s　]/g,'');
 const chargeKind=r=>r.charge_kind||({ '重機回送費':'transport','回送費':'transport','諸経費':'overhead','値引き':'discount','値引':'discount','法定福利費':'welfare' }[keyQuote(r.label)]||'');
 function quoteSummary(groups){
  const result={direct:0,transport:0,overhead:0,discount:0,welfare:0,other:0,pending:0,directPending:0,pendingKinds:{}};
  for(const g of groups)for(const r of g.quote_lines||[]){
   if(r.excluded)continue;
   const a=Quote.quoteLine(r),kind=chargeKind(r)||(/諸経費|福利|値引/.test(g.name)?'other':'direct');
   if(!a.complete){result.pending++;result.pendingKinds[kind]=true;if(kind==='direct')result.directPending++;continue;}
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
  if(found.length){
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
  }
  if(groups.reduce((n,g)=>n+(g.quote_lines||[]).length,0)>=300)throw Error('明細は300行までです。');
  let i=groups.findIndex(g=>/諸経費|値引/.test(g.name));
  if(i<0){if(groups.length>=100)throw Error('工事項目は100件までです。');i=groups.length;groups.push({name:'回送費・諸経費・値引き',item_no:'',quote_layout_version:1,quote_lines:[],lines:[]});}
  const r={...Quote.blankQuoteLine(),charge_kind:kind,label:({transport:'重機回送費',overhead:'諸経費',discount:'値引き'})[kind],amount_mode:true,quote_amount:''};
  if(kind==='overhead')Object.assign(r,{auto_percent:'quote_overhead_v1',overhead_rate:groups.find(g=>g.auto_input)?.auto_input?.overhead_rate??defaults().overhead_rate,overhead_mode:'rate'});
  if(kind==='discount')r.discount_input=true;
  groups[i].quote_layout_version=1;groups[i].quote_lines.push(r);
  return {groups,groupIndex:i,rowIndex:groups[i].quote_lines.length-1};
 }
 function setQuoteOverheadMode(input,i,j,mode){
  if(!['rate','amount'].includes(mode))throw Error('諸経費の入力方法を確認してください。');
  const groups=copyQuote(input),r=groups[i]?.quote_lines?.[j];if(!r||chargeKind(r)!=='overhead')throw Error('諸経費の明細を確認してください。');
  const current=Quote.quoteLine(r).amount;
  r.charge_kind='overhead';r.overhead_mode=mode;r.amount_mode=true;r.quantity='1';r.unit='式';r.quote_price='';
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

 return {TSUBO,structureRates,Concrete,defaults,normalize,build,percentRows,round,chargeKind,quoteSummary,rateBasisPoints,updateQuoteCharges,ensureQuoteCharge,setQuoteOverheadMode,addSeparateWaste};
});
