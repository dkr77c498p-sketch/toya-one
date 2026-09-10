/* TOYA One: other-machine transport and missing-price reminders.
 * Writes occur only after an administrator explicitly saves a tool rate or a transport total.
 * Daily-report updates use id/company/updated_at compare-and-swap and change one item price.
 */
(() => {
 'use strict';
 const q=(s,r=document)=>r.querySelector(s),arr=v=>Array.isArray(v)?v:[],esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const ident=()=>typeof cloudProfile!=='undefined'&&cloudProfile?.active===true&&cloudProfile.company_id&&typeof cloudClient!=='undefined'&&cloudClient?cloudProfile.id+':'+cloudProfile.company_id+':'+cloudProfile.role:'';
 const admin=()=>!!ident()&&cloudProfile.role==='admin';const yen=n=>Number(n).toLocaleString('ja-JP',{maximumFractionDigits:2})+'円';
 let owner='',busy=false,missing=[],toolRows=[],lastRead=0,editingAmount=false,writing=false;
 function customUI(){
  if(q('#ptOther')||!q('#etCard'))return;
  const box=document.createElement('details');box.id='ptOther';box.innerHTML='<summary>＋ 自社以外・単価未登録の重機を運搬</summary><p class="note">リース機械・他社機械など。金額は後で管理者が入力できます。単価表の自社機械と同じ型式でも、自動で同じ金額にはしません。</p><label>運搬会社<input id="ptCarrier" type="text" list="ptCarriers" placeholder="宝友・横手重機・その他"><datalist id="ptCarriers"><option>宝友</option><option>横手重機</option></datalist></label><label>運ぶ機械名・型式（自由入力）<input id="ptMachine" type="text" placeholder="例：リースの0.7重機"></label><label>運搬経路・区分のメモ<input id="ptRoute" type="text" placeholder="例：リース会社→現場／市外"></label><label>片道回数（この機械1台分）<input id="ptCount" type="number" inputmode="numeric" min="1" max="1000" step="1" value="1"></label><button id="ptAdd" type="button" class="btn dark">金額未入力で日報へ追加</button><p class="note" id="ptMessage"></p>';
  q('#etCard').appendChild(box);
  q('#ptAdd').onclick=()=>{
   const carrier=q('#ptCarrier').value.trim(),machine=q('#ptMachine').value.trim(),route=q('#ptRoute').value.trim(),count=Number(q('#ptCount').value);
   if(!ident())return alert('ログインを確認してください。');
   if(!carrier||!machine)return alert('運搬会社と機械名を入力してください。');
   if([carrier,machine,route].some(t=>/[｜|<>]/.test(t)||t.length>150))return alert('名称・メモは150文字以内で、区切り記号は使わず入力してください。');
   if(!Number.isInteger(count)||count<1||count>1000)return alert('片道回数は1以上の整数にしてください。');
   const name='重機回送：'+carrier+'｜'+machine+'｜単価未登録（'+(route||'経路未記入')+'）';
   if([...document.querySelectorAll('#items .i-name')].some(i=>i.value===name)&&!confirm('同じ回送が入力済みです。別の運搬として追加しますか？'))return;
   window.addItem({name,company:carrier,unit:'片道回',qty:count,price:'',isWaste:false});
   q('#ptMessage').textContent='金額未入力で追加しました。日報を保存すると、管理者ホームへ未入力のお知らせが出ます。';
  };
 }
 function toolNames(){let a=[];try{if(typeof get==='function'&&typeof LS!=='undefined')a=get(LS.attachments,[]);}catch{}
  const dom=[...document.querySelectorAll('#smallToolChoices input')].map(e=>e.value);
  return [...new Set([...dom,...a.filter(x=>/小型|工具|発電|エア|散水|洗浄/.test(x.category||'')).map(x=>x.name),...toolRows.map(x=>x.label)].filter(Boolean))];
 }
 function mountAdmin(){
  if(!admin()){q('#ptPending')?.remove();q('#ptRates')?.remove();return;}
  if(!q('#ptPending')&&q('#homePage')){const box=document.createElement('div');box.id='ptPending';box.className='card';box.innerHTML='<h2>金額未入力のお知らせ</h2><p class="note">全現場・全期間の重機回送を確認します。未入力を0円で確定しません。ここはアプリ内のお知らせです。</p><button id="ptRefresh" type="button" class="btn light">未入力を確認</button><p id="ptStatus" class="note" role="status"></p><div id="ptList"></div>';q('#homePage').prepend(box);q('#ptRefresh').onclick=()=>{if(editingAmount&&!confirm('未保存の金額入力を破棄して一覧を更新しますか？'))return;editingAmount=false;load(true);};}
  if(!q('#ptRates')&&q('#masterPage')){const box=document.createElement('div');box.id='ptRates';box.className='card';box.innerHTML='<h2>小型機械・工具の時間単価（管理者用）</h2><p class="note">1台・1本あたりの使用料です。燃料はこの単価に含めず、日報の燃料欄から別に1回加算します。未登録の単価を0円として確定しません。過去の未確定計算にも反映します。</p><label>小型機械・工具<input id="ptToolName" type="text" list="ptTools" placeholder="登録名を選択・入力"></label><datalist id="ptTools"></datalist><label>1時間単価（円・燃料別）<input id="ptToolRate" type="number" inputmode="decimal" min="0" step="0.01" placeholder="未登録"></label><button id="ptSaveTool" class="btn dark" type="button">この時間単価を保存</button><p id="ptToolStatus" class="note" role="status"></p>';q('#masterPage').prepend(box);q('#ptSaveTool').onclick=saveTool;q('#ptToolName').onchange=()=>{const r=toolRows.find(r=>r.label===q('#ptToolName').value.trim());q('#ptToolRate').value=r?.hourly_rate??'';};}
 }
 async function allReports(company){const out=[];for(let i=0;i<100000;i+=500){const r=await cloudClient.from('daily_reports').select('id,site_id,report_date,report_data,updated_at').eq('company_id',company).order('id').range(i,i+499);if(r.error)throw r.error;out.push(...arr(r.data));if(arr(r.data).length<500)return out;}throw new Error('件数が多いため、全件確認できませんでした。');}
 async function load(force=false){
  mountAdmin();if(!admin()||busy||writing||(!force&&editingAmount)||(!force&&Date.now()-lastRead<60000))return;busy=true;const mine=ident(),company=cloudProfile.company_id;owner=mine;q('#ptStatus').textContent='回送の未入力金額を確認中…';
  try{const [reports,rr,tr]=await Promise.all([allReports(company),cloudClient.from('equipment_transport_rate_master').select('carrier,machine_name,distance_label,unit_price,price_basis,active').eq('company_id',company),cloudClient.from('small_tool_rate_master').select('id,label,hourly_rate,fuel_included,active,updated_at').eq('company_id',company)]);
   if(ident()!==mine)return;if(rr.error)throw rr.error;if(tr.error)throw tr.error;toolRows=arr(tr.data);missing=[];
   const engine=window.ToyaTransportEngine;if(!engine)throw new Error('回送の計算を読み込めませんでした。');
   for(const r of reports)arr(r.report_data?.items).forEach((item,index)=>{if(!engine.parse(item))return;const c=engine.calculate(item,rr.data);if(c.value===null)missing.push({r,item,index,issue:c.issue});});
   missing.sort((a,b)=>a.r.report_date.localeCompare(b.r.report_date));
   q('#ptStatus').textContent=missing.length?'回送費の金額未入力・要確認：'+missing.length+'件':'重機回送の金額未入力はありません。';
   q('#ptList').innerHTML=missing.map((x,i)=>'<div class="pt-entry"><b>'+esc(x.r.report_date)+' ／ '+esc(x.r.report_data?.site)+'</b><p>'+esc(x.item.name)+'</p><p class="note">'+esc(x.item.qty)+'片道回 ／ '+esc(x.issue)+'</p><label>後から確定した合計金額（円）<input type="number" data-pt-amount="'+i+'" min="0" step="0.01" placeholder="未入力（0円と区別）"></label><button type="button" class="btn dark" data-pt-save="'+i+'">この回送の金額を保存</button><p class="note" data-pt-result="'+i+'"></p></div>').join('');
   q('#ptList').oninput=()=>{editingAmount=true;};
   q('#ptList').onclick=e=>{const b=e.target.closest('[data-pt-save]');if(b)saveAmount(Number(b.dataset.ptSave),b);};
   q('#ptTools').innerHTML=toolNames().map(n=>'<option value="'+esc(n)+'">').join('');lastRead=Date.now();
  }catch(e){if(ident()===mine&&q('#ptStatus'))q('#ptStatus').textContent='確認できませんでした：'+e.message+'。未入力なしとは判断していません。';}finally{busy=false;}
 }
 async function saveAmount(i,button){
  if(!admin()||writing)return;const x=missing[i],input=q('[data-pt-amount="'+i+'"]'),status=q('[data-pt-result="'+i+'"]');if(!x)return;
  const amount=input.value.trim()===''?null:Number(input.value);if(amount===null||!Number.isFinite(amount)||amount<0||amount>1e9){status.textContent='合計金額を入力してください。0円は指定できます。';return;}
  if(!confirm(x.r.report_date+' '+x.r.report_data.site+'\n'+x.item.name+'\n合計 '+yen(amount)+' を保存しますか？'))return;
  const mine=ident(),company=cloudProfile.company_id;button.disabled=true;writing=true;
  try{const fresh=await cloudClient.from('daily_reports').select('id,report_data,updated_at').eq('company_id',company).eq('id',x.r.id).single();if(fresh.error)throw fresh.error;
   if(ident()!==mine)throw new Error('アカウントが変わりました。');
   if(fresh.data.updated_at!==x.r.updated_at||JSON.stringify(fresh.data.report_data.items?.[x.index])!==JSON.stringify(x.item))throw new Error('日報が更新されています。未入力一覧を読み直してください。');
   const d=structuredClone(fresh.data.report_data);d.items[x.index].price=String(Math.round(amount*100)/100);
   const result=await cloudClient.from('daily_reports').update({report_data:d,updated_at:new Date().toISOString()}).eq('company_id',company).eq('id',x.r.id).eq('updated_at',fresh.data.updated_at).select('id,report_data,updated_at');if(result.error)throw result.error;if(result.data?.length!==1)throw new Error('同時に日報が変更されたため保存していません。');
   if(ident()!==mine)return;
   const check=await cloudClient.from('daily_reports').select('report_data').eq('company_id',company).eq('id',x.r.id).single();if(check.error||Number(check.data?.report_data?.items?.[x.index]?.price)!==Math.round(amount*100)/100)throw new Error('保存後の確認が必要です。押し直す前に一覧を更新してください。');
   status.textContent='この回送費だけを保存しました。';q('#sfRefresh')?.click();lastRead=0;editingAmount=false;writing=false;await load(true);
  }catch(e){status.textContent=e.message;}finally{writing=false;button.disabled=false;}
 }
 async function saveTool(){
  if(!admin())return;const label=q('#ptToolName').value.trim(),raw=q('#ptToolRate').value,n=raw===''?null:Number(raw);if(!label||label.length>160||n===null||!Number.isFinite(n)||n<0||n>1e9){q('#ptToolStatus').textContent='機械名と時間単価を入力してください。';return;}
  if(!confirm(label+'\n1時間 '+yen(n)+'（燃料別）で登録しますか？'))return;
  const mine=ident(),company=cloudProfile.company_id,b=q('#ptSaveTool');b.disabled=true;
  try{const old=toolRows.find(r=>r.label===label);let req=old?cloudClient.from('small_tool_rate_master').update({hourly_rate:n,fuel_included:false,active:true,updated_at:new Date().toISOString()}).eq('company_id',company).eq('id',old.id).eq('updated_at',old.updated_at):cloudClient.from('small_tool_rate_master').insert({company_id:company,label,hourly_rate:n,fuel_included:false,active:true});const r=await req.select('id,label,hourly_rate,fuel_included');if(r.error)throw r.error;if(r.data?.length!==1||r.data[0].fuel_included!==false)throw new Error('単価が同時に変更されました。画面を開き直してください。');if(ident()!==mine)return;q('#ptToolStatus').textContent=label+'：1時間 '+yen(n)+'（燃料別）を保存しました。';lastRead=0;editingAmount=false;writing=false;await load(true);q('#sfRefresh')?.click();}
  catch(e){q('#ptToolStatus').textContent='保存できませんでした：'+e.message;}finally{b.disabled=false;}
 }
 function start(){if(!q('#ptStyle')){const s=document.createElement('style');s.id='ptStyle';s.textContent='#ptOther summary{font-weight:900;padding:14px 0}#ptOther input,#ptPending input,#ptRates input,#ptRates select{width:100%;box-sizing:border-box;font-size:16px;min-height:44px}#ptOther .btn,#ptPending .btn,#ptRates .btn{width:100%;margin-top:10px}.pt-entry{padding:12px;border:1px solid #dcaa4a;border-radius:12px;margin:10px 0;overflow-wrap:anywhere}';document.head.appendChild(s);}customUI();mountAdmin();load();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,250),{once:true});else setTimeout(start,250);
 document.addEventListener('click',e=>{if(e.target.closest?.('nav [data-page]')){customUI();mountAdmin();if(e.target.closest('[data-page="homePage"]')&&!editingAmount)load(true);}});
 setInterval(()=>{customUI();if(owner&&owner!==ident()){q('#ptPending')?.remove();q('#ptRates')?.remove();owner='';lastRead=0;missing=[];toolRows=[];editingAmount=false;}if(!document.hidden&&q('#homePage')?.classList.contains('active'))load();},3000);
})();
