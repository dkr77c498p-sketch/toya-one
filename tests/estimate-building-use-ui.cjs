const assert=require('node:assert/strict');
const {setup,pause}=require('./project-business-ui.cjs');

(async()=>{
 const {dom,w,db}=await setup('admin',true),q=s=>w.document.querySelector(s);
 try{
  const set=(s,v)=>{const el=q(s);el.value=v;el.dispatchEvent(new w.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));};
  const reopen=id=>{q('#epNew').click();q('[data-ep-open="'+id+'"]').click();};
  const concreteRow=()=>[...w.document.querySelectorAll('[data-quote-row]')].find(r=>r.querySelector('[data-quote-key="label"]').value==='コンクリート処分費');
  const quantity=()=>concreteRow().querySelector('[data-quote-key="quantity"]').value;
  q('#epNew').click();set('#epJobName','用途の選択試験');set('#epCustomer','試験見積先');q('#epNextItems').click();
  assert.deepEqual([...q('#epAutoUse').options].filter(o=>!o.disabled).map(o=>o.textContent),['住宅','事務所','店舗','工場','倉庫','その他']);
  assert.equal(q('#epAutoUse').value,'residential');
  set('#epAutoKind','rc');set('#epAutoM2','300');set('#epAutoConcreteHaul','100');set('#epAutoConcreteDisposal','200');
  for(const [use,label] of [['shop','店舗'],['factory','工場'],['warehouse','倉庫'],['other','その他']]){
   set('#epAutoUse',use);assert.ok(q('#epAutoConcreteSummary').textContent.includes(label));
   q('#epAutoApply').click();assert.equal(quantity(),'491.4');
   q('#epSave').click();await pause();const saved=db.estimate_plans[0];
   assert.equal(saved.groups[0].auto_input.use,use);
   assert.equal(saved.groups[0].auto_input.concrete_reference.reference_use,'other');
   reopen(saved.id);assert.equal(q('#epAutoUse').value,use);assert.equal(quantity(),'491.4');
  }
  const saved=db.estimate_plans[0],amount=saved.calculation.total;
  saved.groups[0].auto_input.use='unknown';saved.groups[0].auto_draft.use='unknown';
  reopen(saved.id);
  assert.equal(q('#epAutoUse').value,'','旧用途未確認を別の用途に振り替えない');
  assert.equal(q('#epAutoUse').selectedOptions[0].textContent,'選択してください');
  assert.ok(![...q('#epAutoUse').options].some(o=>o.textContent==='用途未確認'));
  assert.equal(quantity(),'491.4','開くだけでは保存済み明細を変えない');
  q('#epSave').click();await pause();assert.equal(db.estimate_plans[0].calculation.total,amount);
  q('#epAutoApply').click();assert.equal(quantity(),'','用途未選択から住宅数量を自動採用しない');
  set('#epAutoUse','factory');q('#epAutoApply').click();assert.equal(quantity(),'491.4');
  console.log('PASS building uses: six choices, shared reference, saving/reopening and legacy unknown without recalculation');
 }finally{dom.window.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
