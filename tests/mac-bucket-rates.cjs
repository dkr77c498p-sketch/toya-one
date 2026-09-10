'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const S=require('../docs/site-financial-summary.js');
const html=fs.readFileSync(path.join(__dirname,'../docs/index.html'),'utf8');
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
const start=html.indexOf('function isLegacyMacBucket('),end=html.indexOf('\nensureMacBucketCatalog();',start);
assert(start>=0&&end>start);
const legacy=[
 {name:'MAC',category:'スケルトンバケット2号機用',location:'Yard A',memo:'First existing record'},
 {name:'MAC',category:'スケルトンバケット2号機用',location:'Yard B',memo:'Second existing record'},
 {name:'スケルトンバケット2号機用｜KGSP',category:''},
 {name:'スケルトンバケット',category:'バケット',mountedOn:'SK55SR'}
];
let catalog=structuredClone(legacy),writes=0;
const ctx={LS:{attachments:'attachments'},defaults:{attachments:[]},get:()=>structuredClone(catalog),set:(_,v)=>{catalog=structuredClone(v);writes++;}};
vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);
ctx.ensureMacBucketCatalog();
const names=['スケルトンバケット1号機用','スケルトンバケット2号機用'];
assert.deepEqual(catalog.slice(0,legacy.length),legacy,'legacy metadata is retained without guessing ownership');
assert.deepEqual(catalog.filter(x=>!ctx.isLegacyMacBucket(x)).map(x=>x.name),['スケルトンバケット',...names]);
assert.deepEqual(catalog.filter(x=>names.includes(x.name)).map(x=>x.category),['MAC','MAC']);
ctx.ensureMacBucketCatalog();assert.equal(writes,1,'reloading does not add duplicate buckets');
catalog.find(x=>x.name===names[0]).memo='Service complete';
ctx.ensureMacBucketCatalog();assert.equal(catalog.find(x=>x.name===names[0]).memo,'Service complete');
assert.equal(ctx.isLegacyMacBucket({name:'MAC',category:'スケルトンバケット２号機用'}),true);
assert.equal(ctx.isLegacyMacBucket({name:'MAC',category:'Other attachment'}),false);

const site={id:'s1',name:'Site A'},dest={id:'s2',name:'Site B'};
// Synthetic test price; production prices remain in the private rate master.
const testHourlyRate=400;
const entry=(label,minutes)=>({kind:'attachment',label,quantity:1,allocations:[{site:site.name,minutes}]});
const make=entries=>({sites:[site,dest],reports:[{id:'r1',site_id:site.id,report_date:'2026-09-10',report_data:{site:site.name,date:'2026-09-10',attachments:entries.map(e=>e.label),workers:[],vehicles:[],machines:[],fuels:[],items:[],usageHours:{version:1,entries}}}],laborRates:[],vehicleRates:[],equipmentRates:[],toolRates:[],transportRates:[],laborSheets:[],vehicleSheets:[],equipmentSheets:[],attachmentRates:names.map(label=>({label,hourly_rate:testHourlyRate,active:true}))});
const both=make(names.map(name=>entry(name,480)));
assert.equal(S.analyze(both,site).expenses.attachments.value,6400,'two MAC buckets each receive their full day charge');
assert.equal(S.analyze(both,site).expenses.attachments.missing,0);
const mixed=make([entry(names[0],240),entry(names[1],480)]);
assert.equal(S.analyze(mixed,site).expenses.attachments.value,4800,'each bucket keeps its own usage time');
both.reports[0].report_data.usageHours.entries[0].allocations=[{site:site.name,minutes:240},{site:dest.name,minutes:240}];
assert.equal(S.analyze(both,site).expenses.attachments.value,4800);
assert.equal(S.analyze(both,dest).expenses.attachments.value,1600);
for(const ambiguous of ['MAC','スケルトンバケット','スケルトンバケット2号機用｜KGSP']){
 assert.equal(S.analyze(make([entry(ambiguous,480)]),site).expenses.attachments.missing,1,'legacy label is not silently assigned to a numbered MAC');
}
console.log('Passed MAC catalog preservation, distinct bucket rates, split-site totals and legacy-name checks.');
