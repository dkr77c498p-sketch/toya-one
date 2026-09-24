/* Staging only. Pure monthly aggregation: no network, storage, auth or production writes. */
'use strict';
const VERSION='general-waste-own-20260924-stage1';
const COLUMNS=Object.freeze({north:'もやせるごみ・北部搬入',south:'もやせるごみ・南部搬入',yokoi:'もやせないごみ・横井搬入',bulky:'粗大ごみ・処理棟搬入'});
const REQUIRED_PROFILE=['companyId','companyName','address','permitNumber'];
const text=x=>String(x??'').trim();
const key=x=>text(x).normalize('NFKC').replace(/[\s　]/g,'');
const routeKey=r=>[r.type,r.facility].join('|');
const ROUTES=Object.freeze({'可燃物|北部清掃処分':'north','可燃物|南部清掃処分':'south','不燃物|横井処分':'yokoi','粗大ごみ|粗大ごみ処理棟':'bulky'});
function dateOK(s){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;}
function monthOK(month){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('対象月はYYYY-MMで指定してください。');}
function dueDate(month){monthOK(month);const[y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m,10)).toISOString().slice(0,10);}
function fiscalYear(date){if(!dateOK(date))throw Error('日付を確認してください。');return Number(date.slice(0,4))-(Number(date.slice(5,7))<4?1:0);}
function massGrams(value,unit){
 const v=text(value).normalize('NFKC');if(!v)return null;
 if(!/^\d+(?:\.\d{1,3})?$/.test(v))throw Error('重量は0以上、小数3桁までで入力してください。');
 const [a,b='']=v.split('.');const scaled=BigInt(a)*1000n+BigInt(b.padEnd(3,'0'));
 const u=key(unit);if(!['kg','t'].includes(u))return null;
 const grams=u==='kg'?scaled:scaled*1000n;
 if(grams>9000000000000n)throw Error('重量が入力上限を超えています。');
 return grams;
}
function asKg(g){const s=(g/1000n).toString(),p=(g%1000n).toString().padStart(3,'0').replace(/0+$/,'');return s+(p?'.'+p:'');}
function csvCell(v){const s=text(v);return '"'+(/^[=+\-@\t\r]/.test(s)?"'"+s:s).replace(/"/g,'""')+'"';}
function stable(value){if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';return JSON.stringify(value);}
function profileIssues(p){const a=REQUIRED_PROFILE.filter(k=>!text(p[k])).map(k=>'報告者情報未設定：'+k);if(p.permitConfirmed!==true)a.push('一般廃棄物収集運搬業の許可保有が未確認');if(p.reportingMode!=='own_carrier')a.push('TOYA自身の収集運搬実績報告に設定してください。');return a;}
function route(r){
 // A rough facility alias is not sufficient to classify a bulky-waste delivery.
 const found=ROUTES[routeKey(r)];if(!found)return null;
 if(found==='bulky'&&r.facilitySectionConfirmed!==true)return null;
 return found;
}
function monthly(records,month,profile,review={}){
 monthOK(month);if(!Array.isArray(records))throw Error('記録は配列で指定してください。');
 if(!text(profile.companyId))throw Error('集計する会社を確認してください。');
 const all=records.filter(r=>r&&r.companyId===profile.companyId&&r.wasteClass==='general');
 const source=all.filter(r=>!dateOK(text(r.date))||text(r.date).slice(0,7)===month);
 const issues=[],accepted=[],foreign=[],ignored=[],map=new Map(),conflicts=new Set();
 const issue=(r,message)=>issues.push({id:text(r.id),site:text(r.siteName),message});
 // Identical repeated retrieval of one row is counted once. Conflicting IDs are withheld.
 for(const r of source){
  const id=text(r.id);if(!id){issue(r,'記録ID未設定');continue;}
  if(map.has(id)){if(stable(map.get(id))!==stable(r)){conflicts.add(id);issue(r,'同じ記録IDに異なる内容があります。');}else ignored.push(id);}
  else map.set(id,r);
 }
 const receiptCounts=new Map();
 for(const r of map.values()){
  if(r.void===true||r.carrierCompanyId!==profile.companyId||r.municipality!=='鹿児島市')continue;
  const t=text(r.ticketNumber);if(!t)continue;
  // One ticket for multiple rows needs manual reconciliation; do not silently add a repeated weight.
  const k=[r.date,key(r.vehicleNumber),r.facility,t].join('|');receiptCounts.set(k,(receiptCounts.get(k)||0)+1);
 }
 const vehicleMap=new Map(),totals=Object.fromEntries(Object.keys(COLUMNS).map(k=>[k,0n]));
 for(const r of map.values()){
  if(conflicts.has(text(r.id)))continue;
  if(!dateOK(text(r.date))){issue(r,'搬入日未設定・日付不正');continue;}
  if(!text(r.carrierCompanyId)){issue(r,'運搬業者未設定');continue;}
  if(r.carrierCompanyId!==profile.companyId){foreign.push({id:r.id,reason:'他社運搬'});continue;}
  if(!text(r.municipality)){issue(r,'収集区域の市町村未設定');continue;}
  if(r.municipality!=='鹿児島市'){foreign.push({id:r.id,reason:'他市町村の実績'});continue;}
  if(!text(r.vehicleNumber)){issue(r,'登録車両番号未入力');continue;}
  if(r.void===true){ignored.push(r.id);continue;}
  const col=route(r);if(!col){issue(r,'種類・搬入先の組合せを確認（粗大ごみは処理棟を確認）。');continue;}
  const ticket=text(r.ticketNumber),tk=[r.date,key(r.vehicleNumber),r.facility,ticket].join('|');
  if(ticket&&receiptCounts.get(tk)>1){issue(r,'同じ計量票の複数行：正味重量の重複を原票で確認');continue;}
  let grams=null;
  try{
   if(text(r.netKg))grams=massGrams(r.netKg,'kg');
   else if(r.massConfirmed===true)grams=massGrams(r.quantity,r.unit);
   if(grams===null){issue(r,'計量票等で確定した重量未入力（m³から重量を推測しません）。');continue;}
  }catch(e){issue(r,e.message);continue;}
  const vk=key(r.vehicleNumber);
  if(!vehicleMap.has(vk))vehicleMap.set(vk,{vehicleNumber:text(r.vehicleNumber),cells:Object.fromEntries(Object.keys(COLUMNS).map(k=>[k,0n]))});
  vehicleMap.get(vk).cells[col]+=grams;totals[col]+=grams;accepted.push({id:r.id,column:col,kg:asKg(grams),siteName:text(r.siteName),facility:r.facility,type:r.type});
 }
 const vehicles=[...vehicleMap.values()].sort((a,b)=>a.vehicleNumber.localeCompare(b.vehicleNumber,'ja')).map(v=>({...v,cells:Object.fromEntries(Object.entries(v.cells).map(([k,g])=>[k,asKg(g)])),totalKg:asKg(Object.values(v.cells).reduce((a,b)=>a+b,0n))}));
 const missing=profileIssues(profile);if(review.sourceComplete!==true)missing.push('当月の日報・別台帳に漏れがないことを確認');
 if(review.weighSlipsReconciled!==true)missing.push('計量票・搬入先の実績と照合');
 if(review.contractReportChecked!==true)missing.push('契約事業所報告書の確認');
 if(!accepted.length&&review.explicitZero!==true)missing.push('実績なしの場合は0件を明示確認');
 return {version:VERSION,month,dueDate:dueDate(month),reportingMode:'own_carrier',companyName:profile.companyName,
  vehicles,totals:Object.fromEntries(Object.entries(totals).map(([k,g])=>[k,asKg(g)])),totalKg:asKg(Object.values(totals).reduce((a,b)=>a+b,0n)),
  accepted,issues,excluded:foreign,ignoredIds:ignored,profileIssues:missing,
  ready:issues.length===0&&missing.length===0,zeroConfirmed:accepted.length===0&&issues.length===0&&review.explicitZero===true,
  status:'prepared_not_submitted'};
}
function monthlyCSV(m){
 // Always label this an intermediate table; no submission is performed by the export.
 const lines=[['一般廃棄物収集運搬実績・転記用','未提出',m.companyName,m.month,'単位kg'],
 ['登録車両番号',...Object.values(COLUMNS),'合計kg'],...m.vehicles.map(v=>[v.vehicleNumber,...Object.keys(COLUMNS).map(k=>v.cells[k]),v.totalKg]),
 ['合計',...Object.keys(COLUMNS).map(k=>m.totals[k]),m.totalKg],['要確認件数',m.issues.length],...m.profileIssues.map(x=>['要確認',x]),...m.issues.map(x=>['明細要確認',x.id,x.message])];
 return '\ufeff'+lines.map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
function yearly(records,year,profile){
 if(!Number.isInteger(year)||year<2000||year>2199)throw Error('年度を確認してください。');
 return Array.from({length:12},(_,i)=>{const m=(i+3)%12+1,y=year+(i>=9?1:0);const result=monthly(records,y+'-'+String(m).padStart(2,'0'),profile);return {month:result.month,totals:result.totals,totalKg:result.totalKg,issues:result.issues.length};});
}
module.exports={VERSION,COLUMNS,ROUTES,monthly,monthlyCSV,yearly,dueDate,fiscalYear,massGrams,asKg};
