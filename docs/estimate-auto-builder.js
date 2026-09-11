(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ToyaEstimateAuto=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const TSUBO=3.305785;
 const round=(n,d=2)=>String(Math.round((Number(n)||0)*10**d)/10**d);
 const num=x=>{const n=Number(x);return Number.isFinite(n)&&n>0?n:0;};
 const line=(label,quantity,unit,price,spec='',extra={})=>({label,spec,quantity:round(quantity,3),unit,quote_price:price===null||price===undefined?'':String(price),quote_amount:null,excluded:false,...extra});
 const group=(name,quote_lines,auto)=>({name,quote_lines:quote_lines.filter(r=>num(r.quantity)>0),lines:[],...(auto?{auto_input:auto}:{})});
 const structureRates={
  // Waste factors are the company's 300 m2 standard sheet divided by 300.
  wood:{label:'木造',inside:1650,upper:2270,foundation:10800,slab:4500,waste:{haul:129.7/300,concrete:60/300,wood:52.3/300,glass:23.1/300,plastic:3.2/300,paper:5.4/300,board:10.4/300,rubble:25.3/300,metal:2.4/300,mixed:10/300},wasteRates:{haul:2190,concreteHaul:2200,wood:12000,glass:8500,plastic:8500,paper:10000,board:22000,concrete:4000,rubble:9500,metal:-34000,mixed:18500}},
  lightSteel:{label:'軽量鉄骨造',inside:2150,upper:3900,foundation:11000,slab:7000,waste:{haul:124.3/300,concrete:75/300,wood:48.7/300,glass:16.5/300,plastic:7.9/300,paper:7.5/300,board:14.4/300,rubble:19.5/300,metal:9/300,mixed:10/300},wasteRates:{haul:7000,concreteHaul:2200,wood:15000,glass:9500,plastic:9500,paper:10000,board:25000,concrete:4000,rubble:9500,metal:-35000,mixed:18500}},
  steel:{label:'鉄骨造',inside:2150,upper:3900,foundation:11000,slab:7000,waste:{haul:119.5/300,concrete:165/300,wood:48.7/300,glass:16.5/300,plastic:7.9/300,paper:7.5/300,board:14.4/300,rubble:19.5/300,metal:21/300,mixed:5/300},wasteRates:{haul:7000,concreteHaul:2200,wood:15000,glass:9500,plastic:9500,paper:10000,board:25000,concrete:4000,rubble:9500,metal:-35000,mixed:18500}},
  rc:{label:'RC造',inside:2150,upper:3900,foundation:10800,slab:4500,waste:{haul:88.3/300,concrete:120/300,wood:11.2/300,glass:17.1/300,plastic:8.6/300,paper:7.5/300,board:14.4/300,rubble:19.5/300,metal:14.4/300,mixed:10/300},wasteRates:{haul:7000,concreteHaul:2200,wood:15000,glass:9500,plastic:9500,paper:10000,board:25000,concrete:4000,rubble:9500,metal:-35000,mixed:18500}}
 };
 function defaults(){return {kind:'wood',area_m2:'',area_tsubo:'',floors:'1',scaffold_m2:'',sound_m2:'',mesh_m2:'',foundation_m3:'',slab_m3:'',asbestos_samples:'',slate_m2:'',exterior_m2:'',garden_m3:'',plants_m3:'',cb_m2:'',residual_m3:'',grading_m2:'',sandbag_m:'',internal_m2:'',internal_wall_m2:'',overhead_rate:'2',welfare_rate:'0'};}
 function normalize(raw={}){const d={...defaults(),...raw};if(num(d.area_m2))d.area_tsubo=round(num(d.area_m2)/TSUBO,2);else if(num(d.area_tsubo))d.area_m2=round(num(d.area_tsubo)*TSUBO,2);return d;}
 function build(raw){
  const a=normalize(raw),m2=num(a.area_m2),interior=a.kind==='interior',r=structureRates[a.kind]||structureRates.wood,internal=num(a.internal_m2)||(interior?m2:0),wall=num(a.internal_wall_m2);
  const temporary=[line('散水費',m2?1:0,'式',15000,'散水手間のみ'),line('養生足場',a.scaffold_m2,'㎡',800),line('防音シート張り',a.sound_m2,'㎡',700),line('養生メッシュシート張り',a.mesh_m2,'㎡',300),line('アスベスト含有調査',a.asbestos_samples,'検体',35000),line('アスベスト含有スレート撤去・処分',a.slate_m2,'㎡','')];
  const demolition=[];
  if(m2&&!interior)demolition.push(line(r.label+' 内部解体',m2,'㎡',r.inside),line(r.label+' 上屋解体',m2,'㎡',r.upper,'建物延床面積から計算'));
  demolition.push(line('基礎コンクリート解体',a.foundation_m3,'m³',r.foundation),line('土間コンクリート解体',a.slab_m3,'m³',r.slab),line('外構撤去',a.exterior_m2,'㎡',''),line('庭石撤去',a.garden_m3,'m³',''),line('植栽撤去',a.plants_m3,'m³',''),line('CB撤去',a.cb_m2,'㎡',''),line('内部残置物撤去',a.residual_m3,'m³',10000));
  if(internal)demolition.push(line('内部床撤去',internal,'㎡',750,'階数 '+Math.max(1,Math.round(num(a.floors)||1))+'階'),line('内部床下地撤去',internal,'㎡',750),line('内部天井撤去',internal,'㎡',600),line('内部天井下地撤去',internal,'㎡',400));
  if(wall)demolition.push(line('内部壁撤去',wall,'㎡',500),line('内部壁下地撤去',wall,'㎡',250));
  const based='TOYA標準300㎡表から面積比例',w=r.waste,wr=r.wasteRates,waste=m2&&!interior?[line('産業廃棄物運搬費',m2*w.haul,'m³',wr.haul,'コンクリート以外／'+based),line('産業廃棄物運搬費',m2*w.concrete,'m³',wr.concreteHaul,'コンクリート／'+based),line('産業廃棄物処分費',m2*w.wood,'m³',wr.wood,'木くず／'+based),line('産業廃棄物処分費',m2*w.glass,'m³',wr.glass,'ガラス・陶磁器／'+based),line('産業廃棄物処分費',m2*w.plastic,'m³',wr.plastic,'廃プラスチック／'+based),line('産業廃棄物処分費',m2*w.paper,'m³',wr.paper,'紙・繊維／'+based),line('産業廃棄物処分費',m2*w.board,'m³',wr.board,'ボード類／'+based),line('産業廃棄物処分費',m2*w.concrete,'m³',wr.concrete,'コンクリート・アスファルト／'+based),line('産業廃棄物処分費',m2*w.rubble,'m³',wr.rubble,'がれき／'+based),line('産業廃棄物処分費',m2*w.metal,'t',wr.metal,'金属／'+based),line('産業廃棄物処分費',m2*w.mixed,'m³',wr.mixed,'その他混合／'+based)]:[];
  const other=[line('解体跡整地',a.grading_m2,'㎡',850),line('土嚢積み',a.sandbag_m,'m','')];
  const groups=[group('A 仮設工事',temporary,a),group('B 解体工事',demolition),group('C 産業廃棄物処理工事',waste),group('D その他工事',other),group('E 諸経費・法定福利費・値引き',[])];
  return {input:a,groups};
 }
 function percentRows(groups,raw){
  let base=0;
  for(const g of groups)for(const r of g.quote_lines||[]){if(r.excluded||r.auto_percent)return;const q=num(r.quantity),p=Number(r.quote_price);if(q&&Number.isFinite(p))base+=Math.floor(q*p);}
  const target=groups.find(g=>/諸経費|福利/.test(g.name));if(!target)return groups;
  target.quote_lines=(target.quote_lines||[]).filter(r=>!r.auto_percent);
  for(const [label,key] of [['法定福利費','welfare_rate'],['諸経費','overhead_rate']]){const rate=Number(raw?.[key]);if(Number.isFinite(rate)&&rate>0)target.quote_lines.push(line(label,1,'式','',`直接工事費 ${rate}%`,{amount_mode:true,quote_amount:String(Math.floor(base*rate/100)),auto_percent:key}));}
  return groups;
 }
 return {TSUBO,structureRates,defaults,normalize,build,percentRows,round};
});
