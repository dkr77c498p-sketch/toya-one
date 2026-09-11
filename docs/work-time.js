/* Recorded working time and company cost multipliers. No employee prices here.
 * Premium minutes are disjoint portions of actual minutes, never extra hours.
 * Old reports retain their original calculation until the user enables this form.
 */
(() => {
 'use strict';
 const arr=v=>Array.isArray(v)?v:[],bands=['overtimeMinutes','nightMinutes','holidayNightMinutes'];
 const standardBreaks=()=>[{start:'10:00',end:'10:30'},{start:'12:00',end:'13:00'},{start:'15:00',end:'15:30'}];
 const parse=t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(t))?Number(t.slice(0,2))*60+Number(t.slice(3)):null;
 const integer=v=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=1440;
 const factor=v=>v===1.25||v===1.3;
 function premiumError(minutes,p){
  if(!p)return '';
  if(!integer(minutes)||bands.some(k=>!integer(p[k])))return '実働・残業・夜間は0〜24時間の分数で入力してください。';
  if(bands.reduce((n,k)=>n+p[k],0)>minutes)return '残業・夜間・休日夜間の合計が実働時間を超えています。同じ時間は重ねて入力しません。';
  if(p.overtimeMultiplier!=null&&!factor(p.overtimeMultiplier))return '残業倍率は1.25倍または1.3倍を選んでください。';
  return '';
 }
 function weighted(minutes,p){
  const error=premiumError(minutes,p);if(error)return {minutes:0,issue:error};
  if(!p)return {minutes,issue:''};
  const pending=p.overtimeMinutes>0&&!factor(p.overtimeMultiplier);
  return {minutes:minutes-p.overtimeMinutes+(pending?0:p.overtimeMinutes*(p.overtimeMultiplier||1))+p.nightMinutes*0.5+p.holidayNightMinutes*0.6,
   issue:pending?'残業倍率が未選択です。残業の部分だけ金額を保留しています。':''};
 }
 function classify(start,end,settings){
  const fail=issue=>({minutes:null,breakMinutes:null,premium:null,issue});
  const a=parse(start),rawEnd=parse(end);
  if(a===null||rawEnd===null)return fail('開始・終了時刻を入力してください。');
  const b=rawEnd+(settings?.nextDay===true?1440:0);
  if(b<=a||b-a>1440)return fail('終了が翌日の場合は「翌日終了」を選んでください。作業時間は24時間以内です。');
  if(!Array.isArray(settings?.breaks))return fail('休憩時間を確認してください。');
  const windows=[];
  for(const r of settings.breaks){
   const x=parse(r.start),y=parse(r.end);if(x===null||y===null||x===y)return fail('休憩の開始・終了を確認してください。');
   const stop=y+(y<x?1440:0);
   for(const offset of [-1440,0,1440])windows.push([x+offset,stop+offset]);
  }
  const premium={overtimeMinutes:0,nightMinutes:0,holidayNightMinutes:0,overtimeMultiplier:settings.overtimeMultiplier??null};
  let minutes=0,breakMinutes=0;
  for(let t=a;t<b;t++){
   if(windows.some(([x,y])=>t>=x&&t<y)){breakMinutes++;continue;}
   minutes++;const clock=t%1440;
   if(clock<300||clock>=1320)premium[settings.holiday?'holidayNightMinutes':'nightMinutes']++;
   else if(clock>=1020)premium.overtimeMinutes++;
  }
  if(settings.manualPremium){
   for(const k of bands)premium[k]=settings.manualPremium[k];
  }
  const issue=premiumError(minutes,premium);
  return {minutes,breakMinutes,premium,issue};
 }
 const report=d=>d?.workTime?.version===1?classify(d.start,d.end,d.workTime):null;
 const textMinutes=m=>m==null?'未入力':Math.floor(m/60)+'時間'+(m%60?m%60+'分':'');
 function describe(p){
  if(!p)return '';
  return [['overtimeMinutes','残業'],['nightMinutes','夜間'],['holidayNightMinutes','休日夜間']].filter(([k])=>p[k]>0).map(([k,label])=>label+' '+textMinutes(p[k])+(k==='overtimeMinutes'?'（'+(factor(p.overtimeMultiplier)?p.overtimeMultiplier+'倍':'倍率未選択')+'）':k==='nightMinutes'?'（1.5倍）':'（1.6倍）')).join(' ／ ');
 }
 function exportColumns(d){const x=report(d);return x?[d.workTime.nextDay?'翌日':'当日',d.workTime.holiday?'休日':'通常日',x.breakMinutes,x.minutes,x.premium?.nightMinutes??'',x.premium?.holidayNightMinutes??'',d.workTime.overtimeMultiplier??'未選択']:['','','','','','',''];}
 const engine=Object.freeze({standardBreaks,classify,report,premiumError,weighted,describe,textMinutes,exportColumns});
 if(typeof module==='object'&&module.exports){module.exports=engine;return;}
 if(window.ToyaWorkTimeEngine)return;window.ToyaWorkTimeEngine=engine;
 const q=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let enabled=true,manualPremium=null,installed=false;
 function read(){
  return {version:1,nextDay:q('#wtNextDay').checked,holiday:q('#wtHoliday').checked,
   overtimeMultiplier:q('#wtMultiplier').value===''?null:Number(q('#wtMultiplier').value),
   breaks:[...document.querySelectorAll('#wtBreaks .wt-break')].filter(row=>row.querySelector('input[type=checkbox]').checked).map(row=>({start:row.querySelector('.wt-break-start').value,end:row.querySelector('.wt-break-end').value})),
   ...(manualPremium?{manualPremium:{...manualPremium}}:{})};
 }
 function addBreak(r={start:'12:00',end:'13:00'}){
  const row=document.createElement('div');row.className='wt-break';row.innerHTML='<input type="checkbox" aria-label="この休憩を使う" checked><input type="time" class="wt-break-start" aria-label="休憩開始" value="'+esc(r.start)+'"><span>〜</span><input type="time" class="wt-break-end" aria-label="休憩終了" value="'+esc(r.end)+'">';q('#wtBreaks').appendChild(row);
 }
 function update(apply=false){
  q('#wtEnable').checked=enabled;q('#wtFields').hidden=!enabled;
  if(enabled){const x=classify(q('#start').value,q('#end').value,read());
   q('#wtStatus').textContent=x.issue||'実働 '+textMinutes(x.minutes)+' ／ 休憩 '+x.breakMinutes+'分'+(describe(x.premium)?' ／ '+describe(x.premium):'');
   if(!manualPremium&&x.premium){q('#overtime').value=x.premium.overtimeMinutes/60;q('#wtNight').value=x.premium.nightMinutes/60;q('#wtHolidayNight').value=x.premium.holidayNightMinutes/60;}
  }else q('#wtStatus').textContent='この日報は以前の時間設定を保持しています。残業・夜間を入力するときは上のチェックを入れてください。';
  document.dispatchEvent(new CustomEvent('toya-work-time-change',{detail:{enabled,apply}}));
 }
 function restore(d,mode){
  enabled=d?.workTime?.version===1||mode!=='edit';manualPremium=d?.workTime?.manualPremium?structuredClone(d.workTime.manualPremium):null;
  const s=d?.workTime||{};q('#wtNextDay').checked=s.nextDay===true;q('#wtHoliday').checked=s.holiday===true;q('#wtMultiplier').value=s.overtimeMultiplier??'';
  q('#wtBreaks').innerHTML='';(s.breaks||standardBreaks()).forEach(addBreak);
  if(manualPremium){q('#overtime').value=manualPremium.overtimeMinutes/60;q('#wtNight').value=manualPremium.nightMinutes/60;q('#wtHolidayNight').value=manualPremium.holidayNightMinutes/60;}
  update();
 }
 function install(){
  if(installed||typeof window.collect!=='function'||!q('#overtime'))return;installed=true;
  const oldInput=q('#overtime'),oldWrap=oldInput.parentElement,grid=oldWrap.parentElement;
  grid.classList.replace('grid3','grid2');oldWrap.remove();
  const card=document.createElement('div');card.id='workTimeCard';card.className='row';
  card.innerHTML='<h3>休憩・残業・夜間</h3><label class="wt-check"><input id="wtEnable" type="checkbox" checked>休憩・残業・夜間を入力する</label><div id="wtFields"><div class="grid2"><label class="wt-check"><input id="wtNextDay" type="checkbox">翌日終了</label><label class="wt-check"><input id="wtHoliday" type="checkbox">休日の作業</label></div><details><summary>休憩時間を変更</summary><p class="note">基本休憩：10:00〜10:30、12:00〜13:00、15:00〜15:30。作業時間と重なる部分を引きます。</p><div id="wtBreaks"></div><button id="wtAddBreak" type="button" class="btn light">＋休憩を追加</button></details><div class="grid2"><div id="wtOvertimeWrap"><label for="overtime">残業（17〜22時・時間）</label></div><div><label for="wtMultiplier">残業倍率</label><select id="wtMultiplier"><option value="">選択してください</option><option value="1.25">1.25倍</option><option value="1.3">1.3倍</option></select></div><div><label for="wtNight">夜間（22〜翌5時・1.5倍）</label><input id="wtNight" type="number" min="0" max="24" step="0.25" inputmode="decimal" value="0"></div><div><label for="wtHolidayNight">休日夜間（22〜翌5時・1.6倍）</label><input id="wtHolidayNight" type="number" min="0" max="24" step="0.25" inputmode="decimal" value="0"></div></div><p class="note">時間を入力します。残業・夜間は実働時間の内訳です。同じ時間は重ねず、作業者ごとの違いは下の人工欄で調整できます。</p><button id="wtApply" type="button" class="btn light">開始・終了・休憩から人工の時間を設定</button></div><p id="wtStatus" class="note" role="status" aria-live="polite"></p>';
  grid.after(card);q('#wtOvertimeWrap').appendChild(oldInput);oldInput.max='24';oldInput.step='0.25';oldInput.inputMode='decimal';
  const style=document.createElement('style');style.textContent='#workTimeCard{margin-top:16px}#workTimeCard [hidden]{display:none!important}#workTimeCard .wt-check{display:flex;gap:8px;align-items:center}#workTimeCard .wt-check input,#workTimeCard .wt-break input[type=checkbox]{width:24px;min-width:24px;height:24px;margin:0}#workTimeCard input,#workTimeCard select{box-sizing:border-box;min-width:0;font-size:16px}#workTimeCard .wt-break{display:grid;grid-template-columns:24px minmax(0,1fr) 18px minmax(0,1fr);align-items:center;gap:6px;margin:8px 0}#workTimeCard summary{font-weight:800;padding:12px 0}#workTimeCard .btn{width:100%;margin:8px 0}';document.head.appendChild(style);
  q('#wtEnable').onchange=()=>{enabled=q('#wtEnable').checked;update();};q('#wtAddBreak').onclick=()=>{addBreak();update();};
  q('#wtApply').onclick=()=>{manualPremium=null;update(true);};
  card.addEventListener('input',event=>{
   const map={overtime:'overtimeMinutes',wtNight:'nightMinutes',wtHolidayNight:'holidayNightMinutes'};
   if(map[event.target.id]){manualPremium={overtimeMinutes:Number(q('#overtime').value)*60,nightMinutes:Number(q('#wtNight').value)*60,holidayNightMinutes:Number(q('#wtHolidayNight').value)*60};}
   update();
  });
  card.addEventListener('change',()=>update());
  for(const id of ['start','end']){q('#'+id).addEventListener('input',()=>update());q('#'+id).addEventListener('change',()=>update());}
  const quick=window.setTimeQuick;if(quick)window.setTimeQuick=function(){const r=quick.apply(this,arguments);update();return r;};
  const collect=window.collect;window.collect=function(){const d=collect.apply(this,arguments);if(enabled){d.workTime=read();const x=report(d);if(x?.premium)d.overtime=x.premium.overtimeMinutes/60;}return d;};
  const fill=window.fillReportForm;window.fillReportForm=function(d,mode='edit'){const r=fill.apply(this,arguments);restore(d,mode);return r;};
  const valid=window.validate;window.validate=function(d){if(!valid.apply(this,arguments))return false;const x=report(d);if(x?.issue){alert(x.issue);return false;}return true;};
  const line=window.lineText;window.lineText=function(d){let t=line.apply(this,arguments);const x=report(d);if(x)t+='\n\n■休憩・残業・夜間\n'+(d.workTime.nextDay?'翌日終了 ／ ':'')+(d.workTime.holiday?'休日 ／ ':'')+'実働 '+textMinutes(x.minutes)+' ／ 休憩 '+x.breakMinutes+'分\n'+(describe(x.premium)||'残業・夜間なし');return t;};
  standardBreaks().forEach(addBreak);update();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
