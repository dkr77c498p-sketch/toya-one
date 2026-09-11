'use strict';
const assert=require('node:assert/strict');
const {setup,pause}=require('./project-business-ui.cjs');
const Q=require('../docs/estimate-quantities.js'),fixture=require('./estimate-quantities-fixture.cjs');
const ui=s=>({q:sel=>s.w.document.querySelector(sel),put(sel,value){const el=this.q(sel);el.value=value;el.dispatchEvent(new s.w.Event('input',{bubbles:true}));},choose(sel,value){const el=this.q(sel);el.value=value;el.dispatchEvent(new s.w.Event('change',{bubbles:true}));}});
const settle=async()=>{await pause();await pause();};
(async()=>{
 const s=await setup('admin',true),u=ui(s),{q}=u;
 const baseline=JSON.stringify({sites:s.db.sites,revenues:s.db.revenues});
 q('#epNew').click();assert.equal(q('#epStep1').hidden,false);assert.equal(q('#epStep2').hidden,true);
 q('#epNextItems').click();assert.equal(s.w.document.activeElement,q('#epJobName'));assert.match(q('#epFormStatus').textContent,/工事名/);
 u.put('#epJobName','新しい解体工事');q('#epNextItems').click();assert.equal(s.w.document.activeElement,q('#epCustomer'));
 u.put('#epCustomer','テスト建設 御中');q('#epNextItems').click();assert.equal(q('#epStep1').hidden,true);assert.equal(q('#epStep2').hidden,false);
 u.choose('#epChoice0','0');assert.equal(q('#epLabel0_0').value,'養生足場');assert.equal(q('#epUnit0_0').value,'㎡');assert.equal(q('#epQty0_0').value,'');assert.equal(q('#epQuotePrice0_0').value,'');
 q('#epCreateQuote').click();await settle();assert.equal(s.w.document.activeElement,q('#epQty0_0'));assert.equal(s.db.estimate_plans.length,0);assert.equal(s.db.project_documents.length,0);
 u.put('#epQty0_0','10');q('#epCreateQuote').click();assert.equal(s.w.document.activeElement,q('#epQuotePrice0_0'));
 u.put('#epQuotePrice0_0','800');u.choose('#epChoice4','2');u.put('#epQuotePrice4_0','1000');assert.match(q('#epTotals').textContent,/7,700円/);q('[data-exclude-quote="4,0"]').click();assert.match(q('#epTotals').textContent,/8,800円/);q('#epBackInfo').click();assert.equal(q('#epJobName').value,'新しい解体工事');q('#epNextItems').click();assert.equal(q('#epQty0_0').value,'10');
 q('#epSave').click();await settle();assert.equal(q('#epStep2').hidden,false);assert.equal(s.db.estimate_plans.length,1);assert.equal(s.db.estimate_plans[0].groups[4].quote_lines[0].quote_price,'-1000');
 q('#epCreateQuote').click();q('#epCreateQuote').click();await settle();assert.equal(s.db.project_documents.length,1);assert.equal(q('#epStep2').hidden,true);assert.equal(q('[data-ep-step="3"]').getAttribute('aria-current'),'step');assert.equal(q('#pbName0'),null);assert.equal(q('#pbCustomer').value,'テスト建設 御中');assert.match(q('#pbTotals').textContent,/8,800円/);
 const original=JSON.stringify(s.db.project_documents[0]);q('#pbCloseEditor').click();assert.equal(q('#epStep2').hidden,false);q('#epCreateQuote').click();await settle();assert.equal(s.db.project_documents.length,1);assert.equal(s.calls.filter(x=>x[0]==='toya_save_estimate_plan').length,1);
 q('#pbCloseEditor').click();u.put('#epQty0_0','20');q('#epCreateQuote').click();await settle();assert.equal(s.db.project_documents.length,2);assert.equal(JSON.stringify(s.db.project_documents[0]),original);assert.match(q('#pbTotals').textContent,/17,600円/);
 u.put('#pbNotes','変更した見積条件');s.w.confirm=()=>false;const before=s.calls.length;q('#pbIssueDoc').click();await settle();assert.equal(s.calls.length,before);assert.equal(s.db.project_documents[1].status,'draft');
 s.w.confirm=()=>true;q('#pbIssueDoc').click();await settle();assert.equal(s.db.project_documents[1].status,'issued');assert.equal(s.db.project_documents[1].notes,'変更した見積条件');assert.ok(q('#pbPreview'));assert.match(q('#pbPreview iframe').srcdoc,/変更した見積条件/);assert.match(q('#pbPreview iframe').srcdoc,/17,600/);assert.equal(JSON.stringify({sites:s.db.sites,revenues:s.db.revenues}),baseline);s.dom.window.close();
 console.log('PASS guided steps, required-field focus, preset quantities, back navigation, partial save, no duplicate review, edited version and complete-to-PDF');

 const retry=await setup('admin',true),v=ui(retry);v.q('#epNew').click();v.put('#epJobName','再試行工事');v.put('#epCustomer','テスト先');v.q('#epNextItems').click();v.choose('#epChoice0','2');v.put('#epQuotePrice0_0','1000');
 const rpc=retry.w.cloudClient.rpc.bind(retry.w.cloudClient);let fail=true,ids=[];
 retry.w.cloudClient.rpc=async(name,p)=>{if(name==='toya_create_estimate_document'){ids.push(p.p_document_id);if(fail){fail=false;return {error:{message:'通信を再試行してください'}};}}return rpc(name,p);};
 v.q('#epCreateQuote').click();await settle();assert.equal(retry.db.estimate_plans.length,1);assert.equal(retry.db.project_documents.length,0);assert.equal(v.q('#epStep2').hidden,false);assert.equal(v.q('#epQuotePrice0_0').value,'1000');assert.equal(v.q('#epCreateQuote').disabled,false);assert.match(v.q('#epFormStatus').textContent,/通信/);
 v.q('#epCreateQuote').click();await settle();assert.equal(retry.db.project_documents.length,1);assert.equal(ids[0],ids[1]);assert.equal(retry.calls.filter(x=>x[0]==='toya_save_estimate_plan').length,1);retry.dom.window.close();
 console.log('PASS failed document creation retains saved inputs and retries the same request without another plan save');

 const template=await setup('admin',true),a=ui(template);a.q('#epNew').click();a.put('#epJobName','今回の工事');a.put('#epJobAddress','今回の住所');a.put('#epCustomer','今回の見積先');template.w.confirm=()=>false;
 assert.equal(template.w.ToyaEstimatePlanUI.useQuantity(Q.fromSheet(fixture(),null)),true);assert.equal(a.q('#epJobName').value,'今回の工事');assert.equal(a.q('#epJobAddress').value,'今回の住所');assert.equal(a.q('#epCustomer').value,'今回の見積先');assert.equal(a.q('#epStep2').hidden,false);assert.equal(a.q('#epQty0_0').value,'21.60');assert.equal(template.db.estimate_plans.length,0);template.dom.window.close();
 console.log('PASS reference quotation fills items while preserving the new job information');
})().catch(e=>{console.error(e);process.exitCode=1});
