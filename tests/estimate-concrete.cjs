const assert=require('node:assert/strict');
const A=require('../docs/estimate-auto-builder.js');
const C=require('../docs/estimate-plan-engine.js');
const raw={kind:'rc',use:'residential',area_m2:'300',floors:'3'};
const concrete=x=>A.Concrete.estimate(A.normalize(x));
const rows=x=>A.build(x).groups.flatMap(g=>g.quote_lines);
const disposal=x=>rows(x).find(r=>r.label==='コンクリート処分費');

assert.equal(concrete(raw).quantity,339.9,'RC住宅のW-out 1133kg/㎡を延床300㎡に適用');
assert.equal(concrete({...raw,floors:'10'}).quantity,339.9,'入力済み延床面積に階数を二重掛けしない');
assert.equal(concrete({...raw,area_basis:'typical',area_m2:'100'}).quantity,339.9,'同面積の3階なら100×3㎡');
assert.throws(()=>concrete({...raw,area_basis:'typical',floors:'2.5'}),/整数/);
assert.throws(()=>concrete({...raw,area_m2:'-5'}),/0以上/);
assert.equal(concrete({...raw,kind:'wood'}).quantity,61.5);
assert.equal(concrete({...raw,kind:'steel',use:'office'}).quantity,252.9);
assert.equal(concrete({...raw,kind:'steel',use:'office'}).method,'in','事務所は資材投入量の代用と明示');
assert.equal(concrete({...raw,kind:'lightSteel',use:'office'}).label,'軽量鉄骨造（S造係数を参照）／事務所');
assert.equal(concrete({...raw,kind:'src',use:'residential'}).quantity,410.7);
assert.equal(concrete({...raw,kind:'steel',use:'residential'}).sample_count,1,'少数事例を隠さない');
assert.equal(concrete({...raw,use:'unknown'}).quantity,null);
assert.equal(disposal({...raw,use:'unknown'}).quantity,'','未登録条件は0にせず数量未入力');
assert.equal(concrete({...raw,use:''}).quantity,null,'用途未選択を住宅の係数で計算しない');
for(const use of ['shop','factory','warehouse']){
 for(const [kind,quantity] of [['wood',61.5],['steel',161.7],['lightSteel',161.7],['rc',491.4],['src',515.1]]){
  const result=concrete({...raw,kind,use});
  assert.equal(result.quantity,quantity,kind+' / '+use);
  assert.equal(result.reference_use,kind==='wood'?'all':'other');
  if(kind!=='wood'){
   assert.ok(result.label.includes(A.Concrete.uses[use]));
   assert.match(result.label,/共通参考値/,'専用の係数ではなく既存のその他区分と明示');
  }
 }
 const savedUse=A.build({...raw,use}).input;
 assert.equal(savedUse.use,use);
 assert.equal(concrete(JSON.parse(JSON.stringify(savedUse))).quantity,491.4);
}
assert.equal(concrete({...raw,use:'other'}).quantity,491.4,'保存済みのその他区分の計算を維持');
assert.equal(disposal({...raw,concrete_scope:'partial'}).quantity,'','部分解体に建物全体の係数を適用しない');
assert.equal(C.calculate({entry_mode:'quote',tax_rate:10,groups:A.build(raw).groups}).complete,false,'t単価の未入力を確定見積にしない');
assert.equal(disposal({...raw,foundation_m3:'100',slab_m3:'50'}).quantity,'339.9','全体の参考量に基礎・土間を二重加算しない');

const manual={...raw,concrete_mode:'manual',concrete_quantity:'12.5',concrete_unit:'solid_m3',concrete_price_basis:'solid_m3',concrete_disposal_price:'4000'};
assert.equal(disposal(manual).quantity,'12.5');assert.equal(disposal(manual).unit,'m³');assert.equal(disposal(manual).quote_price,'4000');
assert.equal(disposal({...manual,concrete_mode:'reference'}).quote_price,'','m³単価をt単価へ流用しない');
assert.equal(disposal({...manual,concrete_unit:'loose_m3'}).quote_price,'','実体積単価をかさ体積へ流用しない');
assert.equal(disposal({...manual,concrete_quantity:'0'}),undefined,'明示的な0は再概算せず処分行を作らない');
assert.equal(disposal({...manual,concrete_quantity:''}).quantity,'','空欄と0を区別');
assert.throws(()=>rows({...manual,concrete_quantity:'-1'}),/0以上/);
assert.equal(disposal({...manual,kind:'interior'}).quantity,'12.5','内部解体でも拾い数量は使用可能');
assert.equal(disposal({kind:'interior',area_m2:'50'}),undefined);
const saved=A.build(manual).groups[0].auto_input;
assert.equal(disposal(JSON.parse(JSON.stringify(saved))).quantity,'12.5','再読込で手入力値を維持');
assert.equal(A.build(raw).input.concrete_reference.source.id,'hashimoto-terashima-1999-table4-v1','根拠と採用係数を見積に保存');

const elevated=rows({...raw,upper_method:'elevated',elevated_m2:'200'});
assert.equal(elevated.find(r=>r.label==='RC造 階上解体').quantity,'200');
assert.equal(elevated.find(r=>r.label==='RC造 上屋解体').quantity,'100');
assert.equal(elevated.find(r=>r.label==='RC造 階上解体').quote_price,'','階上解体の単価を推測しない');
assert.equal(rows({...raw,upper_method:'elevated'}).some(r=>r.label==='RC造 上屋解体'),false,'全体を階上解体する場合の重複なし');
assert.throws(()=>rows({...raw,upper_method:'elevated',elevated_m2:'301'}),/延床面積以下/);
const percent=A.build({...raw,concrete_haul_price:'100',concrete_disposal_price:'200',overhead_rate:'2'});
A.percentRows(percent.groups,percent.input);const oldAmount=percent.groups[4].quote_lines[0].quote_amount;
percent.groups[2].quote_lines.find(r=>r.label==='コンクリート処分費').quote_price='300';
A.percentRows(percent.groups,percent.input);
assert.ok(Number(percent.groups[4].quote_lines[0].quote_amount)>Number(oldAmount),'単価変更後に諸経費も再計算');
const previous=JSON.stringify(percent.groups);A.percentRows(percent.groups,percent.input);assert.equal(JSON.stringify(percent.groups),previous);
console.log('PASS concrete source, units, scope, manual persistence, floor area and elevated demolition');
