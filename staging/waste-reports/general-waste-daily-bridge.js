/* STAGING ONLY. No automatic installation, network, storage or database writes.
 * This bridge is not loaded by docs/index.html. The old-client server guard
 * described in INTEGRATION.md must be implemented before any live rollout.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ToyaGeneralWasteDaily=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const KEY='generalWasteV1',VERSION=1;
 const TYPES=Object.freeze(['可燃物','不燃物','粗大ごみ']);
 const FACILITIES=Object.freeze(['横井処分','北部清掃処分','粗大ごみ処理棟','南部清掃処分']);
 const UNITS=Object.freeze(['kg','t','m³']);
 const limits={date:10,siteName:200,siteId:100,type:40,facility:80,municipality:80,vehicleNumber:80,quantity:30,unit:20,netKg:30,ticketNumber:100,notes:1000,carrierCompanyId:100};
 const checks=['scopeConfirmed','massConfirmed','facilitySectionConfirmed'];
 const clone=x=>JSON.parse(JSON.stringify(x));
 const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
 const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
 const text=x=>String(x??'').trim();
 const stable=x=>Array.isArray(x)?'['+x.map(stable).join(',')+']':object(x)?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}':JSON.stringify(x);
 function identity(p){if(!p||p.active!==true||!text(p.id)||!text(p.companyId))throw Error('ログイン中の会社・入力者を確認してください。');return p.id+':'+p.companyId;}
 function envelope(value,companyId){
  if(!object(value)||value.version!==VERSION||value.companyId!==companyId||!Array.isArray(value.entries)||value.entries.length>100)throw Error('一般廃棄物の保存形式・会社を確認してください。データは変更していません。');
  const ids=new Set();
  for(const r of value.entries){
   if(!object(r)||!text(r.id)||r.id.length>100||ids.has(r.id)||r.companyId!==companyId||r.wasteClass!=='general')throw Error('一般廃棄物の記録ID・区分を確認してください。');
   ids.add(r.id);
   for(const [k,n] of Object.entries(limits))if(own(r,k)&&(typeof r[k]!=='string'||r[k].length>n))throw Error('一般廃棄物の入力を確認してください：'+k);
   for(const k of checks)if(own(r,k)&&typeof r[k]!=='boolean')throw Error('一般廃棄物の確認欄を確認してください：'+k);
  }
  return clone(value);
 }
 function newRow(profile,base={},id){
  identity(profile);const result={id:id||(globalThis.crypto?.randomUUID?.()),companyId:profile.companyId,wasteClass:'general'};
  if(!result.id)throw Error('記録IDを発行できません。記録を重複させないため追加していません。');
  for(const k of Object.keys(limits))result[k]='';
  return Object.assign(result,{date:text(base.date),siteName:text(base.site),unit:'kg',carrierCompanyId:profile.companyId,scopeConfirmed:false,massConfirmed:false,facilitySectionConfirmed:false});
 }
 class Session{
  constructor(profile){this.owner=identity(profile);this.profile=clone(profile);this.value=null;}
  check(profile){if(identity(profile)!==this.owner){this.value=null;throw Error('ログインが切り替わりました。前の会社の記録は引き継いでいません。');}}
  load(report,profile,mode='edit'){
   this.check(profile);if(!object(report))throw Error('日報の形式を確認してください。');
   if(report.company_id&&report.company_id!==profile.companyId)throw Error('別会社の日報は開けません。');
   const v=own(report,KEY)?envelope(report[KEY],profile.companyId):null;
   // A copied daily report represents a different work event: do not duplicate
   // delivery tickets, quantities, photos or waste-row IDs into another day/site.
   if(!['edit','restore','duplicate'].includes(mode))throw Error('日報の入力方法を確認してください。');
   this.value=mode==='duplicate'?null:v;
   return this.snapshot(profile);
  }
  snapshot(profile){this.check(profile);return this.value?clone(this.value):null;}
  entries(profile){return this.snapshot(profile)?.entries||[];}
  add(patch,base,profile,id){
   this.check(profile);const r=newRow(profile,base,id),next=this.value?clone(this.value):{version:VERSION,companyId:profile.companyId,entries:[]};
   if(next.entries.length>=100)throw Error('一般廃棄物は日報1件につき100行までです。');
   next.entries.push(r);envelope(next,profile.companyId);const prior=this.value;this.value=next;
   try{this.update(r.id,patch,profile);}catch(error){this.value=prior;throw error;}
   return r.id;
  }
  update(id,patch,profile){
   this.check(profile);if(!object(patch))throw Error('入力内容を確認してください。');
   const next=this.snapshot(profile),r=next?.entries.find(r=>r.id===id);if(!r)throw Error('変更元の記録がありません。');
   for(const [k,v] of Object.entries(patch)){
    if(!own(limits,k)&&!checks.includes(k))throw Error('この項目は変更できません：'+k);
    if(checks.includes(k)){if(typeof v!=='boolean')throw Error('確認欄を確認してください。');r[k]=v;}
    else {if(typeof v!=='string'||v.length>limits[k])throw Error('入力文字数を確認してください：'+k);r[k]=v;}
   }
   // Partial numeric inputs are retained by draft/save; aggregation validates
   // them and never treats an incomplete quantity as a confirmed zero.
   this.value=envelope(next,profile.companyId);
  }
  remove(id,profile,confirmed=false){
   this.check(profile);if(!confirmed)throw Error('記録を削除する確認が必要です。');
   const next=this.snapshot(profile);if(!next?.entries.some(r=>r.id===id))throw Error('削除元の記録がありません。');
   next.entries=next.entries.filter(r=>r.id!==id);this.value=next;
  }
  capture(report,profile){
   this.check(profile);if(!object(report))throw Error('日報の形式を確認してください。');
   const next=clone(report);
   if(this.value)next[KEY]=this.snapshot(profile);else delete next[KEY];
   return next;
  }
  reset(profile){this.check(profile);this.value=null;}
 }
 function bind(host,options){
  for(const n of ['collect','fillReportForm','clearReportEditState'])if(typeof host[n]!=='function')throw Error('日報の入力プログラムを確認してください：'+n);
  if(host.__generalWasteStagingBridge)throw Error('一般廃棄物の日報連携は接続済みです。');
  const getProfile=options.getProfile,changed=options.onChange||(()=>{});let session=new Session(getProfile());
  const originals={collect:host.collect,fill:host.fillReportForm,clear:host.clearReportEditState};
  const active=()=>{const p=getProfile();session.check(p);return p;};
  host.collect=function(){const p=active();return session.capture(originals.collect.apply(this,arguments),p);};
  host.fillReportForm=function(d,mode='edit'){
   const p=active(),prepared=new Session(p);prepared.load(d,p,mode);
   const out=originals.fill.apply(this,arguments);session=prepared;changed(session.entries(p));return out;
  };
  host.clearReportEditState=function(){const p=active(),out=originals.clear.apply(this,arguments);session.reset(p);changed([]);return out;};
  const api={
   entries(){const p=active();return session.entries(p);},
   add(values,id){const p=active(),key=session.add(values,originals.collect(),p,id);changed(session.entries(p));return key;},
   update(id,values){const p=active();session.update(id,values,p);},
   remove(id,confirmed){const p=active();session.remove(id,p,confirmed);changed(session.entries(p));},
   changedIdentity(){const p=getProfile();session=new Session(p);changed([]);}
  };
  host.__generalWasteStagingBridge=api;return api;
 }
 function extractReports(rows,companyId){
  if(!Array.isArray(rows)||!text(companyId))throw Error('集計対象を確認してください。');
  const records=[],issues=[],coverage={legacyReports:0,recordedReports:0};
  for(const row of rows){
   if(!row||row.company_id!==companyId)continue;
   const d=row.report_data;
   if(!object(d)||!own(d,KEY)){coverage.legacyReports++;continue;}
   let v;try{v=envelope(d[KEY],companyId);}catch(e){issues.push({id:text(row.id),message:e.message});continue;}
   coverage.recordedReports++;
   // Do not copy the report date/site over the original delivery's date/site.
   // Entries are stored once, not duplicated from items/siteMoves/waste_entries.
   records.push(...v.entries);
  }
  return {records,issues,coverage};
 }
 function monthlyFromReports(engine,rows,month,profile,review={}){
  const source=extractReports(rows,profile.companyId),records=[],issues=[...source.issues];
  for(const r of source.records){
   if(text(r.date).slice(0,7)!==month&&/^\d{4}-\d{2}-\d{2}$/.test(r.date)) {records.push(r);continue;}
   if(r.scopeConfirmed!==true){issues.push({id:r.id,site:r.siteName,message:'一般廃棄物・生ごみなしの確認が必要です。'});continue;}
   records.push(r);
  }
  const result=engine.monthly(records,month,profile,review);
  result.issues.push(...issues);result.coverage=source.coverage;
  if(source.coverage.legacyReports&&review.legacyReportsReconciled!==true)result.profileIssues.push('旧日報の一般廃棄物記録を原票と照合してください。');
  result.ready=result.ready&&result.issues.length===0&&result.profileIssues.length===0;
  if(result.issues.length)result.zeroConfirmed=false;
  return result;
 }
 // Specification test for a future SERVER-side guard, NOT a deployed trigger.
 // An older client that omits a protected field must be rejected before UPDATE.
 function assertWritePreserves(previous,incoming){
  if(previous&&own(previous,KEY)&&(!incoming||!own(incoming,KEY)))throw Error('一般廃棄物の記録がある日報です。更新版で開き直してください。');
  return true;
 }
 return {KEY,VERSION,TYPES,FACILITIES,UNITS,Session,bind,envelope,extractReports,monthlyFromReports,assertWritePreserves,stable};
});
