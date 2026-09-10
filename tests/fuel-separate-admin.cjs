'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const docs=path.resolve(__dirname,'../docs');
const read=name=>fs.readFileSync(path.join(docs,name),'utf8');

function calculator(name){
  const source=read(name);
  const start=source.indexOf('  const num=');
  const end=source.indexOf('  function signature(',start);
  assert(start>=0&&end>start,`${name}: pure calculator source must exist`);
  const context={};
  vm.createContext(context);
  vm.runInContext(source.slice(start,end)+'\nthis.calculate=calculate;',context);
  return {calculate:context.calculate,source};
}

for(const name of ['vehicle-cost-admin.js','equipment-cost-admin.js']){
  const {calculate,source}=calculator(name);
  const automatic=calculate({used:true,dayRate:15000,recordedFuel:2224,manualFuel:999});
  assert.equal(automatic.gross,15000,name);
  assert.equal(automatic.fuel,2224,name);
  assert.equal(automatic.net,15000,name);
  assert.equal(automatic.manual,false,name);

  const adjusted=calculate({used:true,dayRate:15000,recordedFuel:2224,manualGross:12000,manualFuel:999});
  assert.equal(adjusted.net,12000,name);
  assert.equal(adjusted.manual,true,name);
  assert.match(source,/fuel_deduction_total:0,net_total:t\.gross/,`${name}: saved totals must never deduct fuel`);
}

console.log('Passed vehicle and equipment fuel-separate admin checks.');
