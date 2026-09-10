'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const H=require('../docs/usage-hours.js'),S=require('../docs/site-financial-summary.js'),T=require('../docs/dispatch-travel.js');
const sites=[{id:'a',name:'Site A'},{id:'b',name:'Site B'},{id:'c',name:'Site C'}];
const rate={code:'meiken',kind:'dispatch',label:'明建',day_rate:12000,half_rate:6000,city_per_vehicle:800};
function report(i,q=2,allocations){const site=sites[i];return {id:'report-'+i,site_id:site.id,report_date:'2026-09-03',updated_at:'2026-09-03T10:00:00.123456Z',report_data:{site:site.name,start:'08:00',end:'17:00',workers:[],vehicles:[],machines:[],meikenCount:q,asahiCount:0,siteMoves:[],dispatchTravel:{meiken:{area:'city',vehicles:1,highway:0,manualTravel:null}},...(allocations?{usageHours:{version:1,entries:[{kind:'dispatch',label:'明建',quantity:q,travelSite:site.name,allocations}]}}:{})}};}
function confirmation(r,crew=r.site_id){return {id:'confirm-'+r.id,site_id:r.site_id,report_id:r.id,work_date:r.report_date,dispatch_code:'meiken',crew_key:crew,report_updated_at:r.updated_at};}
function data(reports,confirmed=true){return {reports,sites,laborRates:[rate],vehicleRates:[],equipmentRates:[],toolRates:[],attachmentRates:[],transportRates:[],laborSheets:[],vehicleSheets:[],equipmentSheets:[],dispatchCrews:confirmed?reports.map(r=>confirmation(r)):[]};}
let count=0;function test(name,fn){fn();count++;console.log('PASS',name);}
test('confirmed separate legacy crews retain each site headcount and travel',()=>{
  const d=data([report(0,2),report(1,3)]),before=JSON.stringify(d);
  const a=S.analyze(d,sites[0]),b=S.analyze(d,sites[1]);
  assert.equal(a.categories.labor.value,24800);assert.equal(b.categories.labor.value,36800);
  assert.equal(a.partial,false);assert.equal(b.partial,false);assert.equal(JSON.stringify(d),before);
});
test('unconfirmed, stale and duplicate confirmations cannot resolve an ambiguity',()=>{
  for(const mode of ['none','stale','duplicate']){
    const d=data([report(0),report(1)],mode!=='none');
    if(mode==='stale')d.reports[0].updated_at='2026-09-03T10:00:00.123457Z';
    if(mode==='duplicate')d.dispatchCrews.push({...d.dispatchCrews[0],id:'duplicate'});
    const x=S.analyze(d,sites[0]);assert.equal(x.partial,true);assert.equal(x.categories.labor.value,0);
  }
});
test('confirmation date, site, company code and exact timestamp must match',()=>{
  const r=report(0);
  for(const change of [{work_date:'2026-09-04'},{site_id:'b'},{dispatch_code:'asahi'},{report_updated_at:null}]){
    const d=data([r]);Object.assign(d.dispatchCrews[0],change);assert.equal(H.dispatchCrew(d,r,'明建'),'');
  }
  const d=data([r]);d.dispatchCrews[0].report_updated_at='2026-09-03T19:00:00.123456+09:00';assert.equal(H.dispatchCrew(d,r,'明建'),'a');
});
test('a separate crew stays local while the report records a vehicle move',()=>{
  const a=report(0),b=report(1);a.report_data.siteMoves=[{site:sites[1].name,action:'処分場へ運搬'}];
  const d=data([a,b]);assert.equal(S.analyze(d,sites[0]).categories.labor.value,24800);
  assert.equal(S.analyze(d,sites[1]).categories.labor.value,24800);
});
test('timed separate crews can join one destination and are both counted',()=>{
  const a=report(0,1,[{site:sites[0].name,minutes:120},{site:sites[2].name,minutes:360}]);
  const b=report(1,2,[{site:sites[1].name,minutes:240},{site:sites[2].name,minutes:240}]);
  const d=data([a,b]),results=sites.map(s=>S.analyze(d,s));
  assert.equal(results[0].categories.labor.value,3800);assert.equal(results[1].categories.labor.value,12800);assert.equal(results[2].categories.labor.value,21000);
  assert.equal(results.reduce((n,r)=>n+r.subtotal,0),37600);results.forEach(r=>assert.equal(r.partial,false));
  const context={window:{ToyaUsageHoursEngine:H,ToyaDispatchTravelEngine:T},document:{readyState:'loading',addEventListener(){}},structuredClone};vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../docs/labor-cost-admin.js'),'utf8'),context);
  const L=context.window.ToyaLaborEngine,rows=L.fromTimedReports(d.reports,[rate],sites[2],d.dispatchCrews);
  assert.equal(rows.length,1);assert.equal(rows[0].hourlyCrews.length,2);assert.equal(L.calculate(rows[0]).total,21000);
  rows[0].manualLabor=null;assert.equal(L.calculate(rows[0]).total,21000);
});
test('copies of one confirmed crew count once, conflicting copies stay pending',()=>{
  const a=report(0,2,[{site:sites[0].name,minutes:240},{site:sites[1].name,minutes:240}]);
  const b=structuredClone(a);b.id='copy';b.site_id='b';b.report_data.site=sites[1].name;
  const d=data([a,b]);d.dispatchCrews[1].crew_key='a';
  assert.equal(S.analyze(d,sites[0]).categories.labor.value,12800);assert.equal(S.analyze(d,sites[1]).categories.labor.value,12000);
  b.report_data.usageHours.entries[0].allocations[0].minutes=120;
  assert.equal(S.analyze(d,sites[0]).partial,true);assert.equal(S.analyze(d,sites[0]).categories.labor.value,0);
});
test('saved manual zero and missing travel are both preserved',()=>{
  const d=data([report(0),report(1)]);d.laborSheets=[{site_id:'a',work_date:'2026-09-03',entries:[],cost_total:0,revenue_total:0,source_reports:[d.reports[0]]}];
  assert.equal(S.analyze(d,sites[0]).categories.labor.value,0);
  delete d.reports[1].report_data.dispatchTravel;
  const b=S.analyze(d,sites[1]);assert.equal(b.categories.labor.value,24000);assert.equal(b.partial,true);assert.ok(b.warnings.some(w=>w.includes('通勤')));
});
console.log('Passed',count,'separate-crew regression tests');
