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
 const kinds={labor:'人工',dispatch:'応援・派遣',vehicle:'車両',equipment:'重機',tool:'小型機械・工具'};
 const fields={labor:'workers',dispatch:null,vehicle:'vehicles',equipment:'machines',tool:'attachments'};
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
 function used(r,kind,name){const d=r.report_data||{};
  if(kind==='dispatch')return Number(d[norm(name)==='明建'?'meikenCount':'asahiCount'])>0;
  return arr(d[fields[kind]]).some(v=>key(label(v).replace(/\s*[×x]\s*\d+\s*[台本個]$/,''))===key(name));
 }
 function build(data){
  const reports=unique(data.reports),groups=new Map();
  for(const r of reports){const h=r.report_data?.usageHours;if(!h||h.version!==1)continue;
   for(const e of arr(h.entries)){
    const id=[r.report_date,e.kind,key(e.label)].join('|');
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
    if(!g.sites.includes(norm(r.report_data?.site)))g.errors.push('時間を指定した現場以外にも使用記録があります。配分を確認してください。');
   }
   if(g.kind!=='tool'&&g.sites.length>1&&arr(data[sheetKey(g.kind)]).some(s=>s.work_date===g.date&&arr(data.sites).some(t=>t.id===s.site_id&&g.sites.includes(norm(t.name)))))g.errors.push('配分先に保存済みの費用があります。保存額を残すため、この時間配分は保留しています。');
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
  for(const g of matched){
   names.add(key(g.label));
   s.entries=arr(s.entries).filter(e=>key(e.label)!==key(g.label));
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
    const fr=fuelRows(data,site,getAmount).filter(x=>x.report.report_date===date&&key(x.fuel.asset)===key(g.label)&&['軽油','ガソリン'].includes(x.fuel.type));
    if(fr.some(x=>x.value===null))pending.push(g.label+'の燃料額');
    const fuel=fr.reduce((n,x)=>round(n+(x.value??0)),0);
    s.entries.push({code:r.code,label:r.label,used:m>0,minutes:m,quantity:e.quantity,dayRate:daily,manualGross:gross,manualFuel:fuel,recordedFuel:fuel,fuelCount:fr.length});
   }
   if(m>480&&kind==='labor')issues.add(date+'：'+g.label+'は8時間を超えています。原価の時間換算のみで、残業割増は別確認です。');
  }
  if(kind==='labor')s.cost_total=round(arr(s.entries).reduce((n,e)=>n+(num(e.cost)??0),0));
  else{s.gross_total=round(arr(s.entries).reduce((n,e)=>n+(e.used?(num(e.manualGross)??num(e.dayRate)??0):0),0));s.fuel_deduction_total=round(arr(s.entries).reduce((n,e)=>n+(e.used?(num(e.manualFuel)??num(e.recordedFuel)??0):0),0));s.net_total=round(s.gross_total-s.fuel_deduction_total);}
  if(matched.length){for(const t of [...issues])if(/移動者と人工配分が未確認|移動先の車両代・燃料の配分が未確認/.test(t))issues.delete(t);}
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
   const basis=rates[0].fuel_included;
   if(typeof basis!=='boolean'){out.push({date:g.date,label:e.label,value:null,issue:e.label+'の時間単価が燃料込みか別か未設定です。'});continue;}
   const gross=round(rate*m*e.quantity/60);
   const fr=basis?fuelRows(data,site,getAmount).filter(x=>x.report.report_date===g.date&&key(x.fuel.asset)===key(e.label)&&['軽油','ガソリン'].includes(x.fuel.type)):[];
   const fuel=fr.reduce((n,x)=>round(n+(x.value??0)),0);
   out.push({date:g.date,label:e.label,value:round(gross-fuel),issue:fr.some(x=>x.value===null)?e.label+'の燃料差引額が未入力です。':''});
  }return out;
 }
 const engine=Object.freeze({workMinutes,validateEntry,build,fuelRows,adjust,tools,key});
 if(typeof module==='object'&&module.exports){module.exports=engine;return;}
 if(window.ToyaUsageHoursEngine)return;window.ToyaUsageHoursEngine=engine;
 const q=(s,r=document)=>r.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const groups=[['labor','人工'],['dispatch','明建・朝日の作業時間'],['vehicle','車両の使用時間'],['equipment','重機の使用時間'],['tool','小型機械・工具の使用時間']];
 let state={},enabled=true,installed=false,originalCollect=null,breakMinutes=60;
 const rid=(k,n)=>k+'|'+key(n);
 const availableSites=()=>[...new Set([q('#site')?.value,...[...document.querySelectorAll('.sm-site')].map(e=>e.value)].filter(Boolean))];
 function resources(d){
  const rows=[];const push=(kind,label,quantity=1,minutes=null)=>{if(label)rows.push({kind,label,quantity,minutes});};
  arr(d.workers).forEach(n=>push('labor',label(n)));
  [['明建','meikenCount'],['朝日','asahiCount']].forEach(([n,f])=>{if(Number(d[f])>0)push('dispatch',n,Number(d[f]));});
  arr(d.vehicles).forEach(n=>push('vehicle',label(n)));
  arr(d.machines).forEach(n=>push('equipment',label(n),1,num(n.hours)===null?null:Math.round(Number(n.hours)*60)));
  const small=new Set([...document.querySelectorAll('#smallToolChoices input[name="attachment"]')].map(e=>key(e.value)));
  arr(d.attachments).forEach(v=>{const n=label(v),m=n.match(/\s*[×x]\s*(\d+)\s*[台本個]$/),base=m?n.slice(0,m.index).trim():n;if(small.has(key(base)))push('tool',base,m?Number(m[1]):1);});
  return rows;
 }
 function makeEntry(r,d){const sites=availableSites(),moving=sites.length>1;
  const main=(r.kind==='labor'||r.kind==='dispatch')&&!moving?workMinutes(d.start,d.end,breakMinutes):!moving?r.minutes:null;
  return {kind:r.kind,label:r.label,quantity:r.quantity,fromReportTime:!moving&&['labor','dispatch','equipment'].includes(r.kind),travelSite:d.site,allocations:sites.map((site,i)=>({site,minutes:i===0?main:0}))};
 }
 function sync(d){const rows=resources(d),sites=availableSites();for(const r of rows){const id=rid(r.kind,r.label);if(!state[id])state[id]=makeEntry(r,d);else{
   const e=state[id];e.quantity=r.quantity;
   if(e.fromReportTime){
    if(sites.length===1)e.allocations=[{site:sites[0],minutes:['labor','dispatch'].includes(r.kind)?workMinutes(d.start,d.end,breakMinutes):r.minutes}];
    else{e.allocations=e.allocations.map(a=>({...a,minutes:null}));e.fromReportTime=false;}
   }
   for(const site of sites)if(!e.allocations.some(a=>a.site===site))e.allocations.push({site,minutes:0});
  }}return rows.map(r=>state[rid(r.kind,r.label)]);
 }
 function display(){if(!q('#uhCard')||!originalCollect)return;const d=originalCollect(),entries=sync(d);
  q('#uhBody').hidden=!enabled;
  q('#uhBody').innerHTML=groups.map(([kind,title])=>{const es=entries.filter(e=>e.kind===kind);if(!es.length)return '';return '<details open><summary>'+title+'</summary>'+es.map(e=>{
   const id=rid(kind,e.label);return '<div class="uh-row" data-uh-id="'+esc(id)+'"><b>'+esc(e.label)+(e.quantity>1?' × '+e.quantity+(kind==='dispatch'?'人':'台・本'):'')+'</b>'+e.allocations.map((a,i)=>'<div class="uh-allocation"><label>'+esc(a.site)+'</label><div class="uh-input"><input aria-label="'+esc(e.label+' '+a.site+' 時間')+'" data-uh-index="'+i+'" data-uh-part="h" type="number" min="0" max="24" step="1" inputmode="numeric" value="'+(a.minutes===null?'':Math.floor(a.minutes/60))+'" placeholder="未入力"><span>時間</span><input aria-label="'+esc(e.label+' '+a.site+' 分')+'" data-uh-index="'+i+'" data-uh-part="m" type="number" min="0" max="59" step="1" inputmode="numeric" value="'+(a.minutes===null?'':a.minutes%60)+'" placeholder="分"><span>分</span></div>'+((kind==='labor'||kind==='dispatch')?'<details><summary>開始・終了・休憩から計算</summary><label>開始<input type="time" class="uh-start"></label><label>終了<input type="time" class="uh-end"></label><label>休憩（分）<input type="number" class="uh-break" min="0" max="1440" step="1" value="0"></label><button type="button" class="btn light" data-uh-times="'+i+'">この現場の実働時間を計算</button></details>':'')+'</div>').join('')+(kind==='dispatch'?'<label>通勤費・高速代はこの現場に1回計上<select data-uh-travel>'+e.allocations.map(a=>'<option '+(a.site===e.travelSite?'selected':'')+'>'+esc(a.site)+'</option>').join('')+'</select></label>':'')+'<p class="note uh-note">'+esc(validateEntry(e)||'合計 '+e.allocations.reduce((n,a)=>n+a.minutes,0)/60+'時間')+'</p></div>';}).join('')+'</details>';}).join('')||'<p class="note">作業者・使用車両・機械を先に選択してください。選んだ対象の時間欄がここへ出ます。</p>';
 }
 function restore(d,mode){state={};const h=d?.usageHours;enabled=h?.version===1||mode!=='edit';breakMinutes=h?.breakMinutes??60;
  if(h?.version===1&&mode!=='duplicate')arr(h.entries).forEach(e=>state[rid(e.kind,e.label)]=structuredClone(e));
  q('#uhEnable').checked=enabled;q('#uhBreak').value=breakMinutes;display();
 }
 function install(){if(installed||typeof window.collect!=='function'||!q('#siteMoveCard'))return;installed=true;originalCollect=window.collect;
  const style=document.createElement('style');style.textContent='#uhCard [hidden]{display:none!important}#uhCard .uh-row{padding:12px;border:1px solid #ccc;border-radius:12px;margin:10px 0}#uhCard .uh-allocation{margin:12px 0;padding-top:8px;border-top:1px solid #ddd}#uhCard input,#uhCard select{box-sizing:border-box;width:100%;min-width:0;font-size:16px;min-height:44px}#uhCard .uh-input{display:grid;grid-template-columns:minmax(0,1fr) 40px minmax(0,1fr) 25px;gap:5px;align-items:center}#uhCard summary{font-weight:800;padding:12px 0;cursor:pointer}#uhCard .uh-toggle{display:flex;align-items:center;gap:8px}#uhCard .uh-toggle input{width:24px;min-height:24px}#uhCard .btn{width:100%;margin:8px 0}';document.head.appendChild(style);
  const card=document.createElement('div');card.id='uhCard';card.className='card';card.innerHTML='<h2>現場別の作業・使用時間</h2><label class="uh-toggle"><input id="uhEnable" type="checkbox" checked>時間で自動計算する</label><p class="note">人工・車両・重機は日額÷8時間。小型機械は登録した時間単価です。移動した人や車両だけ、元の現場と移動先へ時間を振り分けます。空欄は未入力、0は使用なしです。過去の保存額は優先します。</p><details><summary>人工の標準休憩・一括設定</summary><label>休憩（分）<input id="uhBreak" type="number" value="60" min="0" max="1440" step="1"></label><button id="uhDefault" type="button" class="btn light">移動なしの人工を日報の時刻から設定</button><p class="note">開始〜終了から休憩を引きます。車両・機械の使用時間にはコピーしません。</p></details><button id="uhSync" type="button" class="btn light">選択した人・車両・機械を表示</button><details><summary>移動先を変更したとき</summary><button id="uhReset" type="button" class="btn light">時間の入力だけをやり直す</button></details><div id="uhBody"></div>';
  q('#siteMoveCard').after(card);
  q('#uhEnable').onchange=()=>{enabled=q('#uhEnable').checked;display();};q('#uhSync').onclick=display;q('#uhReset').onclick=()=>{if(confirm('この画面の時間入力だけを消してやり直しますか？保存済みの日報は変わりません。')){state={};display();}};
  q('#uhDefault').onclick=()=>{if(availableSites().length>1)return alert('現場移動があるため、各現場の実働時間を個別に入力してください。');breakMinutes=Number(q('#uhBreak').value);const d=originalCollect(),m=workMinutes(d.start,d.end,breakMinutes);if(m===null)return alert('日報の開始・終了・休憩時間を確認してください。');sync(d).filter(e=>['labor','dispatch'].includes(e.kind)).forEach(e=>{e.allocations=[{site:d.site,minutes:m}];e.fromReportTime=true;});display();};
  card.addEventListener('input',e=>{if(e.target.id==='uhBreak')breakMinutes=Number(e.target.value);const row=e.target.closest('[data-uh-id]'),i=e.target.dataset.uhIndex;if(!row||i===undefined)return;const entry=state[row.dataset.uhId],box=e.target.closest('.uh-allocation'),h=q('[data-uh-part="h"]',box).value,m=q('[data-uh-part="m"]',box).value;entry.fromReportTime=false;entry.allocations[Number(i)].minutes=h===''&&m===''?null:Number(h||0)*60+Number(m||0);q('.uh-note',row).textContent=validateEntry(entry)||'時間を記録しました。日報保存後に集計します。';});
  card.addEventListener('change',e=>{if(e.target.matches('[data-uh-travel]'))state[e.target.closest('[data-uh-id]').dataset.uhId].travelSite=e.target.value;});
  card.addEventListener('click',e=>{const b=e.target.closest('[data-uh-times]');if(!b)return;const row=b.closest('[data-uh-id]'),box=b.closest('.uh-allocation'),m=workMinutes(q('.uh-start',box).value,q('.uh-end',box).value,q('.uh-break',box).value);if(m===null)return alert('開始・終了・休憩を確認してください。同日内で計算します。');state[row.dataset.uhId].fromReportTime=false;state[row.dataset.uhId].allocations[Number(b.dataset.uhTimes)].minutes=m;display();});
  window.collect=function(){const d=originalCollect.apply(this,arguments);if(enabled)d.usageHours={version:1,baseHours:8,breakMinutes,entries:structuredClone(sync(d))};return d;};
  const fill=window.fillReportForm;window.fillReportForm=function(d,mode='edit'){const out=fill.apply(this,arguments);restore(d,mode);return out;};
  const valid=window.validate;window.validate=function(d){if(!valid.apply(this,arguments))return false;if(d.usageHours&&[...document.querySelectorAll('#uhBody [data-uh-part]')].some(i=>!i.checkValidity())){alert('使用時間は整数、分は0〜59で入力してください。');return false;}
   for(const e of arr(d.usageHours?.entries)){if(e.allocations.some(a=>!availableSites().includes(a.site))){alert('移動先を変更・削除したため、時間欄の現場が一致しません。一度時間計算を外し、対象の時間を確認してください。');return false;}const problem=validateEntry(e);if(problem&&!problem.includes('未入力')){alert(e.label+'：'+problem);return false;}}return true;};
  const text=window.lineText;window.lineText=function(d){let t=text.apply(this,arguments);if(d.usageHours?.entries?.length)t+='\n\n■現場別の作業・使用時間\n'+d.usageHours.entries.map(e=>e.label+'：'+e.allocations.map(a=>a.site+' '+(a.minutes===null?'時間未入力':Math.floor(a.minutes/60)+'時間'+a.minutes%60+'分')).join('／')).join('\n');return t;};
  document.addEventListener('change',e=>{if(e.target.matches('input[name="worker"],input[name="vehicle"],input[name="machine"],input[name="attachment"],#meikenCount,#asahiCount,#start,#end,.sm-site'))display();});
  // No UI observers that append duplicate controls. Render only on relevant interaction.
  document.addEventListener('click',e=>{if(e.target.closest('nav [data-page="reportPage"]'))setTimeout(display,50);});
  const draft=typeof get==='function'&&typeof LS!=='undefined'?get(LS.draft,null):null;if(draft?.usageHours)restore(draft,'edit');else display();
 }
 const start=()=>setTimeout(install,180);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
