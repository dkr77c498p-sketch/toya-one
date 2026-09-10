/* TOYA One usage hours v1: minute-based facts; private rates are never embedded.
 * Existing confirmed sheets retain priority. Missing time/rates are not confirmed zero.
 */
(() => {
 'use strict';
 const arr=v=>Array.isArray(v)?v:[],norm=v=>String(v??'').normalize('NFKC').replace(/[\s　]/g,'').toLowerCase();
 const key=v=>['sk55','sk55sr'].includes(norm(v))?'sk55':norm(v)==='アームロール'?norm('4tアームロール'):norm(v);
 const num=v=>v==null||String(v).trim()===''||typeof v==='boolean'?null:Number(v);
 const unique=rows=>[...new Map(arr(rows).map(r=>[r.id,r])).values()];
 const round=v=>Math.round((v+Number.EPSILON)*100)/100;
 const kinds={labor:'人工',dispatch:'応援・派遣',vehicle:'車両',equipment:'重機',attachment:'アタッチメント',tool:'小型機械・工具'};
 const fields={labor:'workers',dispatch:null,vehicle:'vehicles',equipment:'machines',attachment:'attachments',tool:'attachments'};
 const label=v=>typeof v==='string'?v:String(v?.name||'');
 const sheetKey=k=>k==='labor'||k==='dispatch'?'laborSheets':k==='vehicle'?'vehicleSheets':'equipmentSheets';
 function workMinutes(start,end,pause){
  const parse=t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(t))?Number(t.slice(0,2))*60+Number(t.slice(3)):NaN;
  const a=parse(start),b=parse(end),p=num(pause);
  return Number.isFinite(a)&&Number.isFinite(b)&&a>=0&&b<=1440&&b>a&&Number.isInteger(p)&&p>=0&&p<=b-a?b-a-p:null;
 }
 function validateEntry(e){
  if(!e||!Object.hasOwn(kinds,e.kind)||!String(e.label||'').trim())return '対象の種類・名前を確認してください。';
  if(['labor','vehicle','equipment'].includes(e.kind)&&e.quantity!==1)return '自社の人・車両・重機は1人・1台ごとに時間を入力してください。';
  if(!Number.isInteger(e.quantity)||e.quantity<1||e.quantity>100)return '人数・台数を確認してください。';
  if(!arr(e.allocations).length)return '現場と時間を入力してください。';
  const seen=new Set();let sum=0;
  for(const a of e.allocations){
   if(!String(a.site||'').trim()||seen.has(norm(a.site)))return '同じ対象の現場を重複させないでください。';seen.add(norm(a.site));
   if(a.minutes===null)return '使用時間が未入力です。0時間とは区別しています。';
   if(!Number.isInteger(a.minutes)||a.minutes<0||a.minutes>1440)return '時間は0〜24時間、分は整数で入力してください。';sum+=a.minutes;
  }
  if(e.kind==='dispatch'&&!seen.has(norm(e.travelSite)))return '通勤費の計上先を指定した現場から選んでください。';
  if(sum>1440)return '同じ対象の1日の時間合計が24時間を超えています。';
  return '';
 }
 // Keep an in-progress one-site report coherent when its main site changes.
 // Multi-site allocations are never discarded, merged or silently reassigned.
 function syncEntrySites(entry,siteNames){
  const sites=[...new Map(arr(siteNames).filter(n=>String(n||'').trim()).map(n=>[norm(n),n])).values()];
  const next={...entry,allocations:arr(entry.allocations).map(a=>({...a}))};
  const entered=next.allocations.filter(a=>a.minutes!==0||a.clock);
  if(sites.length===1&&(next.allocations.length===1||(next.allocations.length>1&&entered.length<=1))){
   // The old UI appended zero placeholders after a main-site change. Remove only
   // those empty rows; never sum or discard two real/unknown time allocations.
   const keep=entered[0]||next.allocations.find(a=>norm(a.site)===norm(sites[0]))||next.allocations[0];
   next.allocations=[{...keep,site:sites[0]}];
  }else{
   next.allocations.forEach(a=>{const match=sites.find(n=>norm(n)===norm(a.site));if(match)a.site=match;});
   for(const site of sites)if(!next.allocations.some(a=>norm(a.site)===norm(site)))next.allocations.push({site,minutes:0});
  }
  if(next.kind==='dispatch'){
   const choices=sites.filter(site=>next.allocations.some(a=>norm(a.site)===norm(site)));
   if(sites.length===1&&next.allocations.length===1)next.travelSite=sites[0];
   else next.travelSite=choices.find(site=>norm(site)===norm(next.travelSite))||'';
  }
  return next;
 }
 function used(r,kind,name){const d=r.report_data||{};
  if(kind==='dispatch')return Number(d[norm(name)==='明建'?'meikenCount':'asahiCount'])>0;
  return arr(d[fields[kind]]).some(v=>key(label(v).replace(/\s*[×x]\s*\d+\s*[台本個]$/,''))===key(name));
 }
 // A company name is not a crew identity. Only current administrator
 // confirmations may distinguish separate crews; unconfirmed reports remain ambiguous.
 function dispatchCrew(data,r,name){
  const code=norm(name)==='明建'?'meiken':norm(name)==='朝日'?'asahi':'';
  const stamp=v=>{const t=Date.parse(v);return Number.isFinite(t)?t+':'+(String(v).match(/\.(\d+)/)?.[1]?.padEnd(6,'0').slice(3,6)||'000'):'';};
  const time=stamp(r.updated_at);
  const rows=arr(data.dispatchCrews).filter(c=>c.report_id===r.id&&c.site_id===r.site_id&&c.work_date===r.report_date&&c.dispatch_code===code&&time&&stamp(c.report_updated_at)===time);
  return rows.length===1&&typeof rows[0].crew_key==='string'?rows[0].crew_key:'';
 }
 function sameDispatchCrew(data,a,b,name){const x=dispatchCrew(data,a,name),y=dispatchCrew(data,b,name);return !x||!y||x===y;}
 function build(data){
  const reports=unique(data.reports),groups=new Map();
  for(const r of reports){const h=r.report_data?.usageHours;if(!h||h.version!==1)continue;
   for(const e of arr(h.entries)){
    const crew=e.kind==='dispatch'?dispatchCrew(data,r,e.label):'';
    const id=[r.report_date,e.kind,key(e.label),...(crew?[crew]:[])].join('|');
    if(!groups.has(id))groups.set(id,{date:r.report_date,kind:e.kind,label:e.label,claims:[],errors:[],valid:false});
    const g=groups.get(id);g.claims.push({e,r});const error=validateEntry(e);if(error)g.errors.push(error);
   }
  }
  for(const g of groups.values()){
   const canonical=c=>JSON.stringify({q:c.e.quantity,sites:arr(c.e.allocations).map(a=>[norm(a.site),a.minutes]).sort(),travel:norm(c.e.travelSite)});
   if(new Set(g.claims.map(canonical)).size>1)g.errors.push('同じ対象の時間記録が複数の日報で異なります。片方を勝手に採用していません。');
   const c=g.claims[0];
   const known=arr(data.sites);if(known.length&&arr(c.e.allocations).some(a=>known.filter(t=>norm(t.name)===norm(a.site)).length!==1))g.errors.push('時間を指定した現場名を登録現場から一意に確認できません。');
   if(!arr(c.e.allocations).some(a=>norm(a.site)===norm(c.r.report_data?.site)))g.errors.push('日報の元の現場が時間配分から抜けています。');
   g.entry=c.e;g.report=c.r;g.sites=arr(c.e.allocations).map(a=>norm(a.site));
   for(const r of reports.filter(r=>r.report_date===g.date&&used(r,g.kind,g.label))){
    if(g.kind==='dispatch'&&!sameDispatchCrew(data,c.r,r,g.label))continue;
    if(!g.sites.includes(norm(r.report_data?.site)))g.errors.push('時間を指定した現場以外にも使用記録があります。配分を確認してください。');
   }
   if(!['tool','attachment'].includes(g.kind)&&g.sites.length>1&&arr(data[sheetKey(g.kind)]).some(s=>s.work_date===g.date&&arr(data.sites).some(t=>t.id===s.site_id&&g.sites.includes(norm(t.name)))))g.errors.push('配分先に保存済みの費用があります。保存額を残すため、この時間配分は保留しています。');
   g.errors=[...new Set(g.errors)];g.valid=!g.errors.length;
  }
  return groups;
 }
 function fuelRows(data,site,getAmount){
  const groups=build(data),out=[];
  for(const r of unique(data.reports))for(const [index,f] of arr(r.report_data?.fuels).entries()){
   const g=groups.get([r.report_date,'vehicle',key(f.asset)].join('|'))||groups.get([r.report_date,'equipment',key(f.asset)].join('|'))||groups.get([r.report_date,'tool',key(f.asset)].join('|'));
   const value=getAmount(f),own=norm(r.report_data?.site)===norm(site.name);
   const allocations=g?.valid?arr(g.entry.allocations).filter(a=>a.minutes>0):[];
   const total=allocations.reduce((s,a)=>s+a.minutes,0);
   if(!g?.valid||!total||!g.sites.includes(norm(r.report_data?.site))){if(own)out.push({report:r,fuel:f,value,index,allocated:false});continue;}
   let remainder=value;
   allocations.forEach((a,i)=>{const n=value===null?null:i===allocations.length-1?remainder:round(value*a.minutes/total);if(n!==null)remainder=round(remainder-n);
    if(norm(a.site)===norm(site.name))out.push({report:r,fuel:f,value:n,index,allocated:true});
   });
  }return out;
 }
 function adjust(kind,date,data,site,legacy,getAmount,travelEngine){
  const out=structuredClone(legacy),s=out.sheet,issues=new Set(out.issues),groups=build(data),names=new Set(),pending=[];
  const matched=[...groups.values()].filter(g=>g.date===date&&(g.kind===kind||(kind==='labor'&&g.kind==='dispatch'))&&g.sites.includes(norm(site.name)));
  const replaced=new Set(matched.map(g=>key(g.label)));
  s.entries=arr(s.entries).filter(e=>!replaced.has(key(e.label)));
  for(const g of matched){
   names.add(key(g.label));
   if(!g.valid){pending.push(g.label);g.errors.forEach(t=>issues.add(date+'：'+g.label+'／'+t));continue;}
   // Remove obsolete per-resource ambiguity warnings only after a valid explicit allocation.
   for(const t of [...issues])if(t.includes(g.label)&&/現場間の人工配分|同日に複数現場|短時間または勤務時間|会社の人工/.test(t))issues.delete(t);
   const e=g.entry,a=e.allocations.find(a=>norm(a.site)===norm(site.name)),m=a?.minutes||0;
   const rates=kind==='labor'?data.laborRates:kind==='vehicle'?data.vehicleRates:data.equipmentRates;
   const matches=arr(rates).filter(r=>r.active!==false&&key(r.label)===key(g.label));
   if(matches.length!==1){pending.push(g.label);issues.add(date+'：'+g.label+'の単価が未登録・重複です。時間は記録済みですが金額は未計上です。');continue;}
   const r=matches[0],daily=num(r[kind==='labor'?'day_rate':'daily_rate']);
   if(daily===null||!Number.isFinite(daily)||daily<0){pending.push(g.label);issues.add(date+'：'+g.label+'の単価を確認してください。');continue;}
   const gross=round(daily*m*e.quantity/480);
   if(kind==='labor'){
    let travel=0,highway=0;
    if(g.kind==='dispatch'&&norm(e.travelSite||g.report.report_data?.site)===norm(site.name)&&travelEngine){const t=travelEngine.resolve([g.report],r.code,r.city_per_vehicle);travel=t.travel;highway=t.highway;if(travel===null||highway===null)pending.push(g.label+'の交通費');t.issues.forEach(x=>issues.add(date+'：'+g.label+'／'+x));}
    s.entries.push({key:r.code,label:r.label,kind:r.kind,minutes:m,quantity:e.quantity,cost:round(gross+(travel||0)+(highway||0)),laborCost:gross,travel,highway});
   }else{
    // Vehicle and equipment rates are usage charges. Fuel stays in the daily
    // report and is added separately by the financial summary.
    s.entries.push({code:r.code,label:r.label,used:m>0,minutes:m,quantity:e.quantity,dayRate:daily,manualGross:gross,manualFuel:null,recordedFuel:0,fuelCount:0});
   }
   if(m>480&&kind==='labor')issues.add(date+'：'+g.label+'は8時間を超えています。原価の時間換算のみで、残業割増は別確認です。');
  }
  if(kind==='labor')s.cost_total=round(arr(s.entries).reduce((n,e)=>n+(num(e.cost)??0),0));
  else{s.gross_total=round(arr(s.entries).reduce((n,e)=>n+(e.used?(num(e.manualGross)??num(e.dayRate)??0):0),0));s.fuel_deduction_total=0;s.net_total=s.gross_total;}
  if(matched.length){for(const t of [...issues])if(/移動者と人工配分が未確認|移動先の車両代(?:・燃料)?の配分が未確認/.test(t))issues.delete(t);}
  out.pendingResources=[...new Set(pending)];out.issues=[...issues];return out;
 }
 function tools(data,site,getAmount){
  const out=[];for(const g of build(data).values()){
   if(g.kind!=='tool'||!g.sites.includes(norm(site.name)))continue;
   if(!g.valid){out.push({date:g.date,label:g.label,value:null,issue:g.errors.join(' ')});continue;}
   const e=g.entry,m=e.allocations.find(a=>norm(a.site)===norm(site.name))?.minutes||0;if(!m)continue;
   const rates=arr(data.toolRates).filter(r=>r.active!==false&&key(r.label)===key(e.label));
   if(rates.length!==1||num(rates[0].hourly_rate)===null){out.push({date:g.date,label:e.label,value:null,issue:e.label+'は時間を記録済みですが、小型機械の単価が未登録です。'});continue;}
   const rate=num(rates[0].hourly_rate);if(!Number.isFinite(rate)||rate<0){out.push({date:g.date,label:e.label,value:null,issue:'小型機械の単価を確認してください。'});continue;}
   const gross=round(rate*m*e.quantity/60);
   out.push({date:g.date,label:e.label,value:gross,issue:''});
  }return out;
 }
 function attachments(data,site){
  const out=[];
  for(const g of build(data).values()){
   if(g.kind!=='attachment'||!g.sites.includes(norm(site.name)))continue;
   if(!g.valid){out.push({date:g.date,label:g.label,value:null,issue:g.errors.join(' ')});continue;}
   const e=g.entry,m=e.allocations.find(a=>norm(a.site)===norm(site.name))?.minutes||0;
   if(!m)continue;
   const rates=arr(data.attachmentRates).filter(r=>r.active!==false&&key(r.label)===key(e.label));
   const rate=rates.length===1?num(rates[0].hourly_rate):null;
   if(rate===null||!Number.isFinite(rate)||rate<0){out.push({date:g.date,label:e.label,value:null,issue:e.label+'のアタッチメント時間単価が未登録・不正です。使用時間は記録済みです。'});continue;}
   out.push({date:g.date,label:e.label,value:round(rate*m*e.quantity/60),issue:''});
  }
  return out;
 }
 const engine=Object.freeze({workMinutes,validateEntry,syncEntrySites,dispatchCrew,sameDispatchCrew,build,fuelRows,adjust,tools,attachments,key});
 if(typeof module==='object'&&module.exports){module.exports=engine;return;}
 if(window.ToyaUsageHoursEngine)return;window.ToyaUsageHoursEngine=engine;
 const q=(s,r=document)=>r.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const groups=[['labor','人工の時間'],['dispatch','応援・派遣の時間'],['vehicle','車両の使用時間'],['equipment','重機の使用時間'],['attachment','アタッチメントの使用時間'],['tool','小型機械・工具の使用時間']];
 let state={},enabled=true,installed=false,originalCollect=null,breakMinutes=60,scheduled=false;
 const rid=(k,n)=>k+'|'+key(n);
 const availableSites=()=>[...new Set([q('#site')?.value,...[...document.querySelectorAll('.sm-site')].map(e=>e.value)].filter(Boolean))];
 function resources(d){
  const rows=[];
  const push=(kind,n,quantity=1,minutes=null)=>{if(n)rows.push({kind,label:n,quantity,minutes});};
  arr(d.workers).forEach(n=>push('labor',label(n)));
  [['明建','meikenCount'],['朝日','asahiCount']].forEach(([n,f])=>{if(Number(d[f])>0)push('dispatch',n,Number(d[f]));});
  arr(d.vehicles).forEach(n=>push('vehicle',label(n)));
  arr(d.machines).forEach(n=>push('equipment',label(n),1,num(n.hours)===null?null:Math.round(Number(n.hours)*60)));
  const small=new Set([...document.querySelectorAll('#smallToolChoices input[name="attachment"]')].map(e=>key(e.value)));
  const heavy=new Set([...document.querySelectorAll('#machineAttachmentChoices input[name="attachment"]')].map(e=>key(e.value)));
  arr(d.attachments).forEach(v=>{
   const n=label(v),m=n.match(/\s*[×x]\s*(\d+)\s*[台本個]$/),base=m?n.slice(0,m.index).trim():n,qty=m?Number(m[1]):1;
   if(small.has(key(base)))push('tool',base,qty);
   else if(heavy.has(key(base)))push('attachment',base,qty);
  });
  return rows;
 }
 function makeEntry(r,d){
  const sites=availableSites(),moving=sites.length>1;
  const main=(r.kind==='labor'||r.kind==='dispatch')&&!moving?workMinutes(d.start,d.end,breakMinutes):!moving?r.minutes:null;
  return {kind:r.kind,label:r.label,quantity:r.quantity,fromReportTime:!moving&&['labor','dispatch','equipment'].includes(r.kind),travelSite:d.site,allocations:sites.map((site,i)=>({site,minutes:i===0?main:0}))};
 }
 function sync(d){
  const rows=resources(d),sites=availableSites();
  for(const r of rows){
   const id=rid(r.kind,r.label);
   if(!state[id])state[id]=makeEntry(r,d);
   else{
    const e=state[id]=syncEntrySites(state[id],sites);e.quantity=r.quantity;
    if(e.fromReportTime){
     if(sites.length===1&&e.allocations.length===1)e.allocations[0].minutes=['labor','dispatch'].includes(r.kind)?workMinutes(d.start,d.end,breakMinutes):r.minutes;
     else e.fromReportTime=false; // Retain entered minutes when adding a destination.
    }
   }
  }
  return rows.map(r=>state[rid(r.kind,r.label)]);
 }
 function mountHosts(){
  const worker=q('input[name="worker"]')?.closest('.choice-grid');
  const definitions=[['labor',worker],['vehicle',q('#vehicleChoices')],['equipment',q('#machineChoices')],['attachment',q('#machineAttachmentChoices')],['tool',q('#smallToolChoices')]];
  for(const code of ['meiken','asahi']){
   const input=q('#'+code+'Count');definitions.push([code,input?.closest('.stepper')||input]);
  }
  for(const [id,anchor] of definitions){
   if(!anchor)continue;
   let host=q('#uhInline-'+id);
   if(!host){host=document.createElement('div');host.id='uhInline-'+id;host.className='uh-inline';}
   if(anchor.nextElementSibling!==host)anchor.after(host);
  }
  const legacy=q('#machineHours');if(legacy)legacy.style.display=enabled?'none':'';
 }
 function friendly(e){
  if(e.kind!=='attachment')return e.label;
  const input=[...document.querySelectorAll('#machineAttachmentChoices input')].find(i=>i.value===e.label);
  return input?.closest('label')?.querySelector('.toya-asset-label')?.textContent||e.label;
 }
 function entryHTML(e){
  const kind=e.kind,id=rid(kind,e.label),labor=['labor','dispatch'].includes(kind);
  const count=e.quantity>1?' × '+e.quantity+(kind==='dispatch'?'人':'台・本'):'';
  const al=e.allocations.map((a,i)=>{
   const clock=a.clock||{},pfx=esc(e.label+' '+a.site);
   return '<div class="uh-allocation"><label>'+esc(a.site)+'</label><div class="uh-input">'+
    '<input data-stepper="1" aria-label="'+pfx+' 時間" data-uh-index="'+i+'" data-uh-part="h" type="number" min="0" max="24" step="1" inputmode="numeric" value="'+(a.minutes===null?'':Math.floor(a.minutes/60))+'" placeholder="未入力"><span>時間</span>'+
    '<input data-stepper="1" aria-label="'+pfx+' 分" data-uh-index="'+i+'" data-uh-part="m" type="number" min="0" max="59" step="1" inputmode="numeric" value="'+(a.minutes===null?'':a.minutes%60)+'" placeholder="分"><span>分</span></div>'+
    '<div class="uh-quick">'+[1,4,8].map(h=>'<button type="button" data-uh-quick="'+(h*60)+'" data-uh-allocation="'+i+'">'+h+'時間</button>').join('')+'</div>'+
    (labor?'<details><summary>開始・終了・休憩から計算</summary><label>開始<input type="time" class="uh-start" value="'+esc(clock.start||'')+'"></label><label>終了<input type="time" class="uh-end" value="'+esc(clock.end||'')+'"></label><label>休憩（分）<input data-stepper="1" type="number" class="uh-break" min="0" max="1440" step="1" value="'+esc(clock.pause??0)+'"></label><button type="button" class="btn light" data-uh-times="'+i+'">この現場の実働時間を計算</button></details>':'')+'</div>';
  }).join('');
  const total=e.allocations.reduce((n,a)=>n+(a.minutes||0),0);
  const message=validateEntry(e)||'合計 '+Math.floor(total/60)+'時間'+total%60+'分';
  return '<div class="uh-row" data-uh-id="'+esc(id)+'"><b>'+esc(friendly(e))+count+'</b>'+al+
   (kind==='dispatch'?(e.allocations.length===1?'<p class="note uh-travel-auto">通勤費・高速代：'+esc(e.travelSite)+'へ自動計上（1回だけ）</p>':
    '<label>通勤費・高速代の計上先（1回だけ）<select data-uh-travel><option value="" '+(!e.travelSite?'selected':'')+'>計上先の現場を選択</option>'+e.allocations.filter(a=>availableSites().some(n=>norm(n)===norm(a.site))).map(a=>'<option value="'+esc(a.site)+'" '+(a.site===e.travelSite?'selected':'')+'>'+esc(a.site)+'</option>').join('')+'</select></label>'):'')+
   '<p class="note uh-note" role="status">'+esc(message)+'</p>'+
   (kind==='attachment'?'<p class="note">アタッチメント独自の時間です。重機の時間・燃料は重ねて加算しません。単価未登録なら金額のみ要確認です。</p>':'')+'</div>';
 }
 function display(){
  if(!q('#uhCard')||!originalCollect)return;
  mountHosts();const d=originalCollect(),entries=sync(d);
  for(const [kind,title] of groups){
   const buckets=kind==='dispatch'?[['meiken','明建'],['asahi','朝日']]:[[kind,null]];
   for(const [id,name] of buckets){
    const host=q('#uhInline-'+id);if(!host)continue;
    const es=entries.filter(e=>e.kind===kind&&(!name||e.label===name));
    host.hidden=!enabled||!es.length;
    const structure=JSON.stringify(es.map(e=>[e.kind,e.label,e.quantity,e.allocations.map(a=>a.site)]));
    // Do not detach a field while the user is typing in it on a mobile keyboard.
    if(host.contains(document.activeElement)&&host.dataset.structure===structure)continue;
    host.dataset.structure=structure;
    host.innerHTML=es.length?'<h3>'+esc(title)+'</h3>'+es.map(entryHTML).join(''):'';
   }
  }
  q('#uhInlineStatus').textContent=enabled?'選択した項目のすぐ下で時間を入力できます。上へ戻る操作は不要です。':'時間入力は無効です。過去の日報は従来の計算を保持しています。';
 }
 function schedule(){if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;display();},0);}
 function restore(d,mode){
  state={};const h=d?.usageHours;enabled=h?.version===1||mode!=='edit';breakMinutes=h?.breakMinutes??60;
  if(h?.version===1&&mode!=='duplicate')arr(h.entries).forEach(e=>state[rid(e.kind,e.label)]=structuredClone(e));
  q('#uhEnable').checked=enabled;q('#uhBreak').value=breakMinutes;display();
 }
 function updateRow(row){
  const e=state[row.dataset.uhId];q('.uh-note',row).textContent=validateEntry(e)||'時間を記録しました。日報保存後に集計します。';
 }
 function setMinutes(row,index,minutes){
  const e=state[row.dataset.uhId];e.fromReportTime=false;e.allocations[index].minutes=minutes;
  const box=row.querySelectorAll('.uh-allocation')[index];q('[data-uh-part="h"]',box).value=Math.floor(minutes/60);q('[data-uh-part="m"]',box).value=minutes%60;updateRow(row);
 }
 function install(){
  if(installed||typeof window.collect!=='function'||!q('#siteMoveCard'))return;
  installed=true;originalCollect=window.collect;
  const style=document.createElement('style');style.id='uhInlineStyle';style.textContent=`
   .uh-inline[hidden],#uhCard [hidden]{display:none!important}
   .uh-inline{grid-column:1/-1;min-width:0;margin-top:12px}.uh-inline h3{font-size:16px;margin:10px 0}
   .uh-inline .uh-row{padding:12px;border:1px solid #ccc;border-radius:12px;margin:10px 0;background:#fff;overflow-wrap:anywhere}
   .uh-inline .uh-allocation{margin:10px 0;padding-top:8px;border-top:1px solid #ddd}
   .uh-inline input,.uh-inline select,#uhCard input{box-sizing:border-box;width:100%;min-width:0;font-size:16px;min-height:44px}
   .uh-inline .uh-input{display:grid;grid-template-columns:minmax(0,1fr) 36px minmax(0,1fr) 22px;gap:6px;align-items:center}
   .uh-inline .uh-input input{margin:0}.uh-inline summary,#uhCard summary{font-weight:800;padding:12px 0;cursor:pointer}
   #uhCard .uh-toggle{display:flex;align-items:center;gap:8px}#uhCard .uh-toggle input{width:24px;min-height:24px}
   .uh-inline .btn,#uhCard .btn{width:100%;margin:8px 0}
   .uh-inline .uh-quick{display:flex;gap:6px;margin:8px 0}.uh-quick button{flex:1;min-height:40px;border:1px solid #bbb;border-radius:9px;background:#f6f6f6;color:#111;font-size:15px;font-weight:700}
   .uh-inline .note{margin:8px 0 0}#uhCard>details>summary{padding:0}#uhCard>details[open]>summary{padding-bottom:12px}
  `;document.head.appendChild(style);
  const card=document.createElement('div');card.id='uhCard';card.className='card';
  card.innerHTML='<details><summary>時間計算の設定（通常は変更不要）</summary><label class="uh-toggle"><input id="uhEnable" type="checkbox" checked>時間で自動計算する</label><p class="note">各項目の選択欄で時間を入力します。人工・車両・重機は日額÷8時間、アタッチメント・小型機械は登録時間単価です。空欄と0時間は区別し、保存済みの調整額は優先します。</p><details><summary>人工の標準休憩・一括設定</summary><label>休憩（分）<input data-stepper="1" id="uhBreak" type="number" value="60" min="0" max="1440" step="1"></label><button id="uhDefault" type="button" class="btn light">移動なしの人工を日報の時刻から設定</button><p class="note">車両・機械へはコピーしません。</p></details><details><summary>移動先変更・時間入力のやり直し</summary><button id="uhReset" type="button" class="btn light">この画面の時間入力だけをやり直す</button></details></details><p class="note" id="uhInlineStatus"></p>';
  q('#siteMoveCard').after(card);
  q('#uhEnable').onchange=()=>{enabled=q('#uhEnable').checked;display();};
  q('#uhBreak').oninput=()=>{breakMinutes=Number(q('#uhBreak').value);};
  q('#uhReset').onclick=()=>{if(confirm('この画面の時間入力だけを消してやり直しますか？保存済みの日報は変わりません。')){state={};display();}};
  q('#uhDefault').onclick=()=>{
   if(availableSites().length>1)return alert('現場移動があるため、各現場の実働時間を個別に入力してください。');
   breakMinutes=Number(q('#uhBreak').value);const d=originalCollect(),m=workMinutes(d.start,d.end,breakMinutes);
   if(m===null)return alert('日報の開始・終了・休憩時間を確認してください。');
   sync(d).filter(e=>['labor','dispatch'].includes(e.kind)).forEach(e=>{e.allocations=[{site:d.site,minutes:m}];e.fromReportTime=true;});display();
  };
  document.addEventListener('input',event=>{
   const el=event.target,row=el.closest('.uh-inline [data-uh-id]'),i=el.dataset.uhIndex;
   if(!row||i===undefined)return;
   const entry=state[row.dataset.uhId],box=el.closest('.uh-allocation');
   const h=q('[data-uh-part="h"]',box).value,m=q('[data-uh-part="m"]',box).value;
   entry.fromReportTime=false;entry.allocations[Number(i)].minutes=h===''&&m===''?null:Number(h||0)*60+Number(m||0);updateRow(row);
  });
  document.addEventListener('change',event=>{
   const el=event.target;if(el.matches('.uh-inline [data-uh-travel]'))state[el.closest('[data-uh-id]').dataset.uhId].travelSite=el.value;
  });
  document.addEventListener('click',event=>{
   const b=event.target.closest('.uh-inline button');if(!b)return;
   const row=b.closest('[data-uh-id]');if(!row)return;
   if(b.dataset.uhQuick!==undefined){setMinutes(row,Number(b.dataset.uhAllocation),Number(b.dataset.uhQuick));return;}
   if(b.dataset.uhTimes===undefined)return;
   const box=b.closest('.uh-allocation'),clock={start:q('.uh-start',box).value,end:q('.uh-end',box).value,pause:Number(q('.uh-break',box).value)};
   const m=workMinutes(clock.start,clock.end,clock.pause);if(m===null)return alert('開始・終了・休憩を確認してください。同日内で計算します。');
   const i=Number(b.dataset.uhTimes);state[row.dataset.uhId].allocations[i].clock=clock;setMinutes(row,i,m);
  });
  window.collect=function(){const d=originalCollect.apply(this,arguments);if(enabled)d.usageHours={version:1,baseHours:8,breakMinutes,entries:structuredClone(sync(d))};return d;};
  const fill=window.fillReportForm;window.fillReportForm=function(d,mode='edit'){const out=fill.apply(this,arguments);restore(d,mode);return out;};
  const valid=window.validate;window.validate=function(d){
   if(!valid.apply(this,arguments))return false;
   if(d.usageHours&&[...document.querySelectorAll('.uh-inline:not([hidden]) [data-uh-part]')].some(i=>!i.checkValidity())){alert('使用時間は整数、分は0〜59で入力してください。');return false;}
   for(const e of arr(d.usageHours?.entries)){
    if(e.allocations.some(a=>!availableSites().includes(a.site))){alert('移動先変更により時間欄の現場が一致しません。時間計算の設定から時間入力を確認してください。');return false;}
    if(e.kind==='dispatch'&&!e.allocations.some(a=>norm(a.site)===norm(e.travelSite))){alert(e.label+'：作業時間欄の「通勤費・高速代の計上先」で現場を1つ選んでください。');return false;}
    const problem=validateEntry(e);if(problem&&!problem.includes('未入力')){alert(e.label+'：'+problem);return false;}
   }return true;
  };
  const text=window.lineText;window.lineText=function(d){let t=text.apply(this,arguments);if(d.usageHours?.entries?.length)t+='\n\n■現場別の作業・使用時間\n'+d.usageHours.entries.map(e=>e.label+'：'+e.allocations.map(a=>a.site+' '+(a.minutes===null?'時間未入力':Math.floor(a.minutes/60)+'時間'+a.minutes%60+'分')).join('／')).join('\n');return t;};
  document.addEventListener('change',event=>{
   const el=event.target;
   if(el.matches('input[name="worker"],input[name="vehicle"],input[name="machine"],input[name="attachment"],#meikenCount,#asahiCount,#start,#end,#site,.sm-site')||el.closest('#smallToolChoices,#machineAttachmentChoices'))schedule();
  });
  document.addEventListener('input',event=>{if(event.target.matches('#meikenCount,#asahiCount'))schedule();});
  document.addEventListener('click',event=>{if(event.target.closest('nav [data-page="reportPage"]'))schedule();});
  // Observe only source selectors/movement rows, never rendered time controls.
  // This also handles delayed master loads without appending duplicate buttons or rows.
  const observer=new MutationObserver(schedule);
  for(const id of ['vehicleChoices','machineChoices','machineAttachmentChoices','smallToolChoices','siteMoveEntries']){const el=q('#'+id);if(el)observer.observe(el,{childList:true});}
  const draft=typeof get==='function'&&typeof LS!=='undefined'?get(LS.draft,null):null;
  if(draft?.usageHours)restore(draft,'edit');else display();
 }
 const start=()=>setTimeout(install,180);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
