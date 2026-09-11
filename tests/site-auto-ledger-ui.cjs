'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.join(__dirname,'..'),S=require('../docs/site-financial-summary.js'),fixture=require('./site-auto-ledger-fixture.cjs');
const pause=()=>new Promise(r=>setTimeout(r,10));
async function waitFor(fn){for(let i=0;i<100;i++){if(fn())return;await pause();}assert.ok(fn(),'UI did not reach expected state');}
async function setup(role='admin',active=true){
 const dom=new JSDOM(fs.readFileSync(path.join(root,'docs/index.html'),'utf8'),{runScripts:'outside-only',url:'https://example.test/toya/',pretendToBeVisual:true}),w=dom.window,q=s=>w.document.querySelector(s),d=fixture();
 const db={sites:d.sites,estimate_plans:[],project_documents:[]};for(const [key,table] of S.sources)db[table]=d[key];
 const calls=[],intervals=[];let fail='';
 w.cloudProfile=role?{id:'synthetic-admin',role,active,company_id:'synthetic-company'}:null;
 w.cloudClient={from(table){const filters=[],query={select(){return this},eq(k,v){filters.push([k,v]);return this},order(){return this},range(from,to){this.bounds=[from,to];return this},then(resolve,reject){calls.push({table,filters});if(table===fail)return Promise.resolve({error:{message:'synthetic read failure'}}).then(resolve,reject);const rows=(db[table]||[]).filter(r=>filters.every(([k,v])=>k==='company_id'||r[k]===v));const [from,to]=this.bounds;return Promise.resolve({data:structuredClone(rows.slice(from,to+1)),error:null}).then(resolve,reject)}};return query},rpc(){throw Error('Automatic aggregation must never write data');}};
 w.ToyaSiteCostSummaryEngine=S;w.applyCloudRoleUI=()=>{};w.confirm=()=>true;w.Element.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.setInterval=fn=>{intervals.push(fn);return intervals.length};const timeout=w.setTimeout.bind(w);w.setTimeout=(fn,ms)=>timeout(fn,Math.min(ms,5));
 for(const file of ['project-documents-engine.js','estimate-plan-engine.js','estimate-auto-builder.js','estimate-plan-admin.js','site-auto-ledger.js'])w.eval(fs.readFileSync(path.join(root,'docs',file),'utf8'));
 await new Promise(r=>setTimeout(r,70));return {dom,w,q,db,calls,intervals,fail:table=>{fail=table;}};
}
(async()=>{
 for(const [role,active] of [[null,true],['employee',true],['admin',false]]){const s=await setup(role,active);assert.equal(s.q('#estimatePlanCard'),null);assert.equal(s.calls.length,0);s.dom.window.close();}console.log('PASS logged-out, employee and inactive users make no financial requests');
 const s=await setup(),{w,q,db,calls}=s;await waitFor(()=>q('#alRows .al-table tbody tr'));const baseline=JSON.stringify(db);
 assert.equal(q('#alRows').querySelectorAll('tbody tr').length,4);assert.equal(q('#epPlannedEstimates').open,false);assert.equal(q('#epEditor').textContent,'');assert.match(q('#alRows').textContent,/34,700円/);assert.match(q('#alStatus').textContent,/作成操作は不要/);assert.ok(calls.every(c=>c.filters.some(([k,v])=>k==='company_id'&&v==='synthetic-company')));console.log('PASS costs appear on login without creating any estimate; company filter applied');
 q('[data-al-site="a"]').click();assert.equal(q('#epSite').value,'a');assert.match(q('#epActualDetail').textContent,/完工済み/);assert.match(q('#epActualDetail').textContent,/65,300円/);assert.equal(q('#epPlannedEstimates').open,false);
 q('#alPrintSite').click();assert.match(q('#alPreview iframe').srcdoc,/費用別内訳/);assert.match(q('#alPreview iframe').srcdoc,/34,700円/);q('#alClosePrint').click();assert.equal(JSON.stringify(db),baseline);console.log('PASS completed-site detail and print need no data mutations');
 q('[data-al-site="c"]').click();assert.match(q('#epActualDetail').textContent,/記録がない費用を0円とは扱いません/);assert.equal(q('#alUseActual'),null);
 db.daily_reports.push({id:'new',site_id:'c',report_date:'2026-09-09',updated_at:'2026-09-09T10:00:00Z',report_data:{site:'予定テスト現場',items:[{name:'資材',price:1500}]}});q('#alRefresh').click();await waitFor(()=>!q('#alRefresh').disabled);assert.match(q('#epActualDetail').textContent,/48,500円/);console.log('PASS future site gains costs and profit when its first daily report arrives');
 db.sites.push({id:'e',name:'追加テスト現場',status:'active',completed_on:null});q('#alRefresh').click();await waitFor(()=>!q('#alRefresh').disabled);assert.ok([...q('#epSite').options].some(o=>o.value==='e'));q('[data-al-site="e"]').click();assert.match(q('#epActualDetail').textContent,/追加テスト現場/);console.log('PASS newly registered sites become selectable without reloading');
 q('[data-al-site="a"]').click();q('#alUseActual').click();assert.equal(q('#epPlannedEstimates').open,true);assert.ok(q('#epGroups').querySelectorAll('[data-ep-row]').length>=4);assert.match(q('#epTotals').textContent,/34,700円/);assert.equal(q('#epCreateQuote').disabled,true);assert.equal(q('#epOverhead').value,'');assert.equal(db.estimate_plans.length,0);
 q('#epTitle').value='入力途中の見積';q('#epTitle').dispatchEvent(new w.Event('input',{bubbles:true}));q('#alRefresh').click();await waitFor(()=>!q('#alRefresh').disabled);assert.equal(q('#epTitle').value,'入力途中の見積');console.log('PASS actual-reference draft remains unsaved, incomplete and intact across refresh');
 s.fail('daily_reports');q('#alRefresh').click();await waitFor(()=>!q('#alRefresh').disabled);assert.equal(q('#alRows').textContent,'');assert.equal(q('#epActualDetail').textContent,'');assert.match(q('#alStatus').textContent,/集計できませんでした/);assert.equal(q('#alPrintAll').disabled,true);console.log('PASS read failures remove stale financial numbers instead of showing zeros');
 s.fail('');q('#alRefresh').click();await waitFor(()=>!q('#alRefresh').disabled);q('#alPrintAll').click();assert.ok(q('#alPreview'));w.cloudProfile=null;s.intervals.forEach(fn=>fn());assert.equal(q('#estimatePlanCard'),null);assert.equal(q('#alPreview'),null);console.log('PASS logout clears financial content and open print preview');
 s.dom.window.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
