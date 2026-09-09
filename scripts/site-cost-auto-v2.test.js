'use strict';
const assert = require('node:assert/strict');
const engine = require(process.argv[2]);
const site = {id:'site-1',name:'Test Site'};
const date='2026-09-01', timestamp='2026-09-08T00:00:00.001Z';
const base=()=>({reports:[],laborSheets:[],vehicleSheets:[],equipmentSheets:[],
 laborRates:[{code:'own_a',label:'Worker A',kind:'own',day_rate:18000,half_rate:9000,active:true},{code:'meiken',label:'明建',kind:'dispatch',day_rate:13000,half_rate:6500,city_per_vehicle:1000,active:true}],
 vehicleRates:[{code:'dump',label:'3tダンプ',daily_rate:15000,active:true},{code:'kei',label:'軽トラ',daily_rate:5000,active:true}],
 equipmentRates:[{code:'sk135_1',label:'SK135（1号機）',daily_rate:20000,active:true},{code:'sk55',label:'SK55',daily_rate:15000,active:true}]
});
const report=(id='r1', extra={}, overrides={})=>({id,site_id:site.id,report_date:date,recorder_name:'Worker A',updated_at:timestamp,report_data:{date,site:site.name,writer:'Worker A',workers:['Worker A'],meikenCount:0,asahiCount:0,start:'08:00',end:'17:00',vehicles:[],machines:[],items:[],fuels:[],...extra},...overrides});
const sheet=(kind,r, value, extra={})=>({id:'sheet',site_id:site.id,work_date:r.report_date,entries:[],source_reports:[{id:r.id,updated_at:r.updated_at}],cost_total:value,revenue_total:0,gross_total:value,fuel_deduction_total:0,net_total:value,review_warnings:[],...extra});
let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
test('empty data is not real zero',()=>assert.equal(engine.analyze(base(),site).hasData,false));
test('no daily save required for worker, vehicle and machine',()=>{
 const d=base();d.reports=[report('r1',{vehicles:['3tダンプ'],machines:[{name:'SK135（1号機）',hours:'8'}]})];
 const copy=JSON.stringify(d), a=engine.analyze(d,site);
 assert.equal(a.subtotal,53000);assert.equal(a.categories.labor.autoDates.length,1);assert.equal(a.categories.labor.savedDays,0);assert.equal(a.categories.vehicle.value,15000);assert.equal(a.categories.equipment.value,20000);assert.equal(JSON.stringify(d),copy);
});
test('exact case fuel subtraction and addition occurs once',()=>{
 const d=base();d.reports=[report('r1',{vehicles:['3tダンプ'],machines:['SK135（1号機）'],fuels:[{asset:'3tダンプ',type:'軽油',qty:16,unitPrice:139,amount:2224}]})];
 const a=engine.analyze(d,site);assert.equal(a.categories.vehicle.value,12776);assert.equal(a.expenses.fuel.value,2224);assert.equal(a.subtotal,53000);
});
test('saved values completely override automatic estimates',()=>{
 const d=base(),r=report('r1',{meikenCount:2,vehicles:['3tダンプ'],machines:['SK135（1号機）'],fuels:[{asset:'3tダンプ',type:'軽油',amount:2224}]});d.reports=[r];
 d.laborSheets=[sheet('labor',r,63000)];d.vehicleSheets=[sheet('vehicle',r,12776,{gross_total:15000,fuel_deduction_total:2224,entries:[{used:true,label:'3tダンプ'}]})];d.equipmentSheets=[sheet('equipment',r,20000)];
 const a=engine.analyze(d,site);assert.equal(a.subtotal,98000);assert.equal(a.categories.labor.autoDates.length,0);assert.equal(a.categories.labor.savedDays,1);
});
test('saved explicit zero is never replaced',()=>{
 const d=base(),r=report();d.reports=[r];d.laborSheets=[sheet('labor',r,0)];assert.equal(engine.analyze(d,site).subtotal,0);
});
test('same worker and assets in several daily reports charged once',()=>{
 const d=base();d.reports=[report('r1',{vehicles:['軽トラ'],machines:['SK55']}),report('r2',{vehicles:['軽トラ'],machines:['SK55SR']})];
 const a=engine.analyze(d,site);assert.equal(a.subtotal,38000);assert.equal(a.reportCount,2);assert.ok(a.warnings.length>0);
});
test('same record id is deduplicated without changing original',()=>{const d=base(),r=report();d.reports=[r,r];const a=engine.analyze(d,site);assert.equal(a.subtotal,18000);assert.equal(a.reportCount,1);});
test('same record id different version rejected',()=>{const d=base(),r=report();d.reports=[r,{...r,updated_at:'2026-09-09T01:00:00Z'}];assert.throws(()=>engine.analyze(d,site));});
test('names and equipment aliases normalized',()=>{
 const d=base();d.reports=[report('r1',{workers:['Worker　A'],machines:[{name:'SK55SR'}]})];assert.equal(engine.analyze(d,site).subtotal,33000);
});
test('unknown commute is not guessed from number of workers',()=>{
 const d=base();d.reports=[report('r1',{meikenCount:2})];const a=engine.analyze(d,site);assert.equal(a.subtotal,44000);assert.ok(a.warnings.some(x=>x.includes('通勤台数')));assert.equal(a.categories.labor.reviewDates.length,1);
});
test('different dispatch counts remain for review not doubled',()=>{const d=base();d.reports=[report('r1',{meikenCount:2}),report('r2',{meikenCount:3})];const a=engine.analyze(d,site);assert.equal(a.subtotal,18000);assert.ok(a.warnings.some(x=>x.includes('人数・勤務')));});
test('dispatch shown at two sites is not charged two full crews',()=>{
 const d=base();d.reports=[report('r1',{meikenCount:2}),report('r2',{workers:[],meikenCount:2},{site_id:'site-2'})];const a=engine.analyze(d,site);assert.equal(a.subtotal,18000);assert.ok(a.warnings.some(x=>x.includes('別班')));
});
test('same worker at multiple sites is withheld pending allocation',()=>{const d=base();d.reports=[report('r1'),report('r2',{}, {site_id:'site-2'})];assert.equal(engine.analyze(d,site).categories.labor.value,0);});
test('site moves do not create a second truck day',()=>{
 const d=base();d.reports=[report('r1',{vehicles:['3tダンプ'],siteMoves:[{site:'Other Site',vehicle:'3tダンプ'}]})];const a=engine.analyze(d,site);assert.equal(a.categories.vehicle.value,0);assert.equal(a.categories.labor.value,0);assert.ok(a.warnings.length);
});
test('machine appearing at several sites waits for allocation',()=>{const d=base();d.reports=[report('r1',{machines:['SK55']}),report('r2',{machines:['SK55']},{site_id:'site-2'})];assert.equal(engine.analyze(d,site).categories.equipment.value,0);});
test('missing rate is not silently zero cost',()=>{const d=base();d.reports=[report('r1',{vehicles:['Unknown Truck']})];const a=engine.analyze(d,site);assert.equal(a.categories.vehicle.value,0);assert.ok(a.warnings.some(x=>x.includes('単価')));});
test('short shift is not assumed full or half without agreement',()=>{const d=base();d.reports=[report('r1',{end:'12:00'})];assert.equal(engine.analyze(d,site).categories.labor.value,0);assert.ok(engine.analyze(d,site).warnings.some(x=>x.includes('短時間')));});
test('saved half-day takes precedence',()=>{const d=base(),r=report('r1',{end:'12:00'});d.reports=[r];d.laborSheets=[sheet('labor',r,9000)];assert.equal(engine.analyze(d,site).categories.labor.value,9000);});
test('oversized fuel gives negative net not clamped and summed once',()=>{
 const d=base();d.reports=[report('r1',{workers:[],machines:['SK135（1号機）'],fuels:[{asset:'SK135（1号機）',type:'軽油',amount:23364}]})];
 const a=engine.analyze(d,site);assert.equal(a.categories.equipment.value,-3364);assert.equal(a.subtotal,20000);
});
test('vehicle fuel never subtracted from machine',()=>{
 const d=base();d.reports=[report('r1',{workers:[],vehicles:['3tダンプ'],machines:['SK55'],fuels:[{asset:'3tダンプ',type:'軽油',amount:3000},{asset:'SK55',type:'軽油',amount:4000},{asset:'SK55',type:'グリース',amount:1000}]})];
 const a=engine.analyze(d,site);assert.equal(a.categories.equipment.value,11000);assert.equal(a.categories.vehicle.value,12000);assert.equal(a.subtotal,31000);
});
test('waste line price is already a total and missing stays review',()=>{
 const d=base();d.reports=[report('r1',{items:[{isWaste:true,name:'産廃：A',qty:100,unit:'kg',price:4950},{isWaste:true,name:'産廃：B',qty:1,unit:'台',price:''}]})];
 const a=engine.analyze(d,site);assert.equal(a.expenses.waste.value,4950);assert.equal(a.expenses.waste.missing,1);assert.equal(a.subtotal,22950);
});
test('saved report stale retains adjusted amounts and warns',()=>{const d=base(),r=report();d.reports=[r];d.laborSheets=[sheet('labor',r,18000,{source_reports:[{id:r.id,updated_at:'2026-01-01T00:00:00Z'}]})];const a=engine.analyze(d,site);assert.equal(a.categories.labor.value,18000);assert.equal(a.categories.labor.staleDates.length,1);});
test('unsaved report changes are reflected without creating sheets',()=>{const d=base();d.reports=[report()];assert.equal(engine.analyze(d,site).subtotal,18000);d.reports[0].report_data.vehicles=['軽トラ'];assert.equal(engine.analyze(d,site).subtotal,23000);assert.equal(d.vehicleSheets.length,0);});
test('different dates and full period agree',()=>{
 const d=base();d.reports=[report(),report('r2',{date:'2026-09-02'},{report_date:'2026-09-02'})];const a=engine.analyze(d,site);assert.equal(a.subtotal,36000);assert.equal(a.days.reduce((s,x)=>s+x.subtotal,0),a.subtotal);
});
test('invalid saved amount fails instead of showing zero',()=>{const d=base(),r=report();d.reports=[r];d.vehicleSheets=[sheet('vehicle',r,null)];assert.throws(()=>engine.analyze(d,site));});
test('period validation excludes invalid days',()=>{assert.throws(()=>engine.periodBounds('day','2026-02-30'));assert.equal(engine.periodBounds('month','2026-12').end,'2027-01-01');});
console.log(count+' tests passed');
