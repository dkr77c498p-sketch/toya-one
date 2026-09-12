'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const read=p=>fs.readFileSync(path.join(__dirname,'..','docs',p),'utf8');
const html=read('index.html');
const dom=new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'https://toya.test/',runScripts:'dangerously'});
const w=dom.window,q=s=>w.document.querySelector(s),qa=s=>Array.from(w.document.querySelectorAll(s));
const section=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const timers=[],errors=[];w.setTimeout=fn=>timers.push(fn);w.structuredClone=structuredClone;
w.$=q;w.$$=qa;w.editingReport=null;w.stagedPhotos=[];w.cloudProfile={id:'user',company_id:'company',role:'employee',active:true};
w.alert=m=>errors.push(m);w.confirm=()=>true;w.cloudSitesCache=[];w.isLegacyMacBucket=()=>false;w.restoreAttachmentChoices=()=>{};w.today=()=> '2026-09-12';
w.eval(section('const LS=','function today()')+'\nwindow.LS=LS;window.defaults=defaults;');
w.eval(section('function cloudHtml(v){','async function cloudSyncLocalReports'));
w.eval(section('function decimalPlaces(n){','function addLeaseAttachment'));
w.eval(section('function renderFuelVehicleChoices(){','function populateSiteSummarySelect'));
w.eval(section('function collect(){','async function saveReport(){'));
w.eval(section('async function exportCSV(){','const DAILY_REPORT_STAFF='));
w.eval(section('function applyCloudRoleUI(){','async function cloudRefreshSession(){'));
w.fillReportForm=d=>{q('#start').value=d.start;q('#end').value=d.end;};
const flush=()=>{let n=0;while(timers.length){timers.shift()();if(++n>100)throw Error('timer loop');}};
const change=(sel,value,event='input')=>{const e=q(sel);if(e.type==='checkbox')e.checked=value;else e.value=value;e.dispatchEvent(new w.Event(event,{bubbles:true}));flush();};
const visibleText=el=>{const clone=el.cloneNode(true);clone.querySelectorAll('[hidden],script,style').forEach(n=>n.remove());return clone.textContent+' '+Array.from(clone.querySelectorAll('[aria-label],input,select')).map(x=>(x.getAttribute('aria-label')||'')+' '+(x.value||'')).join(' ');};
const noRates=()=>{
 for(const selector of ['#workTimeCard','#uhCard','#uhInline-labor'])assert(!/1\.(?:25|3|5|6)倍|残業倍率|日額÷|時間単価/.test(visibleText(q(selector))),selector);
 assert.equal(q('.uh-inline [data-uh-premium="overtimeMultiplier"]'),null);
 assert.equal(q('#wtMultiplier').value,'');
};
let csv='';w.Blob=class{constructor(parts){csv=parts.join('');}};w.URL.createObjectURL=()=> 'blob:fixture';w.HTMLAnchorElement.prototype.click=function(){};
(async()=>{
 try{
  w.renderSelectors();q('#date').value=w.today();q('#site').appendChild(new w.Option('検証現場','検証現場'));q('#site').value='検証現場';
  const worker=q('input[name="worker"]');assert(worker);worker.checked=true;
  q('#start').value='17:00';q('#end').value='23:00';
  w.eval(read('work-time.js'));w.eval(read('usage-hours.js'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));flush();
  assert(q('#workTimeCard'));assert(q('#uhInline-labor .uh-row'));noRates();
  assert.equal(q('#overtime').value,'5');assert.equal(q('#wtNight').value,'1');
  let d=w.collect();assert.equal(d.workTime.overtimeMultiplier,1.25);
  let e=d.usageHours.entries.find(x=>x.kind==='labor');assert.equal(e.allocations[0].premium.nightMinutes,60);assert.equal(e.allocations[0].premium.overtimeMultiplier,1.25);
  assert(!/倍|残業倍率/.test(w.lineText(d)));assert.match(w.lineText(d),/夜間 1時間/);
  w.cloudReportsCache=[d];await w.exportCSV();assert(!csv.includes('残業倍率'));assert(!csv.includes('"1.25"'));
  assert.equal(csv.split('\n')[0].split(',').length,csv.split('\n')[1].split(',').length);
  console.log('PASS employee time fields, summaries, LINE/preview text and CSV contain no premium rates');

  change('#wtHoliday',true,'change');noRates();d=w.collect();
  assert.equal(d.workTime.overtimeMultiplier,1.3);assert.equal(q('#wtNight').value,'0');assert.equal(q('#wtHolidayNight').value,'1');
  e=d.usageHours.entries.find(x=>x.kind==='labor');assert.equal(e.allocations[0].premium.overtimeMultiplier,1.3);assert.equal(e.allocations[0].premium.holidayNightMinutes,60);
  change('.uh-inline [data-uh-day-type]','ordinary','change');
  change('.uh-inline [data-uh-premium="overtimeMinutes"]','90');
  d=w.collect();e=d.usageHours.entries.find(x=>x.kind==='labor');assert.equal(e.allocations[0].premium.overtimeMultiplier,1.25);assert.equal(e.allocations[0].premium.overtimeMinutes,90);
  noRates();console.log('PASS ordinary/holiday choices preserve the automatic factors and editable premium minutes');

  const saved=JSON.parse(JSON.stringify(d));w.fillReportForm(saved,'edit');flush();
  assert.deepEqual(JSON.parse(JSON.stringify(w.collect().usageHours)),saved.usageHours);noRates();
  w.cloudProfile.role='admin';w.applyCloudRoleUI();flush();
  assert.equal(q('#wtMultiplierWrap').hidden,false);assert.match(q('#wtMultiplier').value,/1.3倍/);
  assert(q('.uh-inline [data-uh-premium="overtimeMultiplier"]'));
  q('.uh-inline [data-uh-premium="overtimeMultiplier"]').focus();
  w.cloudReportsCache=[saved];await w.exportCSV();assert(csv.includes('残業倍率'));assert(csv.includes('"1.3"'));
  assert(!/倍/.test(w.lineText(saved)),'shared LINE text remains factual even when copied by admin');
  w.cloudProfile.role='employee';w.applyCloudRoleUI();flush();noRates();
  assert.deepEqual(JSON.parse(JSON.stringify(w.collect().usageHours)),saved.usageHours);
  w.cloudProfile.role='admin';w.cloudReportsCache=[];
  w.cloudFetchReports=async()=>{w.cloudProfile.role='employee';return [saved];};
  await w.exportCSV();assert(!csv.includes('残業倍率'),'an account change during a read must not retain administrator export columns');
  w.cloudProfile=null;w.applyCloudRoleUI();flush();noRates();
  assert.equal(errors.length,0);console.log('PASS draft round trip, administrator display and focused-field logout/role changes');
 }finally{dom.window.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
