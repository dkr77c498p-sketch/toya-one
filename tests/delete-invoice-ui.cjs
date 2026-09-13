const assert=require('node:assert/strict');
const {setup,pause}=require('./project-business-ui.cjs');
(async()=>{
 const {dom,w,db,calls}=await setup('admin'),q=s=>w.document.querySelector(s);
 const set=(s,v)=>{q(s).value=v;q(s).dispatchEvent(new w.Event('input',{bubbles:true}));};
 const rpc=w.cloudClient.rpc.bind(w.cloudClient),from=w.cloudClient.from.bind(w.cloudClient);let fail=false,failRead=false,failList=false,release;
 w.cloudClient.from=table=>{
  const query=from(table),eq=query.eq,then=query.then;let byId=false,bySite=false;
  query.eq=function(k,v){if(k==='id')byId=true;if(k==='site_id')bySite=true;return eq.call(this,k,v);};
  query.then=function(resolve,reject){
   if(table==='project_documents'&&(byId&&failRead||bySite&&failList))return Promise.resolve({error:{message:'通信を確認して再度お試しください。'}}).then(resolve,reject);
   return then.call(this,resolve,reject);
  };return query;
 };
 w.cloudClient.rpc=async(name,p)=>{
  if(name!=='toya_delete_unissued_invoice')return rpc(name,p);
  calls.push([name,p]);if(fail)return {error:{message:'書類が更新されています。開き直してください。'}};
  await new Promise(resolve=>{release=resolve;});db.project_documents=db.project_documents.filter(d=>d.id!==p.p_id);return {data:p.p_id};
 };
 q('#pbSite').value='site-1';q('#pbSite').dispatchEvent(new w.Event('change'));await pause();
 q('#pbNew').click();assert.equal(q('#pbDeleteDoc'),null,'未保存は削除対象なし');
 set('#pbCustomer','サンプル宛先');set('#pbSubject','削除サンプル <test>');q('#pbSaveDoc').click();await pause();
 assert.ok(q('#pbDeleteDoc'));const id=db.project_documents[0].id,version=db.project_documents[0].updated_at,saved=JSON.stringify(db.project_documents[0]),saveCount=()=>calls.filter(x=>x[0]==='toya_save_project_document').length;
 const initialSaves=saveCount();set('#pbSubject','未保存の変更');assert.equal(q('#pbDeleteDoc').disabled,false,'未保存の変更があっても削除へ進める');
 q('#pbDeleteDoc').click();await pause();assert.ok(q('#pbDeleteConfirmation').open);assert.equal(w.document.activeElement,q('#pbDeleteCancel'));
 assert.match(q('#pbDeleteConfirmation').textContent,/サンプル宛先/);assert.match(q('#pbDeleteConfirmation').textContent,/110,000円/);
 assert.match(q('#pbDeleteConfirmation').textContent,/削除サンプル <test>/);assert.doesNotMatch(q('#pbDeleteConfirmation').textContent,/未保存の変更/);assert.match(q('#pbDeleteExplanation').textContent,/変更中の内容も破棄/);
 q('#pbDeleteCancel').click();await pause();assert.equal(db.project_documents.length,1);assert.equal(calls.filter(x=>x[0]==='toya_delete_unissued_invoice').length,0);
 assert.equal(JSON.stringify(db.project_documents[0]),saved);assert.equal(q('#pbSubject').value,'未保存の変更');assert.equal(saveCount(),initialSaves,'削除の確認・中止は保存しない');
 failRead=true;q('#pbDeleteDoc').click();await pause();assert.equal(q('#pbDeleteConfirmation'),null);assert.match(q('#pbDeleteStatus').textContent,/通信/);assert.equal(q('#pbDeleteDoc').disabled,false);failRead=false;
 Object.assign(db.project_documents[0],{subject:'別端末で保存した件名',updated_at:'server-v2'});
 fail=true;q('#pbDeleteDoc').click();await pause();assert.match(q('#pbDeleteConfirmation').textContent,/別端末で保存した件名/);q('#pbDeleteApprove').click();await pause();assert.equal(db.project_documents.length,1);assert.ok(q('#pbDeleteDoc'));assert.match(q('#pbDeleteStatus').textContent,/更新/);assert.equal(q('#pbSubject').value,'未保存の変更');
 fail=false;failList=true;q('#pbReload').click();await pause();assert.match(q('#pbStatus').textContent,/書類を確認できませんでした/);assert.equal(q('#pbDeleteDoc').disabled,false,'一覧の読み込みに失敗しても保存済みの書類を確認できる');
 q('#pbDeleteDoc').click();await pause();q('#pbDeleteApprove').click();await pause();assert.equal(q('#pbDeleteDoc').disabled,true);failList=false;
 release();await pause();await pause();assert.equal(db.project_documents.length,0);assert.equal(q('#pbEditor').textContent,'');assert.match(q('#pbStatus').textContent,/完全削除しました/);assert.equal(q('#pbNew').disabled,false,'削除後に一覧の読み込みを回復');assert.equal(saveCount(),initialSaves);
 const request=calls.filter(x=>x[0]==='toya_delete_unissued_invoice').at(-1)[1];assert.equal(request.p_id,id);assert.notEqual(request.p_expected_updated_at,version);assert.equal(request.p_expected_updated_at,'server-v2','確認画面で取得した保存内容の版を削除する');
 q('#pbNew').click();set('#pbCustomer','履歴確認');q('#pbSaveDoc').click();await pause();
 const row=db.project_documents[0];row.status='void';row.issued_at='2026-09-13T00:00:00Z';row.document_number='INV-2026-9999';
 q('#pbCloseEditor').click();q('#pbReload').click();await pause();
 const open=[...q('#pbDocuments').querySelectorAll('button')].find(b=>b.textContent.includes('開く'));open.click();assert.equal(q('#pbDeleteDoc'),null,'一度確定した取消は削除不可');
 q('#pbCloseEditor').click();row.issued_at=null;row.document_number=null;q('#pbReload').click();await pause();q('#pbDocuments button').click();assert.ok(q('#pbDeleteDoc'),'未確定の取消は削除可');
 row.status='issued';row.issued_at='2026-09-13T00:00:00Z';const deletesBefore=calls.filter(x=>x[0]==='toya_delete_unissued_invoice').length;
 q('#pbDeleteDoc').click();await pause();assert.equal(q('#pbDeleteConfirmation'),null);assert.match(q('#pbDeleteStatus').textContent,/確定済み/);assert.equal(calls.filter(x=>x[0]==='toya_delete_unissued_invoice').length,deletesBefore,'別端末で確定された書類は削除へ進めない');
 row.status='void';row.issued_at=null;q('#pbDeleteDoc').click();await pause();assert.ok(q('#pbDeleteConfirmation'));w.cloudProfile=null;w.applyCloudRoleUI();await pause();assert.equal(q('#pbDeleteConfirmation'),null,'ログアウトで確認を閉じる');
 dom.window.close();console.log('PASS deletion UI: unsaved changes, saved-record confirmation, cancellation, read/RPC errors, unavailable list recovery, exact ID/version, issued protection, logout');
})().catch(e=>{console.error(e);process.exitCode=1;});
