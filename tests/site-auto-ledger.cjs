'use strict';
const assert=require('node:assert/strict'),A=require('../docs/site-auto-ledger.js'),S=require('../docs/site-financial-summary.js'),C=require('../docs/estimate-plan-engine.js'),fixture=require('./site-auto-ledger-fixture.cjs');
let count=0;function test(name,fn){fn();console.log('PASS',name);count++;}
test('all sites, including completed and future, use the existing actual-cost calculator without writes',()=>{
 const d=fixture(),before=JSON.stringify(d),rows=A.build(d);assert.equal(rows.length,4);
 for(const row of rows)assert.deepEqual(row.result,S.analyze(d,row.site));
 assert.equal(JSON.stringify(d),before);assert.equal(A.phase(rows.find(r=>r.site.id==='a')),'完工済み');
});
test('same-cohort totals exclude missing records/contracts, preserving their rows',()=>{
 const rows=A.build(fixture());assert.deepEqual(A.totals(rows),{count:2,excluded:2,cost:35900,sales:110000,profit:74100,partial:true});
 const future=rows.find(r=>r.site.id==='c');assert.equal(A.phase(future),'日報待ち');assert.match(A.tableHTML([future]),/記録なし/);assert.doesNotMatch(A.tableHTML([future]),/data-label="概算利益">[^<]*50,000/);
 assert.equal(A.state(rows.find(r=>r.site.id==='d')),'請負金額未登録');
});
test('fuel is added once; stored zero retains its meaning',()=>{
 const d=fixture();let row=A.build(d).find(r=>r.site.id==='a');assert.equal(row.result.subtotal,34700);assert.equal(row.result.categories.vehicle.value,10000);assert.equal(row.result.expenses.fuel.value,500);
 d.laborSheets[0].cost_total=0;row=A.build(d).find(r=>r.site.id==='a');assert.equal(row.result.subtotal,14700);assert.equal(A.costRows(row.result).find(r=>r.key==='labor').present,true);
});
test('new daily records accumulate without creating or saving an estimate',()=>{
 const d=fixture();d.reports.push({id:'r4',site_id:'c',report_date:'2026-09-09',updated_at:'2026-09-09T10:00:00Z',report_data:{site:d.sites[2].name,items:[{name:'資材',price:1500}]}});
 const row=A.build(d).find(r=>r.site.id==='c');assert.equal(row.result.subtotal,1500);assert.equal(row.result.profit,48500);assert.equal(A.phase(row),'施工中');assert.equal(A.totals(A.build(d)).count,3);
});
test('individual calculation errors remain visible and are excluded from totals',()=>{
 const d=fixture();d.revenues.push({...d.revenues[0],id:'duplicate'});const rows=A.build(d),a=rows.find(r=>r.site.id==='a');assert.match(a.error,/複数/);assert.equal(A.state(a),'集計要確認');assert.equal(A.totals(rows).cost,1200);assert.match(A.tableHTML([a]),/集計不可/);
});
test('actual references are detached quote drafts; unresolved costs cannot become complete',()=>{
 const d=fixture(),before=JSON.stringify(d),row=A.build(d).find(r=>r.site.id==='a'),p=A.fromActual(row,'テスト時点');assert.equal(p.site_id,'a');assert.equal(p.quote_amount_override,100000);assert.equal(p.overhead_percent,null);assert.equal(p.markup_percent,null);assert.equal(C.calculate(p).known_cost,34700);p.groups[0].lines[0].unit_price='1';assert.equal(JSON.stringify(d),before);
 d.reports[0].report_data.items.push({isWaste:true,price:''});const pending=A.fromActual(A.build(d).find(r=>r.site.id==='a'),'テスト時点');pending.overhead_percent=0;pending.markup_percent=0;assert.equal(C.calculate(pending).complete,false);assert.match(pending.internal_notes,/金額/);
 assert.throws(()=>A.fromActual(A.build(d).find(r=>r.site.id==='c'),'テスト'),/日報/);
});
test('print includes actual day/category totals, guards missing data and escapes record names',()=>{
 const d=fixture();d.sites[0].name='<script>試験</script>';d.reports[0].report_data.site=d.sites[0].name;const rows=A.build(d),html=A.printHTML(rows,'2026-09-11','a');assert.match(html,/34,700円/);assert.match(html,/費用別内訳/);assert.match(html,/日別内訳/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(A.printHTML(rows,'テスト','c'),/記録なし/);
});
console.log(count+' automatic ledger checks passed');
