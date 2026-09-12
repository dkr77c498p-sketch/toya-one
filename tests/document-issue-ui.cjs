'use strict';
const assert=require('node:assert/strict');
const {setup,pause}=require('./project-business-ui.cjs');

async function invoice(){
 const s=await setup('admin'),w=s.w,q=sel=>w.document.querySelector(sel);
 const put=(sel,value)=>{q(sel).value=value;q(sel).dispatchEvent(new w.Event('input',{bubbles:true}));};
 q('#pbSite').value='site-1';q('#pbSite').dispatchEvent(new w.Event('change'));await pause();
 q('#pbNew').click();put('#pbCustomer','テスト請求先');put('#pbPrice0','727273');
 q('#pbSaveDoc').click();await pause();
 // Reproduce a browser that silently declines native confirmation dialogs.
 let nativeCalls=0;w.confirm=()=>{nativeCalls++;return false;};
 return {...s,q,put,nativeCalls:()=>nativeCalls,issues:()=>s.calls.filter(([name])=>name==='toya_issue_project_document')};
}

(async()=>{
 const s=await invoice(),{q,w}=s,saved=JSON.stringify(s.db.project_documents[0]);
 assert.equal(q('#pbIssueDoc').disabled,false);
 q('#pbIssueDoc').click();q('#pbIssueDoc').click();
 assert.equal(w.document.querySelectorAll('#pbIssueConfirmation').length,1);
 assert.match(q('#pbIssueConfirmation').textContent,/テスト請求先/);
 assert.match(q('#pbIssueConfirmation').textContent,/800,000円/);
 assert.equal(s.nativeCalls(),0);assert.equal(s.issues().length,0);
 q('#pbIssueCancel').click();await pause();
 assert.equal(q('#pbIssueConfirmation'),null);assert.equal(JSON.stringify(s.db.project_documents[0]),saved);
 assert.equal(w.document.activeElement,q('#pbIssueDoc'));
 q('#pbIssueDoc').click();q('#pbIssueConfirmation').dispatchEvent(new w.Event('cancel',{cancelable:true}));await pause();
 assert.equal(q('#pbIssueConfirmation'),null);assert.equal(s.issues().length,0);

 const original=w.cloudClient.rpc.bind(w.cloudClient);let release;
 w.cloudClient.rpc=async(name,p)=>{
  if(name==='toya_issue_project_document')await new Promise(resolve=>{release=resolve;});
  const r=await original(name,p);if(name==='toya_issue_project_document')r.data.document_number='INV-2026-0001';return r;
 };
 q('#pbIssueDoc').click();const approve=q('#pbIssueApprove');approve.click();approve.click();await pause();
 assert.equal(q('#pbIssueDoc').disabled,true);assert.match(q('#pbActionStatus').textContent,/確定しています/);
 assert.equal(s.db.project_documents[0].status,'draft');release();await pause();
 assert.equal(s.issues().length,1);assert.equal(s.issues()[0][1].p_id,s.db.project_documents[0].id);
 assert.equal(s.db.project_documents[0].status,'issued');assert.equal(s.db.project_documents[0].total,800000);
 assert.match(q('#pbEditor').textContent,/INV-2026-0001/);assert.equal(q('#pbFields').disabled,true);
 assert.equal(s.nativeCalls(),0);s.dom.window.close();
 console.log('PASS saved invoice confirmation, cancel, blocked native dialogs, one issue request and assigned number');

 const failed=await invoice(),f=failed.q,call=failed.w.cloudClient.rpc.bind(failed.w.cloudClient);let attempts=0;
 failed.w.cloudClient.rpc=async(name,p)=>name==='toya_issue_project_document'&&attempts++===0?{error:{message:'通信を確認してください'}}:call(name,p);
 f('#pbIssueDoc').click();f('#pbIssueApprove').click();await pause();
 assert.equal(failed.db.project_documents[0].status,'draft');assert.equal(f('#pbIssueDoc').disabled,false);
 assert.match(f('#pbActionStatus').textContent,/確定できませんでした.*通信/);
 f('#pbIssueDoc').click();f('#pbIssueApprove').click();await pause();
 assert.equal(failed.db.project_documents.length,1);assert.equal(failed.db.project_documents[0].status,'issued');failed.dom.window.close();
 console.log('PASS failed issue retains draft, shows the reason and retries without a duplicate document');

 const stale=await invoice(),sq=stale.q;
 sq('#pbIssueDoc').click();stale.put('#pbNotes','確認後に変更');sq('#pbIssueApprove').click();await pause();
 assert.equal(stale.issues().length,0);assert.match(sq('#pbActionStatus').textContent,/内容が変わりました/);
 sq('#pbSaveDoc').click();await pause();
 const isBusy=stale.w.ToyaEstimatePlanUI.isBusy;stale.w.ToyaEstimatePlanUI.isBusy=()=>true;
 sq('#pbIssueDoc').click();assert.match(sq('#pbActionStatus').textContent,/保存処理中/);assert.equal(sq('#pbIssueConfirmation'),null);
 stale.w.ToyaEstimatePlanUI.isBusy=isBusy;sq('#pbIssueDoc').click();assert.ok(sq('#pbIssueConfirmation'));
 stale.w.cloudProfile=null;stale.w.applyCloudRoleUI();await pause();
 assert.equal(sq('#pbIssueConfirmation'),null);assert.equal(stale.issues().length,0);stale.dom.window.close();
 console.log('PASS changed content, concurrent saves and logout cannot silently issue a stale document');

 const progress=await setup('admin'),pw=progress.w,pq=sel=>pw.document.querySelector(sel);
 pq('#pbSite').value='site-1';pq('#pbSite').dispatchEvent(new pw.Event('change'));await pause();
 pq('[data-pb-kind="progress"]').click();pq('#pbNew').click();
 for(const [sel,value] of [['#pbCustomer','出来高テスト先'],['#pbCumulative','50000']]){pq(sel).value=value;pq(sel).dispatchEvent(new pw.Event('input',{bubbles:true}));}
 pq('#pbSaveDoc').click();await pause();pw.confirm=()=>false;
 pq('#pbIssueDoc').click();assert.match(pq('#pbIssueConfirmation').textContent,/出来高請求書/);assert.match(pq('#pbIssueConfirmation').textContent,/55,000円/);
 pq('#pbIssueApprove').click();await pause();assert.equal(progress.db.project_documents[0].status,'issued');assert.equal(progress.db.project_documents[0].total,55000);progress.dom.window.close();
 console.log('PASS progress billing uses the same explicit confirmation with the current amount');
})().catch(e=>{console.error(e);process.exitCode=1});
