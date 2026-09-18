const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const engine=require('../docs/site-financial-summary.js'),fixture=require('./site-auto-ledger-fixture.cjs');
const monthly=require('../docs/company-monthly-summary.js');
const root=path.join(__dirname,'../docs/');
const pause=()=>new Promise(r=>setTimeout(r,30));
const until=async test=>{for(let n=0;n<60;n++){if(test())return;await pause();}assert.fail('UI did not settle');};
async function setup(role='admin'){
 const dom=new JSDOM(fs.readFileSync(root+'index.html','utf8'),{runScripts:'outside-only',url:'https://example.test',pretendToBeVisual:true}),w=dom.window;
 const realDate=w.Date;w.Date=class extends realDate{constructor(...a){super(...(a.length?a:['2026-09-18T06:00:00Z']));}static now(){return +new realDate('2026-09-18T06:00:00Z');}};
 w.cloudProfile={id:'admin',active:role!=='inactive',role:role==='inactive'?'admin':role,company_id:'company-a'};w.ToyaSiteCostSummaryEngine=engine;
 const data=fixture(),db={},calls=[],state={error:'',foreign:'',hold:false,waiting:[],clock:[]};
 data.documents=[{id:'invoice',site_id:'a',kind:'invoice',status:'issued',document_date:'2026-09-10',subtotal:130000}];data.profiles=[];
 data.contracts=structuredClone(data.revenues).map(r=>({...r,revenue_date:'2026-07-01'}));
 data.sites[0].name='<img src=x onerror=alert(1)>';
 data.reports[0].report_data.site=data.sites[0].name;
 for(const [key,table] of monthly.sources())db[table]=(data[key]||[]).map(r=>({...r,company_id:'company-a'}));
 w.cloudClient={from(table){const filters=[];let sort='id',start=0,end=499;return{select(){return this;},eq(k,v){filters.push(['eq',k,v]);return this;},gte(k,v){filters.push(['gte',k,v]);return this;},lt(k,v){filters.push(['lt',k,v]);return this;},order(k){sort=k;return this;},range(a,b){start=a;end=b;return this;},then(resolve,reject){
  calls.push({table,filters:structuredClone(filters),start,end});
  const response=()=>{let rows=(db[table]||[]).filter(r=>filters.every(([op,k,v])=>op==='eq'?r[k]===v:op==='gte'?r[k]>=v:r[k]<v)).sort((a,b)=>String(a[sort]).localeCompare(String(b[sort]))).slice(start,end+1);if(state.foreign===table)rows=[{id:'leak',company_id:'company-b'}];return{data:structuredClone(rows),error:state.error===table?{message:'denied'}:null};};
  return (state.hold?new Promise(r=>state.waiting.push(()=>r(response()))):Promise.resolve(response())).then(resolve,reject);
 }}}};
 w.setInterval=fn=>{state.clock.push(fn);return state.clock.length;};const timeout=w.setTimeout.bind(w);w.setTimeout=(fn,ms)=>timeout(fn,Math.min(ms,2));
 w.scrollTo=()=>{throw Error('Unexpected forced scrolling');};w.Element.prototype.scrollIntoView=()=>{throw Error('Unexpected forced scrolling');};
 w.document.querySelectorAll('nav [data-page]').forEach(b=>b.onclick=()=>{w.document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));w.document.getElementById(b.dataset.page).classList.add('active');});
 w.eval(fs.readFileSync(root+'usability.js','utf8'));w.eval(fs.readFileSync(root+'company-monthly-summary.js','utf8'));
 await pause();
 await until(()=>role!=='admin'||w.document.querySelector('#companyMonthlySummary')?.getAttribute('aria-busy')==='false');
 return{w,dom,db,calls,state,q:s=>w.document.querySelector(s)};
}
(async()=>{
 {
 const f=await setup(),{w,q}=f;
 const check=q('#cmSiteChoices input[data-site-id="a"]');assert(check.checked);
 check.checked=false;check.dispatchEvent(new w.Event('change'));
 assert.equal(q('#cmSales').textContent,'0円');assert.equal(q('#cmCost').textContent,'1,600円');
 assert.deepEqual(JSON.parse(w.localStorage.getItem('toya-monthly-excluded:company-a')),['a']);
 q('#cmRefresh').click();await until(()=>q('#companyMonthlySummary').getAttribute('aria-busy')==='false');
 assert.equal(q('#cmSiteChoices input[data-site-id="a"]').checked,false);assert.equal(q('#cmCost').textContent,'1,600円');
 assert.equal(q('#cmScope').textContent,'選択現場・税別');assert(!q('#cmSiteChoices img'));
 f.dom.window.close();console.log('PASS selected-site totals, persisted exclusions, escaped names and refresh');
 }

 for(const role of ['employee','inactive']){
  const f=await setup(role);assert.equal(f.q('#companyMonthlySummary'),null);assert.equal(f.calls.length,0);f.dom.window.close();
 }
 console.log('PASS employee/inactive profiles do not request or render company financial totals');
 const f=await setup(),{w,db,calls,state,q}=f;
 assert.equal(q('#cmSales').textContent,'130,000円');assert.equal(q('#cmCost').textContent,'36,300円');assert.equal(q('#cmProfit').textContent,'93,700円');
 assert.equal(q('#cmContract').textContent,'110,000円');assert.equal(q('.cm-metrics').children.length,4);assert.match(q('#cmContractInfo').textContent,/請負金未登録 1現場/);assert.equal(q('#cmBreakdown [data-label="請負金（全工期）"]').textContent,'100,000円');
 assert.equal(q('#homePage').firstElementChild.id,'uxDailyHome');assert.equal(q('#uxDailyHome').nextElementSibling.id,'companyMonthlySummary');
 assert.equal(q('#cmBreakdown img'),null);assert.ok(q('#cmBreakdown').textContent.includes('<img src=x onerror=alert(1)>'));
 assert.ok(calls.every(c=>c.filters.some(([op,k,v])=>op==='eq'&&k==='company_id'&&v==='company-a')));
 const monthRead=calls.find(c=>c.table==='project_documents');assert.ok(monthRead.filters.some(f=>f[0]==='gte'&&f[2]==='2026-09-01'));assert.ok(monthRead.filters.some(f=>f[0]==='lt'&&f[2]==='2026-10-01'));
 const contractRead=calls.find(c=>c.table==='revenues');assert.ok(contractRead.filters.some(f=>f[0]==='eq'&&f[1]==='revenue_type'&&f[2]==='contract'));assert.equal(contractRead.filters.some(f=>['gte','lt'].includes(f[0])),false);
 const late=w.document.createElement('section');late.id='lateHomeModule';q('#homePage').prepend(late);await pause();assert.equal(q('#uxDailyHome').nextElementSibling.id,'companyMonthlySummary');
 const input=q('#details');input.value='未保存の日本語入力';input.focus();const metrics=q('#cmSales');q('#cmDetails').open=true;
 q('#cmRefresh').click();await until(()=>q('#companyMonthlySummary').getAttribute('aria-busy')==='false');
 assert.equal(q('#cmSales'),metrics);assert.equal(q('#details'),input);assert.equal(input.value,'未保存の日本語入力');assert.equal(w.document.activeElement,input);assert.equal(q('#cmDetails').open,true);
 console.log('PASS scoped read-only fetch, escaped site names, stable home placement/focus/input/details with no scrolling');
 db.revenues.find(r=>r.site_id==='a').amount=120000;w.document.dispatchEvent(new w.CustomEvent('toya-site-project-profile-saved'));
 q('#cmRefresh').click();await until(()=>q('#companyMonthlySummary').getAttribute('aria-busy')==='false');assert.equal(q('#cmContract').textContent,'130,000円');assert.equal(q('#cmSales').textContent,'130,000円');assert.equal(q('#cmProfit').textContent,'93,700円');
 console.log('PASS saved contract updates reach the summary without changing invoiced sales or profit');

 db.project_documents=Array.from({length:1001},(_,n)=>({id:'page-'+String(n).padStart(4,'0'),company_id:'company-a',site_id:'a',kind:'invoice',status:'issued',document_date:'2026-09-10',subtotal:1}));
 q('#cmRefresh').click();await until(()=>q('#companyMonthlySummary').getAttribute('aria-busy')==='false');assert.equal(q('#cmSales').textContent,'1,001円');
 assert.ok(calls.some(c=>c.table==='project_documents'&&c.start===1000));
 db.project_documents.push({id:'aug',company_id:'company-a',site_id:'a',kind:'invoice',status:'issued',document_date:'2026-08-31',subtotal:2000});
 q('#cmMonth').value='2026-08';q('#cmMonth').dispatchEvent(new w.Event('change'));assert.equal(q('#cmSales').textContent,'—');await until(()=>q('#companyMonthlySummary').getAttribute('aria-busy')==='false');
 assert.equal(q('#cmSales').textContent,'2,000円');assert.equal(q('#cmCost').textContent,'—');assert.equal(q('#cmProfit').textContent,'—');assert.match(q('#cmTitle').textContent,/月別/);
 assert.equal(q('#cmContract').textContent,'120,000円');
 q('#cmThisMonth').click();await until(()=>q('#companyMonthlySummary').getAttribute('aria-busy')==='false');assert.equal(q('#cmMonth').value,'2026-09');assert.equal(q('#cmSales').textContent,'1,001円');
 console.log('PASS complete pagination beyond 1000 records and explicit month navigation without stale values');

 state.error='daily_reports';q('#cmRefresh').click();await until(()=>q('#companyMonthlySummary').getAttribute('aria-busy')==='false');assert.equal(q('#cmSales').textContent,'—');assert.match(q('#cmStatus').textContent,/集計できません/);
 assert.equal(q('#cmContract').textContent,'—');assert.equal(q('#cmContractInfo').textContent,'');
 state.error='';state.foreign='project_documents';q('#cmRefresh').click();await until(()=>q('#companyMonthlySummary').getAttribute('aria-busy')==='false');assert.equal(q('#cmSales').textContent,'—');assert.match(q('#cmStatus').textContent,/会社の記録/);
 state.foreign='';q('#cmRefresh').click();await until(()=>q('#companyMonthlySummary').getAttribute('aria-busy')==='false');
 w.document.dispatchEvent(new w.CustomEvent('toya-project-document-changed'));assert.match(q('#cmStatus').textContent,/記録が変わりました/);
 const oldCount=calls.length;await pause();assert.equal(calls.length,oldCount);
 q('nav [data-page="reportPage"]').click();q('nav [data-page="homePage"]').click();await until(()=>calls.length>oldCount&&q('#companyMonthlySummary').getAttribute('aria-busy')==='false');
 state.hold=true;q('#cmRefresh').click();await pause();w.document.dispatchEvent(new w.CustomEvent('toya-project-document-changed'));state.waiting.splice(0).forEach(resolve=>resolve());await pause();assert.match(q('#cmStatus').textContent,/記録が変わりました/);assert.equal(q('#cmRefresh').disabled,false);
 state.hold=false;q('#cmRefresh').click();await until(()=>q('#companyMonthlySummary').getAttribute('aria-busy')==='false');
 state.hold=true;q('#cmRefresh').click();await pause();w.cloudProfile=null;w.document.dispatchEvent(new w.CustomEvent('toya-role-changed'));assert.equal(q('#companyMonthlySummary'),null);
 state.waiting.splice(0).forEach(resolve=>resolve());await pause();assert.equal(q('#companyMonthlySummary'),null);
 w.cloudProfile={id:'other',company_id:'company-b',role:'admin',active:true};state.hold=false;w.document.dispatchEvent(new w.CustomEvent('toya-role-changed'));await until(()=>q('#companyMonthlySummary')?.getAttribute('aria-busy')==='false');assert.equal(q('#cmSales').textContent,'0円');assert.equal(q('#cmCost').textContent,'—');assert.equal(q('#cmBreakdown').textContent,'');
 assert.equal(q('#cmContract').textContent,'—');
 assert.ok(calls.slice(oldCount).some(c=>c.filters.some(f=>f[2]==='company-b')));
 f.dom.window.close();console.log('PASS fetch errors/mixed companies cannot masquerade as zero; in-flight logout and account switches discard previous company data');
})().catch(e=>{console.error(e);process.exitCode=1;});
