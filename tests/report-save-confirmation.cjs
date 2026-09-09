const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const code=fs.readFileSync(path.join(root,'scripts/report-save-confirmation-functions.js'),'utf8');
const html=fs.readFileSync(path.join(root,'docs/index.html'),'utf8');
const old={id:'report-a',company_id:'company-a',created_by:'user-a',updated_at:'2026-01-01T00:00:00Z',source_report_id:'local-a'};
const input=()=>({id:'local-a',cloudId:'report-a',cloudCreatedById:'user-a',date:'2026-01-01',site:'Site B',writer:'Worker A',workers:[],workTypes:[],details:'Work details',items:[],fuels:[],start:'08:00',end:'17:00'});
function setup(options={}){
 const calls=[];const profile={id:'user-a',company_id:'company-a',role:'employee',active:true,name:'Worker A',...options.profile};
 const target=options.target===undefined?old:options.target;
 const ctx={console,Date,JSON,Error,Object,Array,String,Number,Boolean,Map,Set,cloudProfile:profile,editingReport:null,stagedPhotos:[],window:{},
  today:()=> '2026-01-01',cloudWorkText:d=>d.details||'',cloudEnsureSite:async()=>{calls.push('site');return 'site-b';}};
 const client={auth:{getSession:async()=>({data:{session:{user:{id:options.sessionId||profile.id}}},error:null})},from(table){
  let mode='read',payload,filters=[];
  const req={select(){return this},eq(k,v){filters.push([k,v]);return this},is(k,v){filters.push([k,v]);return this},limit(){return this},update(v){mode='update';payload=v;return this},insert(v){mode='insert';payload=v;return this},
   then(resolve,reject){calls.push({table,mode,payload,filters});let result;
    if(mode==='read')result={data:filters.some(([k])=>k==='site_id')?[]:(target?[structuredClone(target)]:[]),error:null};
    else if(options.writeError)result={data:null,error:new Error('write failed')};
    else if(options.zero)result={data:[],error:null};
    else result={data:[{...structuredClone(payload),id:target?.id||'new-report',site_id:options.wrongSite?'unexpected-site':payload.site_id,updated_at:'2026-01-02T00:00:00Z'}],error:null};
    return Promise.resolve(result).then(resolve,reject);
   }};return req;
 }};ctx.cloudClient=client;vm.createContext(ctx);vm.runInContext(code,ctx);return {ctx,calls};
}
let total=0;async function test(name,fn){await fn();total++;console.log('PASS',name);}
(async()=>{
 await test('employee cannot edit another creator before any write',async()=>{const {ctx,calls}=setup({target:{...old,created_by:'user-b'}});await assert.rejects(ctx.cloudSaveReport(input()),/本人か管理者/);assert(!calls.some(c=>c.mode==='update'||c==='site'));});
 await test('owner can change site on the same report',async()=>{const {ctx,calls}=setup();const r=await ctx.cloudSaveReport(input());assert.equal(r.id,old.id);assert.equal(r.verified,true);const w=calls.find(c=>c.mode==='update');assert(w);assert(w.filters.some(([k,v])=>k==='id'&&v===old.id));assert.equal(w.payload.site_id,'site-b');assert.equal(w.payload.report_data.site,'Site B');assert.equal(w.payload.created_by,'user-a');});
 await test('administrator may edit without taking ownership',async()=>{const {ctx,calls}=setup({profile:{id:'admin-a',role:'admin'}});const r=await ctx.cloudSaveReport(input());assert.equal(r.verified,true);assert.equal(calls.find(c=>c.mode==='update').payload.created_by,'user-a');});
 await test('zero updated rows never means success',async()=>{const {ctx}=setup({zero:true});await assert.rejects(ctx.cloudSaveReport(input()),/保存を確認できません/);});
 await test('write errors remain errors',async()=>{const {ctx}=setup({writeError:true});await assert.rejects(ctx.cloudSaveReport(input()),/write failed/);});
 await test('returned site must match the requested site',async()=>{const {ctx}=setup({wrongSite:true});await assert.rejects(ctx.cloudSaveReport(input()),/一致しません/);});
 await test('deleted edit target is not inserted as another report',async()=>{const {ctx,calls}=setup({target:null});await assert.rejects(ctx.cloudSaveReport(input()),/見つかりません/);assert(!calls.some(c=>c.mode==='insert'));});
 await test('legacy report uses cloud id even with no source id',async()=>{const {ctx,calls}=setup({target:{...old,source_report_id:null}});await ctx.cloudSaveReport(input());assert.equal(calls.filter(c=>c.mode==='update').length,1);assert.equal(calls.filter(c=>c.mode==='insert').length,0);});
 await test('stale edit revision is not overwritten',async()=>{const {ctx,calls}=setup();await assert.rejects(ctx.cloudSaveReport({...input(),cloudUpdatedAt:'2025-01-01T00:00:00Z'}),/編集中に更新/);assert(!calls.some(c=>c.mode==='update'));});
 await test('update includes concurrency revision filter',async()=>{const {ctx,calls}=setup();await ctx.cloudSaveReport(input());assert(calls.find(c=>c.mode==='update').filters.some(([k,v])=>k==='updated_at'&&v===old.updated_at));});
 await test('session and profile mismatch is rejected',async()=>{const {ctx,calls}=setup({sessionId:'user-b'});await assert.rejects(ctx.cloudSaveReport(input()),/ログイン/);assert.equal(calls.length,0);});
 await test('input object is not modified by cloud save',async()=>{const {ctx}=setup(),d=input(),before=JSON.stringify(d);await ctx.cloudSaveReport(d);assert.equal(JSON.stringify(d),before);});
 await test('new own report still inserts and verifies',async()=>{const {ctx,calls}=setup({target:null}),d=input();delete d.cloudId;const r=await ctx.cloudSaveReport(d);assert.equal(r.inserted,true);assert.equal(r.verified,true);assert.equal(calls.filter(c=>c.mode==='insert').length,1);});
 await test('employee buttons permit only their own record',async()=>{const {ctx}=setup();assert.equal(ctx.cloudCanEditReport({cloudCreatedById:'user-a'}),true);assert.equal(ctx.cloudCanEditReport({cloudCreatedById:'user-b'}),false);assert.equal(ctx.cloudCanEditReport({}),false);});
 await test('administrator buttons still permit other records',async()=>{const {ctx}=setup({profile:{id:'admin-a',role:'admin'}});assert.equal(ctx.cloudCanEditReport({cloudCreatedById:'user-b'}),true);});
 const save=html.slice(html.indexOf('async function saveReport(){'),html.indexOf('const PHOTO_CATEGORIES'));
 await test('save rejection leaves form, draft and photos unchanged',async()=>{
  const {ctx}=setup({target:{...old,created_by:'user-b'}});const events=[],button={disabled:false};
  Object.assign(ctx,{collect:()=>input(),validate:()=>true,$:()=>button,savePhotosForReport:async()=>{events.push('photos');return 0;},set:()=>events.push('local-write'),showStatus:m=>events.push(m),cloudMsg:()=>{},alert:m=>events.push(m),clearReportEditState:()=>events.push('clear'),stagedPhotos:[{name:'photo'}]});
  vm.runInContext(save,ctx);await ctx.saveReport();assert(!events.includes('local-write'));assert(!events.includes('photos'));assert(!events.includes('clear'));assert.equal(ctx.stagedPhotos.length,1);assert.equal(button.disabled,false);assert(events.some(e=>e.includes('本人か管理者')));
 });
 await test('database zero-row response never logs success or navigates',async()=>{
  const {ctx}=setup({zero:true});const events=[],button={disabled:false};
  Object.assign(ctx,{collect:()=>input(),validate:()=>true,$:()=>button,savePhotosForReport:async()=>0,get:()=>[],set:(k)=>events.push('set-'+k),LS:{reports:'reports',draft:'draft'},populateLedgerSites:()=>{},localStorage:{removeItem:()=>{}},renderStagedPhotos:()=>{},showStatus:m=>events.push(m),cloudMsg:()=>{},alert:()=>{},clearReportEditState:()=>events.push('clear'),cloudLogActivity:()=>events.push('log'),cloudSyncPhotosForReport:()=>events.push('syncPhotos'),setTimeout:()=>events.push('navigate')});
  vm.runInContext(save,ctx);await ctx.saveReport();assert(events.includes('set-draft'));assert(!events.includes('log'));assert(!events.includes('syncPhotos'));assert(!events.includes('clear'));assert(!events.includes('navigate'));assert(events.some(e=>e.includes('保存を完了できません')));
 });
 await test('confirmed save alone logs success and permits navigation',async()=>{
  const {ctx}=setup();const events=[],button={disabled:false};let locals=[];
  Object.assign(ctx,{collect:()=>input(),validate:()=>true,$:()=>button,savePhotosForReport:async()=>0,get:()=>locals,set:(k,v)=>{if(k==='reports')locals=v;},LS:{reports:'reports',draft:'draft'},populateLedgerSites:()=>{},localStorage:{removeItem:()=>{}},renderStagedPhotos:()=>{},showStatus:m=>events.push(m),cloudMsg:()=>{},alert:m=>events.push('ALERT '+m),clearReportEditState:()=>events.push('clear'),cloudLogActivity:async(t)=>events.push('log-'+t),cloudSyncPhotosForReport:async()=>({ok:0,ng:0}),cloudSyncWasteForReport:async()=>({ok:0,ng:0}),cloudLoadReports:()=>{},setTimeout:()=>events.push('navigate')});
  vm.runInContext(save,ctx);await ctx.saveReport();assert(events.includes('log-report_save'));assert(events.includes('clear'));assert(events.includes('navigate'));assert(!events.some(e=>e.startsWith('ALERT')));assert.equal(locals[0].cloudId,'report-a');assert.equal(locals[0].site,'Site B');
 });
 await test('duplicate saves are blocked while busy',async()=>{const {ctx}=setup();let collected=false;ctx.window.__toyaReportSaveBusy=true;ctx.collect=()=>{collected=true;};vm.runInContext(save,ctx);await ctx.saveReport();assert.equal(collected,false);});
 await test('returned JSON equality ignores key ordering but not content',async()=>{const {ctx}=setup();assert(ctx.cloudReportDataEqual({a:1,b:2},{b:2,a:1}));assert(!ctx.cloudReportDataEqual({a:1},{a:2}));});
 await test('UI labels other reports read-only and preserves view action',async()=>{assert(html.includes('閲覧のみ（変更は登録者本人・管理者）'));assert(html.includes('日報詳細を見る'));assert(html.includes("if(!cloudCanEditReport(d))return alert('この日報を変更できるのは登録した本人か管理者です。')"));});
 console.log('Passed',total,'isolated report-save checks. No real database requests.');
})().catch(e=>{console.error(e);process.exit(1);});
