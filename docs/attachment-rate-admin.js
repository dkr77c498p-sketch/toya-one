/* TOYA One attachment hourly rates. Admin-only; no embedded prices or automatic rate writes. */
(() => {
 'use strict';
 if(window.__toyaAttachmentRateAdminV1)return;window.__toyaAttachmentRateAdminV1=true;
 const q=s=>document.querySelector(s),arr=v=>Array.isArray(v)?v:[];
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const identity=()=>typeof cloudProfile!=='undefined'&&cloudProfile?.active===true&&cloudProfile.role==='admin'&&cloudProfile.company_id&&typeof cloudClient!=='undefined'&&cloudClient?cloudProfile.id+':'+cloudProfile.company_id:'';
 let owner='',rates=[],busy=false,saving=false,loaded=false,dirty=false;
 const yen=n=>Number(n).toLocaleString('ja-JP',{maximumFractionDigits:4})+'円';
 function names(){
  return [...new Set([...document.querySelectorAll('#machineAttachmentChoices input[name="attachment"]')].map(e=>e.value).concat(rates.map(r=>r.label)).filter(Boolean))];
 }
 function mount(){
  const id=identity();
  if(owner&&owner!==id){q('#attachmentRateCard')?.remove();rates=[];loaded=false;dirty=false;owner='';}
  if(!id)return false;
  owner=id;
  if(!q('#attachmentRateCard')){
   const parent=q('#attachmentMaster')?.closest('.card')||q('#masterPage');if(!parent)return false;
   const card=document.createElement('div');card.id='attachmentRateCard';card.className='card';
   card.innerHTML='<h2>重機アタッチメントの時間単価（管理者用）</h2><p class="note">重機本体とは別の時間単価です。未登録でも使用時間は記録できますが、金額は要確認になります。重機代に含む場合は0円を明示して登録してください。単価変更は過去の自動計算分にも反映します。</p><label>アタッチメント<select id="arName"><option value="">選択してください</option></select></label><label>1台・1時間あたり（円）<input id="arRate" data-stepper="1" type="number" inputmode="decimal" min="0" max="1000000000" step="0.01" placeholder="未登録"></label><button type="button" id="arSave" class="btn dark">この時間単価を保存</button><p class="note" id="arStatus" role="status"></p>';
   if(parent.id==='masterPage')parent.appendChild(card);else parent.after(card);
   if(!q('#arStyle')){const style=document.createElement('style');style.id='arStyle';style.textContent='#attachmentRateCard input,#attachmentRateCard select{box-sizing:border-box;width:100%;min-width:0;min-height:44px;font-size:16px}#attachmentRateCard .btn{width:100%;margin-top:10px}';document.head.appendChild(style);}
   q('#arName').onchange=()=>{const row=rates.find(r=>r.label===q('#arName').value);q('#arRate').value=row?.hourly_rate??'';dirty=false;q('#arStatus').textContent=row?'登録済み：1時間 '+yen(row.hourly_rate):'単価未登録です。時間は記録でき、金額だけ要確認になります。';};
   q('#arRate').oninput=()=>{dirty=true;};q('#arSave').onclick=save;
  }
  const sel=q('#arName'),current=sel.value,html='<option value="">選択してください</option>'+names().map(n=>'<option value="'+esc(n)+'">'+esc(n)+'</option>').join('');
  if(sel.innerHTML!==html){sel.innerHTML=html;sel.value=current;}
  return true;
 }
 async function load(){
  if(!mount()||busy||saving||loaded||dirty)return;
  busy=true;const mine=identity(),company=cloudProfile.company_id;
  try{
   const r=await cloudClient.from('attachment_rate_master').select('id,label,hourly_rate,active,updated_at').eq('company_id',company).order('label');
   if(r.error)throw r.error;if(identity()!==mine)return;
   rates=arr(r.data);loaded=true;mount();q('#arStatus').textContent=rates.length?'登録単価を読み込みました。':'アタッチメントの時間単価はまだ未登録です。';
  }catch(e){if(identity()===mine&&q('#arStatus'))q('#arStatus').textContent='単価を読み込めませんでした：'+e.message;}
  finally{busy=false;}
 }
 async function save(){
  if(!identity()||saving||!loaded)return;
  const label=q('#arName').value,raw=q('#arRate').value.trim(),n=raw===''?null:Number(raw);
  if(!label||n===null||!Number.isFinite(n)||n<0||n>1e9||!q('#arRate').checkValidity()){q('#arStatus').textContent='アタッチメントと時間単価を入力してください。0円も指定できます。';return;}
  if(!confirm(label+'\n1台・1時間 '+yen(n)+'（重機本体とは別）で登録しますか？\n過去の自動計算分にも反映します。'))return;
  const mine=identity(),company=cloudProfile.company_id,button=q('#arSave');saving=true;button.disabled=true;
  try{
   const old=rates.find(r=>r.label===label);
   const req=old?cloudClient.from('attachment_rate_master').update({hourly_rate:n,active:true,updated_at:new Date().toISOString()}).eq('company_id',company).eq('id',old.id).eq('updated_at',old.updated_at):cloudClient.from('attachment_rate_master').insert({company_id:company,label,hourly_rate:n,active:true});
   const r=await req.select('id,label,hourly_rate,active,updated_at');if(r.error)throw r.error;
   if(r.data?.length!==1)throw new Error('単価が同時に変更されました。再読み込みして確認してください。');
   if(identity()!==mine)return;
   rates=rates.filter(x=>x.label!==label).concat(r.data);dirty=false;q('#arStatus').textContent=label+'：1時間 '+yen(n)+' を保存しました。';q('#sfRefresh')?.click();
  }catch(e){if(identity()===mine&&q('#arStatus'))q('#arStatus').textContent='保存できませんでした：'+e.message;}
  finally{saving=false;button.disabled=false;}
 }
 function start(){mount();load();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,350),{once:true});else setTimeout(start,350);
 document.addEventListener('click',e=>{if(e.target.closest('nav [data-page]')){mount();load();}});
 // Auth restoration is asynchronous. Poll only for identity changes/missing initialization.
 setInterval(()=>{if(owner!==identity()||!loaded)start();},3000);
})();
