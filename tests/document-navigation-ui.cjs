const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {setup,pause}=require('./project-business-ui.cjs');
(async()=>{
 const f=await setup('admin'),{w,db,dom,calls}=f,q=s=>w.document.querySelector(s),scrolled=[];
 w.Element.prototype.scrollIntoView=function(){scrolled.push(this.id)};
 w.eval(fs.readFileSync(path.join(__dirname,'../docs/site-project-profile-engine.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(__dirname,'../docs/site-project-profile.js'),'utf8'));await pause();
 assert.equal(q('#pbHomeActions').parentElement.id,'homePage');
 assert.equal(q('#pbSiteSettings').open,false);
 assert.ok(q('#pbSiteSettings').contains(q('#spProjectDetails')));
 assert.ok(q('#pbDocuments').compareDocumentPosition(q('#pbSiteSettings'))&w.Node.DOCUMENT_POSITION_FOLLOWING);
 q('#pbHomeActions [data-pb-go="site"]').click();assert.equal(w.document.activeElement,q('#pbSite'));
 q('#pbSite').value='site-1';q('#pbSite').dispatchEvent(new w.Event('change',{bubbles:true}));await pause();await pause();
 assert.match(q('#pbDocuments').textContent,/試験現場の請求書はまだありません/);
 assert.match(q('#pbDocuments').textContent,/0件/);
 assert.match(q('#pbSettingsSite').textContent,/試験現場/);
 q('#pbHomeActions [data-pb-go="site"]').click();assert.equal(scrolled.at(-1),'pbSiteSettings');assert.equal(q('#pbSiteSettings').open,true);
 q('#pbHomeActions [data-pb-go="invoice"]').click();assert.equal(scrolled.at(-1),'projectBusinessCard');
 q('#pbNew').click();q('#pbCustomer').value='未保存の宛先';q('#pbCustomer').dispatchEvent(new w.Event('input',{bubbles:true}));
 const before=JSON.stringify(db),rpcCount=calls.filter(c=>c[0]!=='read').length;
 q('#pbHomeActions [data-pb-go="estimate"]').click();assert.equal(scrolled.at(-1),'estimatePlanCard');
 q('#epShowSaved').click();assert.equal(q('#epPlannedEstimates').open,true);assert.equal(q('#epQuotes').open,true);assert.equal(scrolled.at(-1),'epSavedPlans');
 q('#pbMasterLink [data-pb-go="invoice"]').click();assert.equal(q('#pbCustomer').value,'未保存の宛先');
 assert.equal(JSON.stringify(db),before);assert.equal(calls.filter(c=>c[0]!=='read').length,rpcCount);
 w.cloudProfile=null;w.applyCloudRoleUI();assert.equal(q('#pbHomeActions'),null);assert.equal(q('#pbMasterLink'),null);dom.window.close();
 for(const plan of ['daily','billing']){
  const p=await setup('admin',false,plan),d=p.w.document;
  assert.equal(d.querySelector('[data-pb-go="estimate"]'),null);
  if(plan==='daily'){assert.equal(d.querySelector('[data-pb-go="invoice"]'),null);assert.equal(d.querySelector('#pbDocuments').hidden,true);}
  p.dom.window.close();
 }
 const employee=await setup('employee');assert.equal(employee.w.document.querySelector('#pbHomeActions'),null);employee.dom.window.close();
 console.log('PASS direct navigation, selected-site empty state, collapsed site settings, no writes or lost drafts, plan/role isolation, logout');
})().catch(e=>{console.error(e);process.exitCode=1});
