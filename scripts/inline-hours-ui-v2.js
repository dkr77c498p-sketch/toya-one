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
    const e=state[id];e.quantity=r.quantity;
    if(e.fromReportTime){
     if(sites.length===1)e.allocations=[{site:sites[0],minutes:['labor','dispatch'].includes(r.kind)?workMinutes(d.start,d.end,breakMinutes):r.minutes}];
     else{e.allocations=e.allocations.map(a=>({...a,minutes:null}));e.fromReportTime=false;}
    }
    for(const site of sites)if(!e.allocations.some(a=>a.site===site))e.allocations.push({site,minutes:0});
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
   (kind==='dispatch'?'<label>通勤費・高速代の計上先（1回だけ）<select data-uh-travel>'+e.allocations.map(a=>'<option '+(a.site===e.travelSite?'selected':'')+'>'+esc(a.site)+'</option>').join('')+'</select></label>':'')+
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
