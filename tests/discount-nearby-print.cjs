'use strict';
const assert=require('node:assert/strict'),test=require('node:test');
const Before=require('../docs/project-documents-engine.quote5-r2.js'),After=require('../docs/project-documents-engine.quote5-r3.js'),Q=require('../docs/estimate-plan-engine.quote5-r1.js'),A=require('../docs/estimate-auto-builder.quote5-r1.js');
const row=(label,price,extra={})=>({...Q.blankQuoteLine(),label,quote_price:String(price),...extra});
function quote(rate='5'){
 let p=Q.quoteDraft();p.site_name='表示検証用工事';p.groups[1].quote_lines=[row('外構撤去工事',134700,{item_no:'001'})];p.groups=A.ensureQuoteCharge(p.groups,'overhead').groups;
 const r=p.groups[4].quote_lines[0];r.overhead_rate=rate;A.updateQuoteCharges(p.groups);
 const t=Q.calculate(p);return {kind:'estimate',status:'draft',tax_rate:10,document_date:'2026-09-23',issuer:{issuer_name:'検証用株式会社'},items:t.quote_items,subtotal:t.price,total:t.total,estimate_snapshot:{...p,calculation:t}};
}
test('generated formula is absent from print, money and row height are unchanged',()=>{
 const d=quote(),saved=JSON.stringify(d),html=After.printHTML(d);
 assert.match(Before.printHTML(d),/直接工事費×5%/);assert.ok(!html.includes('直接工事費×5%'));
 assert.match(html,/6,735/);assert.match(html,/141,435/);assert.match(html,/14,143/);assert.match(html,/155,578/);assert.equal(JSON.stringify(d),saved);
 assert.equal(After.printHTML(d),Before.printHTML(d).replace('直接工事費×5%',''));
});
test('original generated rates do not affect monetary amounts',()=>{
 for(const r of ['0','3','5','10','2.55']){const d=quote(r);assert.equal(After.printHTML(d),Before.printHTML(d).replace('直接工事費×'+r+'%',''));}
});
test('manual remarks on an automatic row are preserved',()=>{
 const d=quote();d.estimate_snapshot.groups[4].quote_lines[0].spec='現場管理費・交通費を含む';assert.equal(After.printHTML(d),Before.printHTML(d));assert.match(After.printHTML(d),/現場管理費・交通費を含む/);
});
test('unmarked or user-written remarks that look like formulas are not removed',()=>{
 const d=quote(),r=d.estimate_snapshot.groups[4].quote_lines[0];delete r.auto_percent;assert.equal(After.printHTML(d),Before.printHTML(d));r.spec='直接工事費×5%';assert.match(After.printHTML(d),/直接工事費×5%/);
});
test('rendering cannot add a second discount or mutate stored snapshots',()=>{
 const d=quote();let p=d.estimate_snapshot;p.groups=A.ensureQuoteCharge(p.groups,'discount').groups;p.groups[4].quote_lines[1].quote_amount='-10000';p.calculation=Q.calculate(p);d.items=p.calculation.quote_items;d.subtotal=p.calculation.price;d.total=p.calculation.total;
 assert.equal(d.total,144578);const snapshot=JSON.stringify(d);assert.match(After.printHTML(d),/-10,000/);assert.match(After.printHTML(d),/144,578/);assert.equal(JSON.stringify(d),snapshot);
});
test('invoice rendering and all money functions stay byte identical',()=>{
 const d={kind:'invoice',status:'draft',document_date:'2026-09-23',issuer:{},tax_rate:10,items:[{name:'工事代金',quantity:'1',unit:'式',unitPrice:'1000'}]};assert.equal(After.printHTML(d),Before.printHTML(d));assert.equal(After.total.toString(),Before.total.toString());
});
