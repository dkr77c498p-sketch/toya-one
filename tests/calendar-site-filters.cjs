'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,'..','docs',file),'utf8');
const html=read('index.html');
const dom=new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'https://toya.test/',runScripts:'dangerously'});
const w=dom.window,q=s=>w.document.querySelector(s);
const timers=[];w.setTimeout=fn=>timers.push(fn);w.setInterval=()=>0;
w.$=q;w.today=()=> '2026-09-12';w.cloudProfile=null;
w.recordViewMode='calendar';w.recordCalendarMonth='2026-09';w.recordSelectedDate='';w.recordCalendarPickedDate='';w.currentRecordsData=[];
w.cloudReportsCache=[{id:999,date:'2026-09-29',site:'削除済み現場',writer:'古い記録'}];
w.LS={reports:'reports'};w.get=()=>[{id:998,date:'2026-09-30',site:'ローカルだけの現場',writer:'古い記録'}];
w.cloudHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
w.eval(html.slice(html.indexOf('function setRecordView(mode){'),html.indexOf('async function renderRecords(){')));
// Exercise the actual late-installed site-move patches, which previously repainted all sites.
w.eval(read('midway.js'));
w.eval(read('site-move-filter-fix.js').split('/* TOYA_SMALL_TOOLS_MASTER_V1 */')[0]);
w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
timers.splice(0).forEach(fn=>fn());
const reports=[
 {id:1,date:'2026-09-01',site:'現場A',writer:'担当一',details:'解体'},
 {id:2,date:'2026-09-01',site:'現場B',writer:'担当二',details:'解体'},
 {id:3,date:'2026-09-02',site:'現場B',writer:'担当一',details:'整地'},
 {id:4,date:'2026-09-03',site:'現場A',writer:'担当二',details:'整地'},
 {id:5,date:'2026-09-04',site:'現場A',writer:'担当一',siteMoves:[{site:'移動先C',action:'積込'}]},
 {id:6,date:'2026-10-01',site:'現場A',writer:'担当一',details:'翌月'},
];
const day=date=>Array.from(w.document.querySelectorAll('.calendar-day')).find(b=>b.getAttribute('onclick')===`selectRecordDate('${date}')`);
const counts=()=>Object.fromEntries(Array.from(w.document.querySelectorAll('.calendar-day.has')).map(b=>[b.getAttribute('onclick').match(/'([^']+)'/)[1],Number(b.querySelector('.count').textContent.replace('件',''))]));
const change=(id,value,event='change')=>{q('#'+id).value=value;q('#'+id).dispatchEvent(new w.Event(event,{bubbles:true}));};
const reset=()=>{w.recordViewMode='calendar';w.recordSelectedDate='';w.recordCalendarPickedDate='';w.recordCalendarMonth='2026-09';for(const id of ['recordSearch','recordSiteFilter','recordWriterFilter','recordDateFrom','recordDateTo'])q('#'+id).value='';w.renderRecordBrowser(reports);};
try{
 reset();assert.equal(counts()['2026-09-01'],2);
 change('recordSiteFilter','現場A');
 assert.deepEqual(counts(),{'2026-09-01':1,'2026-09-03':1,'2026-09-04':1,'2026-10-01':1});
 day('2026-09-01').click();
 assert.match(q('#records').textContent,/現場A/);assert(!q('#records').textContent.includes('現場B'));
 assert.equal(counts()['2026-09-03'],1,'day selection retains the site-filtered month overview');
 change('recordSiteFilter','現場B');
 assert.deepEqual(counts(),{'2026-09-01':1,'2026-09-02':1});
 assert.match(q('#records').textContent,/現場B/);assert(!q('#records').textContent.includes('現場A'));
 day('2026-09-01').click();assert.equal(q('#recordDateFrom').value,'');assert.equal(w.recordSelectedDate,'');
 console.log('PASS site changes update marks, counts and selected-day reports; date tap toggles');

 reset();change('recordSiteFilter','現場A');change('recordWriterFilter','担当一');
 assert.equal(day('2026-09-03').classList.contains('has'),false);
 change('recordSearch','積込','input');assert.deepEqual(counts(),{'2026-09-04':1});
 change('recordSearch','存在しない内容','input');assert.deepEqual(counts(),{});
 reset();change('recordSiteFilter','移動先C');
 assert.equal(q('#recordSiteFilter').value,'移動先C','destination-only site selection survives option refresh');
 assert.deepEqual(counts(),{'2026-09-04':1});day('2026-09-04').click();assert.match(q('#records').textContent,/現場A/);
 console.log('PASS writer, search, empty results and moved-to site filters');

 reset();change('recordSiteFilter','現場A');day('2026-09-04').click();w.shiftRecordMonth(1);
 assert.equal(w.recordCalendarMonth,'2026-10');assert.equal(q('#recordDateFrom').value,'');
 assert.equal(day('2026-10-01').classList.contains('has'),true);
 assert.equal(q('#recordSiteFilter').value,'現場A');
 reset();change('recordDateFrom','2026-09-02');change('recordDateTo','2026-09-03');
 assert.deepEqual(counts(),{'2026-09-02':1,'2026-09-03':1});
 change('recordDateFrom','2026-09-03');assert.deepEqual(counts(),{'2026-09-03':1},'manual single date remains a date filter');
 assert.match(q('#records').textContent,/現場A/);
 w.setRecordView('list');assert.equal(q('#records .record-title').textContent,'2026-09-03　現場A');
 console.log('PASS month navigation clears only the clicked-day restriction; explicit date bounds and list mode work');

 reset();w.renderRecordBrowser([]);w.rerenderRecordBrowser();assert.deepEqual(counts(),{});
 assert.equal(w.currentRecordsData.length,0,'empty loaded results never fall back to old cloud/local caches');
 reset();change('recordSiteFilter','');assert.equal(counts()['2026-09-01'],2);
 assert.equal(day('2026-09-29').classList.contains('has'),false);assert.equal(day('2026-09-30').classList.contains('has'),false);
 console.log('PASS empty refresh and all-site reset do not resurrect stale or deleted reports');
}finally{dom.window.close();}
