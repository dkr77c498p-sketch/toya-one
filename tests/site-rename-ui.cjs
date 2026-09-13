const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
const html='<!doctype html><html><head></head><body><main><select id="site"><option value="旧現場" selected>旧現場</option></select><div id="siteMoveEntries"><select class="sm-site"><option value="旧現場" selected>旧現場</option></select></div><div id="siteMaster"></div></main></body></html>';
const wait=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
 const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://toya.test/'}),w=dom.window,q=s=>w.document.querySelector(s);
 const db=[{id:'site-1',name:'旧現場',status:'active',completed_on:null,lifecycle_version:4}];
 const calls=[];let reportsRead=0;
 w.cloudProfile={id:'admin-1',company_id:'company-1',role:'admin',active:true};
 w.cloudSitesCache=[];w.cloudReportsCache=[{site:'旧現場'}];
 w.LS={sites:'sites'};const local={sites:['旧現場']};w.get=(k,d)=>structuredClone(local[k]||d);w.set=(k,v)=>{local[k]=structuredClone(v)};
 w.renderSelectors=()=>{};w.renderMasters=()=>{};w.renderHome=()=>{};
 w.cloudFetchReports=async()=>{reportsRead++;w.cloudReportsCache=[{site:'新現場'}];};
 w.confirm=()=>true;w.alert=()=>{};w.Element.prototype.scrollIntoView=()=>{};
 w.cloudClient={
  from(table){assert.equal(table,'sites');const query={select(columns){assert.match(columns,/lifecycle_version/);return this},eq(){return this},order(){return this},range(from,to){this.bounds=[from,to];return this},then(resolve,reject){const [from,to]=this.bounds;return Promise.resolve({data:structuredClone(db.slice(from,to+1)),error:null}).then(resolve,reject)}};return query},
  async rpc(name,args){calls.push([name,structuredClone(args)]);assert.equal(name,'toya_rename_shared_site');assert.equal(args.p_site_id,'site-1');assert.equal(args.p_expected_version,4);assert.equal(args.p_name,'新現場');Object.assign(db[0],{name:'新現場',lifecycle_version:5});return {data:structuredClone(db[0]),error:null};}
 };
 w.setInterval=()=>0;const timeout=w.setTimeout.bind(w);w.setTimeout=(fn,ms)=>timeout(fn,Math.min(ms,2));
 w.eval(fs.readFileSync(path.join(root,'docs/shared-site-master.js'),'utf8'));
 await wait(30);w.renderMasters();await wait(30);
 assert.equal(q('[data-ss-rename="site-1"]').textContent,'名前を変更');
 q('[data-ss-rename="site-1"]').click();q('#ssRenameName').value='新現場';q('#ssRenameName').dispatchEvent(new w.Event('input',{bubbles:true}));q('#ssRenameSave').click();
 await wait(50);
 assert.equal(calls.length,1,'rename RPC');
 assert.equal(db[0].name,'新現場','database fixture');
 assert.equal(q('#site').value,'新現場','open report site');
 assert.equal(q('.sm-site').value,'新現場','open movement entry');
 assert.deepEqual(local.sites,['新現場'],'legacy local site list');
 assert.ok(reportsRead>0,'report cache refreshed');
 assert.match(q('#siteMaster').textContent,/新現場/);
 assert.match(q('#siteMaster').textContent,/社員の画面にも反映/);
 w.cloudProfile.role='employee';w.renderMasters();assert.equal(q('[data-ss-rename]'),null);assert.match(q('#siteMaster').textContent,/管理者用/);
 await wait(20);dom.window.close();console.log('PASS administrator renames one shared site and keeps current selections connected');
})().catch(e=>{console.error(e);process.exitCode=1});
