const assert=require('node:assert/strict');
const {setup,pause}=require('./project-business-ui.cjs');
const E=require('../docs/project-documents-engine.js'),C=require('../docs/estimate-plan-engine.js');
(async()=>{
 const {dom,w,db,calls}=await setup('admin'),q=s=>w.document.querySelector(s);
 const p={...C.quoteDraft(db.sites[0]),id:'plan-rename',company_id:'c',customer_name:'見積先',title:'試験現場 見積',
  groups:[{name:'試験現場 解体',lines:[],quote_lines:[{label:'試験現場',quantity:'1',unit:'式',quote_price:'35000'}]}],
  created_at:'2026-09-16T00:00:00Z',updated_at:'plan-before'};
 p.calculation=C.calculate(p);db.estimate_plans.push(p);
 const invoice={...E.draft('invoice',db.sites[0],db.billing_profiles[0],'2026-09-16'),id:'invoice-rename',company_id:'c',
  subject:'試験現場 工事',customer_name:'請求先',items:[{name:'試験現場',quantity:'1',unit:'式',unitPrice:'35000',costPrice:null}],
  status:'draft',subtotal:35000,tax_amount:3500,total:38500,created_at:'2026-09-16T00:00:00Z',updated_at:'invoice-before'};
 const quote={...invoice,id:'quote-rename',kind:'estimate',subject:p.title,estimate_plan_id:p.id,
  estimate_snapshot:structuredClone(p),status:'issued',document_number:'EST-2026-0077',updated_at:'quote-before'};
 db.project_documents.push(invoice,quote);
 q('#pbSite').value='site-1';q('#pbSite').dispatchEvent(new w.Event('change'));q('#epReload').click();await pause();
 q('[data-pb-open="invoice-rename"]').click();q('[data-ep-open="plan-rename"]').click();
 let scrolls=0;w.Element.prototype.scrollIntoView=()=>scrolls++;
 function rename(newName,companyId='c'){
  const old=db.sites[0].name;db.sites[0].name=newName;
  for(const row of [...db.estimate_plans,...db.project_documents]){
   row.site_name=newName;row.updated_at+='-renamed';
   for(const key of ['title','subject'])if(row[key]?.startsWith(old))row[key]=newName+row[key].slice(old.length);
   if(row.items)row.items[0].name=newName;
  }
  p.groups[0].name=newName+' 解体';p.groups[0].quote_lines[0].label=newName;p.calculation=C.calculate(p);
  quote.estimate_snapshot=structuredClone(p);
  w.document.dispatchEvent(new w.CustomEvent('toya-site-renamed',{detail:{companyId,siteId:'site-1',oldName:old,newName}}));
 }
 rename('試験現場(工事番号41-513)');await pause();await pause();
 assert.equal(q('#pbSubject').value,'試験現場(工事番号41-513) 工事');
 assert.equal(q('#epJobName').value,'試験現場(工事番号41-513)');
 assert.equal(q('#epLabel0_0').value,'試験現場(工事番号41-513)');
 assert.match(q('#epQuoteList').textContent,/試験現場\(工事番号41-513\) 見積/);
 assert.match(q('#pbDocuments').textContent,/試験現場\(工事番号41-513\) 工事/);
 assert.equal(scrolls,0,'rename does not scroll to the document editor');
 q('[data-ep-quote="quote-rename"]').click();await pause();
 assert.equal(q('#pbSubject').value,'試験現場(工事番号41-513) 見積');
 q('#pbShowPreview').click();
 assert.match(q('#pbPreview iframe').srcdoc,/試験現場\(工事番号41-513\) 見積/);
 assert.match(q('#pbPreview iframe').srcdoc,/EST-2026-0077/);
 assert.match(q('#pbPreview iframe').srcdoc,/38,500/);
 q('#pbPreviewClose').click();q('#pbCloseEditor').click();
 q('[data-pb-open="invoice-rename"]').click();q('[data-ep-open="plan-rename"]').click();
 const invoiceInput=q('#pbCustomer'),planInput=q('#epCustomer');
 invoiceInput.value='入力途中の請求先';invoiceInput.dispatchEvent(new w.Event('input',{bubbles:true}));
 planInput.value='入力途中の見積先';planInput.dispatchEvent(new w.Event('input',{bubbles:true}));planInput.focus();
 scrolls=0;rename('訂正した現場名');await pause();await pause();
 assert.equal(q('#pbCustomer'),invoiceInput);assert.equal(invoiceInput.value,'入力途中の請求先');
 assert.equal(q('#epCustomer'),planInput);assert.equal(planInput.value,'入力途中の見積先');
 assert.equal(w.document.activeElement,planInput);assert.equal(scrolls,0);
 assert.match(q('#epQuoteList').textContent,/訂正した現場名 見積/,'saved list is current even with unsaved input');
 const count=calls.length;
 w.document.dispatchEvent(new w.CustomEvent('toya-site-renamed',{detail:{companyId:'other-company',siteId:'site-1'}}));
 await pause();assert.equal(calls.length,count,'another company event is ignored');
 dom.window.close();
 console.log('PASS rename refreshes invoice/estimate lists and clean editors, preview uses new name with same number/amount, dirty inputs/focus/scroll preserved');
})().catch(e=>{console.error(e);process.exitCode=1});
