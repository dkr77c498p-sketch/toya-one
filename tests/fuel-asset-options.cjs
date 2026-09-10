'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'..','docs','index.html'),'utf8');
const start=html.indexOf('function addFuelRow(d={}){');
const end=html.indexOf('function fuelPrice(source,type){');
assert(start>=0&&end>start,'addFuelRow source must exist');

const rows=[];
const context={
  document:{createElement:()=>({className:'',innerHTML:''})},
  $:selector=>{assert.equal(selector,'#fuelRows');return {appendChild:row=>rows.push(row)};},
  updateFuelOptions:()=>{},
  enhanceNumericInputs:()=>{}
};
vm.createContext(context);
vm.runInContext(html.slice(start,end),context);

const fuelOptions=row=>{
  const select=row.innerHTML.match(/<select class="f-asset">([\s\S]*?)<\/select>/);
  assert(select,'fuel asset select must be rendered');
  return [...select[1].matchAll(/<option\s*(selected)?>([^<]+)<\/option>/g)].map(match=>({label:match[2],selected:!!match[1]}));
};

context.addFuelRow();
assert.deepEqual(fuelOptions(rows[0]).map(x=>x.label),[
  '10tダンプ','4tダンプ','4tアームロール','3tダンプ','軽トラ','ハイエース',
  'SK135（1号機）','SK135（2号機）','SK55','インバーター発電機','その他'
]);

context.addFuelRow({asset:'インバーター発電機'});
assert.deepEqual(fuelOptions(rows[1]).filter(x=>x.selected).map(x=>x.label),['インバーター発電機']);
assert(html.includes('<label>車両・重機・小型機械</label>'));
assert(html.includes('車両・重機・小型機械ごとに月間集計します。'));

console.log('Passed fuel-asset option and saved-selection checks.');
