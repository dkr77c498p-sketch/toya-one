const assert=require('node:assert/strict');
const {setup,pause}=require('./project-business-ui.cjs');

(async()=>{
 const {dom,w}=await setup('admin',true),q=s=>w.document.querySelector(s);
 q('#epNew').click();
 q('#epJobName').value='300㎡ 木造解体';q('#epJobName').dispatchEvent(new w.Event('input',{bubbles:true}));
 q('#epCustomer').value='試験見積先';q('#epCustomer').dispatchEvent(new w.Event('input',{bubbles:true}));
 q('#epNextItems').click();
 assert.equal(q('#epStep2').hidden,false);
 q('#epAutoM2').value='300';q('#epAutoM2').dispatchEvent(new w.Event('input',{bubbles:true}));
 assert.equal(q('#epAutoTsubo').value,'90.75');
 q('#epAutoSamples').value='2';
 q('#epAutoApply').click();await pause();
 const rows=[...w.document.querySelectorAll('[data-quote-row]')];
 const byLabel=label=>rows.find(r=>r.querySelector('[data-quote-key="label"]')?.value===label);
 assert.equal(byLabel('アスベスト含有調査').querySelector('[data-quote-key="quantity"]').value,'2');
 assert.equal(byLabel('アスベスト含有調査').querySelector('[data-quote-key="quote_price"]').value,'35000');
 assert.equal(byLabel('産業廃棄物処分費').querySelector('[data-quote-key="quantity"]').value,'52.3');
 assert.match(q('#epTotals').textContent,/見積合計/);
 dom.window.close();console.log('PASS 300㎡数量からTOYA標準の自動積算明細を作る');
})().catch(e=>{console.error(e);process.exitCode=1;});
