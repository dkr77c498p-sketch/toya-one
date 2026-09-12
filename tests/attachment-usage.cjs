'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const {project}=require('../docs/attachment-usage.js');
const master=[
 {name:'未使用の工具',category:'エア工具',location:'誤った保管先',mountedOn:'重機X'},
 {name:'バケット（1号機）',category:'バケット',location:'誤った保管先',mountedOn:'重機X'},
 {name:'バケット（2号機）',category:'バケット'},
 {name:'発電機',category:'発電機'},
];
const reports=[
 {id:'r1',date:'2026-09-01',site:'現場A',attachments:['発電機 × 1台','バケット（1号機）'],machines:['重機A']},
 {id:'r2',date:'2026-09-02',site:'現場B',attachments:['発電機 × 2台','バケット（2号機）'],machines:['重機B'],
  usageHours:{entries:[{kind:'attachment',label:'バケット（2号機）',allocations:[{site:'移動先C',minutes:60},{site:'現場B',minutes:0}]}]}},
 {id:'r3',date:'2026-09-02',site:'現場D',attachments:[{name:'発電機'}]},
 {id:'r4',date:'2026-09-03',site:'現場A',attachments:['バケット（1号機）'],
  leaseAttachments:[{name:'リースカッター',model:'型式Z',company:'リース会社',machine:'重機C',price:123456789}],
  usageHours:{entries:[{kind:'tool',label:'未選択の工具',allocations:[{site:'現場A',minutes:60}]}]}},
 {id:'r5',date:'2026-09-04',site:'現場A',attachments:['使用0時間の工具'],
  usageHours:{entries:[{kind:'tool',label:'使用0時間の工具',allocations:[{site:'現場A',minutes:0}]}]}},
];
const snapshot=JSON.stringify({master,reports});
const result=project(reports,master),byName=name=>result.find(r=>r.name===name);
assert.equal(result.length,4);
assert.equal(byName('バケット(1号機)').date,'2026-09-03');
assert.deepEqual(byName('バケット(1号機)').sites,['現場A']);
assert.deepEqual(byName('バケット(1号機)').mounts,[],'machine in same report and manual catalog mount are not mounting evidence');
assert.deepEqual(byName('バケット(2号機)').sites,['移動先C']);
assert.deepEqual(byName('発電機').sites,['現場B','現場D']);
assert.deepEqual(byName('発電機').mounts,[]);
assert.deepEqual(byName('リースカッター').mounts,['重機C']);
assert(!JSON.stringify(result).includes('123456789'),'usage projection excludes lease prices');
assert.equal(JSON.stringify({master,reports}),snapshot,'reports and catalog remain unchanged');
assert.equal(project([],master).length,0,'catalog-only items never become usage');
assert.equal(project([{date:'2026-09-05',site:'現場A',attachments:['発電機'],usageHours:{entries:[{kind:'tool',label:'発電機',allocations:[{site:'現場A',minutes:null}]}]}}],master).length,1,'selected legacy/unknown-hours use is not treated as zero');
console.log('PASS actual selected items, quantity suffixes, distinct assets, last use, multiple sites and explicit mounting only');

const html=fs.readFileSync(path.join(__dirname,'..','docs','index.html'),'utf8');
const source=fs.readFileSync(path.join(__dirname,'..','docs','attachment-usage.js'),'utf8');
const dom=new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'https://toya.test/',runScripts:'dangerously'});
const w=dom.window,q=s=>w.document.querySelector(s),requests=[];
w.LS={attachments:'master'};w.get=()=>master;
w.cloudProfile={id:'user-one',company_id:'company-one',role:'employee',active:true};
let handler=()=>({data:reports,error:null});
w.cloudClient={from(table){
 const req={table,filters:[]};
 const builder={select(fields){req.fields=fields;return builder;},eq(k,v){req.filters.push([k,v]);return builder;},order(k,o){req.order=[k,o];return builder;},range(a,b){req.range=[a,b];return builder;},then(resolve,reject){requests.push(req);return Promise.resolve().then(()=>handler(req)).then(resolve,reject);}};
 return builder;
}};
w.eval(source);
w.eval(html.slice(html.indexOf('function renderAttachments(){'),html.indexOf('function addAttachment(){')));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const names=()=>Array.from(q('#attachmentList').querySelectorAll('.record-title')).map(x=>x.textContent);
(async()=>{
 try{
  await w.renderAttachments();
  assert.equal(q('#attachmentCount').textContent,'3');assert.equal(q('#leasedAttachmentCount').textContent,'1');
  assert(names().some(n=>n.includes('バケット(1号機)')));assert(!names().some(n=>n.includes('未使用')));
  assert(!q('#attachmentPage').textContent.includes('装着中'));assert(!q('#attachmentPage').textContent.includes('123456789'));
  assert.match(q('#leasedAttachmentList').textContent,/使用時の装着先：重機C/);
  assert.equal(requests[0].table,'daily_reports');assert.deepEqual(requests[0].filters,[['company_id','company-one']]);
  assert.equal(requests[0].order[0],'id');assert.deepEqual(requests[0].range,[0,499]);
  assert(!requests[0].fields.includes('*'));assert(!requests[0].fields.split(',').includes('report_data'));
  assert.match(requests[0].fields,/attachments:report_data->attachments/);
  console.log('PASS rendered usage-only lists and counts; company-scoped narrow employee reads');

  const many=Array.from({length:500},(_,i)=>({id:String(i),report_date:'2026-09-10',site:'現場A',attachments:['発電機']}));
  handler=req=>({data:req.range[0]===0?many:[{id:'older',report_date:'2026-08-01',sites:{name:'古い現場'},attachments:['古い日報だけの機材']}],error:null});
  await w.ToyaAttachmentUsage.render();assert.equal(q('#attachmentCount').textContent,'2');assert(names().includes('古い日報だけの機材'));
  assert.match(q('#attachmentList').textContent,/古い現場/);assert.deepEqual(requests.at(-1).range,[500,999]);
  handler=()=>({data:[],error:null});await w.ToyaAttachmentUsage.render();
  assert.equal(q('#attachmentCount').textContent,'0');assert.match(q('#attachmentList').textContent,/まだありません/);
  console.log('PASS pagination keeps historical usage; an empty refresh removes edited/deleted usage');

  handler=req=>req.range[0]===0?{data:many,error:null}:{data:null,error:{message:'denied'}};
  await w.ToyaAttachmentUsage.render();assert.equal(q('#attachmentCount').textContent,'0');assert.equal(names().length,0);assert.match(q('#attachmentUsageStatus').textContent,/読み込めません/);
  let resolve;handler=()=>new Promise(r=>resolve=r);const pending=w.ToyaAttachmentUsage.render();await tick();
  w.cloudProfile=null;w.ToyaAttachmentUsage.sessionChanged();resolve({data:reports,error:null});await pending;
  assert.equal(names().length,0);const n=requests.length;await w.ToyaAttachmentUsage.render();assert.equal(requests.length,n);
  assert.match(q('#attachmentUsageStatus').textContent,/ログイン/);
  console.log('PASS read errors discard partial results; logout discards in-flight data without local fallback');

  w.cloudProfile={id:'user-two',company_id:'company-two',role:'employee',active:true};
  handler=()=>new Promise(r=>resolve=r);const old=w.ToyaAttachmentUsage.render();await tick();
  handler=()=>({data:[{report_date:'2026-09-12',site:'<img src=x>',attachments:['<script>fixture</script>']}],error:null});
  await w.ToyaAttachmentUsage.render();resolve({data:reports,error:null});await old;
  assert.equal(q('#attachmentCount').textContent,'1');assert.equal(q('#attachmentList img'),null);assert.equal(q('#attachmentList script'),null);
  assert.match(q('#attachmentList').textContent,/<script>fixture<\/script>/);
  assert.deepEqual(requests.at(-1).filters,[['company_id','company-two']]);
  console.log('PASS latest refresh wins, new account is scoped and report names render as safe text');
 }finally{dom.window.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
