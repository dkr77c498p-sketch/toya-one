'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const read=name=>fs.readFileSync(path.join(__dirname,'..','docs',name),'utf8'),html=read('index.html');
const section=(start,end)=>{const a=html.indexOf(start),b=html.indexOf(end,a);assert(a>=0&&b>a,start);return html.slice(a,b);};
// Exercise the real form, fuel controls, restoration and time-card redraws with synthetic data only.
const dom=new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'https://toya.test/',runScripts:'dangerously'});
const w=dom.window,q=s=>w.document.querySelector(s),qa=s=>Array.from(w.document.querySelectorAll(s));
w.$=q;w.$$=qa;w.editingReport=null;w.stagedPhotos=[];w.cloudSitesCache=[];w.cloudProfile={role:'employee',active:true};
w.isLegacyMacBucket=()=>false;w.restoreAttachmentChoices=()=>{};w.renderStagedPhotos=()=>{};w.structuredClone=structuredClone;
w.today=()=> '2026-09-12';w.confirm=()=>true;w.scrollTo=()=>{};w.Element.prototype.scrollIntoView=function(){};
const alerts=[],timers=[];w.alert=m=>alerts.push(m);w.setTimeout=fn=>timers.push(fn);
w.eval(section('const LS=','function today()')+'\nwindow.LS=LS;window.defaults=defaults;');
w.eval(section('function cloudHtml(v){','async function cloudSyncLocalReports'));
w.eval(section('function decimalPlaces(n){','let stagedPhotos=[];'));
w.eval(section('function renderFuelVehicleChoices(){','function populateSiteSummarySelect'));
w.eval(section('function renderFuelSummary(reports){','async function saveReport(){'));
w.eval(section('function clearReportEditState(){','function editCloudReport('));
w.eval(section('const fuelInputObserver=','renderSelectors();enhanceNumericInputs(document)'));
const plain=x=>JSON.parse(JSON.stringify(x)),fuels=()=>plain(w.collect().fuels);
const group=name=>qa('.fuel-group').find(g=>g.dataset.fuelAsset===name);
const fuel=name=>group(name)?.querySelector('.fuel-row');
const flush=async()=>{for(let i=0;i<4;i++){await Promise.resolve();let n=0;while(timers.length){timers.shift()();if(++n>100)throw Error('timer loop');}}};
const set=async(el,value,event='input')=>{if(el.type==='checkbox')el.checked=value;else el.value=value;el.dispatchEvent(new w.Event(event,{bubbles:true}));await flush();};
const choose=async(kind,name,on=true)=>{const c=qa(`input[name="${kind}"]`).find(x=>x.value===name);assert(c,name);await set(c,on,'change');};
const qty=async(name,n)=>set(fuel(name).querySelector('.f-qty'),String(n));
const byAsset=()=>new Map(fuels().map(x=>[x.asset,x]));
const sorted=x=>JSON.stringify(x.toSorted((a,b)=>(a.asset+a.type+a.qty).localeCompare(b.asset+b.type+b.qty)));
(async()=>{try{
 w.set(w.LS.attachments,[...w.defaults.attachments,{name:'2kW発電機',category:'発電機'},{name:'エアーホース20M',category:'エア工具'}]);
 w.renderSelectors();q('#date').value=w.today();q('#site').value=q('#site').options[0].value;q('#writer').value=q('#writer').options[1].value;
 w.eval(read('work-time.js'));w.eval(read('usage-hours.js'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));await flush();
 assert.equal(q('#fuelVehicleChoices'),null,'no second vehicle picker');assert(!qa('#reportPage h2').some(x=>x.textContent.includes('燃料費')));
 await choose('vehicle','3tダンプ');await choose('vehicle','ハイエース');await choose('machine','SK55SR');
 for(const name of ['3tダンプ','ハイエース','SK55SR']){
  const row=fuel(name);assert(row,name);assert(row.closest('[data-uh-fuel-asset]'),'fuel is in the same card as usage time');
  assert.equal(row.querySelector('.f-asset-wrap').hidden,true,'no reselecting the asset');assert.equal(row.querySelector('.f-settings').open,false);
  assert(!row.querySelector('.f-qty').closest('details'),'quantity needs no extra tap');assert.equal(row.querySelectorAll('.stepper').length,1);
  assert.equal(row.querySelector('.f-unit').readOnly,true);assert.equal(row.querySelector('.f-amount').readOnly,true);
 }
 assert.equal(fuels().length,0,'selecting a vehicle creates no fuel charge');
 await qty('3tダンプ',50);await set(fuel('ハイエース').querySelector('.f-type'),'ガソリン','change');await qty('ハイエース',20);await qty('SK55SR',30);
 assert.deepEqual([...byAsset()].map(([n,x])=>[n,x.qty,x.amount]),[['ハイエース',20,3180],['3tダンプ',50,6950],['SK55SR',30,4170]]);
 const input=fuel('3tダンプ').querySelector('.f-qty');input.focus();input.setAttribute('data-fixture','kept');
 await set(q('#end'),'18:00','change');assert.equal(fuel('3tダンプ').querySelector('.f-qty'),input,'time refresh keeps the actual fuel input node');assert.equal(w.document.activeElement,input);
 input.blur();await choose('vehicle','4tダンプ');assert.equal(fuel('3tダンプ').querySelector('.f-qty'),input,'structural redraw also preserves the node');
 await choose('vehicle','4tダンプ',false);assert.equal(group('4tダンプ'),undefined,'deselecting an unused blank removes its fuel field');
 await choose('vehicle','3tダンプ',false);assert.equal(fuel('3tダンプ').querySelector('.f-qty').value,'50');assert.equal(group('3tダンプ').querySelector('.f-only-note').hidden,false);
 assert(fuel('3tダンプ').closest('#vehicleFuelInputs'));await choose('vehicle','3tダンプ');assert.equal(byAsset().get('3tダンプ').amount,6950);
 console.log('PASS direct quantity entry, same time/fuel card, no extra picker, keyboard stability and deselection without data loss');

 group('3tダンプ').querySelector('.f-more button').click();await flush();let r=group('3tダンプ').querySelectorAll('.fuel-row')[1];await set(r.querySelector('.f-qty'),'5');
 const prior=sorted(fuels());w.saveDraft();const draft=plain(w.get(w.LS.draft));w.fillReportForm(draft,'edit');await flush();
 assert.equal(sorted(fuels()),prior,'all fuel rows survive complete draft restoration exactly once');assert.equal(group('3tダンプ').querySelectorAll('.fuel-row').length,2);
 w.renderFuelSummary([w.collect(),{date:'2026-08-31',fuels:[{asset:'3tダンプ',type:'軽油',qty:999,amount:999}]}]);
 assert.equal(q('#monthFuelAmount').textContent,'¥14,995');assert.match(q('#fuelBreakdown').textContent,/3tダンプ.*55L.*7,645/);
 r=group('3tダンプ').querySelectorAll('.fuel-row')[1];r.querySelector('.f-remove').click();await flush();assert.equal(group('3tダンプ').querySelectorAll('.fuel-row').length,1);
 q('#uhEnable').checked=false;q('#uhEnable').dispatchEvent(new w.Event('change',{bubbles:true}));await flush();assert(fuel('3tダンプ').closest('#vehicleFuelInputs'));
 q('#uhEnable').checked=true;q('#uhEnable').dispatchEvent(new w.Event('change',{bubbles:true}));await flush();assert(fuel('3tダンプ').closest('[data-uh-fuel-asset]'));
 assert.equal(byAsset().get('3tダンプ').qty,50);console.log('PASS repeated fills, full draft round trip, monthly totals and legacy time-mode toggling');

 w.addLeaseVehicle({name:'リース車両A'});w.addLeaseMachine({name:'リース重機A'});await flush();
 assert(fuel('リース車両A').closest('.lease-vehicle'));assert(fuel('リース重機A').closest('.lease-machine'));await qty('リース車両A',8);
 await set(q('.lv-name'),'');await set(q('.lv-name'),'リース車両B');assert.equal(byAsset().get('リース車両B').qty,8);assert.equal(group('リース車両A'),undefined);
 const leased=fuel('リース車両B');leased.querySelector('[data-source="マルマサ"]').click();await set(leased.querySelector('.f-type'),'AdBlue','change');await qty('リース車両B',2);
 assert.equal(byAsset().get('リース車両B').amount,165);leased.querySelector('[data-source="川崎建機"]').click();await qty('リース車両B',3);
 assert.equal(byAsset().get('リース車両B').amount,3000);assert.equal(byAsset().get('リース車両B').unit,'本');assert.equal(byAsset().get('リース車両B').liters,0);
 leased.querySelector('[data-source="スタンド"]').click();leased.querySelector('[data-outlet="IDEX"]').click();await flush();assert.equal(byAsset().get('リース車両B').outlet,'IDEX');
 q('.lease-vehicle > .rowhead .danger').click();await flush();assert.equal(byAsset().get('リース車両B').qty,3,'removing lease use retains the recorded fill');assert(fuel('リース車両B').closest('#vehicleFuelInputs'));
 await choose('attachment','2kW発電機');assert(fuel('2kW発電機'));await choose('attachment','エアーホース20M');assert.equal(group('エアーホース20M'),undefined);
 console.log('PASS lease entry/rename/removal, supplier and oil calculations, generator fuel and no fuel field for hoses');

 const oldName='旧車両 "12" <img src=x>';
 const historical={...draft,usageHours:undefined,vehicles:[],machines:[],leaseVehicles:[],leaseMachines:[],attachments:[],fuels:[
  {asset:oldName,source:'スタンド',outlet:'IDEX',type:'軽油',qty:8,liters:8,unit:'L',unitPrice:130,amount:1040,note:'<img src=x> & 給油'},
  {asset:'SK55',source:'マルマサ',type:'軽油',liters:10,unitPrice:160,amount:1600}
 ]};
 w.fillReportForm(historical,'edit');await flush();assert.equal(fuels().length,2);assert.equal(byAsset().get(oldName).unitPrice,130,'opening old data never replaces its saved price');
 assert.equal(byAsset().get('SK55').asset,'SK55');assert.equal(byAsset().get('SK55').qty,10);assert.equal(group(oldName).querySelector('img'),null);assert.equal(byAsset().get(oldName).note,'<img src=x> & 給油');
 assert.equal(q('#otherFuelEntry').open,true,'legacy fills remain discoverable');
 await qty(oldName,9);assert.equal(byAsset().get(oldName).amount,1170,'quantity edits use the saved unit price');
 w.renderSelectors();await flush();assert.equal(byAsset().get(oldName).qty,9,'master redraw keeps legacy fuel data');
 const blank=w.addVehicleFuel('');await set(blank.querySelector('.f-qty'),'7');assert.equal(w.validate(w.collect()),false);assert.equal(blank.querySelector('.f-asset-error').hidden,false);
 await set(blank.querySelector('.f-asset'),'インバーター発電機','change');assert.equal(w.validate(w.collect()),true);assert.equal(byAsset().get('インバーター発電機').amount,973);
 const fuelOnly=w.addVehicleFuel('');await set(fuelOnly.querySelector('.f-asset'),'4tダンプ','change');
 assert.equal(fuel('4tダンプ'),fuelOnly,'choosing an unused asset before its quantity keeps the field');await qty('4tダンプ',4);
 assert.equal(byAsset().get('4tダンプ').qty,4);assert(!w.collect().vehicles.includes('4tダンプ'),'fuel-only entry does not add a vehicle usage charge');
 w.fillReportForm({...draft,fuels:[]},'edit');await flush();assert.equal(fuels().length,0,'switching reports never carries old fuel forward');
 assert.equal(alerts.length,0);console.log('PASS preserved historical names/prices, safe text, missing-asset validation and clean report switching');
}finally{dom.window.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
