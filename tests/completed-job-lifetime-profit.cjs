const assert=require('node:assert/strict');
const E=require('../docs/site-period-ledger.r1.js');
const company='c';
const input={
 sites:[{company_id:company,id:'done',name:'完工現場',status:'completed',completed_on:'2026-09-30'},{company_id:company,id:'active',name:'工事中',status:'active',completed_on:null}],
 revenues:[{company_id:company,id:'r1',site_id:'done',revenue_type:'contract',revenue_date:'2026-09-01',amount:2760000,updated_at:'2026-09-01'},{company_id:company,id:'r2',site_id:'active',revenue_type:'contract',revenue_date:'2026-09-01',amount:3000000,updated_at:'2026-09-01'}],
 profiles:[{company_id:company,site_id:'done',contract_breakdown:[],updated_at:'2026-09-30'},{company_id:company,site_id:'active',contract_breakdown:[{work_kind:'base',label:'9月出来高',target_month:'2026-09',amount:500000,status:'planned'}],updated_at:'2026-09-30'}],
 reports:[],laborSheets:[{company_id:company,id:'l1',site_id:'done',work_date:'2026-09-20',cost_total:856455,revenue_total:0,source_reports:[],updated_at:'2026-09-20'},{company_id:company,id:'l2',site_id:'active',work_date:'2026-09-20',cost_total:300000,revenue_total:0,source_reports:[],updated_at:'2026-09-20'}],
 vehicleSheets:[],equipmentSheets:[],laborRates:[],dispatchCrews:[],vehicleRates:[],equipmentRates:[],transportRates:[],toolRates:[],attachmentRates:[],documents:[]
};
const done=E.analyze(input,'done',{companyId:company,complete:true,asOfMonth:'2026-10'});
assert.equal(done.totals.revenue,null,'monthly progress stays missing');
assert.equal(done.totals.lifetimeRevenue,2760000);
assert.equal(done.totals.lifetimeRevenueSource,'completed-contract');
assert.equal(done.totals.cost,856455);
assert.equal(done.totals.lifetimeProfit,1903545);
const active=E.analyze(input,'active',{companyId:company,complete:true,asOfMonth:'2026-10'});
assert.equal(active.totals.lifetimeRevenue,500000);
assert.equal(active.totals.lifetimeRevenueSource,'monthly-progress');
assert.equal(active.totals.lifetimeProfit,200000);
assert.equal(active.contractAmount,3000000,'active contract total is not treated as earned sales');
console.log(JSON.stringify({pass:true,doneProfit:done.totals.lifetimeProfit,activeProfit:active.totals.lifetimeProfit}));
