'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');

const html=fs.readFileSync(path.join(__dirname,'..','docs','index.html'),'utf8');
const section=(start,end)=>{
  const a=html.indexOf(start),b=html.indexOf(end,a);
  assert(a>=0&&b>a,`source section ${start}`);return html.slice(a,b);
};
// Load the real report form and its fuel/collect functions, without network or cloud initialization.
const dom=new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'https://toya.test/',runScripts:'dangerously'});
const w=dom.window,q=s=>w.document.querySelector(s),qa=s=>Array.from(w.document.querySelectorAll(s));
w.$=q;w.$$=qa;w.editingReport=null;w.stagedPhotos=[];
w.cloudProfile=null;w.cloudSitesCache=[];w.isLegacyMacBucket=()=>false;w.restoreAttachmentChoices=()=>{};
w.today=()=> '2026-09-12';w.alert=message=>{throw new Error('Unexpected alert: '+message)};
const scrolled=[];w.Element.prototype.scrollIntoView=function(){scrolled.push(this)};
w.eval(section('const LS=','function today()')+'\nwindow.LS=LS;window.defaults=defaults;');
w.eval(section('function cloudHtml(v){','async function cloudSyncLocalReports'));
w.eval(section('function decimalPlaces(n){','function addLeaseAttachment'));
w.eval(section('function renderFuelVehicleChoices(){','function populateSiteSummarySelect'));
w.eval(section('function renderFuelSummary(reports){','function lineText(d)'));
w.eval(section('function saveDraft(){','async function saveReport(){'));
const setInput=(row,selector,value,event='input')=>{
  const input=row.querySelector(selector);input.value=value;input.dispatchEvent(new w.Event(event,{bubbles:true}));
};
const rows=()=>qa('.fuel-row');
const fuels=()=>JSON.parse(JSON.stringify(w.collect().fuels));
const reset=()=>q('#fuelRows').replaceChildren();
try{
  w.renderSelectors();q('#date').value=w.today();
  q('#writer').appendChild(new w.Option('検証担当','検証担当'));q('#writer').value='検証担当';
  assert.deepEqual(qa('#fuelVehicleChoices button').map(x=>x.textContent),[
    '＋ 軽トラ','＋ ハイエース','＋ 3tダンプ','＋ 4tダンプ','＋ 4tアームロール','＋ 10tダンプ'
  ]);
  q('#fuelVehicleChoices button[aria-label="3tダンプの給油を入力"]').click();
  q('#fuelVehicleChoices button[aria-label="ハイエースの給油を入力"]').click();
  assert.equal(scrolled.length,2);
  assert.equal(rows()[0].querySelector('.f-asset').value,'3tダンプ');
  assert.match(rows()[0].querySelector('.f-asset-title').textContent,/3tダンプ/);
  assert.equal(rows()[1].querySelector('.f-asset').value,'ハイエース');
  setInput(rows()[0],'.f-qty','50');
  setInput(rows()[1],'.f-type','ガソリン','change');setInput(rows()[1],'.f-qty','20');
  assert.deepEqual(fuels().map(x=>[x.asset,x.qty,x.unitPrice,x.amount]),[
    ['3tダンプ',50,139,6950],['ハイエース',20,159,3180]
  ]);
  assert.equal(rows()[0].querySelectorAll('.stepper').length,1,'only quantity has plus/minus controls');
  assert.equal(rows()[0].querySelector('.f-unit').readOnly,true);
  assert.equal(rows()[0].querySelector('.f-amount').readOnly,true);
  w.addVehicleFuel('3tダンプ');setInput(rows()[2],'.f-qty','5');
  w.renderFuelSummary([w.collect(),{date:'2026-08-31',fuels:[{asset:'3tダンプ',type:'軽油',qty:999,amount:999}]}]);
  const breakdown=qa('#fuelBreakdown .record');
  assert.equal(breakdown.length,2);
  assert.match(breakdown[0].textContent,/3tダンプ.*55L.*7,645/);
  assert.match(breakdown[1].textContent,/ハイエース.*20L.*3,180/);
  assert.equal(q('#monthFuelAmount').textContent,'¥10,825');
  console.log('PASS vehicle buttons, independent fuel amounts, repeat fills and monthly totals');

  q('button[onclick="addVehicleFuel(\'\')"]').click();
  const blank=rows().at(-1);assert.equal(blank.querySelector('.f-asset').value,'');
  assert.equal(fuels().length,3,'unused blank row has no cost');
  setInput(blank,'.f-qty','7');
  assert.equal(w.validate(w.collect()),false,'fuel must not silently default to 10t dump');
  assert.equal(blank.querySelector('.f-asset-error').hidden,false);
  setInput(blank,'.f-asset','インバーター発電機','change');
  setInput(blank,'.f-type','ガソリン','change');
  assert.equal(blank.querySelector('.f-asset-error').hidden,true);
  assert.equal(w.validate(w.collect()),true);
  assert.equal(fuels().at(-1).amount,1113);
  w.saveDraft();const draft=w.get(w.LS.draft),before=JSON.stringify(draft.fuels);
  reset();draft.fuels.forEach(w.addFuelRow);
  assert.equal(JSON.stringify(fuels()),before,'vehicle, supplier, type, quantity, price and amount survive draft reload');
  console.log('PASS blank-vehicle feedback, generator selection and draft fuel round trip');

  reset();w.addLeaseVehicle({name:'4tダンプ（リース2号車）'});w.addLeaseMachine({name:'リース発電機'});
  const row=w.addFuelRow();
  const optionValues=()=>Array.from(row.querySelector('.f-asset').options).map(x=>x.value);
  assert(optionValues().includes('4tダンプ（リース2号車）'));
  assert(optionValues().includes('リース発電機'));
  assert(optionValues().includes('SK55SR'));
  assert(optionValues().includes('SK135（1号機）'));
  assert(optionValues().includes('SK135（2号機）'));
  q('.lv-name').value='4tダンプ（リース3号車）';row.querySelector('.f-asset').dispatchEvent(new w.Event('focus'));
  assert(optionValues().includes('4tダンプ（リース3号車）'),'lease names refresh when choosing');
  setInput(row,'.f-asset','4tダンプ（リース3号車）','change');setInput(row,'.f-qty','8');
  assert.equal(fuels()[0].asset,'4tダンプ（リース3号車）');
  row.querySelector('.fuel-source-chips [data-source="マルマサ"]').click();
  setInput(row,'.f-type','AdBlue','change');setInput(row,'.f-qty','2');
  assert.equal(fuels()[0].amount,165);assert.equal(fuels()[0].unit,'L');
  row.querySelector('.fuel-source-chips [data-source="川崎建機"]').click();
  setInput(row,'.f-qty','3');assert.equal(fuels()[0].amount,3000);
  assert.equal(fuels()[0].unit,'本');assert.equal(fuels()[0].liters,0);
  row.querySelector('.fuel-source-chips [data-source="スタンド"]').click();
  row.querySelector('.fuel-outlet-chips [data-outlet="IDEX"]').click();
  assert.equal(fuels()[0].outlet,'IDEX');assert.equal(fuels()[0].unit,'L');
  assert.equal(fuels()[0].amount,417);
  console.log('PASS lease asset choices and existing supplier/fuel/oil unit calculations');

  reset();
  const oldAsset='4tダンプ（旧2号車 "12"）';
  const old=w.addFuelRow({asset:oldAsset,type:'軽油',qty:8,unitPrice:139,amount:1112,note:'<img src=x> & 給油'});
  w.addFuelRow({asset:'SK55',liters:10,type:'軽油',unitPrice:139,amount:1390});
  assert.equal(old.querySelector('.f-asset').value,oldAsset);
  assert.equal(fuels()[0].note,'<img src=x> & 給油');assert.equal(old.querySelector('img'),null);
  assert.equal(fuels()[1].asset,'SK55','legacy name is not silently reassigned to a new master name');
  assert.equal(fuels()[1].qty,10,'legacy liters still loads');
  w.set(w.LS.vehicles,['4tダンプ（1号車）','4tダンプ（2号車）','__proto__']);w.renderFuelVehicleChoices();
  assert.equal(qa('#fuelVehicleChoices button').length,3);
  qa('#fuelVehicleChoices button')[2].click();setInput(rows().at(-1),'.f-qty','1');
  w.renderFuelSummary([w.collect()]);
  assert.equal(q('#monthFuelAmount').textContent,'¥2,641');
  assert.match(q('#fuelBreakdown').textContent,/__proto__.*139/);
  assert.equal(fuels()[0].asset,oldAsset,'refreshing shortcuts does not change saved rows');
  const count=rows().length;old.querySelector('.danger').click();assert.equal(rows().length,count-1);
  console.log('PASS preserved legacy names, registered individual vehicles, safe text and row removal');
}finally{dom.window.close()}
