const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const E=require('../docs/project-documents-engine.js');
const name='家屋内部残置物撤去工事';
const snapshot={site_name:name,title:name+' 見積',updated_at:'2026-09-18T06:17:00Z'};
const doc={kind:'estimate',site_name:name,subject:snapshot.title,estimate_snapshot:snapshot,
 status:'issued',document_number:'EST-2026-0008',document_date:'2026-09-18',customer_name:'試験見積先',
 issuer:{issuer_name:'試験会社'},tax_rate:10,items:[{name:'残置物撤去工事',quantity:'1',unit:'式',unitPrice:'263000'}]};
function check(document,expected){
 const before=JSON.stringify(document),dom=new JSDOM(E.printHTML(document));
 try{
  const fields=[...dom.window.document.querySelectorAll('.te2-main dl dd')];
  assert.equal(fields[0].textContent,expected,'工事名');assert.equal(fields[4].textContent,expected,'工事概要');
  assert.equal(dom.window.document.querySelector('.te2-grand strong').textContent,'¥289,300','金額は変えない');
  assert.equal(JSON.stringify(document),before,'保存データ・番号・状態は変更しない');
 }finally{dom.window.close();}
}
check(doc,name);
check({...doc,status:'draft'},name);
check({...doc,subject:name,estimate_snapshot:{...snapshot,title:name}},name);
check({...doc,subject:name+'（追加分）'},name+'（追加分）');
check({...doc,subject:'別工事 見積',estimate_snapshot:{...snapshot,title:'別工事 見積'}},'別工事 見積');
check({...doc,estimate_snapshot:null},name+' 見積');
check({...doc,estimate_snapshot:{...snapshot,updated_at:undefined,created_at:snapshot.updated_at}},name);
check({...doc,estimate_snapshot:{...snapshot,updated_at:'2026-09-18T06:24:27Z'}},name+' 見積');
check({...doc,estimate_snapshot:{...snapshot,updated_at:'2026-09-19T00:00:00Z'}},name+' 見積');
check({...doc,estimate_snapshot:{...snapshot,updated_at:'不明'}},name+' 見積');
const escaped='家屋内 <撤去> & 外部工事';
check({...doc,site_name:escaped,subject:escaped+' 見積',estimate_snapshot:{...snapshot,site_name:escaped,title:escaped+' 見積'}},escaped);
for(const length of [198,199,200]){
 const longName='工'.repeat(length),title=(longName+' 見積').slice(0,200);
 check({...doc,site_name:longName,subject:title,estimate_snapshot:{...snapshot,site_name:longName,title}},longName);
}
assert.equal(E.estimateSubject({...doc,kind:'invoice'}),name+' 見積','請求書の件名は変更しない');
console.log('PASS exact construction names, legacy draft/issued display, explicit titles, escaping, maximum length and unchanged totals/data');
