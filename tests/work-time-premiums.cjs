'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const W=require('../docs/work-time.js'),H=require('../docs/usage-hours.js'),S=require('../docs/site-financial-summary.js'),T=require('../docs/dispatch-travel.js');
let count=0;const test=(name,f)=>{f();count++;console.log('PASS',name);};
const settings=(x={})=>({version:1,nextDay:false,holiday:false,breaks:W.standardBreaks(),overtimeMultiplier:1.3,...x});
const site={id:'a',name:'Site A'},other={id:'b',name:'Site B'};
function data(start='08:00',end='23:00',s=settings()){
 const shift=W.classify(start,end,s),premium=shift.premium;
 return {sites:[site,other],reports:[{id:'r',site_id:'a',report_date:'2026-09-11',updated_at:'2026-09-11T10:00:00Z',report_data:{site:site.name,start,end,workTime:s,overtime:premium.overtimeMinutes/60,workers:['Worker'],meikenCount:0,asahiCount:0,vehicles:[],machines:[],items:[],fuels:[],usageHours:{version:1,entries:[{kind:'labor',label:'Worker',quantity:1,allocations:[{site:site.name,minutes:shift.minutes,premium}]}]}}}],laborRates:[{code:'own',label:'Worker',kind:'own',day_rate:18000,half_rate:9000,city_per_vehicle:0}],vehicleRates:[],equipmentRates:[],toolRates:[],attachmentRates:[],transportRates:[],laborSheets:[],vehicleSheets:[],equipmentSheets:[]};
}
test('standard three breaks count 120 minutes and clip to the recorded shift',()=>{
 const a=W.classify('08:00','17:00',settings());assert.equal(a.minutes,420);assert.equal(a.breakMinutes,120);
 const b=W.classify('13:00','17:00',settings());assert.equal(b.minutes,210);assert.equal(b.breakMinutes,30);
 const c=W.classify('10:15','10:45',settings());assert.equal(c.minutes,15);assert.equal(c.breakMinutes,15);
});
test('a custom 90-minute break leaves 5 hours 30 minutes for the confirmed window',()=>{
 const r=W.classify('10:00','17:00',settings({breaks:[{start:'12:00',end:'13:00'},{start:'15:00',end:'15:30'}]}));assert.equal(r.minutes,330);
});
test('overtime ends at 22:00 and night overrides overtime without stacking',()=>{
 const r=W.classify('08:00','23:00',settings());assert.equal(r.minutes,780);assert.equal(r.premium.overtimeMinutes,300);assert.equal(r.premium.nightMinutes,60);assert.equal(r.premium.holidayNightMinutes,0);assert.equal(W.weighted(r.minutes,r.premium).minutes,900);
 assert.equal(S.analyze(data(),site).categories.labor.value,33750);
 assert.equal(S.analyze(data(),site).partial,false);
});
test('next-day night ends at 05:00 including an overnight break',()=>{
 const r=W.classify('21:00','06:00',settings({nextDay:true,breaks:[{start:'23:30',end:'00:30'}]}));assert.equal(r.minutes,480);assert.equal(r.premium.overtimeMinutes,60);assert.equal(r.premium.nightMinutes,360);assert.equal(r.premium.holidayNightMinutes,0);
 const h=W.classify('22:00','05:00',settings({nextDay:true,holiday:true}));assert.equal(h.minutes,420);assert.equal(h.premium.holidayNightMinutes,420);assert.equal(h.premium.nightMinutes,0);assert.equal(h.premium.overtimeMinutes,0);assert.equal(W.weighted(h.minutes,h.premium).minutes,672);
});
test('break overlaps are a union and invalid or over-24-hour shifts remain unknown',()=>{
 const x=W.classify('12:00','14:00',settings({breaks:[{start:'12:00',end:'13:00'},{start:'12:30',end:'13:30'}]}));assert.equal(x.breakMinutes,90);
 for(const [a,b,s] of [['22:00','05:00',settings()],['08:00','09:00',settings({nextDay:true})],['xx','17:00',settings()],['08:00','17:00',settings({breaks:[{start:'10:00',end:'10:00'}]})]])assert.ok(W.classify(a,b,s).issue);
});
test('missing overtime multiplier withholds just the overtime part and keeps a warning',()=>{
 const d=data('08:00','23:00',settings({overtimeMultiplier:null,holiday:undefined})),r=S.analyze(d,site);
 assert.equal(r.categories.labor.value,19125);assert.equal(r.partial,true);assert.ok(r.warnings.some(x=>x.includes('残業倍率が未選択')));
 const one=data('17:00','18:00',settings({overtimeMultiplier:1.25}));assert.equal(S.analyze(one,site).categories.labor.value,2812.5);
});
test('invalid premium minutes cannot exceed or double count actual time',()=>{
 const p={overtimeMinutes:60,nightMinutes:60,holidayNightMinutes:0,overtimeMultiplier:1.3};assert.ok(W.premiumError(60,p));
 for(const change of [{nightMinutes:-1},{nightMinutes:NaN},{nightMinutes:'60'},{overtimeMultiplier:9}])assert.ok(W.premiumError(480,{...p,...change}));
 const d=data();d.reports[0].report_data.usageHours.entries[0].allocations[0].premium.nightMinutes=1000;assert.equal(S.analyze(d,site).partial,true);assert.equal(S.analyze(d,site).categories.labor.value,0);
});
test('site-specific premiums allocate once and different premium copies conflict',()=>{
 const d=data(),e=d.reports[0].report_data.usageHours.entries[0];e.allocations=[{site:site.name,minutes:420,premium:{overtimeMinutes:0,nightMinutes:0,holidayNightMinutes:0,overtimeMultiplier:1.3}},{site:other.name,minutes:360,premium:{overtimeMinutes:300,nightMinutes:60,holidayNightMinutes:0,overtimeMultiplier:1.3}}];
 const a=S.analyze(d,site),b=S.analyze(d,other);assert.equal(a.categories.labor.value,15750);assert.equal(b.categories.labor.value,18000);assert.equal(a.categories.labor.value+b.categories.labor.value,33750);
 const copy=structuredClone(d.reports[0]);copy.id='copy';copy.site_id='b';copy.report_data.site=other.name;copy.report_data.usageHours.entries[0].allocations[1].premium.overtimeMultiplier=1.25;d.reports.push(copy);assert.ok([...H.build(d).values()][0].errors.some(x=>x.includes('異なります')));
});
test('saved costs and legacy reports do not receive new multipliers retroactively',()=>{
 const d=data();d.laborSheets=[{site_id:'a',work_date:'2026-09-11',entries:[],cost_total:0,revenue_total:0,source_reports:d.reports}];assert.equal(S.analyze(d,site).categories.labor.value,0);
 const old=data('08:00','17:00');delete old.reports[0].report_data.workTime;delete old.reports[0].report_data.usageHours;assert.equal(S.analyze(old,site).categories.labor.value,18000);assert.equal(W.report(old.reports[0].report_data),null);
});
test('vehicle charges and fuel do not receive human overtime or night multipliers',()=>{
 const d=data();d.vehicleRates=[{label:'Truck',code:'truck',daily_rate:24000}];const r=d.reports[0].report_data;r.vehicles=['Truck'];r.fuels=[{asset:'Truck',amount:2000,qty:10}];r.usageHours.entries.push({kind:'vehicle',label:'Truck',quantity:1,allocations:[{site:site.name,minutes:480,premium:{overtimeMinutes:480,nightMinutes:0,holidayNightMinutes:0,overtimeMultiplier:1.3}}]});const a=S.analyze(d,site);assert.equal(a.categories.vehicle.value,24000);assert.equal(a.expenses.fuel.value,2000);
});
test('administrator import preserves weighted minutes after manual override is cleared',()=>{
 const context={window:{ToyaUsageHoursEngine:H,ToyaDispatchTravelEngine:T,ToyaWorkTimeEngine:W},document:{readyState:'loading',addEventListener(){}},structuredClone};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../docs/labor-cost-admin.js'),'utf8'),context);
 const L=context.window.ToyaLaborEngine,d=data(),rows=L.fromTimedReports(d.reports,d.laborRates,site);assert.equal(rows[0].hourlyMinutes,780);assert.equal(rows[0].hourlyWeightedMinutes,900);assert.equal(L.calculate(rows[0]).total,33750);rows[0].manualLabor=null;assert.equal(L.calculate(rows[0]).total,33750);rows[0].manualLabor=0;assert.equal(L.calculate(rows[0]).total,0);
});
test('serialized report, line description and CSV columns retain night and holiday facts',()=>{
 const d=JSON.parse(JSON.stringify(data('22:00','05:00',settings({nextDay:true,holiday:true})).reports[0].report_data));assert.equal(W.report(d).premium.holidayNightMinutes,420);assert.match(W.describe(W.report(d).premium),/休日夜間 7時間（1.6倍）/);assert.deepEqual(W.exportColumns(d),['翌日','休日',0,420,0,420,1.3]);
});
test('known ordinary and holiday work choose 1.25 and 1.3 without changing night factors',()=>{
 for(const holiday of [false,true]){
  const s=settings({holiday,overtimeMultiplier:null}),d=data('17:00','23:00',s),r=S.analyze(d,site);
  const p=d.reports[0].report_data.usageHours.entries[0].allocations[0].premium;
  assert.equal(p.overtimeMultiplier,holiday?1.3:1.25);
  assert.equal(r.categories.labor.value,holiday?18225:17437.5);
  assert.equal(r.partial,false);
  assert.equal(p.nightMinutes,holiday?0:60);assert.equal(p.holidayNightMinutes,holiday?60:0);
  assert.equal(W.exportColumns(d.reports[0].report_data)[6],holiday?1.3:1.25);
  // Resolve a previously blank allocation from its explicit report day type.
  p.overtimeMultiplier=null;assert.equal(S.analyze(d,site).categories.labor.value,r.categories.labor.value);
 }
});
test('an explicit saved multiplier stays intact; an unknown day type remains pending',()=>{
 const p={overtimeMinutes:60,nightMinutes:0,holidayNightMinutes:0,overtimeMultiplier:1.3};
 assert.equal(W.resolvePremium(p,{holiday:false}).overtimeMultiplier,1.3);
 assert.equal(W.resolvePremium({...p,overtimeMultiplier:null},{}).overtimeMultiplier,null);
 assert.equal(W.overtimeFactor(false),1.25);assert.equal(W.overtimeFactor(true),1.3);
});
console.log('Passed',count,'working-time and premium tests');
