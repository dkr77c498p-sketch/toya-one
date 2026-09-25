/* Optional administrator UI. No background saves; existing version-checked RPC only
 * after a visible confirmation. No daily-report, auth, invoice or PDF writes. */
(function(){
 'use strict';
 const E=window.ToyaSitePeriodLedger;if(!E||window.ToyaSitePeriodUI)return;
 const q=(s,r=document)=>r.querySelector(s),arr=x=>Array.isArray(x)?x:[],clone=x=>JSON.parse(JSON.stringify(x));
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const yen=x=>x==null?'未入力あり':Number(x).toLocaleString('ja-JP',{maximumFractionDigits:2})+'円';
 const monthNow=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,7);
 const identity=()=>typeof cloudProfile!=='undefined'&&cloudProfile?.active===true&&cloudProfile.role==='admin'&&cloudProfile.company_id&&typeof cloudClient!=='undefined'&&cloudClient?cloudProfile.id+':'+cloudProfile.company_id:'';
 const kinds={base:'本工事',addition:'追加工事',unclassified:'区分未設定'};
 let owner='',card=null,data=null,result=null,siteId='',generation=0,loading=false,saving=false,view='months',edit=null,dirty=false,closeDialog=null,requestMonth='',requestedEdit=false;
 const status=(s,error=false)=>{const el=q('#slStatus');if(el){el.textContent=s;el.classList.toggle('sl-error',error);}};
 const editorStatus=(s,error=false)=>{const el=q('#slEditStatus');if(el){el.textContent=s;el.classList.toggle('sl-error',error);}};
 function clear(){generation++;owner='';data=null;result=null;siteId='';loading=false;saving=false;edit=null;dirty=false;closeDialog?.(false);card?.remove();card=null;}
 function ensureStyle(){if(q('#slStyle'))return;const s=document.createElement('style');s.id='slStyle';s.textContent=`
 #sitePeriodLedger{scroll-margin-top:180px}#sitePeriodLedger *{box-sizing:border-box}#sitePeriodLedger .sl-body{min-width:0}#sitePeriodLedger summary{font-weight:900;padding:10px 0;cursor:pointer}#sitePeriodLedger input,#sitePeriodLedger select{max-width:100%;min-width:0;font-size:16px;min-height:44px}#sitePeriodLedger label{display:block;font-weight:800;margin:8px 0}#sitePeriodLedger .btn{min-height:44px;white-space:normal}#sitePeriodLedger .sl-buttons{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}#sitePeriodLedger .sl-buttons>*{flex:1;min-width:100px}#sitePeriodLedger .sl-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}#sitePeriodLedger .sl-metric{background:#111;color:#fff;border-radius:14px;padding:14px;min-width:0}#sitePeriodLedger .sl-metric small{display:block;font-size:13px;line-height:1.45}#sitePeriodLedger .sl-metric strong{display:block;color:var(--lime,#b8ff00);font-size:22px;overflow-wrap:anywhere;margin-top:7px}#sitePeriodLedger .sl-note{color:#636c61;font-size:14px;line-height:1.6;margin:10px 0}#sitePeriodLedger .sl-error{color:#a02b20;font-weight:700}#sitePeriodLedger .sl-month,#sitePeriodLedger .sl-phase{border:1px solid #d5dccf;border-radius:12px;padding:12px;margin:12px 0;background:#fff}#sitePeriodLedger h3,#sitePeriodLedger h4{margin:6px 0 12px}#sitePeriodLedger .sl-lines{margin:0}#sitePeriodLedger .sl-lines>div{display:flex;align-items:start;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #e0e4dc}#sitePeriodLedger dt{color:#606b5a}#sitePeriodLedger dd{margin:0;text-align:right;font-weight:750;overflow-wrap:anywhere}#sitePeriodLedger .sl-negative{color:#bc2c24}#sitePeriodLedger .sl-subtotal{background:#f1fbcf;padding:10px;border-radius:10px;font-weight:800}#sitePeriodLedger .sl-hidden,#sitePeriodLedger [hidden]{display:none!important}.sl-confirm{max-width:94vw;width:430px;max-height:85vh;border:0;border-radius:16px;padding:20px;overflow:auto}.sl-confirm::backdrop{background:#0008}.sl-confirm .btn{width:100%;min-height:48px;margin-top:10px}.sl-confirm p{white-space:pre-line}.sl-confirm h3{margin-top:0}@media(max-width:360px){#sitePeriodLedger .sl-grid{grid-template-columns:1fr}#sitePeriodLedger .sl-metric strong{font-size:22px}}
 `;document.head.append(s);}
 function mount(){
  const id=identity();if(owner&&id!==owner)clear();if(!id)return false;if(card?.isConnected)return true;
  ensureStyle();owner=id;card=document.createElement('section');card.id='sitePeriodLedger';card.className='card admin-home-only';
  card.innerHTML='<details id="slOpen"><summary>現場別の月別・工事全体の売上と利益</summary><div class="sl-body"><p class="sl-note">同じ現場の月別収支と、年をまたぐ工事の累計をまとめて確認します。金額は税別です。</p><label for="slSite">現場を選ぶ</label><select id="slSite"><option value="">現場を選んでください</option></select><div class="sl-buttons"><button type="button" id="slMonths" class="btn lime">月別</button><button type="button" id="slAll" class="btn light">工事全体</button><button type="button" id="slRefresh" class="btn light">更新</button></div><p id="slStatus" class="sl-note" role="status" aria-live="polite"></p><div id="slResult"></div><div id="slEditor"></div></div></details>';
  const monthly=q('#companyMonthlySummary');if(monthly)monthly.after(card);else q('#homePage')?.prepend(card);
  q('#slOpen').addEventListener('toggle',()=>{if(q('#slOpen')?.open&&!data&&!loading)load();});
  q('#slSite').onchange=async e=>{const next=e.target.value;if(!await discard()){e.target.value=siteId;return;}siteId=next;edit=null;dirty=false;render();if(requestedEdit&&result)openEditor();};
  q('#slMonths').onclick=()=>{view='months';render();};q('#slAll').onclick=()=>{view='all';render();};
  q('#slRefresh').onclick=async()=>{if(await discard()){edit=null;dirty=false;await load();}};return true;
 }
 function confirmAction(title,message,approve){
  closeDialog?.(false);const mine=identity();return new Promise(resolve=>{
   const dialog=document.createElement('dialog');dialog.className='sl-confirm';dialog.innerHTML='<h3>'+esc(title)+'</h3><p>'+esc(message)+'</p><button type="button" class="btn dark" data-sl-approve>'+esc(approve)+'</button><button type="button" class="btn light" data-sl-cancel autofocus>戻る</button>';
   let ended=false;const finish=ok=>{if(ended)return;ended=true;closeDialog=null;if(dialog.open)dialog.close();dialog.remove();resolve(ok&&mine===identity());};closeDialog=finish;
   q('[data-sl-approve]',dialog).onclick=()=>finish(true);q('[data-sl-cancel]',dialog).onclick=()=>finish(false);dialog.addEventListener('cancel',e=>{e.preventDefault();finish(false);});dialog.addEventListener('close',()=>finish(false));document.body.append(dialog);
   try{dialog.showModal();}catch(e){finish(false);status('確認画面を開けませんでした。保存はしていません。',true);}
  });
 }
 async function discard(){if(saving)return false;if(!dirty)return true;return confirmAction('入力途中の内容があります','まだ保存していない月別売上の入力を閉じますか？\n保存済みの金額・日報は変更しません。','未保存の入力を閉じる');}
 async function read(def,company,t,mine){
  const [key,table,fields,,id]=def,rows=[];
  for(let offset=0;offset<100000;offset+=500){
   if(t!==generation||identity()!==mine)throw Error('ログイン状態が変わりました。');
   const query=cloudClient.from(table).select(fields==='*'?'*':'company_id,'+fields).eq('company_id',company).order(id).range(offset,offset+499);
   let timer;const r=await Promise.race([query,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('読み込みが時間切れになりました。')),30000);})]).finally(()=>clearTimeout(timer));
   if(r.error)throw Error(table+'：'+r.error.message);if(!Array.isArray(r.data)||r.data.some(x=>x.company_id!==company))throw Error('会社の記録を確認できません。');
   rows.push(...r.data);if(r.data.length<500)return [key,rows];
  }throw Error('全件を取得できませんでした。途中の合計は表示しません。');
 }
 async function load(){
  if(!mount()||saving)return;if(dirty)return status('入力途中の内容を保存するか閉じてから更新してください。',true);edit=null;const mine=owner,t=++generation,company=cloudProfile.company_id;loading=true;data=null;result=null;
  q('#slResult').replaceChildren();q('#slEditor').replaceChildren();status('全期間の日報と月別売上を読み込んでいます…');q('#slRefresh').disabled=true;
  try{
   const entries=await Promise.all(E.sources().map(d=>read(d,company,t,mine)));if(t!==generation||identity()!==mine)return;
   data=E.prepare(Object.fromEntries(entries),company,true);
   const sites=[...data.sites].sort((a,b)=>(a.status==='active'?0:1)-(b.status==='active'?0:1)||a.name.localeCompare(b.name,'ja'));
   q('#slSite').innerHTML='<option value="">現場を選んでください</option>'+sites.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+(s.completed_on?'（完工）':'')+'</option>').join('');
   if(!sites.some(s=>s.id===siteId))siteId='';q('#slSite').value=siteId;render();status('読み込み済み。保存済みの原価調整を優先し、未入力を勝手に0円にしません。');
  }catch(e){if(t===generation&&identity()===mine){data=null;result=null;q('#slResult').replaceChildren();status('集計できませんでした：'+e.message,true);}}
  finally{if(t===generation&&identity()===mine){loading=false;q('#slRefresh').disabled=false;}}
 }
 const metric=(label,n)=>'<div class="sl-metric"><small>'+esc(label)+'</small><strong>'+yen(n)+'</strong></div>';
 const line=(label,n,negative=false)=>'<div><dt>'+esc(label)+'</dt><dd'+(negative&&n<0?' class="sl-negative"':'')+'>'+yen(n)+'</dd></div>';
 function entryHTML(rows){return rows.map(r=>'<div class="sl-note"><b>'+esc(kinds[r.work_kind])+'／'+esc(r.label)+'</b><br>'+esc(r.target_month)+'　'+yen(r.amount)+'　'+(r.status==='complete'?'月末確定':'途中出来高')+'</div>').join('');}
 function render(){
  if(!data||!q('#slResult'))return;q('#slMonths').className='btn '+(view==='months'?'lime':'light');q('#slAll').className='btn '+(view==='all'?'lime':'light');
  if(!siteId){q('#slResult').innerHTML='<p class="sl-note">上で現場を選んでください。完工済みの現場も選べます。</p>';q('#slEditor').replaceChildren();result=null;return;}
  try{result=E.analyze(data,siteId,{companyId:cloudProfile.company_id,complete:true,asOfMonth:monthNow()});}catch(e){result=null;q('#slResult').replaceChildren();status(e.message,true);return;}
  const r=result,t=r.totals;
  const warning=[t.missingRevenue?'売上未入力の月 '+t.missingRevenue+'件':'',t.missingCost?'原価記録のない月 '+t.missingCost+'件':'',t.warnings.length?'原価の確認事項 '+t.warnings.length+'件':'',r.overContract?'出来高の合計が請負総額を超えています':''].filter(Boolean);
  let html='<h3>'+esc(r.site.name)+'</h3><p class="sl-note">'+(r.periodStart?esc(r.periodStart)+' 〜 '+esc(r.periodEnd):'期間の記録なし')+' ／ '+(r.completed?'完工済み '+esc(r.site.completed_on):'工事中')+'</p>';
  if(view==='all'){
   html+='<div class="sl-grid">'+metric('工事全体の売上累計（出来高）',t.revenue)+metric('工事全体の原価（入力済み）',t.cost)+metric('工事全体の暫定利益',r.overContract?null:t.profit)+metric('登録された請負総額（参考）',r.contractAmount)+'</div>';
   html+='<p class="sl-note">'+(t.missingRevenue?'売上が未入力の月があるため、累計売上・利益は未確定です。登録済み売上だけの小計：'+yen(t.knownRevenue)+'。':'')+(t.provisional?'途中出来高を含むため暫定です。':'')+'完工だけでは月別売上を推定しません。</p>';
   html+='<details><summary>本工事・追加工事の売上内訳</summary><dl class="sl-lines">'+line('本工事の登録済み出来高',t.base)+line('追加工事の登録済み出来高',t.additions)+line('区分未設定の出来高',t.unclassified)+'</dl>'+entryHTML(r.entries.filter(e=>e.target_month<=r.asOfMonth))+'<p class="sl-note">上記は登録済み売上の内訳です。原価は現場単位の合計で、本工事・追加工事へ自動配分しません。</p></details>';
  }else{
   html+='<p class="sl-note">各月の売上と、その月の原価を比較します。途中出来高を含む利益は暫定です。</p>';
   for(const row of r.rows){html+='<section class="sl-month"><h4>'+esc(row.month)+(row.future?'（今後の予定・累計対象外）':row.provisional?'（途中出来高）':'')+'</h4><dl class="sl-lines">'+line('売上（出来高）',row.revenue)+line('原価（入力済み）',row.cost)+line('暫定利益',row.profit,true)+'</dl>'+(row.activity&&!row.future?'<p class="sl-subtotal">ここまでの売上累計：'+yen(row.cumulativeRevenue)+'</p>':'')+(row.entries.length?'<details><summary>本工事・追加工事の内訳</summary>'+entryHTML(row.entries)+'</details>':'<p class="sl-note">月別売上は未入力です。</p>')+'</section>';}
   if(!r.rows.length)html+='<p class="sl-note">まだ月別の記録はありません。</p>';
   html+='<div class="sl-grid">'+metric('現在までの売上累計',t.revenue)+metric('現在までの暫定利益',r.overContract?null:t.profit)+'</div>';
  }
  if(warning.length)html+='<details><summary>未入力・確認の内容</summary><p class="sl-note">'+esc(warning.join('／'))+'</p><p class="sl-note">確認件数のすべてが未計上という意味ではありません。保存済み調整額を計上したままの確認も含みます。</p>'+t.warnings.map(s=>'<p class="sl-note">'+esc(s)+'</p>').join('')+'</details>';
  html+='<details><summary>請求済み・集計の考え方</summary><dl class="sl-lines">'+line('請求済み累計（参考・加算しません）',t.invoice)+line('今後の月に登録された売上',t.futureRevenue)+line('常用応援売上（別枠・上記売上には未加算）',t.outgoing)+'</dl><p class="sl-note">売上は月別出来高の合計です。請負総額・請求書をさらに足すと二重計上になるため足しません。原価は既存の日報集計と同じルールです。会社共通経費や未記録の費用を含む会計上の確定利益ではありません。</p></details><button type="button" class="btn lime" id="slEditOpen" style="width:100%;margin-top:14px">月別売上・追加工事を入力</button>';
  q('#slResult').innerHTML=html;q('#slEditOpen').onclick=()=>openEditor();
  if(!edit)q('#slEditor').replaceChildren();
 }
 function capture(){
  if(!edit)return;edit.contract=q('#slContract').value;
  q('#slPhases').querySelectorAll('[data-sl-row]').forEach(node=>{const i=Number(node.dataset.slRow);for(const key of ['work_kind','label','target_month','amount','status','notes']){const el=q('[data-sl-key="'+key+'"]',node);if(el)edit.rows[i][key]=el.value;}});
 }
 function rowHTML(r,i){return '<div class="sl-phase" data-sl-row="'+i+'"><label>区分<select data-sl-key="work_kind">'+Object.entries(kinds).map(([key,label])=>'<option value="'+key+'"'+(r.work_kind===key?' selected':'')+'>'+label+'</option>').join('')+'</select></label><label>工事内容<input data-sl-key="label" maxlength="160" value="'+esc(r.label)+'"></label><div class="sl-grid"><label>売上の対象月<input type="month" data-sl-key="target_month" min="2000-01" value="'+esc(r.target_month)+'"></label><label>売上（円・税別）<input type="number" inputmode="numeric" min="0" step="1" data-sl-key="amount" value="'+esc(r.amount)+'"></label></div><label>状態<select data-sl-key="status"><option value="planned"'+(r.status==='planned'?' selected':'')+'>途中出来高</option><option value="complete"'+(r.status==='complete'?' selected':'')+'>月末確定</option></select></label><details><summary>備考</summary><input data-sl-key="notes" maxlength="1000" value="'+esc(r.notes||'')+'"></details><button type="button" class="btn light" data-sl-remove="'+i+'">この売上行を外す</button></div>';}
 function openEditor(){if(!result||loading||saving)return;if(edit){q('#slEditor').scrollIntoView({block:'center'});return;}
  edit={siteId,owner:identity(),profile:result.profile?clone(result.profile):null,contractSource:result.contract?clone(result.contract):null,contract:String(result.contractAmount??''),rows:clone(result.entries)};dirty=false;renderEditor();q('#slEditor').scrollIntoView({block:'start'});
 }
 function renderEditor(){
  if(!edit)return;const host=q('#slEditor');
  host.innerHTML='<div class="sl-phase"><h3>月別売上の入力</h3><p class="sl-note">その月に計上する金額を入力します。累計額を毎月入れないでください。本工事と追加工事を、同じ月でも別行で残せます。</p><label>請負総額（本工事＋追加工事・税別）<input type="number" inputmode="numeric" min="0" step="1" id="slContract" value="'+esc(edit.contract)+'"></label><p class="sl-note">追加分だけで本工事の金額を置き換えないでください。元の金額が不明な場合は確認してから保存します。</p><div id="slPhases">'+edit.rows.map(rowHTML).join('')+'</div><div class="sl-buttons"><button type="button" class="btn light" id="slAddBase">＋ 本工事の売上</button><button type="button" class="btn light" id="slAddExtra">＋ 追加工事の売上</button></div><p id="slEditTotal" class="sl-subtotal"></p><button type="button" class="btn dark" id="slSave" style="width:100%">保存内容を確認</button><button type="button" class="btn light" id="slEditClose" style="width:100%;margin-top:10px">閉じる</button><p id="slEditStatus" role="status" class="sl-note"></p></div>';
  host.oninput=()=>{capture();dirty=true;updateEditTotal();};host.onchange=()=>{capture();dirty=true;updateEditTotal();};
  const add=kind=>{capture();if(edit.rows.length>=48)return editorStatus('売上内訳は48行までです。',true);edit.rows.push({work_kind:kind,label:kind==='addition'?'追加工事':'本工事',target_month:requestMonth||monthNow(),amount:'',status:'planned',notes:''});dirty=true;renderEditor();q('#slPhases [data-sl-row]:last-child input').focus();};
  q('#slAddBase').onclick=()=>add('base');q('#slAddExtra').onclick=()=>add('addition');
  host.querySelectorAll('[data-sl-remove]').forEach(b=>b.onclick=()=>{capture();edit.rows.splice(Number(b.dataset.slRemove),1);dirty=true;renderEditor();});
  q('#slEditClose').onclick=async()=>{if(await discard()){edit=null;dirty=false;host.replaceChildren();}};q('#slSave').onclick=save;updateEditTotal();
 }
 function editRows(){return edit.rows.map(r=>({...r,amount:textAmount(r.amount),label:String(r.label||'').trim(),notes:String(r.notes||'')}));}
 function textAmount(x){if(String(x??'').trim()==='')return null;const n=Number(x);return Number.isSafeInteger(n)&&n>=0?n:null;}
 function updateEditTotal(){if(!edit)return;const rows=editRows(),known=rows.filter(r=>r.amount!==null).reduce((a,r)=>E.add(a,r.amount),0);q('#slEditTotal').textContent='登録する月別売上の合計：'+yen(known)+(rows.some(r=>r.amount===null)?'（金額未入力あり）':'');}
 async function save(){
  if(saving||!edit||edit.owner!==identity()||edit.siteId!==siteId)return;capture();let payload;
  try{payload=E.draftProfile(edit.profile,edit.contractSource,editRows(),edit.contract);}catch(e){return editorStatus(e.message,true);}
  const mine=identity(),sid=siteId,snapshot=E.stable(edit),oldAmount=edit.contractSource?.amount;
  const approved=await confirmAction('保存内容の確認',result.site.name+'\n請負総額：'+(oldAmount==null?'未登録':yen(oldAmount))+' → '+yen(payload.p_contract_amount)+'\n月別売上：'+payload.p_profile.contract_breakdown.length+'行／合計 '+yen(payload.p_profile.contract_breakdown.reduce((a,r)=>E.add(a,r.amount),0))+'\n\n本工事・追加工事の金額を確認してください。保存済みの日報・原価・請求書は変更しません。','この内容で保存');
  if(!approved||!edit||identity()!==mine||siteId!==sid||snapshot!==E.stable(edit))return;
  saving=true;editorStatus('保存しています…');q('#slEditor').querySelectorAll('button,input,select').forEach(e=>e.disabled=true);q('#slSite').disabled=true;
  try{
   const r=await cloudClient.rpc('toya_save_site_project_profile',{p_site_id:sid,...payload});if(r.error)throw r.error;
   if(identity()!==mine||siteId!==sid)return;const saved=r.data;
   if(!saved?.profile||saved.profile.company_id!==cloudProfile.company_id||saved.profile.site_id!==sid||!saved?.contract||saved.contract.site_id!==sid||saved.contract.company_id!==cloudProfile.company_id)throw Error('保存結果を確認できません。一覧を更新し、二重に入力しないでください。');
   edit=null;dirty=false;saving=false;
   document.dispatchEvent(new CustomEvent('toya-site-project-profile-saved',{detail:{siteId:sid,origin:'site-period-ledger'}}));
   await load();if(identity()===mine)status('保存しました。月別と工事全体を同じ売上記録から表示しています。');
  }catch(e){if(identity()===mine)editorStatus('保存を確認できません：'+String(e.message||e)+' 入力は残しています。通信切れの場合は更新して保存済み内容を確認してください。',true);}
  finally{if(identity()===mine){saving=false;q('#slEditor')?.querySelectorAll('button,input,select').forEach(e=>e.disabled=false);if(q('#slSite'))q('#slSite').disabled=false;}}
 }
 async function open(options={}){
  if(!mount())return;requestMonth=E.monthOK(options.month)?options.month:'';requestedEdit=options.edit===true;
  if(options.siteId&&options.siteId!==siteId){if(!await discard())return;siteId=options.siteId;edit=null;dirty=false;}
  q('nav [data-page="homePage"]')?.click();q('#slOpen').open=true;
  if(!data)await load();if(!identity()||!card)return;
  if(!siteId&&data?.sites.length===1){siteId=data.sites[0].id;q('#slSite').value=siteId;}
  render();card.scrollIntoView({block:'start'});if(options.edit&&result)openEditor();
 }
 window.ToyaSitePeriodUI=Object.freeze({open,isBusy:()=>saving||dirty});
 function start(){mount();setInterval(()=>{if(identity()!==owner)mount();},1000);
  document.addEventListener('click',e=>{if(e.target.closest?.('nav [data-page="homePage"]'))mount();});
  for(const name of ['toya-site-project-profile-saved','toya-project-document-changed','toya-site-lifecycle-changed','toya-site-renamed'])document.addEventListener(name,e=>{if(e.detail?.origin==='site-period-ledger')return;if(!data)return;if(dirty||saving){status('別の画面で情報が変わりました。入力は保持しています。保存前に最新の内容を確認してください。',true);return;}if(q('#slOpen')?.open)load();else data=null;});
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,1500),{once:true});else setTimeout(start,1500);
})();
