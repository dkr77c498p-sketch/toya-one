'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const docs=path.resolve(__dirname,'../docs');
const read=name=>fs.readFileSync(path.join(docs,name),'utf8');
const vehicle=read('vehicle-cost-admin.js');
const equipment=read('equipment-cost-admin.js');
const summary=read('site-financial-summary.js');
const tools=read('pending-transport-tools.js');

const visibleModules={
  'vehicle-cost-admin.js':vehicle,
  'equipment-cost-admin.js':equipment,
  'site-financial-summary.js':summary,
  'pending-transport-tools.js':tools
};
const obsoleteCopy=[
  '燃料差引',
  '差し引く燃料代',
  '差引前',
  '差引後',
  '記録済み燃料を差引'
];
for(const [name,source] of Object.entries(visibleModules)){
  for(const text of obsoleteCopy)assert.ok(!source.includes(text),`${name} still contains obsolete UI copy: ${text}`);
}

assert.doesNotMatch(vehicle,/field\(i,'manualFuel'/,'vehicle UI must not offer a fuel-deduction amount');
assert.doesNotMatch(vehicle,/data-vc-auto="manualFuel"/,'vehicle UI must not offer a fuel-deduction reset');
assert.doesNotMatch(equipment,/field\(i,'manualFuel'/,'equipment UI must not offer a fuel-deduction amount');
assert.doesNotMatch(equipment,/data-ec-auto="manualFuel"/,'equipment UI must not offer a fuel-deduction reset');
assert.doesNotMatch(tools,/id=["']ptFuelBasis["']/,'small-tool UI must not ask whether fuel is included');
assert.doesNotMatch(tools,/<option[^>]+value=["'](?:included|separate)["']/,'small-tool UI must not render legacy fuel-basis choices');
assert.match(tools,/fuel_included:false/,'small-tool rates must always save as fuel-separate');
assert.doesNotMatch(tools,/fuel_included:true/,'small-tool rates must never save as fuel-included');

console.log('Passed fuel-separate UI copy and control checks.');
