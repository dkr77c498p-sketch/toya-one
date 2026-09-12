'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const read=name=>fs.readFileSync(path.join(__dirname,'..','docs',name),'utf8');
const html=read('index.html');
const section=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const session={user:{id:'employee-a',email:'employee@example.test'}};
const employee={id:'employee-a',company_id:'company-a',name:'検証社員',role:'employee',active:true};
const reports=[{id:'report-a',report_date:'2026-09-12',site:'検証現場',attachments:['発電機'],leaseAttachments:[{name:'リース工具',company:'検証リース'}]}];
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {resolve,promise};};
function fixture(){
 const dom=new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'https://toya.test/',runScripts:'dangerously',pretendToBeVisual:true});
 const w=dom.window,q=s=>w.document.querySelector(s),calls=[],timeouts=new Map();
 let authHandler=()=>({data:{session},error:null}),profileHandler=()=>({data:employee,error:null}),reportHandler=()=>({data:reports,error:null});
 let authListener,inAuthCallback=false,timerId=1000000;
 const nativeTimeout=w.setTimeout.bind(w),nativeClear=w.clearTimeout.bind(w);
 w.setTimeout=(fn,ms,...args)=>{if(ms!==15000)return nativeTimeout(fn,ms,...args);const id=++timerId;timeouts.set(id,()=>fn(...args));return id;};
 w.clearTimeout=id=>{if(timeouts.has(id))timeouts.delete(id);else nativeClear(id);};
 w.$=q;w.$$=s=>Array.from(w.document.querySelectorAll(s));w.LS={attachments:'fixture'};w.get=()=>[];
 w.cloudProfile=null;w.cloudReportsCache=[];w.cloudPhotoCount={};w.cloudProfilesCache={};w.cloudSitesCache=[];w.activityOpenedLogged=false;
 w.cloudMsg=(message,kind)=>{q('#cloudStatus').textContent=message;q('#cloudStatus').dataset.kind=kind||'';};
 w.cloudLogActivity=async()=>{};w.cloudFetchReports=async()=>[];w.cloudLoadActivity=()=>{};
 w.renderHome=()=>{};w.renderRecords=()=>{};w.renderMasters=()=>{};
 w.cloudClient={
  auth:{
   getSession(){assert(!inAuthCallback,'no Supabase call inside the auth callback');calls.push({type:'auth'});return Promise.resolve().then(authHandler);},
   onAuthStateChange(fn){authListener=fn;return {data:{subscription:{unsubscribe(){}}}};}
  },
  from(table){
   assert(!inAuthCallback,'no Supabase call inside the auth callback');
   const req={type:table,filters:[]};
   const builder={select(fields){req.fields=fields;return builder;},eq(k,v){req.filters.push([k,v]);return builder;},order(){return builder;},range(a,b){req.range=[a,b];return builder;},single(){return builder;},then(resolve,reject){calls.push(req);return Promise.resolve().then(()=>table==='profiles'?profileHandler(req):reportHandler(req)).then(resolve,reject);}};
   return builder;
  }
 };
 const run=source=>{const script=w.document.createElement('script');script.textContent=source;w.document.body.append(script);};
 run(section('function applyCloudRoleUI(){','async function cloudLogin(){'));
 run(read('attachment-usage.js'));
 run(section('function renderAttachments(){','function addAttachment(){'));
 run(html.split('\n').find(line=>line.startsWith("$$('nav button').forEach(")));
 w.installCloudSessionListener();
 const f={w,q,calls,timeouts,close:()=>dom.window.close(),
  auth:handler=>authHandler=handler,profile:handler=>profileHandler=handler,reports:handler=>reportHandler=handler,
  emit(event,value){inAuthCallback=true;try{authListener(event,value);}finally{inAuthCallback=false;}},
  open(){q('nav [data-page="attachmentPage"]').click();},
  async done(){for(let i=0;i<50;i++){await tick();if(q('#attachmentPage').getAttribute('aria-busy')!=='true')return;}throw Error('usage request did not finish: '+q('#attachmentUsageStatus').textContent+' '+JSON.stringify(calls));},
  async count(value){for(let i=0;i<50;i++){await tick();if(q('#attachmentCount').textContent===value&&q('#attachmentPage').getAttribute('aria-busy')!=='true')return;}throw Error('expected count '+value+': '+q('#attachmentUsageStatus').textContent);},
  reads(){return calls.filter(c=>c.type==='daily_reports');}
 };
 return f;
}
(async()=>{
 let f=fixture();
 try{
  f.q('#details').value='入力中の日報を残す';
  const waiting=deferred();f.auth(()=>waiting.promise);f.open();
  const shared=f.w.cloudEnsureProfile();assert.strictEqual(shared,f.w.cloudEnsureProfile());
  await tick();assert.equal(f.calls.filter(c=>c.type==='auth').length,1);assert.equal(f.q('#attachmentCount').textContent,'—');
  waiting.resolve({data:{session},error:null});await shared;await f.count('1');
  assert.equal(f.q('#leasedAttachmentCount').textContent,'1');assert.match(f.q('#attachmentList').textContent,/発電機.*最終使用日：2026-09-12.*使用現場：検証現場/);
  assert.equal(f.q('#attachmentUsageLogin').hidden,true);assert.equal(f.q('#details').value,'入力中の日報を残す');
  assert.deepEqual(f.reads()[0].filters,[['company_id','company-a']]);assert(!f.reads()[0].fields.includes('*'));
  console.log('PASS opening usage restores a persisted session, shares auth requests, reads scoped usage and preserves the draft');
 }finally{f.close();}

 f=fixture();
 try{
  f.auth(()=>({data:{session:null},error:null}));f.open();await f.done();
  assert.equal(f.q('#attachmentCount').textContent,'—');assert.equal(f.reads().length,0);assert.equal(f.q('#attachmentUsageLogin').hidden,false);
  f.q('#attachmentUsageLogin').click();assert(f.q('#homePage').classList.contains('active'));assert.equal(f.w.document.activeElement,f.q('#cloudEmail'));
  f.auth(()=>({data:{session},error:null}));f.emit('SIGNED_IN',session);await f.count('1');
  assert(f.q('#attachmentPage').classList.contains('active'));assert.equal(f.q('#attachmentUsageLogin').hidden,true);
  f.reports(()=>({data:[],error:null}));f.q('#attachmentUsageRefresh').click();await f.count('0');
  assert.match(f.q('#attachmentList').textContent,/まだありません/);
  console.log('PASS signed-out state has a working login action, returns to usage after sign-in and shows 0 only for a successful empty read');
 }finally{f.close();}

 f=fixture();
 try{
  f.auth(()=>({data:{session:null},error:new Error('接続できませんでした')}));f.open();await f.done();
  assert.equal(f.q('#attachmentCount').textContent,'—');assert.match(f.q('#attachmentUsageStatus').textContent,/接続できません/);assert.equal(f.reads().length,0);
  f.auth(()=>({data:{session},error:null}));f.profile(()=>({data:null,error:new Error('network')}));f.q('#attachmentUsageRefresh').click();await f.done();
  assert.match(f.q('#attachmentUsageStatus').textContent,/社員情報を取得できません/);assert.equal(f.q('#attachmentUsageLogin').hidden,true);
  f.profile(()=>({data:{...employee,active:false},error:null}));f.q('#attachmentUsageRefresh').click();await f.done();
  assert.equal(f.w.cloudProfile,null);assert.match(f.q('#attachmentUsageStatus').textContent,/利用登録を確認/);assert.equal(f.reads().length,0);
  f.profile(()=>({data:employee,error:null}));f.q('#attachmentUsageRefresh').click();await f.count('1');
  f.reports(()=>({data:null,error:new Error('usage network')}));f.q('#attachmentUsageRefresh').click();await f.done();
  assert.equal(f.q('#attachmentCount').textContent,'—');assert.equal(f.q('#attachmentList').children.length,0);assert.match(f.q('#attachmentUsageStatus').textContent,/読み込めません/);
  f.reports(()=>({data:reports,error:null}));f.w.dispatchEvent(new f.w.Event('online'));await new Promise(r=>setTimeout(r,120));await f.count('1');
  console.log('PASS connection, profile, inactive-account and report errors do not become zero counts; retry and network recovery work');
 }finally{f.close();}

 f=fixture();
 try{
  const waiting=deferred();f.auth(()=>waiting.promise);f.open();await tick();
  f.emit('SIGNED_OUT',null);await f.done();
  assert.equal(f.q('#attachmentUsageLogin').hidden,false);assert.equal(f.q('#attachmentCount').textContent,'—');
  waiting.resolve({data:{session},error:null});await tick();await tick();assert.equal(f.w.cloudProfile,null);assert.equal(f.reads().length,0);
  f.auth(()=>({data:{session},error:null}));const oldProfile=deferred();f.profile(()=>oldProfile.promise);f.q('#attachmentUsageRefresh').click();await tick();
  const nextSession={user:{id:'employee-b',email:'other@example.test'}};
  f.auth(()=>({data:{session:nextSession},error:null}));f.profile(()=>({data:{...employee,id:'employee-b',company_id:'company-b'},error:null}));
  f.reports(()=>({data:[{id:'b',report_date:'2026-09-12',site:'別会社の検証現場',attachments:['別の機材']}],error:null}));
  f.emit('SIGNED_IN',nextSession);await f.count('1');
  oldProfile.resolve({data:employee,error:null});await tick();await tick();
  assert.equal(f.w.cloudProfile.id,'employee-b');assert.match(f.q('#attachmentList').textContent,/別の機材/);assert(!f.q('#attachmentList').textContent.includes('発電機'));
  assert(f.reads().every(r=>r.filters[0][1]==='company-b'));
  console.log('PASS logout cancels pending session recovery and switching accounts discards an old profile response without cross-company reads');
 }finally{f.close();}

 f=fixture();
 try{
  const waiting=deferred();f.auth(()=>waiting.promise);f.open();await tick();assert.equal(f.timeouts.size,1);
  [...f.timeouts.values()].forEach(fn=>fn());await f.done();
  assert.match(f.q('#attachmentUsageStatus').textContent,/タイムアウト/);assert.equal(f.q('#attachmentUsageRefresh').disabled,false);assert.equal(f.q('#attachmentCount').textContent,'—');
  f.auth(()=>({data:{session},error:null}));f.q('#attachmentUsageRefresh').click();await f.count('1');
  waiting.resolve({data:{session:null},error:null});await tick();assert.equal(f.q('#attachmentCount').textContent,'1');
  const before=f.calls.length;f.emit('TOKEN_REFRESHED',session);await tick();assert.equal(f.calls.length,before,'a healthy token refresh must not reload all reports');
  f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));await new Promise(r=>setTimeout(r,120));await f.count('1');assert(f.calls.length>before);
  console.log('PASS a stalled connection releases refresh controls, late responses are ignored and returning to the page rechecks the session');
 }finally{f.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
