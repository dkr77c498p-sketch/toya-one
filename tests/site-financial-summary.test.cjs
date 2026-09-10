'use strict';
// Synthetic data only. No customer records, account IDs or unit-price master values.
const assert = require('node:assert/strict');
const path = require('node:path');
const E = require(process.env.TOYA_SUMMARY_MODULE || path.resolve(__dirname, '../docs/site-financial-summary.js'));
const site = {id:'site-a',name:'テスト現場A'};
function fixture() {
  const report={id:'r1',site_id:site.id,report_date:'2026-09-08',updated_at:'2026-09-08T10:00:00.000+00:00',recorder_name:'テスト作業者',report_data:{site:site.name,workers:['作業者A'],vehicles:['試験車両'],machines:[{name:'試験重機',hours:8}],fuels:[{asset:'試験車両',type:'軽油',qty:16,unitPrice:139,amount:2224}],items:[]}};
  const source=[{id:report.id,updated_at:report.updated_at}];
  return {reports:[report],vehicleRates:[{label:'試験車両'}],equipmentRates:[{label:'試験重機'}],laborSheets:[],vehicleSheets:[{id:'v1',site_id:site.id,work_date:'2026-09-08',gross_total:15000,fuel_deduction_total:2224,net_total:12776,entries:[{label:'試験車両',used:true}],source_reports:source,review_warnings:[]}],equipmentSheets:[{id:'e1',site_id:site.id,work_date:'2026-09-08',gross_total:20000,fuel_deduction_total:0,net_total:20000,entries:[{label:'試験重機',used:true}],source_reports:source,review_warnings:[]}]};
}
let n=0;
function test(name,fn){fn();n++;console.log('PASS',name);}
test('saved gross usage fee plus fuel exactly once; missing labor is pending',()=>{const x=E.analyze(fixture(),site);assert.equal(x.subtotal,37224);assert.deepEqual(x.categories.labor.reviewDates,['2026-09-08']);assert.equal(x.partial,true);assert.equal(x.categories.vehicle.value,15000);assert.equal(x.expenses.fuel.value,2224);});
test('saved labor includes transport, outgoing revenue never adds to cost',()=>{const d=fixture();d.laborSheets=[{id:'l1',site_id:site.id,work_date:'2026-09-08',cost_total:63000,revenue_total:18000,source_reports:d.vehicleSheets[0].source_reports}];const x=E.analyze(d,site);assert.equal(x.subtotal,100224);assert.equal(x.categories.labor.revenue,18000);assert.equal(x.partial,false);});
test('contract and outgoing labor revenue form sales, profit and margin',()=>{const d=fixture();d.revenues=[{id:'contract-1',site_id:site.id,revenue_type:'contract',amount:100000,updated_at:'2026-09-10T00:00:00Z'}];d.laborSheets=[{id:'l1',site_id:site.id,work_date:'2026-09-08',cost_total:63000,revenue_total:18000,source_reports:d.vehicleSheets[0].source_reports}];const x=E.analyze(d,site);assert.equal(x.contractAmount,100000);assert.equal(x.outgoingRevenue,18000);assert.equal(x.sales,118000);assert.equal(x.profit,17776);assert.equal(x.profitMargin,15.06);});
test('missing contract never treats sales or profit as zero',()=>{const x=E.analyze(fixture(),site);assert.equal(x.contractAmount,null);assert.equal(x.sales,null);assert.equal(x.profit,null);assert.equal(x.profitMargin,null);});
test('saved zero contract remains distinct from missing contract',()=>{const d=fixture();d.revenues=[{id:'contract-1',site_id:site.id,revenue_type:'contract',amount:0}];const x=E.analyze(d,site);assert.equal(x.contractAmount,0);assert.equal(x.sales,0);assert.equal(x.profit,-37224);assert.equal(x.profitMargin,null);});
test('multiple site contract rows abort instead of double counting sales',()=>{const d=fixture();d.revenues=[{id:'contract-1',site_id:site.id,revenue_type:'contract',amount:1},{id:'contract-2',site_id:site.id,revenue_type:'contract',amount:2}];assert.throws(()=>E.analyze(d,site),/複数/);});
test('unknown item amount appears in actionable review list',()=>{const d=fixture();d.reports[0].report_data.items=[{isWaste:true,qty:1,unit:'台',price:''}];const x=E.analyze(d,site);assert.equal(x.expenses.waste.missing,1);assert.equal(x.partial,true);assert.ok(x.warnings.some(t=>t.includes('2026-09-08：処分費の金額を確認できません')));});
test('explicit item zero is a recorded zero',()=>{const d=fixture();d.reports[0].report_data.items=[{isWaste:true,qty:1,unit:'台',price:0}];assert.equal(E.analyze(d,site).expenses.waste.missing,0);});
test('expense price is a line total, never qty multiplied again',()=>{const d=fixture();d.reports[0].report_data.items=[{isWaste:true,qty:100,unit:'kg',price:4950},{name:'材料',price:900}];const x=E.analyze(d,site);assert.equal(x.expenses.waste.value,4950);assert.equal(x.expenses.other.value,900);assert.equal(x.subtotal,43074);});
test('missing fuel with no quantity/rate is pending without reducing usage fee',()=>{const d=fixture();d.reports[0].report_data.fuels=[{asset:'試験車両',type:'軽油',qty:16}];const x=E.analyze(d,site);assert.equal(x.expenses.fuel.missing,1);assert.equal(x.categories.vehicle.value,15000);assert.equal(x.subtotal,35000);assert.ok(x.warnings.some(t=>t.includes('2026-09-08：燃料・油脂の金額を確認できません')));});
test('fuel fallback and explicit zero',()=>{assert.equal(E.fuelAmount({qty:16,unitPrice:139}),2224);assert.equal(E.fuelAmount({amount:0,qty:16,unitPrice:139}),0);assert.equal(E.fuelAmount({amount:'bad',qty:16,unitPrice:139}),null);});
test('fuel above equipment fee remains a separate cost and never makes usage negative',()=>{const d=fixture();d.vehicleSheets=[];d.reports[0].report_data.vehicles=[];d.reports[0].report_data.fuels=[{asset:'試験重機',type:'軽油',amount:23364}];Object.assign(d.equipmentSheets[0],{fuel_deduction_total:23364,net_total:-3364});const x=E.analyze(d,site);assert.equal(x.categories.equipment.value,20000);assert.equal(x.expenses.fuel.value,23364);assert.equal(x.subtotal,43364);});
test('same report id deduplicated without mutating input',()=>{const d=fixture();d.reports.push(structuredClone(d.reports[0]));const before=JSON.stringify(d);assert.equal(E.analyze(d,site).subtotal,37224);assert.equal(JSON.stringify(d),before);});
test('racing report snapshot aborts rather than duplicate money',()=>{const d=fixture();d.reports.push({...d.reports[0],updated_at:'2026-09-08T10:01:00Z'});assert.throws(()=>E.analyze(d,site),/読込中/);});
test('same-writer distinct reports warn; do not delete field-move records',()=>{const d=fixture();d.reports.push({...structuredClone(d.reports[0]),id:'r2'});const x=E.analyze(d,site);assert.equal(x.reportCount,2);assert.ok(x.warnings.some(t=>t.includes('同じ記入者')));assert.ok(x.warnings.some(t=>t.includes('同じ給油')));});
test('stale saved costs preserve amounts and name date and category in review list',()=>{
  const d=fixture();
  d.laborSheets=[{site_id:site.id,work_date:'2026-09-08',cost_total:27000,revenue_total:0,source_reports:d.vehicleSheets[0].source_reports}];
  d.reports[0].updated_at='2026-09-08T11:00:00Z';
  const before=JSON.stringify(d),x=E.analyze(d,site);
  assert.equal(x.categories.vehicle.value,15000);assert.equal(x.categories.vehicle.staleDates.length,1);
  assert.equal(x.categories.labor.value,27000);assert.equal(x.partial,true);
  for(const label of ['人件費・常用費（交通費込）','車両使用料','重機使用料']) {
    assert.ok(x.warnings.some(t=>t.includes('2026-09-08：'+label)&&t.includes('保存時と最新の日報')&&t.includes('登録管理')));
  }
  assert.equal(JSON.stringify(d),before);
});
test('timestamp timezone normalization',()=>{assert.equal(E.signature([{id:'a',updated_at:'2026-09-08T10:00:00.123456+00:00'}]),E.signature([{id:'a',updated_at:'2026-09-08T19:00:00.123456+09:00'}]));assert.notEqual(E.signature([{id:'a',updated_at:'2026-09-08T10:00:00.123456Z'}]),E.signature([{id:'a',updated_at:'2026-09-08T10:00:00.123457Z'}]));});
test('saved zero distinct from missing sheet',()=>{const d=fixture();d.laborSheets=[{site_id:site.id,work_date:'2026-09-08',cost_total:0,revenue_total:0,source_reports:d.vehicleSheets[0].source_reports}];d.equipmentSheets=[];d.reports[0].report_data.machines=[];const x=E.analyze(d,site);assert.equal(x.categories.labor.savedDays,1);assert.equal(x.categories.labor.missingDates.length,0);assert.deepEqual(x.categories.labor.savedDates,['2026-09-08']);assert.deepEqual(x.categories.equipment.savedDates,[]);assert.deepEqual(x.categories.equipment.autoDates,[]);});
test('fresh saved movement adjustments are preserved without blanket warning',()=>{
  const d=fixture();
  d.reports[0].report_data.siteMoves=[{site:'テスト現場B',vehicle:'試験車両'}];
  d.laborSheets=[{site_id:site.id,work_date:'2026-09-08',cost_total:27000,revenue_total:0,source_reports:d.vehicleSheets[0].source_reports}];
  const before=JSON.stringify(d),x=E.analyze(d,site);
  assert.equal(x.subtotal,64224);assert.equal(x.partial,false);assert.deepEqual(x.warnings,[]);
  assert.equal(x.notes.length,1);assert.match(x.notes[0],/2026-09-08：現場移動の記録/);
  assert.equal(JSON.stringify(d),before);
});
test('same-date cost sheet duplication aborts',()=>{const d=fixture();d.vehicleSheets.push({...d.vehicleSheets[0],id:'v2'});assert.throws(()=>E.analyze(d,site),/複数/);});
test('legacy saved deduction and net fields never reduce the gross usage fee',()=>{const d=fixture();d.vehicleSheets[0].fuel_deduction_total=14999;d.vehicleSheets[0].net_total=1;const x=E.analyze(d,site);assert.equal(x.categories.vehicle.value,15000);assert.equal(x.expenses.fuel.value,2224);assert.equal(x.subtotal,37224);});
test('new automatic sheets keep gross usage and store no fuel deduction',()=>{const d=fixture();d.vehicleSheets=[];d.vehicleRates=[{label:'試験車両',daily_rate:15000,active:true}];const saved=E.automaticSheet('vehicle','2026-09-08',d,site,d.reports).sheet;assert.equal(saved.gross_total,15000);assert.equal(saved.fuel_deduction_total,0);assert.equal(saved.net_total,15000);const x=E.analyze(d,site);assert.equal(x.categories.vehicle.value,15000);assert.equal(x.expenses.fuel.value,2224);assert.equal(x.subtotal,37224);});
test('other-site costs excluded',()=>{const d=fixture();d.vehicleSheets.push({...d.vehicleSheets[0],site_id:'site-b',id:'v2'});assert.equal(E.analyze(d,site).subtotal,37224);});
test('incoming field move produces missing labor and vehicle; no copying fuel',()=>{const d=fixture();d.reports[0].site_id='site-b';d.reports[0].report_data.site='テスト現場B';d.reports[0].report_data.siteMoves=[{site:site.name,vehicle:'試験車両'}];d.vehicleSheets=[];d.equipmentSheets=[];const x=E.analyze(d,site);assert.equal(x.expenses.fuel.count,0);assert.equal(x.categories.vehicle.reviewDates.length,1);assert.equal(x.categories.labor.reviewDates.length,1);assert.ok(x.warnings.length);});
test('legacy manual fuel metadata is ignored instead of offsetting usage',()=>{const d=fixture();d.vehicleSheets[0].fuel_deduction_total=1000;d.vehicleSheets[0].net_total=14000;const x=E.analyze(d,site);assert.equal(x.categories.vehicle.value,15000);assert.equal(x.subtotal,37224);assert.ok(!x.warnings.some(t=>t.includes('差引額と日報')));});
test('no data is not certified zero',()=>{const x=E.analyze({reports:[]},site);assert.equal(x.hasData,false);});
test('lease and memo expense limits visible',()=>{const d=fixture();d.reports[0].report_data.leaseMachines=[{name:'リース重機',price:3000}];d.reports[0].report_data.memo='軽油35リッター';const x=E.analyze(d,site);assert.equal(x.subtotal,37224);assert.ok(x.warnings.some(t=>t.includes('リース')));assert.ok(x.warnings.some(t=>t.includes('メモ')));});
test('month and year boundaries; leap day',()=>{assert.deepEqual(E.periodBounds('month','2026-12'),{start:'2026-12-01',end:'2027-01-01'});assert.equal(E.periodBounds('day','2028-02-29').end,'2028-03-01');assert.throws(()=>E.periodBounds('day','2026-02-30'));assert.throws(()=>E.periodBounds('month','2026-13'));assert.deepEqual(E.periodBounds('all',''),{start:'',end:''});});
console.log(`${n} calculation/regression tests passed`);
