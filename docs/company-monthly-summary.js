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
  ['profiles','site_project_profiles','site_id,contract_breakdown,updated_at',null,'site_id']
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
 const api=Object.freeze({calculate,japanMonth,sources});
 if(node){module.exports=api;return;}
 if(window.ToyaCompanyMonthlySummary)return;window.ToyaCompanyMonthlySummary=api;
 const q=s=>document.querySelector(s);
 const identity=()=>typeof cloudProfile!=='undefined'&&cloudProfile?.active===true&&cloudProfile.role==='admin'&&cloudProfile.company_id&&typeof cloudClient!=='undefined'&&cloudClient?cloudProfile.id+':'+cloudProfile.company_id:'';
 const visible=()=>q('#homePage')?.classList.contains('active')&&!document.hidden;
 let owner='',ticket=0,pending='',loaded='',loadedAt=0,month=japanMonth(),followCurrent=true,card=null,timer=null,excluded=new Set(),selectionReady=false,snapshot=null;
 function clear(){excluded=new Set();selectionReady=false;snapshot=null;ticket++;owner='';pending='';loaded='';loadedAt=0;clearTimeout(timer);card?.remove();card=null;month=japanMonth();followCurrent=true;}
 function place(){
  const home=q('#homePage'),entry=q('#uxDailyHome');
  if(!card?.isConnected||!home||!entry)return;
  if(entry.nextElementSibling!==card)entry.after(card);
 }
 function setStatus(text,error=false){if(!q('#cmStatus'))return;q('#cmStatus').textContent=text;q('#cmStatus').classList.toggle('cm-error',error);}
 function empty(){for(const id of ['cmContract','cmSales','cmCost','cmProfit'])if(q('#'+id))q('#'+id).textContent='—';if(q('#cmProfit'))q('#cmProfit').classList.remove('cm-negative');if(q('#cmBreakdown'))q('#cmBreakdown').replaceChildren();for(const id of ['cmNotice','cmContractInfo'])if(q('#'+id))q('#'+id).textContent='';}
 function mount(){
  const id=identity();if(id!==owner){clear();if(!id)return false;owner=id;}
  if(!id)return false;if(card?.isConnected)return true;
  const home=q('#homePage');if(!home)return false;
  card=document.createElement('section');card.id='companyMonthlySummary';card.className='card admin-home-only cm-card';card.setAttribute('aria-labelledby','cmTitle');
  card.innerHTML='<div class="cm-heading"><h2 id="cmTitle">今月の請負金・売上・原価・利益</h2><span id="cmScope">選択現場・税別</span></div>'+
   '<div class="cm-controls"><div><label for="cmMonth">対象月</label><input id="cmMonth" type="month" min="2000-01" value="'+month+'"></div><button id="cmThisMonth" class="btn light" type="button">今月</button><button id="cmRefresh" class="btn dark" type="button">更新</button></div>'+
   '<details id="cmSiteFilter"><summary>集計する現場を選ぶ</summary><p class="note">チェックした現場の請負金・売上・原価・利益を集計します。日報や保存金額は変更しません。選択はこの端末・会社ごとに保存します。</p><div id="cmSiteChoices"></div></details><p id="cmSelectionNote" class="note"></p>'+
   '<div class="cm-metrics"><div><span>対象月の請負分（未請求含む）</span><strong id="cmContract">—</strong></div><div class="cm-sales"><span>請求済み（参考）</span><strong id="cmSales">—</strong></div><div><span>対象月の原価（入力済み）</span><strong id="cmCost">—</strong></div><div><span>利益（請負分基準・暫定）</span><strong id="cmProfit">—</strong></div></div>'+
   '<p id="cmContractInfo" class="cm-contract-note"></p>'+
   '<p id="cmNotice" class="cm-notice"></p><p id="cmStatus" class="note" role="status" aria-live="polite">読み込み中…</p>'+
   '<details id="cmDetails"><summary>現場ごとの内訳・集計方法</summary><div id="cmBreakdown"></div><div class="cm-method"><p>対象月の請負分：登録された月別契約内訳（予定・出来高済み）を使います。月途中は出来高を推測せず未確定とします。月末に「現場内容・契約内訳」で対象月の出来高を入力すると、その金額を対象月の請負分として集計します。前月までの出来高は翌月へ二重計上しません。</p><p>請求済み：対象月に発行した確定済みの請求書・出来高請求書の税別合計です。請負分との重複を避けるため、利益には加算しません。見積書・下書き・取消済みは含みません。</p><p>原価：選択した現場の対象月の日報から計算し、保存済みの調整額がある日はその金額を優先します。完工済み・過去の現場も含みます。</p><p>暫定利益：対象月の請負分 − 対象月の入力済み原価です。未請求分を含みます。工事全体の最終利益や会計上の確定利益ではなく、追加費用で変わる途中の差額です。別の月の原価・今後の費用・会社全体の管理費は含みません。</p></div></details>';
  home.prepend(card);place();
  q('#cmMonth').onchange=()=>{month=q('#cmMonth').value;followCurrent=month===japanMonth();ticket++;pending='';loaded='';empty();refresh();};
  q('#cmThisMonth').onclick=()=>{month=japanMonth();followCurrent=true;q('#cmMonth').value=month;ticket++;pending='';loaded='';empty();refresh();};
  q('#cmRefresh').onclick=()=>refresh(true);return true;
 }
 function selectionKey(){return 'toya-monthly-excluded:'+cloudProfile.company_id;}
 function selectSites(data){
  snapshot=data;
  if(!selectionReady){
   let saved=null;try{saved=JSON.parse(localStorage.getItem(selectionKey()));}catch(e){}
   if(Array.isArray(saved))excluded=new Set(saved.filter(x=>typeof x==='string'));
   else if(cloudProfile.company_id==='40a7a065-1086-4e62-aa09-f44d6207602c')excluded=new Set(data.sites.filter(s=>s.name.normalize('NFKC').replace(/[\s　]/g,'')==='会社の清掃(犬迫町)').map(s=>s.id));
   selectionReady=true;
  }
  const box=q('#cmSiteChoices');box.replaceChildren();
  for(const site of [...data.sites].sort((a,b)=>a.name.localeCompare(b.name,'ja'))){
   const label=document.createElement('label'),check=document.createElement('input');
   check.type='checkbox';check.checked=!excluded.has(site.id);check.dataset.siteId=site.id;
   label.append(check,document.createTextNode(site.name));box.append(label);
   check.onchange=()=>{
    if(!snapshot||pending){check.checked=!excluded.has(site.id);return;}
    if(check.checked)excluded.delete(site.id);else excluded.add(site.id);
    let saved=true;try{localStorage.setItem(selectionKey(),JSON.stringify([...excluded]));}catch(e){saved=false;}
    render(calculate(snapshot,month,[...excluded]));selectionNote();
    if(!saved)setStatus('集計は更新しました。現場の選択を端末に保存できませんでした。',true);
   };
  }
  selectionNote();
 }
 function selectionNote(){
  const sites=list(snapshot?.sites),off=sites.filter(s=>excluded.has(s.id));
  q('#cmScope').textContent=(off.length?'選択現場':'全現場')+'・税別';
  q('#cmSelectionNote').textContent=sites.length===off.length?'集計する現場を選んでください。':off.length?'集計対象外：'+off.map(s=>s.name).join('・'):'すべての現場を集計しています。';
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
 function render(result){
  q('#cmContract').textContent=yen(result.monthlyContractTotal);
  q('#cmSales').textContent=yen(result.sales);q('#cmCost').textContent=yen(result.cost);
  const contractText=q('#cmContract').textContent,costText=q('#cmCost').textContent;
  const displayedContract=parseFloat(contractText.replace(/,/g,'').replace('円','')),displayedCost=parseFloat(costText.replace(/,/g,'').replace('円',''));
  const displayProfit=contractText!=='—'&&costText!=='—'&&Number.isFinite(displayedContract)&&Number.isFinite(displayedCost)?Math.round((displayedContract-displayedCost)*100)/100:result.monthlyProfit;
  q('#cmProfit').textContent=yen(displayProfit);result.monthlyProfit=displayProfit;
  q('#cmContractInfo').textContent=result.hasData?'利益は「対象月の請負分 − 対象月の入力済み原価」です。未請求分を含む途中の差額で、追加費用により変わります。':'';
  q('#cmProfit').classList.toggle('cm-negative',result.monthlyProfit!==null&&result.monthlyProfit<0);
  const notices=[];
  if(!result.hasData)notices.push('この月の記録はまだありません。');
  if(result.missingMonthlyContracts)notices.push('着工済みで対象月の出来高が未確定の現場 '+result.missingMonthlyContracts+'件。月末に「現場内容・契約内訳」でその月の出来高を入力・確定してください。確定までは原価だけを表示し、出来高と利益は未確定です。');
  if(result.missingMonthlyCosts)notices.push('請負分は登録済みですが、原価の記録がない現場 '+result.missingMonthlyCosts+'件。入力済み原価だけで暫定利益を表示しています。');
  if(result.warningCount)notices.push('原価に未入力・確認待ちがあります。内訳で確認できます。');
  if(result.unlinked)notices.push('現場の紐付けを確認できない日報・費用 '+result.unlinked+'件。原価と利益の合計は表示していません。');
  q('#cmNotice').textContent=notices.join(' ');
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
  const cells=result.rows.map(row=>'<tr><th scope="row">'+escape(row.site.name)+(row.site.completed_on?'<small>完工済み</small>':'')+'</th><td data-label="対象月の請負分"><span>'+(row.monthlyContractAmount!==null?yen(row.monthlyContractAmount)+'<small>'+(row.monthlyContractSource==='breakdown'?'月別内訳':row.monthlyContractSource==='active-month'?'着工月の請負金':'完工月の請負金')+'</small>':row.monthlyContractSource==='invalid'?'要確認':row.monthlyContractSource==='progress-pending'?'出来高未確定':row.monthlyContractSource==='not-started'?'未着工':row.contractState==='missing'?'請負金未登録':'出来高未確定')+'</span></td><td data-label="請求済み">'+yen(row.sales)+'</td><td data-label="原価">'+(row.hasCosts?yen(row.cost):'記録なし')+'</td><td data-label="暫定利益">'+yen(row.monthlyProfit)+'</td></tr>').join('');
  q('#cmBreakdown').innerHTML=(result.rows.length?'<div class="cm-table-wrap"><table><caption>選択した現場の月別集計</caption><thead><tr><th>現場</th><th>対象月の請負分</th><th>請求済み</th><th>原価</th><th>暫定利益</th></tr></thead><tbody>'+cells+'</tbody></table></div>':'')+references.map(s=>'<p class="cm-reference">'+escape(s)+'</p>').join('')+
   result.rows.filter(r=>r.warnings.length).map(r=>'<details class="cm-site-warnings"><summary>'+escape(r.site.name)+'：原価の確認 '+r.warnings.length+'件</summary>'+r.warnings.map(w=>'<p>'+escape(w)+'</p>').join('')+'</details>').join('');
  setStatus('確定請求 '+result.invoiceCount+'件 ／ '+new Date().toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})+' 更新');
 }
 async function refresh(force=false){
  if(!mount()||!visible())return;
  const key=owner+':'+month;if(pending===key||(!force&&loaded===key&&Date.now()-loadedAt<60000))return;
  const mine=owner,t=++ticket,company=cloudProfile.company_id,currentMonth=month;pending=key;snapshot=null;card.querySelectorAll('#cmSiteChoices input').forEach(x=>x.disabled=true);
  q('#cmTitle').textContent=month===japanMonth()?'今月の請負金・売上・原価・利益':'月別の請負金・売上・原価・利益';
  q('#cmRefresh').disabled=true;card.setAttribute('aria-busy','true');setStatus('全現場の月合計を読み込み中…');
  try{
   if(!S)throw Error('原価計算を読み込めません。画面を再読み込みしてください。');
   const bounds=S.periodBounds('month',currentMonth),results=await Promise.allSettled(sources().map(def=>read(def,company,bounds,t,mine)));
   if(t!==ticket||identity()!==mine||month!==currentMonth)return;
   const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
   const data=Object.fromEntries(results.map(r=>r.value));selectSites(data);const result=calculate(data,currentMonth,[...excluded]);render(result);loaded=key;loadedAt=Date.now();
  }catch(e){if(t===ticket&&identity()===mine){empty();loaded='';setStatus('集計できませんでした：'+e.message,true);}}
  finally{if(t===ticket&&identity()===mine){pending='';q('#cmRefresh').disabled=false;card.querySelectorAll('#cmSiteChoices input').forEach(x=>x.disabled=!snapshot);card.setAttribute('aria-busy','false');}}
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
