from pathlib import Path
import hashlib
root=Path(__file__).resolve().parents[1]
p=root/'docs'
def replace(s,a,b):
 assert s.count(a)==1,(a[:100],s.count(a))
 return s.replace(a,b,1)
s=(p/'estimate-plan-admin.quote5-r2.js').read_text()
s=replace(s,'＋ 工事項目を追加</button></details><button id="epTemplate"','＋ 工事項目を追加</button><button type="button" class="btn light pb-wide" data-transport-section>＋ 運搬費を別項目で入力</button></details><button id="epTemplate"')
s=replace(s,"  bindAutoBuilder();", "  bindAutoBuilder();\n  host.querySelectorAll('[data-transport-section]').forEach(b=>b.onclick=()=>openTransportSection());")
helpers=r'''
 // A transport section is a DIRECT work group, not machinery mobilization.
 // Reuse existing sections; only a user-confirmed move changes row placement.
 const transportSectionName=g=>String(g?.name||'').normalize('NFKC').trim().replace(/^[A-Z0-9]+[\s.、:：-]+/,'').replace(/[\s　]/g,'');
 const isTransportSection=g=>g?.quote_section_kind==='waste_transport'||/^(?:産業廃棄物)?運搬(?:工事|費)$/.test(transportSectionName(g));
 const isHaulRow=r=>!r?.charge_kind&&/運搬/.test(String(r?.label||''))&&!/処分|回送|重機/.test(String(r?.label||''));
 function openTransportSection(moveFrom=null){
  if(busy||!identity()||plan?.entry_mode!=='quote')return;
  try{
   gather();const groups=copy(plan.groups),matches=groups.map((g,i)=>isTransportSection(g)?i:-1).filter(i=>i>=0);
   if(matches.length>1)throw Error('運搬費の工事項目が複数あります。使用する項目を直接開いてください。');
   let target=matches[0]??-1,rowIndex=0,changed=false;
   const source=moveFrom?groups[moveFrom[0]]:null,r=source?.quote_lines?.[moveFrom?.[1]];
   if(moveFrom){
    if(!r||r.excluded||!isHaulRow(r)||isTransportSection(source))throw Error('移動する運搬費の明細を確認してください。');
    if(source.lines?.length||/諸経費|福利|値引/.test(source.name))throw Error('原価や調整費を含む項目からは自動移動しません。費用の配分を先に確認してください。');
    if(!confirm('この運搬費を、独立した「産業廃棄物運搬費」へ移します。\n数量・単価・金額はそのままで、複製はしません。\n保存するまでは、この画面内だけの変更です。'))return;
   }
   if(target<0){
    if(groups.length>=100)throw Error('工事項目は100件までです。');
    target=groups.length;groups.push({name:'産業廃棄物運搬費',item_no:'',quote_section_kind:'waste_transport',quote_layout_version:1,quote_lines:[],lines:[]});changed=true;
   }
   const dest=groups[target];
   if(moveFrom){
    const before=C.calculate(plan);source.quote_lines.splice(moveFrom[1],1);rowIndex=dest.quote_lines.length;dest.quote_lines.push(r);
    const after=C.calculate({...plan,groups});
    for(const key of ['known_price','price','tax','total','known_cost','total_cost'])if(before[key]!==after[key])throw Error('金額や原価が変わるため、移動を中止しました。');
    changed=true;
   }else if(!dest.quote_lines.length){
    if(groups.reduce((n,g)=>n+g.quote_lines.length,0)>=300)throw Error('明細は300行までです。');
    dest.quote_lines.push({...C.blankQuoteLine(),label:'産業廃棄物運搬費',quantity:'',unit:'m³'});changed=true;
   }else rowIndex=Math.max(0,dest.quote_lines.findIndex(r=>!r.excluded));
   if(changed){plan.groups=groups;dirty=true;}
   q('.ep-manual').open=true;renderSimpleGroups(target);updateTotals();
   note(moveFrom?'運搬費を別の工事項目へ移しました。金額は変更していません。保存して反映してください。':changed?'運搬費を独立した工事項目に追加しました。数量・単価を入力してください。処分費は別の項目に残ります。':'既存の運搬費の工事項目を開きました。重複追加はしていません。');
   focusInput(q('#epQty'+target+'_'+rowIndex)?'#epQty'+target+'_'+rowIndex:'#epWork'+target);
  }catch(error){note(error.message||'運搬費の項目を開けませんでした。',true);}
 }
 function transportSectionTools(g){
  return !isTransportSection(g)&&/産業廃棄物|処分/.test(g.name)?'<button type="button" class="btn light pb-wide" data-transport-section>＋ 運搬費を別項目で入力</button>':'';
 }
'''
s=replace(s,' const quoteChoices=name=>/仮設/.test(name)?',helpers+"\n const quoteChoices=name=>isTransportSection({name})?[['産業廃棄物運搬費','m³'],['コンクリート運搬費','m³']]:/仮設/.test(name)?")
s=replace(s,"+'</div>'+choicePicker(g,i)+g.quote_lines.map", "+'</div>'+transportSectionTools(g)+choicePicker(g,i)+g.quote_lines.map")
s=replace(s,"  const change=(fn,index)=>{gather();fn();dirty=true;renderSimpleGroups(index);updateTotals();};", "  const change=(fn,index)=>{gather();fn();dirty=true;renderSimpleGroups(index);updateTotals();};\n  host.querySelectorAll('[data-transport-section]').forEach(b=>b.onclick=()=>openTransportSection());\n  host.querySelectorAll('[data-move-haul]').forEach(b=>b.onclick=()=>openTransportSection(b.dataset.moveHaul.split(',').map(Number)));")
s=replace(s,"(!A.chargeKind(r)&&!/運搬|処分|買取/.test(r.label)?", "(!isTransportSection(plan.groups[i])&&!A.chargeKind(r)&&!/運搬|処分|買取/.test(r.label)?")
s=replace(s,"data-separate-waste=\"'+i+','+j+'\">運搬費・処分費を別行で追加</button>':'')+'</div>';", "data-separate-waste=\"'+i+','+j+'\">運搬費・処分費を別行で追加</button>':'')+(isHaulRow(r)&&!isTransportSection(plan.groups[i])?'<button type=\"button\" class=\"btn light pb-wide\" data-move-haul=\"'+i+','+j+'\">この運搬費を別項目へ移す</button>':'')+'</div>';")
(p/'estimate-plan-admin.quote5-r3.js').write_text(s)
x=(p/'index.html').read_text();x=replace(x,'estimate-plan-admin.quote5-r2.js?v=20260923-discount-r2','estimate-plan-admin.quote5-r3.js?v=20260924-transport-r1');(p/'index.html').write_text(x)
for n in ['estimate-plan-admin.quote5-r3.js','index.html']:
 b=(p/n).read_bytes();print(n,hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest())
