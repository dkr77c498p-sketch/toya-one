const fs=require('fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const {setup,pause}=require('./project-business-ui.cjs');
(async()=>{
 const u=await setup('admin');let scrolls=0;u.w.scrollTo=()=>scrolls++;u.w.eval(fs.readFileSync('docs/usability.js','utf8'));await pause();u.w.document.querySelector('nav [data-page="homePage"]').click();assert.equal(scrolls,0,'programmatic navigation must not force scroll');u.dom.window.close();
 const dom=new JSDOM('<section id="homePage" class="active"><div id="siteSummaryCard"><select id="siteSummarySelect"><option>試験現場</option></select><div id="siteSummaryBody"></div></div></section>',{runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,q=s=>w.document.querySelector(s),intervals=[];let reads=0;
 w.cloudProfile={id:'admin',role:'admin',active:true,company_id:'c'};
 w.cloudClient={from(table){return {select(){return this},eq(){return this},gte(){return this},lt(){return this},order(){return this},range(){return this},then(resolve){reads++;return Promise.resolve({data:table==='sites'?[{id:'s',name:'試験現場'}]:[],error:null}).then(resolve)}}}};
 w.today=()=> '2026-09-15';w.setInterval=(fn,ms)=>{intervals.push([fn,ms]);return intervals.length};w.clearInterval=()=>{};
 const timeout=w.setTimeout.bind(w);w.setTimeout=(fn,ms)=>timeout(fn,Math.min(ms,5));
 for(const [key,file] of [['ToyaDispatchCatalog','dispatch-catalog.js'],['ToyaUsageHoursEngine','usage-hours.js'],['ToyaDispatchTravelEngine','dispatch-travel.js'],['ToyaTransportEngine','equipment-transport.js']])w[key]=require('../docs/'+file);
 w.eval(fs.readFileSync('docs/site-financial-summary.js','utf8'));await pause();await pause();
 assert.ok(q('#sfResult').firstElementChild,q('#sfStatus').textContent);const node=q('#sfResult').firstElementChild,baseline=reads;
 for(const [fn,ms] of intervals)if(ms===60000)fn();w.dispatchEvent(new w.Event('pageshow'));w.document.dispatchEvent(new w.Event('visibilitychange'));await pause();
 assert.equal(q('#sfResult').firstElementChild,node);assert.equal(reads,baseline);
 q('#sfRefresh').click();assert.equal(q('#sfResult').firstElementChild,node);await pause();assert.ok(reads>baseline);assert.ok(q('#sfResult').firstElementChild);
 dom.window.close();console.log('PASS financial summary stays stable across timers/resume, explicit refresh works, programmatic nav does not scroll');
})().catch(e=>{console.error(e);process.exitCode=1});
