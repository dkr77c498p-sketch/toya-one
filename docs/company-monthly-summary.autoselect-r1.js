/* Read-only company totals. Contract-based monthly margins and issued invoices stay separate. */
(() => {
 'use strict';
 const node=typeof module==='object'&&module.exports;
 const S=node?require('./site-financial-summary.js'):window.ToyaSiteCostSummaryEngine;
 const list=x=>Array.isArray(x)?x:[];
 const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const yen=x=>x===null?'—':Number(x).toLocaleString('ja-JP',{maximumFractionDigits:2})+'円';
 const japanMonth=(date=new Date())=>new Date(+date+9*60*60*1000).toISOString().slice(0,7);
 const add=(a,b)=>{const cents=Math.round(a*100)+Math.round(b*100);if(!Number.isSafeInteger(cents))throw Error('集計金額が大きすぎます。');return cents/100;};
 function unique(rows,key='id'){
  const seen=new Map();
  for(const row of list(rows)){
   if(!row[key])throw Error('記録の識別番号を確認できません。');
   if(seen.has(row[key])&&JSON.stringify(seen.get(row[key]))!==JSON.stringify(row))throw Error('読込中に記録が変わりました。更新してください。');
   seen.set(row[key],row);
  }
  return [...seen.values()];
 }
 const sources=()=>[
  ['sites','sites','id,name,status,completed_on',null,'id'],
  ...S.sources.filter(([key])=>key!=='revenues').map(x=>[...x,'id']),
  ['contracts','revenues','id,site_id,revenue_type,revenue_date,amount,updated_at',null,'id'],
  ['documents','project_documents','id,site_id,kind,status,document_date,subtotal,updated_at','document_date','id'],
  ['profiles','site_project_profiles','site_id,contract_breakdown,work_start,work_end,updated_at',null,'site_id']
 ];
 function calculate(input,month,excludedIds=[]){
  const excluded=new Set(excludedIds);
  const bounds=S.periodBounds('month',month),within=d=>typeof d==='string'&&d>=bounds.start&&d<bounds.end;
  const data={revenues:[]};
  for(const [key,,,dateField,idField] of sources()){
   data[key]=unique(dateField?list(input[key]).filter(r=>within(r[dateField])):input[key],idField);
  }
  const rows=new Map(data.sites.map(site=>[site.id,{site,sales:0,invoiceCount:0,draftCount:0,draftAmount:0,cost:0,hasCosts:false,warnings:[],planned:0,completed:0,phaseCount:0,outgoing:0}]));
  const rowFor=id=>{if(!rows.has(id))rows.set(id,{site:{id,name:'現場の紐付けなし'},sales:0,invoiceCount:0,draftCount:0,draftAmount:0,cost:0,hasCosts:false,warnings:[],planned:0,completed:0,phaseCount:0,outgoing:0});return rows.get(id);};
  const contractsBySite=new Map();
  for(const record of data.contracts.filter(r=>r.revenue_type==='contract'&&!excluded.has(r.site_id))){
   if(!contractsBySite.has(record.site_id))contractsBySite.set(record.site_id,[]);
   contractsBySite.get(record.site_id).push(record);
   if(within(record.revenue_date))rowFor(record.site_id).contractRecorded=true;
  }
  let sales=0,invoiceCount=0,draftCount=0,draftAmount=0,cost=0,hasCosts=false,outgoing=0,planned=0,completed=0,phaseCount=0;
  for(const doc of data.documents){
   if(excluded.has(doc.site_id))continue;
   if(!['invoice','progress'].includes(doc.kind)||!['issued','draft'].includes(doc.status))continue;
   const amount=S.amount(doc.subtotal);if(amount===null||amount<0)throw Error('請求書の税別金額を確認できません。');
   const row=rowFor(doc.site_id);
   if(doc.status==='issued'){row.sales=add(row.sales,amount);row.invoiceCount++;sales=add(sales,amount);invoiceCount++;}
   else{row.draftAmount=add(row.draftAmount,amount);row.draftCount++;draftAmount=add(draftAmount,amount);draftCount++;}
  }
  for(const site of data.sites){
   if(excluded.has(site.id))continue;
   let result;try{result=S.analyze(data,site);}catch(e){throw Error(site.name+'：'+e.message);}
   const row=rows.get(site.id);
   row.cost=result.subtotal;row.hasCosts=result.hasData;row.warnings=result.warnings;row.outgoing=result.outgoingRevenue;
   cost=add(cost,row.cost);outgoing=add(outgoing,row.outgoing);hasCosts ||= row.hasCosts;
  }
  const siteIds=new Set(data.sites.map(s=>s.id));
  const unlinked=['reports','laborSheets','vehicleSheets','equipmentSheets'].reduce((n,key)=>n+data[key].filter(r=>!siteIds.has(r.site_id)).length,0);
  let invalidPhases=0;
  const profilesBySite=new Map(data.profiles.map(p=>[p.site_id,p]));
  for(const profile of data.profiles){
   if(excluded.has(profile.site_id))continue;
   for(const phase of list(profile.contract_breakdown).filter(p=>p?.target_month===month)){
    const amount=S.amount(phase.amount);if(amount===null||amount<0||!['planned','complete'].includes(phase.status)){invalidPhases++;rowFor(profile.site_id).invalidPhases=true;continue;}
    const row=rowFor(profile.site_id),key=phase.status==='complete'?'completed':'planned';
    row[key]=add(row[key],amount);row.phaseCount++;phaseCount++;
    if(key==='completed')completed=add(completed,amount);else planned=add(planned,amount);
   }
  }
  const shown=[...rows.values()].filter(r=>!excluded.has(r.site.id)&&(r.hasCosts||r.invoiceCount||r.draftCount||r.phaseCount||r.invalidPhases||r.outgoing||r.contractRecorded||(within(r.site.completed_on)&&contractsBySite.has(r.site.id))))
   .map(r=>{
    const contracts=contractsBySite.get(r.site.id)||[],amount=contracts.length===1?S.amount(contracts[0].amount):null;
    const contractState=!contracts.length?'missing':contracts.length===1&&amount!==null&&amount>=0&&siteIds.has(r.site.id)?'registered':'invalid';
    const rawPhases=profilesBySite.get(r.site.id)?.contract_breakdown,phases=list(rawPhases);
    const malformedPhases=rawPhases!=null&&!Array.isArray(rawPhases);
    let monthlyContractAmount=null,monthlyContractSource='missing';
    if(!siteIds.has(r.site.id)||r.invalidPhases||malformedPhases)monthlyContractSource='invalid';
    else if(r.phaseCount){monthlyContractAmount=add(r.planned,r.completed);monthlyContractSource='breakdown';}
    else if(!phases.length&&contractState==='registered'){
      // Monthly progress is not guessed from the contract amount. Until a
      // monthly breakdown/progress amount is entered, revenue and profit stay
      // unconfirmed while costs continue accumulating from daily reports.
      monthlyContractAmount=null;monthlyContractSource=r.hasCosts?'progress-pending':'not-started';
    }
    const validPhases=phases.length&&phases.every(p=>p&&/^\d{4}-(0[1-9]|1[0-2])$/.test(p.target_month)&&S.amount(p.amount)!==null&&S.amount(p.amount)>=0&&['planned','complete'].includes(p.status));
    const phaseTotal=validPhases?phases.reduce((sum,p)=>add(sum,S.amount(p.amount)),0):null;
    const contractMismatch=contractState==='registered'&&phaseTotal!==null&&phaseTotal!==amount;
    return {...r,contractAmount:contractState==='registered'?amount:null,contractState,profit:r.hasCosts?add(r.sales,-r.cost):null,
     monthlyContractAmount,monthlyContractSource,monthlyProfit:monthlyContractAmount!==null&&r.hasCosts?add(monthlyContractAmount,-r.cost):null,contractMismatch,phaseTotal};
   })
   .sort((a,b)=>a.site.name.localeCompare(b.site.name,'ja'));
  const contractCount=shown.filter(r=>r.contractState==='registered').length;
  const missingContracts=shown.filter(r=>r.contractState==='missing').length;
  const invalidContracts=shown.filter(r=>r.contractState==='invalid').length;
  const contractTotal=contractCount&&!invalidContracts?shown.reduce((sum,r)=>r.contractState==='registered'?add(sum,r.contractAmount):sum,0):null;
  const allocatedContract=phaseCount&&!invalidPhases?add(planned,completed):null;
  const missingInvoices=shown.filter(r=>r.hasCosts&&!r.invoiceCount).length;
  const missingCosts=shown.filter(r=>r.invoiceCount&&!r.hasCosts).length;
  const warningCount=shown.reduce((n,r)=>n+r.warnings.length,0);
  const knownCost=hasCosts&&!unlinked?cost:null;
  const startedRows=shown.filter(r=>r.hasCosts);
  const missingMonthlyContracts=startedRows.filter(r=>r.monthlyContractAmount===null).length;
  const missingMonthlyCosts=shown.filter(r=>r.monthlyContractAmount!==null&&!r.hasCosts).length;
  const monthlyContractTotal=startedRows.length&&!missingMonthlyContracts?startedRows.reduce((sum,r)=>add(sum,r.monthlyContractAmount),0):null;
  const monthlyProfit=monthlyContractTotal!==null&&knownCost!==null?add(monthlyContractTotal,-knownCost):null;
  return {month,rows:shown,sales,invoiceCount,cost:knownCost,profit:knownCost===null?null:add(sales,-knownCost),
   contractTotal,contractCount,missingContracts,invalidContracts,allocatedContract,
   monthlyContractTotal,monthlyProfit,missingMonthlyContracts,missingMonthlyCosts,
   draftCount,draftAmount,planned,completed,phaseCount,outgoing,invalidPhases,unlinked,missingInvoices,missingCosts,warningCount,
   partial:!!(warningCount||missingInvoices||missingCosts||unlinked||draftCount),hasData:!!(shown.length||unlinked)};
 }

 // Auto defaults are derived from this month only. Only explicit user overrides
 // are persisted, so a newly started/completed site can enter the selection.
 const selectionVersion=1;
 const normalizedName=x=>String(x??'').normalize('NFKC').replace(/[\s　]/g,'');
 const validDay=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
 const validMonth=x=>typeof x==='string'&&/^(20\d\d|21\d\d)-(0[1-9]|1[0-2])$/.test(x);
 function selectionStorageKey(company,m){
  if(typeof company!=='string'||!company||!validMonth(m))throw Error('会社・対象月を確認してください。');
  return 'toya-monthly-selection:v1:'+encodeURIComponent(company)+':'+m;
 }
 function parseSelection(raw,m){
  try{const v=JSON.parse(raw);if(!v||v.version!==selectionVersion||v.month!==m||!Array.isArray(v.overrides)||v.overrides.length>10000)return new Map();
   if(v.overrides.some(p=>!Array.isArray(p)||p.length!==2||typeof p[0]!=='string'||!p[0]||typeof p[1]!=='boolean'))return new Map();
   return new Map(v.overrides);
  }catch(e){return new Map();}
 }
 function selectionValue(m,overrides){return JSON.stringify({version:selectionVersion,month:m,overrides:[...overrides]});}
 function automaticSelection(data,m,company){
  if(!validMonth(m))throw Error('対象月を確認してください。');
  const b=S.periodBounds('month',m),within=d=>validDay(d)&&d>=b.start&&d<b.end;
  const sites=list(data.sites),byName=new Map(),active=new Set();
  // Do not use a duplicate name to attribute moved work to an arbitrary site.
  for(const site of sites){const name=normalizedName(site.name);if(!byName.has(name))byName.set(name,[]);byName.get(name).push(site.id);}
  const markName=name=>{const ids=byName.get(normalizedName(name));if(ids?.length===1)active.add(ids[0]);};
  for(const [key,,,dateField] of sources()){
   if(!dateField||key==='documents')continue;
   for(const r of list(data[key]).filter(r=>within(r[dateField]))){
    if(r.site_id)active.add(r.site_id);
    if(key==='reports'){
     for(const move of list(r.report_data?.siteMoves))markName(move?.site);
     for(const entry of list(r.report_data?.usageHours?.entries))for(const a of list(entry?.allocations)){
      if(Number(a.minutes)>0||Number(a.highway)>0)markName(a.site);
     }
    }
   }
  }
  // Revenue rows and issued invoices are month-specific records, not new revenue.
  for(const d of list(data.documents))if(within(d.document_date)&&['invoice','progress'].includes(d.kind)&&d.status==='issued')active.add(d.site_id);
  const profiles=new Map(list(data.profiles).map(p=>[p.site_id,p]));
  const defaults=new Set(),reasons=new Map();
  for(const site of sites){
   const name=normalizedName(site.name),p=profiles.get(site.id);
   if(name==='現場名をあとで変更'){reasons.set(site.id,'現場名未設定');continue;}
   if(company==='40a7a065-1086-4e62-aa09-f44d6207602c'&&(site.id==='b02cdda0-80d2-4129-b681-f25eeff5b7ff'||name==='会社の清掃(犬迫町)')){reasons.set(site.id,'請負外・自動選択対象外');continue;}
   const phase=list(p?.contract_breakdown).some(r=>r?.target_month===m);
   const finished=within(site.completed_on);
   // Creation date is not a work-start date. Do not select an unused master
   // merely because its default status is active. Known work periods can span months.
   const end=validDay(site.completed_on)?site.completed_on:validDay(p?.work_end)?p.work_end:null;
   const ongoing=validDay(p?.work_start)&&p.work_start<b.end&&(end?end>=b.start:site.status==='active');
   if(finished||active.has(site.id)||phase||ongoing){defaults.add(site.id);reasons.set(site.id,finished?'対象月に完工':ongoing?'対象月の工期に該当':'対象月の記録あり');}
   else reasons.set(site.id,'対象月の記録なし');
  }
  return {defaults,reasons};
 }
 function resolveSelection(data,m,company,overrides=new Map()){
  const result=automaticSelection(data,m,company),off=new Set();
  for(const site of list(data.sites)){
   const selected=normalizedName(site.name)!=='現場名をあとで変更'&&(overrides.has(site.id)?overrides.get(site.id)===true:result.defaults.has(site.id));
   if(!selected)off.add(site.id);
  }
  return {...result,excluded:off};
 }
 const selectionAPI=Object.freeze({key:selectionStorageKey,parse:parseSelection,value:selectionValue,automatic:automaticSelection,resolve:resolveSelection});

 const api=Object.freeze({calculate,japanMonth,sources,selection:selectionAPI});
 if(node){module.exports=api;return;}
 if(window.ToyaCompanyMonthlySummary)return;window.ToyaCompanyMonthlySummary=api;
 const q=s=>document.querySelector(s);
 const identity=()=>typeof cloudProfile!=='undefined'&&cloudProfile?.active===true&&cloudProfile.role==='admin'&&cloudProfile.company_id&&typeof cloudClient!=='undefined'&&cloudClient?cloudProfile.id+':'+cloudProfile.company_id:'';
 const visible=()=>q('#homePage')?.classList.contains('active')&&!document.hidden;
 let owner='',ticket=0,pending='',loaded='',loadedAt=0,month=japanMonth(),followCurrent=true,card=null,timer=null,excluded=new Set(),selectionStateKey='',selectionOverrides=new Map(),selectionReadError=false,snapshot=null;
 function clear(){excluded=new Set();selectionStateKey='';selectionOverrides=new Map();selectionReadError=false;snapshot=null;ticket++;owner='';pending='';loaded='';loadedAt=0;clearTimeout(timer);card?.remove();card=null;month=japanMonth();followCurrent=true;}
 function place(){
  const home=q('#homePage'),entry=q('#uxDailyHome');
  if(!card?.isConnected||!home||!entry)return;
  if(entry.nextElementSibling!==card)entry.after(card);
 }
 function setStatus(text,error=false){if(!q('#cmStatus'))return;q('#cmStatus').textContent=text;q('#cmStatus').classList.toggle('cm-error',error);}
 function empty(){for(const id of ['cmActiveContract','cmContract','cmSales','cmCost','cmProfit'])if(q('#'+id))q('#'+id).textContent='—';if(q('#cmProfit'))q('#cmProfit').classList.remove('cm-negative');if(q('#cmBreakdown'))q('#cmBreakdown').replaceChildren();for(const id of ['cmNotice','cmContractInfo'])if(q('#'+id))q('#'+id).textContent='';}
 function mount(){
  const id=identity();if(id!==owner){clear();if(!id)return false;owner=id;}
  if(!id)return false;if(card?.isConnected)return true;
  const home=q('#homePage');if(!home)return false;
  card=document.createElement('section');card.id='companyMonthlySummary';card.className='card admin-home-only cm-card';card.setAttribute('aria-labelledby','cmTitle');
  card.innerHTML='<div class="cm-heading"><h2 id="cmTitle">今月の請負金・売上・原価・利益</h2><span id="cmScope">選択現場・税別</span></div>'+
   '<div class="cm-controls"><div><label for="cmMonth">対象月</label><input id="cmMonth" type="month" min="2000-01" value="'+month+'"></div><button id="cmThisMonth" class="btn light" type="button">今月</button><button id="cmRefresh" class="btn dark" type="button">更新</button></div>'+
   '<details id="cmSiteFilter"><summary>集計する現場を選ぶ</summary><p class="note">対象月の施工・売上・原価の記録がある現場と、その月の完工現場を自動で選びます。チェックは自由に変更でき、手動変更はこの端末・会社・対象月ごとに保存します。日報や保存金額は変更しません。</p><button id="cmAutoSelect" class="btn light" type="button" style="width:100%;margin:8px 0" disabled>自動選択に戻す</button><div id="cmSiteChoices"></div></details><p id="cmSelectionNote" class="note"></p>'+
   '<div class="cm-metrics"><div><span>選択現場の請負総額（参考）</span><strong id="cmActiveContract">—</strong></div><div><span>対象月の出来高（未請求含む）</span><strong id="cmContract">—</strong></div><div class="cm-sales"><span>請求済み（参考）</span><strong id="cmSales">—</strong></div><div><span>対象月の原価（入力済み）</span><strong id="cmCost">—</strong></div><div><span>利益（請負分基準・暫定）</span><strong id="cmProfit">—</strong></div></div>'+
   '<div id="cmProgressAction"><button id="cmProgressOpen" class="btn lime" type="button" style="width:100%;margin:14px 0;font-weight:900">今月の出来高を入力</button><div id="cmProgressEditor"></div></div><p id="cmContractInfo" class="cm-contract-note"></p><button id="cmPeriodOpen" class="btn light" type="button" style="width:100%;margin:10px 0">現場別の月別・工事全体を見る</button>'+
   '<p id="cmNotice" class="cm-notice"></p><p id="cmStatus" class="note" role="status" aria-live="polite">読み込み中…</p>'+
   '<details id="cmDetails"><summary>現場ごとの内訳・集計方法</summary><div id="cmBreakdown"></div><div class="cm-method"><p>対象月の請負分：登録された月別契約内訳（予定・出来高済み）を使います。月途中でも「現場内容・契約内訳」で現時点の出来高を入力すると、その金額を対象月の出来高として集計し、暫定利益を表示します。月末に最終出来高へ変更して確定してください。前月までの出来高は翌月へ二重計上しません。</p><p>請求済み：対象月に発行した確定済みの請求書・出来高請求書の税別合計です。請負分との重複を避けるため、利益には加算しません。見積書・下書き・取消済みは含みません。</p><p>原価：選択した現場の対象月の日報から計算し、保存済みの調整額がある日はその金額を優先します。完工済み・過去の現場も含みます。</p><p>暫定利益：対象月の請負分 − 対象月の入力済み原価です。未請求分を含みます。工事全体の最終利益や会計上の確定利益ではなく、追加費用で変わる途中の差額です。別の月の原価・今後の費用・会社全体の管理費は含みません。</p></div></details>';
  home.prepend(card);place();
  q('#cmMonth').onchange=()=>{month=q('#cmMonth').value;followCurrent=month===japanMonth();ticket++;pending='';loaded='';empty();refresh();};
  q('#cmThisMonth').onclick=()=>{month=japanMonth();followCurrent=true;q('#cmMonth').value=month;ticket++;pending='';loaded='';empty();refresh();};
  q('#cmAutoSelect').onclick=resetSelection;q('#cmRefresh').onclick=()=>refresh(true);q('#cmProgressOpen').onclick=()=>renderProgressEditor();q('#cmPeriodOpen').onclick=()=>{if(!window.ToyaSitePeriodUI)return setStatus('現場別集計を読み込めません。画面を更新してください。',true);const selected=list(snapshot?.sites).filter(s=>!excluded.has(s.id));window.ToyaSitePeriodUI.open({siteId:selected.length===1?selected[0].id:'',month});};return true;
 }
 function loadSelection(){
  const key=selectionStorageKey(cloudProfile.company_id,month);
  if(selectionStateKey!==key){
   selectionStateKey=key;selectionOverrides=new Map();selectionReadError=false;
   // The old company-wide exclusion list had no month or explicit-override
   // provenance. Leave it untouched for rollback; start the new policy afresh.
   try{selectionOverrides=parseSelection(localStorage.getItem(key),month);}catch(e){selectionReadError=true;}
  }
 }
 function persistSelection(){
  try{localStorage.setItem(selectionStateKey,selectionValue(month,selectionOverrides));selectionReadError=false;return true;}
  catch(e){return false;}
 }
 function resetSelection(){
  if(!snapshot||pending||identity()!==owner)return;
  if(selectionOverrides.size&&!confirm('この月の手動チェックを解除して、自動選択に戻しますか？\n日報・売上・原価は変更しません。'))return;
  selectionOverrides=new Map();const saved=persistSelection();
  selectSites(snapshot);render(calculate(snapshot,month,[...excluded]));selectionNote();
  if(!saved)setStatus('自動選択に戻しましたが、端末には保存できませんでした。',true);
 }
 function selectSites(data){
  snapshot=data;loadSelection();
  excluded=resolveSelection(data,month,cloudProfile.company_id,selectionOverrides).excluded;
  const box=q('#cmSiteChoices');box.replaceChildren();
  for(const site of [...data.sites].filter(s=>normalizedName(s.name)!=='現場名をあとで変更').sort((a,b)=>a.name.localeCompare(b.name,'ja'))){
   const label=document.createElement('label'),check=document.createElement('input');
   check.type='checkbox';check.checked=!excluded.has(site.id);check.dataset.siteId=site.id;
   label.append(check,document.createTextNode(site.name));box.append(label);
   check.onchange=()=>{
    if(!snapshot||pending||identity()!==owner){check.checked=!excluded.has(site.id);return;}
    selectionOverrides.set(site.id,check.checked);
    if(check.checked)excluded.delete(site.id);else excluded.add(site.id);
    const saved=persistSelection();
    render(calculate(snapshot,month,[...excluded]));selectionNote();
    if(!saved)setStatus('集計は更新しました。手動チェックは端末に保存できませんでした。',true);
   };
  }
  selectionNote();
 }
 function selectionNote(){
  const sites=list(snapshot?.sites),off=sites.filter(s=>excluded.has(s.id));
  q('#cmScope').textContent=(off.length?'選択現場':'全現場')+'・税別';
  q('#cmSelectionNote').textContent=(selectionOverrides.size?'対象月の自動選択＋手動変更。':'対象月の現場を自動選択。')+(sites.length===off.length?'集計する現場を選んでください。':off.length?'集計対象外：'+off.map(s=>s.name).join('・'):'すべての現場を集計しています。')+(selectionReadError?' 端末の保存済み選択を読み込めませんでした。':'');
 }
 async function read([key,table,fields,dateField,idField],company,bounds,t,mine){
  const rows=[];
  for(let offset=0;offset<100000;offset+=500){
   if(t!==ticket||identity()!==mine)throw Error('ログイン状態が変わりました。');
   let query=cloudClient.from(table).select('company_id,'+fields).eq('company_id',company);
   if(key==='contracts')query=query.eq('revenue_type','contract');
   if(dateField)query=query.gte(dateField,bounds.start).lt(dateField,bounds.end);
   const response=await query.order(idField).range(offset,offset+499);
   if(response.error)throw Error('記録を読み込めませんでした。通信を確認して「更新」を押してください。');
   const page=response.data;
   if(!Array.isArray(page)||page.some(r=>r.company_id!==company))throw Error('会社の記録を確認できません。ログインし直してください。');
   rows.push(...page);if(page.length<500)return [key,rows];
  }
  throw Error('記録の全件を確認できませんでした。途中の合計は表示していません。');
 }
 function renderProgressEditor(){
  if(!snapshot||!window.ToyaSitePeriodUI){setStatus('現場別の売上画面を読み込めません。画面を更新してください。',true);return;}
  const candidates=snapshot.sites.filter(s=>!excluded.has(s.id));
  window.ToyaSitePeriodUI.open({siteId:candidates.length===1?candidates[0].id:'',month,edit:true});
 }
 function render(result){
  const activeContractTotal=result.rows.filter(r=>r.hasCosts&&r.contractAmount!==null).reduce((sum,r)=>add(sum,r.contractAmount),0);
  q('#cmActiveContract').textContent=yen(activeContractTotal);
  q('#cmContract').textContent=yen(result.monthlyContractTotal);
  q('#cmSales').textContent=yen(result.sales);q('#cmCost').textContent=yen(result.cost);
  const contractText=q('#cmContract').textContent,costText=q('#cmCost').textContent;
  const displayedContract=parseFloat(contractText.replace(/,/g,'').replace('円','')),displayedCost=parseFloat(costText.replace(/,/g,'').replace('円',''));
  const displayProfit=contractText!=='—'&&costText!=='—'&&Number.isFinite(displayedContract)&&Number.isFinite(displayedCost)?Math.round((displayedContract-displayedCost)*100)/100:result.monthlyProfit;
  q('#cmProfit').textContent=yen(displayProfit);result.monthlyProfit=displayProfit;
  q('#cmContractInfo').textContent=result.hasData?'出来高を入力すると「出来高 − 原価」で暫定利益を表示します。':'';
  q('#cmProfit').classList.toggle('cm-negative',result.monthlyProfit!==null&&result.monthlyProfit<0);
  const notices=[];
  if(!result.hasData)notices.push('この月の記録はまだありません。');
  if(result.missingMonthlyContracts){const pendingNames=result.rows.filter(r=>r.hasCosts&&r.monthlyContractAmount===null).map(r=>r.site.name);notices.push('着工済みで対象月の出来高が未確定：'+pendingNames.join('・')+'（'+result.missingMonthlyContracts+'件）。「現場内容・契約内訳」で現時点の出来高を入力すると、出来高と暫定利益を表示します。月末に最終出来高へ変更して確定してください。');}
  if(result.missingMonthlyCosts)notices.push('請負分は登録済みですが、原価の記録がない現場 '+result.missingMonthlyCosts+'件。入力済み原価だけで暫定利益を表示しています。');
  if(result.warningCount)notices.push('原価に未入力・確認待ちがあります。内訳で確認できます。');
  if(result.unlinked)notices.push('現場の紐付けを確認できない日報・費用 '+result.unlinked+'件。原価と利益の合計は表示していません。');
  q('#cmNotice').textContent='';
  const references=[];
  if(result.contractCount||result.invalidContracts)references.push('対象現場の請負総額（全工期・登録分）：'+yen(result.contractTotal));
  if(result.missingContracts)references.push('請負総額が未登録の現場：'+result.missingContracts+'件');
  if(result.invalidContracts)references.push('請負総額の重複・金額・現場を要確認：'+result.invalidContracts+'件');
  if(result.hasData)references.push('請求済み − 原価（参考）：'+yen(result.profit)+'。未請求分は含みません。');
  if(result.missingInvoices)references.push('日報・費用があり、対象月に確定請求がない現場：'+result.missingInvoices+'件');
  if(result.draftCount)references.push('未確定の請求書：'+result.draftCount+'件 ／ '+yen(result.draftAmount));
  if(result.phaseCount)references.push('月別契約内訳：出来高済み '+yen(result.completed)+' ／ 予定 '+yen(result.planned));
  if(result.outgoing)references.push('常用売上の記録：'+yen(result.outgoing));
  if(result.invalidPhases)references.push('金額・状態を確認できない月別契約内訳：'+result.invalidPhases+'件');
  for(const row of result.rows.filter(r=>r.contractMismatch))references.push(row.site.name+'：請負総額 '+yen(row.contractAmount)+' と月別内訳の全期間合計 '+yen(row.phaseTotal)+' が異なります。対象月に登録された内訳を優先して集計しています。');
  const siteCards=result.rows.filter(row=>row.hasCosts||row.monthlyContractAmount!==null).map(row=>{const progress=row.monthlyContractAmount!==null?yen(row.monthlyContractAmount):'未確定',profit=row.monthlyProfit!==null?yen(row.monthlyProfit):'未確定',balance=row.contractAmount!==null?yen(Math.max(0,row.contractAmount-(row.phaseTotal??0))):'未登録';return '<div class="cm-site-card"><h3>'+escape(row.site.name)+'</h3><div><span>請負総額</span><b>'+yen(row.contractAmount)+'</b></div><div><span>今月出来高</span><b>'+progress+'</b></div><div><span>請負残金</span><b>'+balance+'</b></div><div><span>今月原価</span><b>'+(row.hasCosts?yen(row.cost):'記録なし')+'</b></div><div><span>今月利益</span><b>'+profit+'</b></div></div>';}).join('');
  q('#cmBreakdown').innerHTML=(siteCards?'<h3>現場ごとの状況</h3><div class="cm-site-cards">'+siteCards+'</div>':'')+references.map(s=>'<p class="cm-reference">'+escape(s)+'</p>').join('')+
   result.rows.filter(r=>r.warnings.length).map(r=>'<details class="cm-site-warnings"><summary>'+escape(r.site.name)+'：原価の確認 '+r.warnings.length+'件</summary>'+r.warnings.map(w=>'<p>'+escape(w)+'</p>').join('')+'</details>').join('');
  setStatus('確定請求 '+result.invoiceCount+'件 ／ '+new Date().toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})+' 更新');
 }
 async function refresh(force=false){
  if(!mount()||!visible())return;
  const key=owner+':'+month;if(pending===key||(!force&&loaded===key&&Date.now()-loadedAt<60000))return;
  const mine=owner,t=++ticket,company=cloudProfile.company_id,currentMonth=month;pending=key;snapshot=null;q('#cmAutoSelect').disabled=true;card.querySelectorAll('#cmSiteChoices input').forEach(x=>x.disabled=true);
  q('#cmTitle').textContent=month===japanMonth()?'今月の請負金・売上・原価・利益':'月別の請負金・売上・原価・利益';
  q('#cmRefresh').disabled=true;card.setAttribute('aria-busy','true');setStatus('全現場の月合計を読み込み中…');
  try{
   if(!S)throw Error('原価計算を読み込めません。画面を再読み込みしてください。');
   const bounds=S.periodBounds('month',currentMonth),results=await Promise.allSettled(sources().map(def=>read(def,company,bounds,t,mine)));
   if(t!==ticket||identity()!==mine||month!==currentMonth)return;
   const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
   const data=Object.fromEntries(results.map(r=>r.value));selectSites(data);const result=calculate(data,currentMonth,[...excluded]);render(result);loaded=key;loadedAt=Date.now();
  }catch(e){if(t===ticket&&identity()===mine){empty();loaded='';setStatus('集計できませんでした：'+e.message,true);}}
  finally{if(t===ticket&&identity()===mine){pending='';q('#cmRefresh').disabled=false;q('#cmAutoSelect').disabled=!snapshot;card.querySelectorAll('#cmSiteChoices input').forEach(x=>x.disabled=!snapshot);card.setAttribute('aria-busy','false');}}
 }
 function schedule(force=false){clearTimeout(timer);timer=setTimeout(()=>refresh(force),180);}
 function start(){
  if(mount())schedule();
  document.addEventListener('toya-role-changed',()=>{if(mount())schedule();});
  document.addEventListener('click',e=>{if(e.target.closest?.('nav [data-page="homePage"]')){if(mount())schedule(true);}});
  window.addEventListener('pageshow',()=>{if(mount())schedule();});
  document.addEventListener('visibilitychange',()=>{if(visible()&&mount())schedule();});
  // Mark fresh data without replacing a screen the user is reading or editing.
  for(const event of ['toya-project-document-changed','toya-site-project-profile-saved','toya-site-renamed','toya-site-lifecycle-changed'])document.addEventListener(event,()=>{loaded='';ticket++;pending='';if(card){q('#cmRefresh').disabled=false;card.setAttribute('aria-busy','false');setStatus('記録が変わりました。「更新」で最新の月合計を確認できます。');}});
  const home=q('#homePage');if(home)new MutationObserver(place).observe(home,{childList:true});
  setInterval(()=>{if(identity()!==owner){if(mount())schedule();}else if(owner&&followCurrent&&month!==japanMonth()){month=japanMonth();q('#cmMonth').value=month;loaded='';empty();schedule();}},1000);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
