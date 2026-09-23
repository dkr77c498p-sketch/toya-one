'use strict';
const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),path=require('node:path');
const dir=path.resolve(__dirname,'../docs');
const old=require(path.join(dir,'project-documents-engine.quote5-r1.js')),fixed=require(path.join(dir,'project-documents-engine.quote5-r2.js'));
function sample(rate='5'){
 const direct=134700,overhead=Math.floor(direct*Number(rate)/100),subtotal=direct+overhead,tax=Math.floor(subtotal/10);
 const lines=[['残置物撤去','4','m³','10000'],['スレート撤去','1','式','35000'],['ステンレス煙突撤去','1','式','3000'],['CBカッター入れ','17.8','m','1500'],['CB撤去','1','式','30000']].map(([label,quantity,unit,quote_price],i)=>({item_no:String(i+1),label,quantity,unit,quote_price,quote_amount:null,excluded:false,spec:''}));
 const adjustment={item_no:'',label:'諸経費',quantity:'1',unit:'式',quote_price:'',quote_amount:String(overhead),amount_mode:true,excluded:false,charge_kind:'overhead',auto_percent:'quote_overhead_v1',overhead_rate:rate,spec:`直接工事費 134,700円 × ${rate}%（1円未満切捨て）`};
 const groups=[{name:'外構撤去工事',item_no:'1',quote_layout_version:1,quote_lines:lines,lines:[]},{name:'回送費・諸経費・値引き',quote_layout_version:1,quote_lines:[adjustment],lines:[]}];
 const items=[{name:'外構撤去工事',quantity:'1',unit:'式',unitPrice:String(direct),costPrice:null},{name:'回送費・諸経費・値引き',quantity:'1',unit:'式',unitPrice:String(overhead),costPrice:null}];
 return {kind:'estimate',status:'draft',tax_rate:10,document_date:'2026-09-23',customer_name:'確認用見積先',site_name:'外構撤去工事（表示確認用）',subject:'外構撤去工事（表示確認用）',site_address:'',issuer:{issuer_name:'株式会社TOYA'},items,subtotal,total:subtotal+tax,estimate_snapshot:{entry_mode:'quote',groups,calculation:{groups:[{active:true,price:direct},{active:true,price:overhead}],price:subtotal,tax,total:subtotal+tax}}};
}
function overheadRow(html){return [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)].map(x=>x[0]).find(s=>s.includes('<td>諸経費</td>'));}
test('automatic overhead occupies one normal-height printed row',()=>{
 const d=sample(),before=old.printHTML(d),after=fixed.printHTML(d);
 assert.match(overheadRow(before),/height:15\.50mm/);assert.match(overheadRow(after),/height:7\.75mm/);
 assert.match(overheadRow(after),/直接工事費×5%/);assert.doesNotMatch(overheadRow(after),/134,700円|切捨て/);
});
test('customer totals and all saved data are unchanged',()=>{
 const d=sample(),snapshot=JSON.stringify(d),after=fixed.printHTML(d);
 for(const value of ['134,700','6,735','141,435','14,143','155,578'])assert.ok(after.includes(value));
 assert.equal(JSON.stringify(d),snapshot);assert.equal(d.estimate_snapshot.groups[1].quote_lines[0].spec,'直接工事費 134,700円 × 5%（1円未満切捨て）');
});
test('zero, decimal and maximum overhead percentages fit one row',()=>{
 for(const rate of ['0','3.5','5.25','10','1000','1000.00']){const html=fixed.printHTML(sample(rate));assert.match(overheadRow(html),/height:7\.75mm/);assert.ok(overheadRow(html).includes('直接工事費×'+rate+'%'));}
});
test('manual remarks are not clipped, removed or rewritten',()=>{
 const d=sample();d.estimate_snapshot.groups[1].quote_lines[0].spec+='\n別途打合せが必要です。';assert.equal(fixed.printHTML(d),old.printHTML(d));
 const manual=sample();delete manual.estimate_snapshot.groups[1].quote_lines[0].auto_percent;assert.equal(fixed.printHTML(manual),old.printHTML(manual));
});
test('historical saved formula uses its own rate, not a current default',()=>{
 const d=sample('3.5');d.estimate_snapshot.groups[1].quote_lines[0].overhead_rate='5';assert.ok(overheadRow(fixed.printHTML(d)).includes('直接工事費×3.5%'));
});
test('line amounts, invoice output and other quote output remain identical',()=>{
 const invoice={...sample(),kind:'invoice',estimate_snapshot:null};assert.equal(fixed.printHTML(invoice),old.printHTML(invoice));
 const d=sample();d.estimate_snapshot.groups[1].quote_lines[0].spec='';assert.equal(fixed.printHTML(d),old.printHTML(d));assert.equal(fixed.lineAmount('17.8','1500'),old.lineAmount('17.8','1500'));
});
if(process.env.OVERHEAD_RENDER_OUT){const out=path.resolve(process.env.OVERHEAD_RENDER_OUT);fs.mkdirSync(out,{recursive:true});const d=sample();fs.writeFileSync(path.join(out,'before.html'),old.printHTML(d));fs.writeFileSync(path.join(out,'after.html'),fixed.printHTML(d));fs.writeFileSync(path.join(out,'max-rate.html'),fixed.printHTML(sample('1000.00')));}
