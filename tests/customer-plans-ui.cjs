const assert=require('node:assert/strict'),fs=require('node:fs'),{setup,pause}=require('./project-business-ui.cjs');
(async()=>{
 for(const plan of ['daily','billing','complete']){
  const {dom,w,calls}=await setup('admin',false,plan),q=s=>w.document.querySelector(s);
  try{
   w.eval(fs.readFileSync('docs/company-plan-ui.js','utf8'));await pause();
   assert(q('#companyPlanCard'));assert.equal(q('#pbNew').hidden,plan==='daily');assert.equal(!!q('#estimatePlanCard'),plan==='complete');
   assert(q('#pbCompanySave'),'company settings remain available');assert(q('#pbCompleteSave')===null||q('#pbCompletion').hidden===false);
   if(plan!=='complete')assert(!calls.some(c=>c[0]==='read'&&c[1]==='estimate_plans'),'lower tiers must not request estimates');
   const before=calls.length;const opened=await w.ToyaProjectBusiness.openEstimate({kind:'estimate',site_id:null,items:[]});if(plan!=='complete'){assert.equal(opened,false);assert.equal(calls.length,before);}
   q('#pbSite').value='site-1';q('#pbSite').dispatchEvent(new w.Event('change'));await pause();
   q('#pbNew').click();if(plan==='daily'){assert.equal(q('#pbEditor').children.length,0);assert.match(q('#pbStatus').textContent,/プラン/);}else assert(q('#pbFields'));
   w.cloudProfile=null;w.document.dispatchEvent(new w.Event('toya-role-changed'));assert.equal(q('#companyPlanCard'),null);
  }finally{w.close();}
 }
 console.log('PASS plan UI: daily/billing/complete entry points, common company settings, blocked programmatic document entry, no lower-tier estimate requests, and logout cleanup');
})().catch(e=>{console.error(e);process.exitCode=1});
