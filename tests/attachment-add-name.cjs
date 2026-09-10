'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../docs/attachment-rate-admin.js'),'utf8');
assert(!/\b(?:localStorage|renderSelectors)\b/.test(source),'Do not overwrite the device catalog or reset report controls');
assert(source.includes('[hidden]{display:none!important}'));

// Execute the real event handlers with a minimal DOM and a fake Supabase client.
// No browser/auth session or database is touched; all fixture rates are synthetic.
function fixture({rows=[],role='admin',active=true,readGate=null}={}){
 const decode=s=>s.replace(/&(?:amp|lt|gt|quot|#39);/g,x=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"}[x]));
 let doc;
 class Element{
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attributes={};this._value='';this.inner='';this.textContent='';this.hidden=false;this.disabled=false;this.open=false;}
  get value(){return this._value;}set value(v){this._value=String(v);}
  get firstElementChild(){return this.children[0]||null;}
  get nextElementSibling(){return this.parentElement?.children[this.parentElement.children.indexOf(this)+1]||null;}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(x=>x!==this);this.parentElement=null;}
  appendChild(e){e.remove();e.parentElement=this;this.children.push(e);return e;}
  append(...items){items.forEach(x=>this.appendChild(x));}
  prepend(e){e.remove();e.parentElement=this;this.children.unshift(e);}
  after(e){const p=this.parentElement;e.remove();e.parentElement=p;p.children.splice(p.children.indexOf(this)+1,0,e);}
  focus(){doc.activeElement=this;}
  click(){if(!this.disabled)return this.onclick?.();}
  checkValidity(){const n=Number(this.value);return this.value!==''&&Number.isFinite(n)&&n>=Number(this.attributes.min??'-Infinity')&&n<=Number(this.attributes.max??'Infinity')&&Math.abs(n*100-Math.round(n*100))<1e-5;}
  get innerHTML(){return this.inner;}
  set innerHTML(value){
   this.inner=value;this.children.forEach(x=>{x.parentElement=null;});this.children=[];
   const stack=[this];
   for(const token of value.matchAll(/<\/?[a-z][^>]*>|[^<]+/gi)){
    const s=token[0];if(s.startsWith('</')){stack.pop();continue;}
    if(!s.startsWith('<')){stack.at(-1).textContent+=decode(s);continue;}
    const tag=s.match(/^<([a-z0-9]+)/i)[1],e=new Element(tag);
    for(const a of s.slice(tag.length+1,-1).matchAll(/([\w-]+)(?:="([^"]*)")?/g)){
     const [key,val]=[a[1],decode(a[2]??'')];e.attributes[key]=val;
     if(['hidden','disabled','open','readonly'].includes(key))e[key]=true;
     else if(key.startsWith('data-'))e.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=val;
     else e[key]=val;
    }
    stack.at(-1).appendChild(e);if(!['input','br','hr'].includes(tag))stack.push(e);
   }
  }
  querySelectorAll(selector){
   if(selector.includes(' ')){const [parent,...rest]=selector.split(' ');return this.querySelectorAll(parent).flatMap(x=>x.querySelectorAll(rest.join(' ')));}
   const match=e=>{
    if(selector.startsWith('#'))return e.id===selector.slice(1);
    if(selector==='[data-attachment-rate-choice]')return e.dataset.attachmentRateChoice!==undefined;
    if(selector==='input[name="attachment"]')return e.tagName==='INPUT'&&e.name==='attachment';
    return e.tagName===selector.toUpperCase();
   };
   const out=[];for(const e of this.children){if(match(e))out.push(e);out.push(...e.querySelectorAll(selector));}return out;
  }
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
 }
 doc=new Element('document');doc.readyState='complete';doc.listeners={};doc.addEventListener=(name,fn)=>doc.listeners[name]=fn;
 doc.createElement=tag=>new Element(tag);doc.head=doc.appendChild(new Element('head'));
 for(const id of ['masterPage','machineAttachmentChoices','smallToolChoices','sfRefresh']){const e=new Element('div');e.id=id;doc.appendChild(e);}
 const q=id=>doc.querySelector('#'+id),tools=new Element('div');tools.id='ptRates';q('masterPage').appendChild(tools);
 function choice(name,small=false){const label=new Element('label'),input=new Element('input');input.name='attachment';input.value=name;label.appendChild(input);q(small?'smallToolChoices':'machineAttachmentChoices').appendChild(label);return input;}
 const existing=choice('Fixture Attach A'),small=choice('Fixture Tool A',true);existing.checked=true;
 const timers=[],intervals=[],observers=[],requests=[],confirms=[];
 let resultOverride=null,writeGate=null,allowConfirm=true,refreshes=0;
 q('sfRefresh').onclick=()=>refreshes++;
 const context={window:{},document:doc,console,cloudProfile:{id:'fixture-admin',company_id:'fixture-company',role,active},
  confirm:s=>{confirms.push(s);return allowConfirm;},
  setTimeout:fn=>timers.push(fn),setInterval:fn=>intervals.push(fn),
  MutationObserver:class{constructor(fn){observers.push(fn);}observe(){}disconnect(){}},
  cloudClient:{from(table){
   assert.equal(table,'attachment_rate_master');const request={kind:'select',filters:[],payload:null};
   const query={select(){return query;},eq(k,v){request.filters.push([k,v]);return query;},order(){return query;},
    insert(payload){request.kind='insert';request.payload=payload;return query;},
    update(payload){request.kind='update';request.payload=payload;return query;},
    then(resolve,reject){requests.push(request);const result=request.kind==='select'?{data:rows,error:null}:resultOverride||{data:[{id:'fixture-rate-new',label:request.payload.label||rows.find(r=>request.filters.some(f=>f[0]==='id'&&f[1]===r.id))?.label,...request.payload,updated_at:'fixture-new-version'}],error:null};return Promise.resolve(request.kind==='select'?readGate:writeGate).then(()=>result).then(resolve,reject);}};
   return query;
  }}};
 vm.createContext(context);vm.runInContext(source,context);timers.splice(0).forEach(fn=>fn());
 const drain=()=>new Promise(resolve=>setImmediate(resolve));
 return {q,doc,context,requests,confirms,existing,small,drain,
  startNew(name,daily){q('arAdd').click();q('arNewName').value=name;q('arNewName').oninput();this.daily(daily);},
  daily(value){q('arDaily').value=value;q('arDaily').oninput();},
  save(){return q('arSave').click();},tick(){intervals.forEach(fn=>fn());},mutate(){observers.forEach(fn=>fn());},
  fail(result){resultOverride=result;},hold(promise){writeGate=promise;},cancel(){allowConfirm=false;},
  writes:()=>requests.filter(r=>r.kind!=='select'),refreshes:()=>refreshes};
}
const row={id:'fixture-rate-existing',label:'Fixture Attach A',hourly_rate:7,active:true,updated_at:'fixture-old-version'};
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS',name);}
(async()=>{
 await test('Admin-only reads; collapsed settings and visible add button',async()=>{
  const f=fixture({rows:[row]});await f.drain();assert.equal(f.q('arSettings').open,false);assert(f.q('arAdd'));
  assert.equal(f.q('ptRates').nextElementSibling,f.q('attachmentRateCard'));assert.equal(f.writes().length,0);
  assert.deepEqual(f.requests[0].filters,[['company_id','fixture-company']]);
  for(const options of [{role:'employee'},{active:false}]){const no=fixture(options);await no.drain();assert.equal(no.q('attachmentRateCard'),null);assert.equal(no.requests.length,0);}
 });
 await test('Add name and daily price; actual conversion and confirmed insert',async()=>{
  const f=fixture();await f.drain();f.startNew('  Fixture New B  ','86.4');
  assert.equal(f.q('arSettings').open,true);assert.equal(f.q('arExistingRow').hidden,true);assert.equal(f.doc.activeElement,f.q('arNewName'));
  assert.equal(f.q('arRate').value,'10.8');await f.save();
  const write=f.writes()[0];assert.equal(write.kind,'insert');assert.equal(write.payload.label,'Fixture New B');assert.equal(write.payload.hourly_rate,10.8);assert.equal(write.payload.company_id,'fixture-company');
  assert.equal(f.q('arName').value,'Fixture New B');assert.match(f.q('arStatus').textContent,/追加しました/);assert.equal(f.refreshes(),1);
  assert(f.doc.querySelectorAll('input[name="attachment"]').some(x=>x.value==='Fixture New B'));assert.equal(f.existing.checked,true);
  f.mutate();assert.equal(f.doc.querySelectorAll('input[name="attachment"]').filter(x=>x.value==='Fixture New B').length,1);
  f.q('machineAttachmentChoices').children.find(x=>x.dataset.attachmentRateChoice).remove();f.mutate();assert(f.doc.querySelectorAll('input[name="attachment"]').some(x=>x.value==='Fixture New B'));
 });
 await test('Existing editing uses update with company and optimistic version filters',async()=>{
  const f=fixture({rows:[row]});await f.drain();f.q('arName').value=row.label;f.q('arName').onchange();assert.equal(f.q('arDaily').value,'56');
  f.daily('92');await f.save();const w=f.writes()[0];assert.equal(w.kind,'update');assert.equal(w.payload.hourly_rate,11.5);
  assert.deepEqual(w.filters,[['company_id','fixture-company'],['id',row.id],['updated_at',row.updated_at]]);
 });
 await test('Invalid and empty inputs never write; zero is explicit and valid',async()=>{
  for(const [name,value] of [['','24'],['　','24'],['A'.repeat(121),'24'],['Bad\nName','24'],['Fixture New',''],['Fixture New','-1'],['Fixture New','Infinity'],['Fixture New','1000000001'],['Fixture New','0.001']]){
   const f=fixture();await f.drain();f.startNew(name,value);await f.save();assert.equal(f.writes().length,0,JSON.stringify([name,value]));
  }
  const f=fixture();await f.drain();f.startNew('Fixture Zero','0');await f.save();assert.equal(f.writes()[0].payload.hourly_rate,0);
 });
 await test('Duplicate normalized names cannot overwrite a registered price in add mode',async()=>{
  const f=fixture({rows:[row]});await f.drain();f.startNew('Ｆｉｘｔｕｒｅ ａｔｔａｃｈ　ａ','24');await f.save();assert.equal(f.writes().length,0);assert.match(f.q('arStatus').textContent,/登録済み/);
  const local=fixture();await local.drain();local.startNew('fixture attach a','24');await local.save();assert.equal(local.writes()[0].payload.label,'Fixture Attach A');
  assert.equal(local.doc.querySelectorAll('input[name="attachment"]').filter(x=>x.value==='Fixture Attach A').length,1);
  const tool=fixture();await tool.drain();tool.startNew('fixture tool a','24');await tool.save();assert.equal(tool.writes().length,0);
 });
 await test('Cancel and save errors preserve the draft and never add a report choice',async()=>{
  for(const failure of [null,{error:{message:'fixture denied'}},{error:{code:'23505',message:'fixture duplicate'}},{data:[],error:null}]){
   const f=fixture();await f.drain();f.startNew('Fixture Unwritten','24');if(failure)f.fail(failure);else f.cancel();await f.save();
   assert.equal(f.q('arNewName').value,'Fixture Unwritten');assert.equal(f.q('arDaily').value,'24');assert.equal(f.q('arSave').disabled,false);assert.equal(f.refreshes(),0);
   assert(!f.doc.querySelectorAll('input[name="attachment"]').some(x=>x.value==='Fixture Unwritten'));
  }
 });
 await test('In-flight save locks controls, prevents double submit, and respects logout',async()=>{
  const f=fixture();await f.drain();f.startNew('Fixture Pending','24');let resolve;f.hold(new Promise(r=>resolve=r));const pending=f.save();await f.drain();
  for(const id of ['arAdd','arBack','arName','arNewName','arDaily','arSave'])assert.equal(f.q(id).disabled,true,id);
  await f.save();assert.equal(f.writes().length,1);f.context.cloudProfile=null;f.tick();resolve();await pending;
  assert.equal(f.q('attachmentRateCard'),null);assert(!f.doc.querySelectorAll('input[name="attachment"]').some(x=>x.value==='Fixture Pending'));
 });
 await test('Initial read does not erase a draft typed before it completes',async()=>{
  let resolve;const f=fixture({readGate:new Promise(r=>resolve=r)});f.startNew('Fixture Early','24');assert.equal(f.q('arSave').disabled,true);
  resolve();await f.drain();assert.equal(f.q('arNewName').value,'Fixture Early');assert.equal(f.q('arDaily').value,'24');assert.equal(f.q('arSave').disabled,false);
  await f.save();assert.equal(f.writes()[0].payload.label,'Fixture Early');
 });
 await test('Saved names restored for admin only; null rate is not shown as zero',async()=>{
  const f=fixture({rows:[{...row,label:'Fixture Cloud Only',hourly_rate:null}]});await f.drain();assert(f.doc.querySelectorAll('input[name="attachment"]').some(x=>x.value==='Fixture Cloud Only'));
  f.q('arName').value='Fixture Cloud Only';f.q('arName').onchange();assert.equal(f.q('arDaily').value,'');
  f.context.cloudProfile={id:'fixture-employee',company_id:'fixture-company',role:'employee',active:true};f.tick();assert.equal(f.q('attachmentRateCard'),null);assert(!f.doc.querySelectorAll('input[name="attachment"]').some(x=>x.value==='Fixture Cloud Only'));
 });
 await test('Names are displayed as escaped options/plain text, not injected markup',async()=>{
  const f=fixture();await f.drain();f.startNew('Fixture <b>& Name','24');await f.save();
  assert(f.q('arName').innerHTML.includes('Fixture &lt;b&gt;&amp; Name'));assert(f.doc.querySelectorAll('span').some(x=>x.textContent==='Fixture <b>& Name'));
 });
 console.log(`${passed} attachment UI execution tests passed`);
})().catch(error=>{console.error(error);process.exitCode=1;});
