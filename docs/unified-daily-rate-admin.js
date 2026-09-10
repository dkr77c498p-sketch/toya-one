/* TOYA One unified daily-rate editor v1.
 * Gives small tools, vehicles and equipment the same add/edit flow as attachments.
 * Existing cost sheets and device catalogs are never rewritten automatically.
 */
(() => {
 'use strict';
 const norm=v=>String(v??'').normalize('NFKC').toLowerCase().replace(/[\s　]/g,'');
 const dailyToHourly=n=>Math.round(Number(n)/8*10000)/10000;
 const validName=v=>{const s=String(v??'').trim();return !!s&&s.length<=120&&!/[\u0000-\u001f\u007f]/.test(s);};
 const validDaily=v=>v!==''&&Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=1e9&&Math.abs(Number(v)*100-Math.round(Number(v)*100))<1e-5;
 if(typeof module==='object'&&module.exports){module.exports={norm,dailyToHourly,validName,validDaily};return;}
 if(window.__toyaUnifiedDailyRatesV1)return;window.__toyaUnifiedDailyRatesV1=true;
 const q=(s,r=document)=>r.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const yen=n=>Number(n).toLocaleString('ja-JP',{maximumFractionDigits:4})+'円';
 const identity=()=>typeof cloudProfile!=='undefined'&&cloudProfile?.active===true&&cloudProfile.role==='admin'&&cloudProfile.company_id&&typeof cloudClient!=='undefined'&&cloudClient?cloudProfile.id+':'+cloudProfile.company_id:'';
 const specs={
  tool:{table:'small_tool_rate_master',label:'小型機械・工具',heading:'小型機械・工具の使用料（管理者用）',legacy:'#ptRates',existing:'#ptTools',rate:'hourly_rate',choice:'#smallToolChoices',choiceName:'attachment',extra:{fuel_included:false}},
  equipment:{table:'equipment_rate_master',label:'重機',heading:'重機使用料（管理者用）',card:'#ecCard',legacy:'#ecRates',rate:'daily_rate',choice:'#machineChoices',choiceName:'machine',coded:true},
  vehicle:{table:'vehicle_rate_master',label:'車両',heading:'車両使用料（管理者用）',card:'#vcCard',legacy:'#vcRates',rate:'daily_rate',choice:'#vehicleChoices',choiceName:'vehicle',coded:true}
 };
 const state=Object.fromEntries(Object.keys(specs).map(k=>[k,{owner:'',rows:[],loaded:false,loading:false,saving:false,adding:false,dirty:false}]));
 function html(key,spec){return `<section id="udr-${key}" class="udr-editor"><h2 class="udr-own-heading">${esc(spec.heading)}</h2><button id="udr-${key}-add" type="button" class="btn light udr-wide">＋ 品名と単価を追加</button><details id="udr-${key}-settings"><summary>単価設定（普段は変更不要）</summary><p class="note">1台・1日の金額を入力します。8時間で割った時間単価を自動計算します。燃料費とは別に加算します。</p><label id="udr-${key}-existing">登録済みの品名<select id="udr-${key}-select"><option value="">選択してください</option></select></label><label id="udr-${key}-new" hidden>追加する品名<input id="udr-${key}-name" type="text" maxlength="120" autocomplete="off" placeholder="${esc(spec.label)}名を入力"></label><label>1台・1日あたり（円）<input id="udr-${key}-daily" type="number" data-stepper="1" inputmode="decimal" min="0" max="1000000000" step="0.01" placeholder="日額を入力"></label><label>1台・1時間あたり（自動計算）<input id="udr-${key}-hourly" type="number" inputmode="decimal" readonly placeholder="日額÷8時間"></label><button id="udr-${key}-save" type="button" class="btn dark udr-wide">この単価を保存</button><button id="udr-${key}-back" type="button" class="btn light udr-wide" hidden>登録済みの単価設定に戻る</button><p id="udr-${key}-status" class="note" role="status"></p></details></section>`;}
 function el(key,name){return q(`#udr-${key}-${name}`);}
 function status(key,text){if(el(key,'status'))el(key,'status').textContent=text;}
 function rateDaily(spec,row){return row?.[spec.rate]==null?'':spec.rate==='hourly_rate'?Math.round(Number(row[spec.rate])*8*10000)/10000:Number(row[spec.rate]);}
 function lock(key){const s=state[key];for(const name of ['add','back','select','name','daily'])if(el(key,name))el(key,name).disabled=s.saving;const save=el(key,'save');if(save)save.disabled=s.saving||!s.loaded;}
 function mode(key,adding){
  const s=state[key];s.adding=adding;el(key,'existing').hidden=adding;el(key,'new').hidden=!adding;el(key,'back').hidden=!adding;
  el(key,'save').textContent=adding?'品名と単価を追加して保存':'この単価を保存';
 }
 function selectRow(key){
  const s=state[key],spec=specs[key];if(s.saving)return;mode(key,false);
  const matches=s.rows.filter(r=>norm(r.label)===norm(el(key,'select').value)),row=matches.length===1?matches[0]:null,daily=rateDaily(spec,row);
  el(key,'daily').value=daily;el(key,'hourly').value=daily===''?'':dailyToHourly(daily);s.dirty=false;
  status(key,row?'登録済み：1日 '+yen(daily)+'／1時間 '+yen(dailyToHourly(daily)):'品名を選択してください。');
 }
 function choices(key){
  const s=state[key],spec=specs[key],host=q(spec.choice);if(!host||!s.loaded||s.owner!==identity())return;
  const seen=new Set([...host.querySelectorAll(`input[name="${spec.choiceName}"]`)].map(x=>norm(x.value)));
  for(const row of s.rows){if(row.active===false||!norm(row.label)||seen.has(norm(row.label)))continue;
   const label=document.createElement('label');label.className='choice';label.dataset.unifiedRateChoice=key;
   const input=document.createElement('input');input.type='checkbox';input.name=spec.choiceName;input.value=row.label;
   const span=document.createElement('span');span.className='toya-asset-label';span.textContent=row.label;label.append(input,span);host.appendChild(label);seen.add(norm(row.label));
  }
 }
 function render(key){
  const s=state[key],select=el(key,'select');if(!select)return;const current=select.value;
  select.innerHTML='<option value="">選択してください</option>'+s.rows.filter(r=>r.active!==false).sort((a,b)=>a.label.localeCompare(b.label,'ja')).map(r=>`<option value="${esc(r.label)}">${esc(r.label)}</option>`).join('');
  select.value=s.rows.some(r=>r.label===current)?current:'';lock(key);choices(key);
 }
 function mount(key){
  const spec=specs[key],s=state[key],id=identity();
  if(s.owner&&s.owner!==id){q(`#udr-${key}`)?.remove();document.querySelectorAll(`[data-unified-rate-choice="${key}"]`).forEach(x=>x.remove());s.owner='';s.rows=[];s.loaded=false;s.loading=false;s.saving=false;s.adding=false;s.dirty=false;}
  if(!id)return false;s.owner=id;if(q(`#udr-${key}`)){choices(key);return true;}
  let anchor=q(spec.legacy),container;
  if(key==='tool'){
   if(!anchor)return false;let old=q('#udr-tool-legacy');if(!old){old=document.createElement('div');old.id='udr-tool-legacy';old.hidden=true;while(anchor.firstChild)old.appendChild(anchor.firstChild);anchor.appendChild(old);}container=anchor;
  }else{
   const card=q(spec.card);if(!card||!anchor)return false;anchor.hidden=true;container=anchor.parentElement;
  }
  const section=document.createElement('div');section.innerHTML=html(key,spec);const editor=section.firstElementChild;
  if(key==='tool')container.appendChild(editor);else{container.parentElement.insertBefore(editor,container);editor.querySelector('.udr-own-heading').hidden=true;}
  el(key,'add').onclick=()=>{if(s.saving)return;if(!s.adding&&s.dirty&&!confirm('入力中の単価を破棄して、新しい品名を追加しますか？'))return;el(key,'name').value='';el(key,'daily').value='';el(key,'hourly').value='';s.dirty=false;mode(key,true);el(key,'settings').open=true;status(key,'追加する品名と、1台・1日あたりの金額を入力してください。');el(key,'name').focus();};
  el(key,'back').onclick=()=>{if(s.saving||s.dirty&&!confirm('入力中の品名・単価を破棄して戻りますか？'))return;selectRow(key);};
  el(key,'select').onchange=()=>selectRow(key);el(key,'name').oninput=()=>{s.dirty=true;};
  el(key,'daily').oninput=()=>{const raw=el(key,'daily').value.trim();el(key,'hourly').value=validDaily(raw)?dailyToHourly(raw):'';s.dirty=true;status(key,validDaily(raw)?'8時間換算：1時間 '+yen(dailyToHourly(raw)):'日額を入力してください。');};
  el(key,'save').onclick=()=>save(key);render(key);return true;
 }
 async function load(key){
  const spec=specs[key],s=state[key];if(!mount(key)||s.loading||s.saving||s.loaded)return;s.loading=true;const mine=identity(),company=cloudProfile.company_id;
  try{const r=await cloudClient.from(spec.table).select('*').eq('company_id',company).order(spec.coded?'sort_order':'label');if(r.error)throw r.error;if(identity()!==mine)return;s.rows=Array.isArray(r.data)?r.data:[];s.loaded=true;render(key);if(!s.dirty&&!s.adding)status(key,s.rows.length?'登録単価を読み込みました。追加するときは上のボタンを押してください。':'まだ登録がありません。上のボタンから追加できます。');}
  catch(e){if(identity()===mine)status(key,'単価を読み込めませんでした：'+e.message);}
  finally{s.loading=false;lock(key);}
 }
 async function save(key){
  const spec=specs[key],s=state[key];if(!identity()||s.saving||!s.loaded)return;
  let label=(s.adding?el(key,'name').value:el(key,'select').value).trim(),raw=el(key,'daily').value.trim();
  if(s.adding&&!validName(label)){status(key,'追加する品名を1〜120文字で入力してください。');return;}
  if(!label||!validDaily(raw)||!el(key,'daily').checkValidity()){status(key,'品名と日額を入力してください。0円も指定できます。');return;}
  const matches=s.rows.filter(r=>norm(r.label)===norm(label));if(matches.length>1){status(key,'同じ品名の単価が複数あります。管理者に確認してください。');return;}
  if(s.adding&&matches.length){status(key,'「'+matches[0].label+'」は登録済みです。登録済みの単価設定から変更してください。');return;}
  label=matches[0]?.label||label;const daily=Number(raw),stored=spec.rate==='hourly_rate'?dailyToHourly(daily):daily;
  if(!confirm(`${label}\n1台・1日 ${yen(daily)}／1時間 ${yen(dailyToHourly(daily))}で登録しますか？\n燃料費は別に加算します。`))return;
  const old=matches[0],mine=identity(),company=cloudProfile.company_id,wasAdding=s.adding;s.saving=true;lock(key);
  try{
   let req;if(old){req=cloudClient.from(spec.table).update({[spec.rate]:stored,...spec.extra,active:true,updated_at:new Date().toISOString()}).eq('company_id',company).eq('id',old.id).eq('updated_at',old.updated_at);}
   else{const payload={company_id:company,label,[spec.rate]:stored,...spec.extra,active:true};if(spec.coded)Object.assign(payload,{code:'custom-'+crypto.randomUUID(),sort_order:(Math.max(0,...s.rows.map(r=>Number(r.sort_order)||0))+10),calculation_mode:'add_recorded_fuel_labor_separate'});req=cloudClient.from(spec.table).insert(payload);}
   const r=await req.select('*');if(r.error)throw r.error;if(r.data?.length!==1)throw new Error('単価が同時に変更されました。画面を開き直してください。');if(identity()!==mine)return;
   s.rows=s.rows.filter(x=>x.id!==r.data[0].id&&norm(x.label)!==norm(label)).concat(r.data[0]);s.dirty=false;render(key);mode(key,false);el(key,'select').value=r.data[0].label;el(key,'daily').value=rateDaily(spec,r.data[0]);el(key,'hourly').value=dailyToHourly(rateDaily(spec,r.data[0]));
   status(key,label+'：1日 '+yen(daily)+'／1時間 '+yen(dailyToHourly(daily))+(wasAdding?' を追加しました。':' を保存しました。'));
   document.dispatchEvent(new CustomEvent('toya-daily-rate-updated',{detail:{kind:key,row:{...r.data[0]}}}));q('#sfRefresh')?.click();
  }catch(e){if(identity()===mine)status(key,'保存できませんでした：'+(e.code==='23505'?'同じ品名が先に登録されています。画面を開き直してください。':e.message));}
  finally{s.saving=false;if(identity()===mine)lock(key);}
 }
 function styles(){if(q('#udr-styles'))return;const css=document.createElement('style');css.id='udr-styles';css.textContent='.udr-editor [hidden]{display:none!important}.udr-editor summary{font-weight:900!important;font-size:18px;padding:10px 0;cursor:pointer}.udr-editor input,.udr-editor select{box-sizing:border-box;width:100%;min-width:0;min-height:44px;font-size:16px}.udr-editor input[readonly]{background:#f2f2f2;color:#333}.udr-editor .udr-wide{width:100%;margin-top:10px}.udr-editor>h2{margin-top:0}';document.head.appendChild(css);}
 function start(){styles();for(const key of Object.keys(specs)){mount(key);load(key);}}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,500),{once:true});else setTimeout(start,500);
 document.addEventListener('click',e=>{if(e.target.closest?.('nav [data-page]'))setTimeout(start,0);});
 setInterval(()=>{for(const key of Object.keys(specs)){const s=state[key];if(s.owner!==identity()||!s.loaded)start();else choices(key);}},3000);
})();
