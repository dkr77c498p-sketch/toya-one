const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {setup,pause}=require('./project-business-ui.cjs');
(async()=>{
 for(const role of ['admin','employee']){
  const f=await setup(role),{w,db,dom,calls}=f,q=s=>w.document.querySelector(s),jumps=[];
  w.scrollTo=()=>{};w.Element.prototype.scrollIntoView=function(){jumps.push(this.id)};
  // Existing navigation behaviour, without network/session bootstrap.
  w.document.querySelectorAll('nav [data-page]').forEach(b=>b.onclick=()=>{w.document.querySelectorAll('.page,nav button').forEach(e=>e.classList.remove('active'));q('#'+b.dataset.page).classList.add('active');b.classList.add('active');});
  const site=q('#site');site.add(new w.Option('保存する現場','site'));site.value='site';q('#details').value='保存前の作業内容';
  const oldInput=q('#details'),before=JSON.stringify(db);
  w.eval(fs.readFileSync(path.join(__dirname,'../docs/usability.js'),'utf8'));await pause();
  assert.equal(q('#homePage').firstElementChild.id,'uxDailyHome');assert.equal(q('#uxMasterGuide').hidden,role!=='admin');
  q('#uxWrite').click();assert.ok(q('#reportPage').classList.contains('active'));
  q('[data-ux-report="photoSection"]').click();assert.equal(jumps.at(-1),'photoSection');
  q('#uxReportTop').click();assert.equal(jumps.at(-1),'uxReportGuide');
  assert.ok(q('#uxReportSections').options.length>10);
  const late=w.document.createElement('div');late.className='card';late.id='lateReportCard';late.innerHTML='<h2>追加機材</h2>';q('#reportPage').append(late);await pause();assert.ok([...q('#uxReportSections').options].some(o=>o.value==='lateReportCard'));
  q('#status').textContent='現場を選んでください';await pause();assert.equal(q('#uxSaveStatus').hidden,false);assert.equal(q('#uxSaveStatus').textContent,'現場を選んでください');
  q('#status').textContent='';await pause();assert.equal(q('#uxSaveStatus').hidden,true);
  q('#uxRecords').click();assert.ok(q('#recordsPage').classList.contains('active'));q('#uxFindPhotos').click();assert.equal(jumps.at(-1),q('#ledgerSite').closest('.card').id);
  assert.ok(q('#records').closest('.card').compareDocumentPosition(q('#ledgerSite').closest('.card'))&w.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.equal(q('#details'),oldInput);assert.equal(q('#details').value,'保存前の作業内容');assert.equal(q('#site').value,'site');assert.equal(JSON.stringify(db),before);assert.equal(calls.filter(c=>c[0]!=='read').length,0);
  if(role==='admin'){
   q('[data-ux-master="siteMaster"]').click();assert.equal(jumps.at(-1),q('#siteMaster').closest('.card').id);
   assert.ok(q('#uxMasterSections').options.length>1);
  }
  w.cloudProfile=null;w.document.dispatchEvent(new w.CustomEvent('toya-role-changed'));await pause();assert.equal(q('#homePage').firstElementChild.id,'cloudCard');assert.equal(q('#uxMasterGuide').hidden,true);assert.equal(q('#uxMasterSections').options.length,1);
  dom.window.close();console.log('PASS '+role+': navigation, late modules, visible save feedback, retained inputs/no writes, logout');
 }
})().catch(e=>{console.error(e);process.exitCode=1});
