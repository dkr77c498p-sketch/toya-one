'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const read=p=>fs.readFileSync(path.join(__dirname,'..','docs',p),'utf8');
const html=read('index.html'),source=read('equipment-transport.js');
const dom=new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'https://toya.test/',runScripts:'dangerously'});
const w=dom.window,q=s=>w.document.querySelector(s),requests=[],errors=[];
w.cloudProfile=null;w.setInterval=()=>0;w.setTimeout=()=>0;w.confirm=()=>true;w.alert=m=>errors.push(m);
w.Element.prototype.scrollIntoView=function(){};w.addItem=()=>{throw Error('Expected a transport row');};w.validate=()=>true;
const choice={id:'choice',carrier:'宝友',machine_name:'SK135（1号機）',distance_label:'近距離運搬',price_basis:'one_way_per_machine',active:true};
let rpc=()=>({data:[choice],error:null}),priceRead=()=>({data:[{...choice,unit_price:12345}],error:null});
w.cloudClient={rpc(name){requests.push({type:'catalog',name});return Promise.resolve().then(rpc);},from(table){
 const req={type:'price',table,filters:[]};const b={select(s){req.fields=s;return b;},eq(k,v){req.filters.push([k,v]);return b;},then(resolve,reject){requests.push(req);return Promise.resolve().then(priceRead).then(resolve,reject);}};return b;
}};
const change=(id,value,event='change')=>{q('#'+id).value=value;q('#'+id).dispatchEvent(new w.Event(event,{bubbles:true}));};
const select=()=>{change('etCarrier','宝友');change('etMachine','SK135（1号機）');change('etDistance','近距離運搬');};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const settle=async()=>{await tick();await tick();};
const role=async value=>{w.cloudProfile=value;w.document.dispatchEvent(new w.CustomEvent('toya-role-changed'));await settle();};
const employee={id:'employee',company_id:'company',role:'employee',active:true};
const reportItems=()=>Array.from(w.document.querySelectorAll('#items .et-item')).map(row=>Object.fromEntries([['name','.i-name'],['unit','.i-unit'],['qty','.i-qty'],['price','.i-price'],['company','.i-company']].map(([key,s])=>[key,row.querySelector(s).value])));
(async()=>{
 try{
  w.eval(source);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));await settle();
  assert.equal(requests.length,0);assert(q('#etCarrier').options.length>1);select();
  assert.equal(q('#etAdd').disabled,false);assert.match(q('#etConnection').textContent,/未接続/);
  w.document.querySelector('[data-et-count="2"]').click();q('#etAdd').click();
  assert.equal(reportItems().length,1);assert.equal(reportItems()[0].qty,'2');assert.equal(reportItems()[0].price,'');
  assert.equal(w.validate({items:reportItems()}),true);assert.equal(requests.length,0,'draft input never writes or reads authenticated data');
  console.log('PASS disconnected carrier/machine/distance input adds a correct draft row without prices or cloud writes');

  await role(employee);assert.equal(requests.filter(x=>x.type==='catalog').length,1);assert.equal(requests.filter(x=>x.type==='price').length,0);
  assert.equal(q('#etLogin').hidden,true);select();q('#etAdd').click();
  assert.equal(reportItems().length,2);assert.equal(reportItems()[1].price,'');
  assert(!q('#etPreview').textContent.includes('12345'));
  change('etCount','0','input');assert.equal(q('#etAdd').disabled,true);
  change('etCount','1.5','input');assert.equal(q('#etAdd').disabled,true);
  change('etCount','1','input');select();assert.equal(q('#etAdd').disabled,false);
  console.log('PASS employee login loads only price-free catalog; row values and count validation remain intact');

  rpc=()=>({error:{message:'offline'}});await q('#etReload').onclick();select();assert.equal(q('#etAdd').disabled,false);assert.match(q('#etConnection').textContent,/確認できません/);
  rpc=()=>({data:[],error:null});await q('#etReload').onclick();select();assert.equal(q('#etAdd').disabled,false);
  rpc=()=>({data:[choice],error:null});await q('#etReload').onclick();assert.match(q('#etConnection').textContent,/登録済み/);
  await role({...employee,role:'admin'});select();assert.match(q('#etPreview').textContent,/12,345円/);
  const pr=requests.find(x=>x.type==='price');assert.equal(pr.table,'equipment_transport_rate_master');assert.deepEqual(pr.filters,[['company_id','company'],['active',true]]);
  priceRead=()=>({error:{message:'denied'}});await q('#etReload').onclick();select();assert.equal(q('#etAdd').disabled,false);assert(!q('#etPreview').textContent.includes('12,345'));
  console.log('PASS retries recover from empty/error catalogs; an admin price error never blocks input or shows stale prices');

  let release;rpc=()=>new Promise(r=>release=r);const pending=q('#etReload').onclick();await tick();
  await role(null);assert.equal(q('#etReload').disabled,false);select();assert.equal(q('#etAdd').disabled,false);
  release({data:[{...choice,carrier:'Old account carrier'}],error:null});await pending;
  assert(!Array.from(q('#etCarrier').options).some(x=>x.textContent==='Old account carrier'));
  assert.equal(reportItems().length,2,'account changes preserve already-entered draft items');
  assert.equal(errors.length,0);console.log('PASS logout cancels stale catalog responses and preserves draft input');
  w.setTimeout=fn=>{fn();return 0;};w.eval(read('pending-transport-tools.js'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));await settle();
  change('ptCarrier','検証の運搬会社');change('ptMachine','他社の重機');change('ptRoute','検証の経路');change('ptCount','2');
  const before=requests.length;q('#ptAdd').click();
  assert.equal(reportItems().length,3);assert.equal(reportItems()[2].price,'');assert.equal(reportItems()[2].qty,'2');
  assert.match(reportItems()[2].name,/単価未登録/);assert.match(q('#ptMessage').textContent,/ログイン/);assert.equal(requests.length,before);
  console.log('PASS other carriers and leased machinery can also be entered as an unpriced draft');
 }finally{dom.window.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
