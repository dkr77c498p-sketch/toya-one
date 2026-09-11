const assert=require('node:assert/strict');
const A=require('../docs/estimate-auto-builder.js');
const C=require('../docs/estimate-plan-engine.js');
const E=require('../docs/project-documents-engine.js');

const built=A.build({kind:'wood',area_tsubo:'30',scaffold_m2:'100',sound_m2:'100',asbestos_samples:'2',foundation_m3:'10',grading_m2:'120',overhead_rate:'2',welfare_rate:'1'});
assert.equal(built.input.area_m2,'99.17');
assert.equal(built.groups[0].quote_lines.find(r=>r.label==='アスベスト含有調査').quote_price,'35000');
assert.equal(built.groups[0].quote_lines.find(r=>r.label==='養生足場').quote_price,'800');
assert.ok(built.groups[2].quote_lines.length>=10,'建物面積から産廃処分・運搬数量を作る');
const woodWaste=Object.fromEntries(built.groups[2].quote_lines.filter(r=>r.label==='産業廃棄物処分費').map(r=>[r.spec.split('／')[0],Number(r.quantity)]));
assert.equal(woodWaste['木くず'],17.289,'300㎡標準表52.3㎥を面積比例');
assert.equal(A.autoFoundation('wood',300,1),'45','木造平屋は延床面積×平均0.15㎥');
assert.equal(A.autoFoundation('wood',300,2),'28.5','階数から建築面積を計算して木造2階平均を適用');
assert.equal(A.autoFoundation('steel',300,1),'69','鉄骨造平屋の平均を適用');
assert.equal(A.autoFoundation('rc',300,4),'60','RC造4階の平均を適用');
const other=A.build({kind:'wood',grading_m2:'10',sandbag_m:'20'}).groups[3].quote_lines;
assert.equal(other.find(r=>r.label==='解体跡整地').quote_price,'500');
assert.equal(other.find(r=>r.label==='土嚢積み').quote_price,'1000');
for(const kind of ['wood','lightSteel','steel','rc']){
 const metal=A.build({kind,area_m2:'300'}).groups[2].quote_lines.find(r=>r.spec.startsWith('金属'));
 assert.equal(metal.unit,'t');
 assert.equal(metal.quote_price,'-37000',kind+'の金属くずは37円/kgの買取控除');
}
A.percentRows(built.groups,built.input);
assert.equal(built.groups[4].quote_lines.length,2,'法定福利費と諸経費を自動追加');
const plan={entry_mode:'quote',tax_rate:10,groups:built.groups};
const total=C.calculate(plan);
assert.equal(total.complete,true);
assert.equal(total.tax,Math.floor(total.price*.1));

const interior=A.build({kind:'interior',area_m2:'50',floors:'2',overhead_rate:'0',welfare_rate:'0'});
assert.equal(interior.groups[1].quote_lines.some(r=>r.label==='内部床撤去'),true);
assert.equal(interior.groups[1].quote_lines.some(r=>r.label.includes('木造 上屋')),false);
assert.equal(interior.groups[2].quote_lines.length,0,'内部解体では建物解体の産廃換算を決め打ちしない');

const doc={kind:'estimate',document_number:null,document_date:'2026-09-11',customer_name:'テスト建設株式会社',customer_address:'鹿児島市',subject:'木造解体工事',site_name:'木造解体工事',site_address:'鹿児島市',notes:'',issuer:{issuer_name:'株式会社TOYA',representative:'代表取締役　宮下 直也',postal_code:'891-1205',address:'鹿児島市犬迫町8485-4',phone:'099-801-3027'},items:total.quote_items,tax_rate:10,subtotal:total.price,total:total.total,estimate_snapshot:{...plan,calculation:total}};
const html=E.printHTML(doc);
for(const text of ['御　見　積　書','工事内訳書','見積諸条件','建設業許可：鹿児島県知事（般-7）第16963号','アスベスト含有調査'])assert.ok(html.includes(text),text);
assert.ok((html.match(/class="te2-page/g)||[]).length>=6,'TOYA書式を複数ページで構成');
assert.ok(html.includes('width=device-width,initial-scale=1'),'スマホ画面幅で見積書を表示');
assert.ok(html.includes('@page{size:A4;margin:0}'),'PDFは余白を含めてA4固定');
assert.ok(html.includes('class="te2-frame"'),'御社書式の見積書枠を使用');
console.log('estimate auto builder tests passed');
