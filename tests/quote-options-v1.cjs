'use strict';
const assert=require('node:assert/strict'),test=require('node:test'),path=require('node:path');
const Q=require('../docs/estimate-plan-engine.js'),A=require('../docs/estimate-auto-builder.js'),D=require('../docs/project-documents-engine.js');
const row=(label,price,extra={})=>({...Q.blankQuoteLine(),label,quote_price:String(price),...extra});
function draft(){const p=Q.quoteDraft();p.site_name='検証用工事';p.customer_name='検証用宛先';p.title='検証用工事';p.groups[1].quote_lines=[row('撤去工事',134700,{item_no:'001'})];return p;}
function charge(p,kind,value){const next=A.ensureQuoteCharge(p.groups,kind);p.groups=next.groups;const r=p.groups[next.groupIndex].quote_lines[next.rowIndex];if(kind==='overhead')r.overhead_rate=value;else r.quote_amount=value;return r;}
function calculate(p){A.updateQuoteCharges(p.groups);return Q.calculate(p);}
function document(p){const t=calculate(p);return {kind:'estimate',company_id:'sample',status:'draft',tax_rate:10,document_date:'2026-09-23',site_name:p.site_name,customer_name:p.customer_name,subject:p.title,items:t.quote_items,subtotal:t.price,total:t.total,issuer:{issuer_name:'サンプル株式会社'},estimate_snapshot:{...p,calculation:t}};}
test('new group and detail numbers preserve leading zeroes',()=>{const p=draft();p.groups[1].item_no='02';assert.equal(Q.calculate(p).price,134700);const html=D.printHTML(document(p));assert.match(html,/<td>02<\/td>/);assert.match(html,/<td>001<\/td>/);assert.match(Q.printHTML(p),/001/);});
test('rate overhead and fixed discount match all totals and stay idempotent',()=>{const p=draft();charge(p,'transport','10000');charge(p,'overhead','10');charge(p,'discount','-1170');const t=calculate(p);assert.equal(t.price,157000);assert.equal(t.tax,15700);assert.equal(t.total,172700);assert.equal(A.quoteSummary(p.groups).overhead,13470);assert.deepEqual(calculate(p),t);});
test('explicitly clearing the approved default leaves overhead incomplete',()=>{const p=draft();charge(p,'overhead','');const t=calculate(p);assert.equal(t.complete,false);assert.equal(t.total,null);assert.equal(A.defaults().overhead_rate,'5');});
test('zero overhead is valid, not missing',()=>{const p=draft();charge(p,'overhead','0');assert.equal(calculate(p).total,148170);});
test('manual exact amount is used instead of quantity*unit price',()=>{const p=draft();p.groups[1].quote_lines[0].quote_amount='50001';p.groups[1].quote_lines[0].amount_mode=true;charge(p,'overhead','2.5');const t=calculate(p);assert.equal(A.quoteSummary(p.groups).overhead,1250);assert.equal(t.price,51251);});
test('invalid rates clear stale calculated amounts and block save calculation',()=>{const p=draft(),r=charge(p,'overhead','10');calculate(p);assert.equal(r.quote_amount,'13470');r.overhead_rate='-2';assert.throws(()=>calculate(p),/諸経費率/);assert.equal(r.quote_amount,'');assert.equal(Q.calculate(p).complete,false);});
test('incomplete direct rows keep overhead unconfirmed',()=>{const p=draft(),r=charge(p,'overhead','10');calculate(p);p.groups[1].quote_lines[0].quote_price='';assert.equal(calculate(p).total,null);assert.equal(r.quote_amount,'');});
test('excluded direct lines are not used for overhead',()=>{const p=draft();p.groups[1].quote_lines.push(row('除外項目',100000,{excluded:true}));charge(p,'overhead','10');assert.equal(calculate(p).price,148170);});
test('negative scrap credit uses signed yen floor in direct basis',()=>{const p=draft();p.groups[2].quote_lines=[row('金属買取控除',-37000,{quantity:'0.101',unit:'t'})];charge(p,'overhead','10');assert.equal(A.quoteSummary(A.updateQuoteCharges(p.groups)).direct,130963);assert.equal(calculate(p).price,144059);});
test('adding a charge twice opens the same row',()=>{const p=draft();charge(p,'overhead','10');const before=JSON.stringify(p.groups),next=A.ensureQuoteCharge(p.groups,'overhead');assert.equal(JSON.stringify(next.groups),before);assert.equal(p.groups.flatMap(g=>g.quote_lines).filter(r=>A.chargeKind(r)==='overhead').length,1);});
test('duplicate overhead cannot be automatically added to a manual charge',()=>{const p=draft();charge(p,'overhead','10');p.groups[4].quote_lines.push(row('諸経費',100));assert.throws(()=>calculate(p),/複数/);});
test('manual switch preserves current amount and stops automatic recomputation',()=>{const p=draft();charge(p,'overhead','10');calculate(p);p.groups=A.setQuoteOverheadMode(p.groups,4,0,'amount');p.groups[1].quote_lines[0].quote_price='100';assert.equal(calculate(p).price,13570);});
test('discount cannot drive the total below zero',()=>{const p=draft();charge(p,'discount','-200000');assert.throws(()=>calculate(p),/合計金額/);});
test('separation keeps removal value, blank transport/disposal prices, and no duplicates',()=>{const p=draft();p.groups[1].quote_lines=[row('残置物撤去',10000,{quantity:'4',unit:'m³'})];const before=JSON.stringify(p.groups);const next=A.addSeparateWaste(p.groups,1,0);assert.equal(JSON.stringify(p.groups),before);assert.equal(Q.quoteLine(next.groups[1].quote_lines[0]).amount,40000);const added=next.groups[next.groupIndex].quote_lines;assert.deepEqual(added.map(r=>r.label),['産業廃棄物運搬費','産業廃棄物処分費']);assert.ok(added.every(r=>r.quantity==='4'&&r.quote_price===''));assert.throws(()=>A.addSeparateWaste(next.groups,1,0),/追加済み/);});
test('area is not automatically converted into transport volume',()=>{const p=draft();p.groups[1].quote_lines=[row('スレート撤去',35000,{quantity:'20',unit:'㎡'})];const next=A.addSeparateWaste(p.groups,1,0);assert.ok(next.groups[2].quote_lines.every(r=>r.quantity===''&&r.unit==='m³'));});
test('already bundled removal and disposal is not split by guessing',()=>{const p=draft();p.groups[1].quote_lines=[row('スレート撤去・処分',35000)];assert.throws(()=>A.addSeparateWaste(p.groups,1,0),/先に名称と単価/);});
test('old layout still renders and quote data survives serialization',()=>{const p=draft();p.groups.forEach(g=>{delete g.item_no;delete g.quote_layout_version});delete p.groups[1].quote_lines[0].item_no;const old=JSON.stringify(p);const html=D.printHTML(document(p));assert.ok(html.includes('御　見　積　書'));assert.equal(JSON.stringify(p),old);const roundtrip=JSON.parse(JSON.stringify(p));assert.deepEqual(Q.calculate(roundtrip),Q.calculate(p));});
test('old invoices are not affected by the quote-only renderer path',()=>{const d={kind:'invoice',status:'draft',tax_rate:10,items:[{name:'工事代金',quantity:'1',unit:'式',unitPrice:'1000'}],issuer:{},document_date:'2026-09-23'};const original=require(process.env.TOYA_QUOTE_BASELINE||path.resolve(__dirname,'../../toya-pages-original/project-documents-engine.js'));assert.equal(D.printHTML(d),original.printHTML(d));});
test('number fields are length limited and escaped before rendering',()=>{const p=draft();p.groups[1].quote_lines[0].item_no='<img>';assert.ok(D.printHTML(document(p)).includes('&lt;img&gt;'));p.groups[1].quote_lines[0].item_no='1234567890123';assert.throws(()=>Q.calculate(p),/項目No/);});
test('incomplete charges are identified, not displayed as a confirmed zero',()=>{const p=draft();charge(p,'overhead','');calculate(p);assert.equal(A.quoteSummary(p.groups).pendingKinds.overhead,true);});
test('existing negative unit-priced discount opens without changing total',()=>{const p=draft();p.groups[4].quote_lines=[row('値引き',-500,{quantity:'2'})];const before=Q.calculate(p).price;p.groups=A.ensureQuoteCharge(p.groups,'discount').groups;assert.equal(p.groups[4].quote_lines[0].discount_input,true);assert.equal(p.groups[4].quote_lines[0].quote_amount,'-1000');assert.equal(Q.calculate(p).price,before);});
test('opening an existing positive discount does not silently reverse the sign',()=>{const p=draft();p.groups[4].quote_lines=[row('値引き',500)];assert.throws(()=>A.ensureQuoteCharge(p.groups,'discount'),/プラス/);assert.equal(p.groups[4].quote_lines[0].quote_price,'500');});
test('legacy welfare row stays at its DOM index when overhead becomes automatic',()=>{const p=draft();p.groups[0].auto_input={kind:'wood',welfare_rate:'3',overhead_rate:'10'};const raw=p.groups[0].auto_input;A.percentRows(p.groups,raw);const before=p.groups[4].quote_lines.map(r=>r.label);const overhead=p.groups[4].quote_lines.find(r=>r.charge_kind==='overhead');assert.ok(overhead);for(let n=0;n<3;n++)A.percentRows(p.groups,raw);assert.deepEqual(p.groups[4].quote_lines.map(r=>r.label),before);assert.equal(p.groups[4].quote_lines.filter(r=>A.chargeKind(r)==='overhead').length,1);assert.equal(overhead.quote_amount,'13470');});
test('new template auto overhead respects fixed amounts and excludes transport',()=>{const p=draft();p.groups[1].quote_lines[0].amount_mode=true;p.groups[1].quote_lines[0].quote_amount='50001';charge(p,'transport','10000');A.percentRows(p.groups,{kind:'wood',overhead_rate:'2.5',welfare_rate:'0'});assert.equal(A.quoteSummary(p.groups).overhead,1250);assert.equal(Q.calculate(p).price,61251);});
test('customer adjustments are ordered as original form regardless of input order',()=>{const p=draft();charge(p,'overhead','10');charge(p,'discount','-1000');charge(p,'transport','2000');const html=D.printHTML(document(p));assert.ok(html.indexOf('重機回送費')<html.indexOf('諸経費'));assert.ok(html.indexOf('諸経費')<html.indexOf('値引き'));});

test('approved default is five percent for new overhead inputs',()=>{
  assert.equal(A.defaults().overhead_rate,'5');
  const p=draft(),before=JSON.stringify(p.groups),n=A.ensureQuoteCharge(p.groups,'overhead');
  assert.equal(JSON.stringify(p.groups),before);
  p.groups=n.groups;
  assert.equal(p.groups[n.groupIndex].quote_lines[n.rowIndex].overhead_rate,'5');
  calculate(p);assert.equal(A.quoteSummary(p.groups).overhead,6735);
  assert.equal(Q.calculate(p).price,141435);
});
test('a million yen direct work calculates fifty thousand overhead',()=>{
  const p=draft();p.groups[1].quote_lines[0].quote_price='1000000';
  p.groups=A.ensureQuoteCharge(p.groups,'overhead').groups;
  calculate(p);assert.equal(A.quoteSummary(p.groups).overhead,50000);
});
test('existing per-quote zero, blank, and custom rates are retained',()=>{
  for(const rate of ['0','','3.5','10']){
    const p=draft();p.groups[0].auto_input={kind:'wood',overhead_rate:rate};
    const before=JSON.stringify(p.groups),n=A.ensureQuoteCharge(p.groups,'overhead');
    assert.equal(JSON.stringify(p.groups),before);
    assert.equal(n.groups[n.groupIndex].quote_lines[n.rowIndex].overhead_rate,rate);
    assert.equal(A.normalize({overhead_rate:rate}).overhead_rate,rate);
  }
});
test('opening an existing manual or rate-based overhead does not reset it to five',()=>{
  for(const rate of ['0','','7']){
    const p=draft();charge(p,'overhead',rate);calculate(p);
    const before=JSON.stringify(p.groups),n=A.ensureQuoteCharge(p.groups,'overhead');
    assert.equal(JSON.stringify(n.groups),before);
  }
  const p=draft();p.groups[4].quote_lines=[row('諸経費',9000)];
  const before=JSON.stringify(p.groups),n=A.ensureQuoteCharge(p.groups,'overhead');
  assert.equal(JSON.stringify(n.groups),before);
  assert.equal(Q.calculate({...p,groups:n.groups}).price,143700);
});
test('default rate can still be changed or switched to a manual amount',()=>{
  const p=draft(),n=A.ensureQuoteCharge(p.groups,'overhead');p.groups=n.groups;
  p.groups[n.groupIndex].quote_lines[n.rowIndex].overhead_rate='3';
  calculate(p);assert.equal(A.quoteSummary(p.groups).overhead,4041);
  p.groups=A.setQuoteOverheadMode(p.groups,n.groupIndex,n.rowIndex,'amount');
  p.groups[n.groupIndex].quote_lines[n.rowIndex].quote_amount='5000';
  calculate(p);assert.equal(A.quoteSummary(p.groups).overhead,5000);
});
test('loading, printing or duplicating a saved quote does not add overhead',()=>{
  const p=draft(),before=JSON.stringify(p);
  calculate(p);D.printHTML(document(p));
  const copied=Q.duplicate(p,null);
  assert.equal(JSON.stringify(p),before);
  assert.equal(A.quoteSummary(p.groups).overhead,0);
  assert.equal(A.quoteSummary(copied.groups).overhead,0);
});
