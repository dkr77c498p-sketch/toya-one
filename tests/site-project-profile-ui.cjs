const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {setup,pause}=require('./project-business-ui.cjs');
const root=path.join(__dirname,'..');
(async()=>{
 const f=await setup('admin'),{w,db,dom}=f,q=s=>w.document.querySelector(s);
 db.site_project_profiles=[];
 const baseRpc=w.cloudClient.rpc.bind(w.cloudClient),calls=[];
 w.cloudClient.rpc=async(name,args)=>{
  if(name!=='toya_save_site_project_profile')return baseRpc(name,args);
  calls.push(structuredClone(args));
  const saved={site_id:args.p_site_id,company_id:'c',...structuredClone(args.p_profile),updated_at:'profile-saved'};
  db.site_project_profiles=[saved];const contract=db.revenues.find(r=>r.site_id===args.p_site_id&&r.revenue_type==='contract');Object.assign(contract,{amount:args.p_contract_amount,updated_at:'contract-saved'});
  return {data:{profile:saved,contract:structuredClone(contract)},error:null};
 };
 w.eval(fs.readFileSync(path.join(root,'docs/site-project-profile-engine.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'docs/site-project-profile.js'),'utf8'));await pause();
 q('#pbSite').value='site-1';q('#pbSite').dispatchEvent(new w.Event('change',{bubbles:true}));await pause();await pause();
 assert.ok(q('#spProjectDetails'));assert.equal(q('#spContract').value,'100000');
 assert.equal(q('#spTotals .sp-warning'),null);assert.equal(q('#spTotals .sp-total'),null);assert.match(q('#spTotals').textContent,/請負金額のみでも保存できます/);
 q('#spFloorSqm').value='100';q('#spFloorSqm').dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(q('#spFloorTsubo').value,'30.25');
 q('#spContract').value='4000000';q('#spAddPhase').click();q('#spAddPhase').click();
 const rows=q('#spPhases').querySelectorAll('[data-sp-phase]');
 [['内部解体工事','2026-08','800000','complete'],['残工事','2026-09','3200000','planned']].forEach((values,i)=>{
  ['label','target_month','amount','status'].forEach((key,j)=>{const el=rows[i].querySelector('[data-sp-key="'+key+'"]');el.value=values[j];el.dispatchEvent(new w.Event('input',{bubbles:true}));});
  if(i===0)assert.match(q('#spTotals .sp-warning').textContent,/3,200,000/);
 });
 assert.match(q('#spTotals').textContent,/一致/);q('#spSave').click();await pause();await pause();
 assert.equal(calls.length,1);assert.equal(calls[0].p_contract_amount,4000000);assert.equal(calls[0].p_profile.floor_area_sqm,100);assert.equal(calls[0].p_profile.contract_breakdown[0].amount,800000);assert.equal(db.revenues[0].amount,4000000);assert.match(q('#spStatus').textContent,/保存しました/);
 console.log('PASS administrator stores site facts and monthly contract breakdown');
 q('[data-sp-remove="1"]').click();q('[data-sp-remove="0"]').click();
 q('#spContract').value='400000';q('#spContract').dispatchEvent(new w.Event('input',{bubbles:true}));
 assert.equal(q('#spTotals .sp-warning'),null);q('#spSave').click();await pause();await pause();
 assert.equal(calls.length,2);assert.equal(calls[1].p_contract_amount,400000);assert.equal(calls[1].p_profile.contract_breakdown.length,0);assert.equal(db.revenues[0].amount,400000);assert.equal(db.site_project_profiles[0].contract_breakdown.length,0);assert.match(q('#spStatus').textContent,/請負金額 ¥400,000（税別）を保存しました/);assert.equal(q('#spTotals .sp-warning'),null);
 console.log('PASS optional empty breakdown saves contract alone without a false difference warning; actual differences still show');
 const employee=await setup('employee');employee.w.eval(fs.readFileSync(path.join(root,'docs/site-project-profile-engine.js'),'utf8'));employee.w.eval(fs.readFileSync(path.join(root,'docs/site-project-profile.js'),'utf8'));await pause();assert.equal(employee.w.document.querySelector('#spProjectDetails'),null);console.log('PASS employees cannot see site contract details');
})().catch(e=>{console.error(e);process.exitCode=1});
