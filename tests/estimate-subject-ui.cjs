const assert=require('node:assert/strict');
const {setup,pause}=require('./project-business-ui.cjs');
const C=require('../docs/estimate-plan-engine.js');

(async()=>{
 const {dom,w,db,calls}=await setup('admin',true),q=s=>w.document.querySelector(s);
 const name='家屋内部残置物撤去工事',title=name+' 見積';
 const plan={...C.quoteDraft(null),id:'legacy-title',site_name:name,title,customer_name:'試験見積先',
  created_at:'2026-09-17T00:00:00Z',updated_at:'2026-09-18T06:17:00Z',
  groups:[{name:'残置物撤去工事',lines:[],quote_lines:[{label:'残置物撤去工事',quantity:'1',unit:'式',quote_price:'263000'}]}]};
 plan.calculation=C.calculate(plan);db.estimate_plans.push(plan);
 try{
  q('#epReload').click();await pause();await pause();
  q('[data-ep-open="legacy-title"]').click();
  assert.equal(q('#epJobName').value,name);assert.equal(q('#epTitle').value,name,'旧下書きの再開でも自動追加分を引き継がない');
  assert.equal(db.estimate_plans[0].title,title,'開いただけでは保存内容を書き換えない');
  q('#epCreateQuote').click();await pause();await pause();
  assert.equal(db.project_documents[0].subject,name);assert.equal(q('#pbSubject').value,name);
  q('#pbEditBreakdown').click();await pause();
  q('#epTitle').value=title;q('#epTitle').dispatchEvent(new w.Event('input',{bubbles:true}));
  q('#epCreateQuote').click();await pause();await pause();
  assert.equal(db.project_documents.at(-1).subject,title,'明示的に入力した件名はそのまま保存する');
  assert.equal(q('#pbSubject').value,title);
  assert.ok(!calls.some(([name])=>/toya_void|delete|toya_issue/.test(name)));
  console.log('PASS reopening old estimate titles, no read-time writes, saving exact construction name and preserving explicit custom titles');
 }finally{dom.window.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
