/* TOYA One attachment usage rates. Admin-only; daily input is stored as an hourly rate. */
(() => {
 'use strict';
 if(window.__toyaAttachmentRateAdminV1)return;window.__toyaAttachmentRateAdminV1=true;
 const q=s=>document.querySelector(s),arr=v=>Array.isArray(v)?v:[];
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const identity=()=>typeof cloudProfile!=='undefined'&&cloudProfile?.active===true&&cloudProfile.role==='admin'&&cloudProfile.company_id&&typeof cloudClient!=='undefined'&&cloudClient?cloudProfile.id+':'+cloudProfile.company_id:'';
 let owner='',rates=[],busy=false,saving=false,loaded=false,dirty=false,adding=false;
 const norm=v=>String(v??'').normalize('NFKC').toLowerCase().replace(/[\s　]/g,'');
 const yen=n=>Number(n).toLocaleString('ja-JP',{maximumFractionDigits:4})+'円';
 const dailyToHourly=n=>Math.round(Number(n)/8*10000)/10000;
 const hourlyToDaily=n=>Math.round(Number(n)*8*10000)/10000;
 function names(){
  return [...new Set([...document.querySelectorAll('#machineAttachmentChoices input[name="attachment"]')].map(e=>e.value).concat(rates.map(r=>r.label)).filter(Boolean))];
 }
 function note(message){if(q('#arStatus'))q('#arStatus').textContent=message;}
 function setLocked(){
  for(const id of ['arAdd','arBack','arName','arNewName','arDaily'])if(q('#'+id))q('#'+id).disabled=saving;
  if(q('#arSave'))q('#arSave').disabled=saving||!loaded;
 }
 function mode(isNew){
  adding=isNew;q('#arExistingRow').hidden=isNew;q('#arNewNameRow').hidden=!isNew;q('#arBack').hidden=!isNew;
  q('#arSave').textContent=isNew?'品名と単価を追加して保存':'このアタッチメント単価を保存';
 }
 function selectRate(){
  if(saving)return;
  mode(false);
  const selected=q('#arName').value,found=rates.filter(r=>norm(r.label)===norm(selected)),row=found.length===1?found[0]:null;
  q('#arDaily').value=row?.hourly_rate!=null?hourlyToDaily(row.hourly_rate):'';
  q('#arRate').value=row?.hourly_rate??'';dirty=false;
  note(row?.hourly_rate!=null?'登録済み：1日 '+yen(hourlyToDaily(row.hourly_rate))+'／1時間 '+yen(row.hourly_rate):'単価未登録です。日額を入力してください。');
 }
 // Cloud rates remain admin-only. Add names to this admin's report choices in memory,
 // without rewriting the device catalog or resetting checked items/usage hours.
 function syncChoices(){
  if(!identity()||owner!==identity()||!loaded)return;
  const host=q('#machineAttachmentChoices');if(!host)return;
  const seen=new Set([...document.querySelectorAll('input[name="attachment"]')].map(e=>norm(e.value)));
  for(const row of rates){
   if(!row.active||!norm(row.label)||seen.has(norm(row.label)))continue;
   const label=document.createElement('label');label.className='choice';label.dataset.attachmentRateChoice='1';
   const input=document.createElement('input');input.type='checkbox';input.name='attachment';input.value=row.label;
   const span=document.createElement('span');span.className='toya-asset-label';span.textContent=row.label;
   label.append(input,span);host.appendChild(label);seen.add(norm(row.label));
  }
 }
 function mount(){
  const id=identity();
  if(owner&&owner!==id){q('#attachmentRateCard')?.remove();document.querySelectorAll('[data-attachment-rate-choice]').forEach(e=>e.remove());rates=[];loaded=false;dirty=false;adding=false;owner='';}
  if(!id)return false;
  owner=id;
  if(!q('#attachmentRateCard')){
   const page=q('#masterPage');if(!page)return false;
   const card=document.createElement('div');card.id='attachmentRateCard';card.className='card';
   card.innerHTML='<h2>重機アタッチメント使用料（管理者用）</h2><button type="button" id="arAdd" class="btn light">＋ 品名と単価を追加</button><details id="arSettings"><summary>単価設定（普段は変更不要）</summary><p class="note">1台・1日の金額を入力します。8時間で割った時間単価を自動計算します。重機本体・燃料費とは別に加算します。単価変更は過去の自動計算分にも反映します。</p><label id="arExistingRow">登録済みの品名<select id="arName"><option value="">選択してください</option></select></label><label id="arNewNameRow" hidden>追加する品名<input id="arNewName" type="text" maxlength="120" autocomplete="off" placeholder="例：法面バケット0.25BH用"></label><label>1台・1日あたり（円）<input id="arDaily" data-stepper="1" type="number" inputmode="decimal" min="0" max="1000000000" step="0.01" placeholder="日額を入力"></label><label>1台・1時間あたり（自動計算）<input id="arRate" type="number" inputmode="decimal" readonly placeholder="日額÷8時間"></label><button type="button" id="arSave" class="btn dark">このアタッチメント単価を保存</button><button type="button" id="arBack" class="btn light" hidden>登録済みの単価設定に戻る</button><p class="note" id="arStatus" role="status"></p></details>';
   page.prepend(card);
   if(!q('#arStyle')){const style=document.createElement('style');style.id='arStyle';style.textContent='#attachmentRateCard [hidden]{display:none!important}#attachmentRateCard summary{font-weight:900;font-size:18px;padding:8px 0;cursor:pointer}#attachmentRateCard details[open] summary{margin-bottom:12px}#attachmentRateCard input,#attachmentRateCard select{box-sizing:border-box;width:100%;min-width:0;min-height:44px;font-size:16px}#attachmentRateCard input[readonly]{background:#f2f2f2;color:#333}#attachmentRateCard .btn{width:100%;margin-top:10px}#arAdd{margin-bottom:12px}';document.head.appendChild(style);}
   q('#arAdd').onclick=()=>{
    if(saving)return;
    if(!adding){if(dirty&&!confirm('入力中の単価を破棄して新しい品名を追加しますか？'))return;q('#arNewName').value='';q('#arDaily').value='';q('#arRate').value='';dirty=false;}
    mode(true);q('#arSettings').open=true;note('追加する品名と、1台・1日あたりの金額を入力してください。');q('#arNewName').focus();
   };
   q('#arBack').onclick=()=>{if(saving||dirty&&!confirm('入力中の品名・単価を破棄して戻りますか？'))return;selectRate();};
   q('#arNewName').oninput=()=>{dirty=true;};q('#arName').onchange=selectRate;
   q('#arDaily').oninput=()=>{const raw=q('#arDaily').value.trim(),daily=raw===''?null:Number(raw);q('#arRate').value=daily!==null&&Number.isFinite(daily)&&daily>=0?dailyToHourly(daily):'';dirty=true;q('#arStatus').textContent=daily!==null&&Number.isFinite(daily)&&daily>=0?'8時間換算：1時間 '+yen(dailyToHourly(daily)):'日額を入力してください。';};q('#arSave').onclick=save;
  }
  const card=q('#attachmentRateCard'),tools=q('#ptRates'),page=q('#masterPage');
  if(tools&&tools.nextElementSibling!==card)tools.after(card);else if(!tools&&page.firstElementChild!==card)page.prepend(card);
  const sel=q('#arName'),current=sel.value,html='<option value="">選択してください</option>'+names().map(n=>'<option value="'+esc(n)+'">'+esc(n)+'</option>').join('');
  if(sel.innerHTML!==html){sel.innerHTML=html;sel.value=current;}
  setLocked();syncChoices();return true;
 }
 async function load(){
  if(!mount()||busy||saving||loaded)return;
  busy=true;const mine=identity(),company=cloudProfile.company_id;
  try{
   const r=await cloudClient.from('attachment_rate_master').select('id,label,hourly_rate,active,updated_at').eq('company_id',company).order('label');
   if(r.error)throw r.error;if(identity()!==mine)return;
   rates=arr(r.data);loaded=true;mount();if(!dirty&&!adding)note(rates.length?'登録単価を読み込みました。追加する場合は「＋ 品名と単価を追加」を押してください。':'アタッチメント単価はまだ未登録です。「＋ 品名と単価を追加」から登録できます。');
  }catch(e){if(identity()===mine&&q('#arStatus'))q('#arStatus').textContent='単価を読み込めませんでした：'+e.message;}
  finally{busy=false;}
 }
 async function save(){
  if(!identity()||saving||!loaded)return;
  let label=adding?q('#arNewName').value.trim():q('#arName').value;
  const raw=q('#arDaily').value.trim(),daily=raw===''?null:Number(raw),n=daily===null?null:dailyToHourly(daily);
  if(adding&&(!norm(label)||label.length>120||/[\u0000-\u001f\u007f]/.test(label))){note('追加する品名を1〜120文字で入力してください。');return;}
  if(!label||daily===null||!Number.isFinite(daily)||daily<0||daily>1e9||!q('#arDaily').checkValidity()){q('#arStatus').textContent='アタッチメントと日額を入力してください。0円も指定できます。';return;}
  if([...document.querySelectorAll('#smallToolChoices input[name="attachment"]')].some(e=>norm(e.value)===norm(label))){note('その品名は小型機械・工具に登録されています。小型機械・工具の単価欄で設定してください。');return;}
  const matches=rates.filter(r=>norm(r.label)===norm(label));
  if(matches.length>1){note('同じ品名の単価が複数あります。管理者に確認してください。');return;}
  if(adding&&matches.length){note('「'+matches[0].label+'」は登録済みです。「登録済みの単価設定に戻る」から変更してください。');return;}
  // An existing device-catalog name may not have a cloud rate yet. Reuse its exact label.
  label=matches[0]?.label||names().find(name=>norm(name)===norm(label))||label;
  if(!confirm(label+'\n1台・1日 '+yen(daily)+'／1時間 '+yen(n)+'で登録しますか？\n重機本体・燃料費とは別に加算します。'))return;
  const mine=identity(),company=cloudProfile.company_id,wasAdding=adding;saving=true;setLocked();
  try{
   const old=rates.find(r=>r.label===label);
   const req=old?cloudClient.from('attachment_rate_master').update({hourly_rate:n,active:true,updated_at:new Date().toISOString()}).eq('company_id',company).eq('id',old.id).eq('updated_at',old.updated_at):cloudClient.from('attachment_rate_master').insert({company_id:company,label,hourly_rate:n,active:true});
   const r=await req.select('id,label,hourly_rate,active,updated_at');if(r.error)throw r.error;
   if(r.data?.length!==1)throw new Error('単価が同時に変更されました。再読み込みして確認してください。');
   if(identity()!==mine)return;
   rates=rates.filter(x=>x.label!==label).concat(r.data);dirty=false;mount();mode(false);q('#arName').value=label;
   q('#arDaily').value=hourlyToDaily(r.data[0].hourly_rate);q('#arRate').value=r.data[0].hourly_rate;
   note(label+'：1日 '+yen(hourlyToDaily(r.data[0].hourly_rate))+'／1時間 '+yen(r.data[0].hourly_rate)+(wasAdding?' を追加しました。':' を保存しました。'));q('#sfRefresh')?.click();
  }catch(e){if(identity()===mine&&q('#arStatus'))note('保存できませんでした：'+(e.code==='23505'?'同じ品名が先に登録されました。画面を再読み込みして確認してください。':e.message));}
  finally{saving=false;if(identity()===mine)setLocked();}
 }
 let observed=null;
 const observer=new MutationObserver(()=>syncChoices());
 function start(){mount();load();const host=q('#machineAttachmentChoices');if(host&&host!==observed){observer.disconnect();observer.observe(host,{childList:true});observed=host;}}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,350),{once:true});else setTimeout(start,350);
 document.addEventListener('click',e=>{if(e.target.closest('nav [data-page]')){mount();load();}});
 // Auth restoration is asynchronous. Poll only for identity changes/missing initialization.
 setInterval(()=>{if(owner!==identity()||!loaded)start();},3000);
})();
