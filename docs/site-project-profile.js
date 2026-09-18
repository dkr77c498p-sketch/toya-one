/* Administrator-only site facts and contract breakdown. */
(() => {
 'use strict';
 const P=window.ToyaSiteProjectProfileEngine;if(!P||window.__toyaSiteProjectProfile)return;window.__toyaSiteProjectProfile=true;
 const q=(s,r=document)=>r.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const yen=v=>'¥'+Math.round(Number(v)||0).toLocaleString('ja-JP');
 const identity=()=>typeof cloudProfile!=='undefined'&&cloudProfile?.active===true&&cloudProfile.role==='admin'&&cloudProfile.company_id&&typeof cloudClient!=='undefined'&&cloudClient?cloudProfile.id+':'+cloudProfile.company_id:'';
 const blank=()=>({project_category:'',structure_type:'',floors_above:null,floors_below:null,floor_area_sqm:null,site_area_sqm:null,foundation_volume_m3:null,work_start:null,work_end:null,scope_notes:'',exclusion_notes:'',contract_breakdown:[],updated_at:null});
 const categoryOptions=[['','選択してください'],['full_demolition','建物全解体'],['interior_demolition','内部解体'],['skeleton','スケルトン解体'],['renovation','内部改修'],['exterior','外構撤去'],['pavement','舗装撤去'],['clearing','伐採・造成'],['other','その他工事']];
 const structureOptions=[['','未入力'],['wood','木造'],['steel','鉄骨造'],['rc','RC造'],['src','SRC造'],['mixed','混構造・複数棟'],['none','建物なし'],['other','その他']];
 let owner='',siteId='',profile=blank(),contract=null,loading=false,saving=false,token=0,mountedFor=null;
 const optionHTML=(rows,current)=>rows.map(([v,l])=>'<option value="'+v+'"'+(v===current?' selected':'')+'>'+l+'</option>').join('');
 const num=v=>v===null||v===undefined?'':String(v);
 const phaseRow=(row={},i=0)=>'<div class="sp-phase" data-sp-phase="'+i+'"><div class="sp-phase-head"><b>契約内訳 '+(i+1)+'</b><button class="btn danger" type="button" data-sp-remove="'+i+'">削除</button></div><label>工事内容</label><input data-sp-key="label" maxlength="160" value="'+esc(row.label||'')+'" placeholder="例：内部解体工事"><div class="sp-grid"><div><label>対象月</label><input data-sp-key="target_month" type="month" value="'+esc(row.target_month||'')+'"></div><div><label>金額（円・税別）</label><input data-sp-key="amount" type="number" inputmode="numeric" min="0" step="1" value="'+esc(row.amount??'')+'"></div></div><label>状態</label><select data-sp-key="status"><option value="planned"'+(row.status!=='complete'?' selected':'')+'>予定</option><option value="complete"'+(row.status==='complete'?' selected':'')+'>出来高済み</option></select><label>内容・範囲（任意）</label><input data-sp-key="notes" maxlength="1000" value="'+esc(row.notes||'')+'" placeholder="工事範囲や補足"></div>';
 function selectedSite(){const s=q('#pbSite');return s?.value?{id:s.value,name:s.selectedOptions[0]?.textContent?.replace(/（(?:完工|過去・未整理)）$/,'')||''}:null;}
 function mount(){
  if(!identity())return false;const overview=q('#pbOverview'),card=q('#projectBusinessCard');if(!overview||!card)return false;
  if(q('#spProjectDetails'))return true;
  const box=document.createElement('details');box.id='spProjectDetails';box.open=true;box.innerHTML='<summary>現場内容・契約内訳</summary><div id="spBody"><p class="note">現場を選んでください。</p></div>';
  overview.after(box);mountedFor=card;
  if(!q('#spProjectStyle')){const style=document.createElement('style');style.id='spProjectStyle';style.textContent='#spProjectDetails{margin:14px 0;border:2px solid #d8dfcf;border-radius:14px;padding:12px}#spProjectDetails>summary{font-size:18px;font-weight:900;cursor:pointer}.sp-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.sp-phase{border:1px solid #d7d7d7;border-radius:12px;padding:12px;margin:10px 0;background:#fafafa}.sp-phase-head{display:flex;justify-content:space-between;align-items:center;gap:10px}.sp-total{background:#111;color:#fff;border-radius:12px;padding:14px;margin:12px 0}.sp-total b{color:#b8ff00;font-size:20px}.sp-warning{color:#a32d20;font-weight:800}.sp-ok{color:#557700;font-weight:800}@media(max-width:520px){.sp-grid{grid-template-columns:1fr}}';document.head.appendChild(style);}
  card.addEventListener('change',e=>{if(e.target?.id==='pbSite')load(true);});
  q('#pbReload')?.addEventListener('click',()=>setTimeout(()=>load(true),100));
  load(true);return true;
 }
 function setStatus(text,error=false){const el=q('#spStatus');if(el){el.textContent=text;el.classList.toggle('pb-error',error);}}
 async function readRows(table,fields,company,sid){
  const r=await cloudClient.from(table).select(fields).eq('company_id',company).eq('site_id',sid).order(table==='site_project_profiles'?'site_id':'id').range(0,99);
  if(r.error)throw r.error;return r.data||[];
 }
 async function load(force=false){
  if(!mount()||loading||saving)return;const id=identity(),site=selectedSite();
  if(!site){siteId='';profile=blank();contract=null;render();return;}
  if(!force&&owner===id&&siteId===site.id)return;owner=id;siteId=site.id;const mine=++token;loading=true;render('現場内容を読み込み中…');
  try{
   const [profiles,revenues]=await Promise.all([readRows('site_project_profiles','*',cloudProfile.company_id,site.id),readRows('revenues','id,site_id,revenue_type,amount,updated_at',cloudProfile.company_id,site.id)]);
   if(mine!==token||identity()!==id||selectedSite()?.id!==site.id)return;
   if(profiles.length>1)throw new Error('現場内容が重複しています。');
   const contracts=revenues.filter(r=>r.revenue_type==='contract');if(contracts.length>1)throw new Error('請負金額が重複しています。');
   profile={...blank(),...(profiles[0]||{}),contract_breakdown:P.breakdown(profiles[0]?.contract_breakdown)};contract=contracts[0]||null;render();
  }catch(e){if(mine===token&&identity()===id)render('読み込みできませんでした：'+String(e.message||e),true);}
  finally{if(mine===token)loading=false;}
 }
 function render(message='',error=false){
  const body=q('#spBody');if(!body)return;const site=selectedSite();if(!site){body.innerHTML='<p class="note">上で現場を選ぶと、積算に必要な情報を登録できます。</p>';return;}
  const rows=P.breakdown(profile.contract_breakdown),amount=contract?.amount??'';
  body.innerHTML='<p class="note">過去の現場を積算の参考にできるよう、建物条件と契約内訳を残します。</p><label>工事種類</label><select id="spCategory">'+optionHTML(categoryOptions,profile.project_category)+'</select><label>建物構造</label><select id="spStructure">'+optionHTML(structureOptions,profile.structure_type)+'</select><div class="sp-grid"><div><label>地上階数</label><input id="spFloorsAbove" type="number" inputmode="numeric" min="0" max="100" step="1" value="'+num(profile.floors_above)+'"></div><div><label>地下階数</label><input id="spFloorsBelow" type="number" inputmode="numeric" min="0" max="20" step="1" value="'+num(profile.floors_below)+'"></div></div><div class="sp-grid"><div><label>延べ床面積（㎡）</label><input id="spFloorSqm" type="number" inputmode="decimal" min="0" step="0.001" value="'+num(profile.floor_area_sqm)+'"></div><div><label>延べ床面積（坪）</label><input id="spFloorTsubo" type="number" inputmode="decimal" min="0" step="0.001" value="'+P.sqmToTsubo(profile.floor_area_sqm)+'"></div></div><div class="sp-grid"><div><label>敷地・整地面積（㎡）</label><input id="spSiteSqm" type="number" inputmode="decimal" min="0" step="0.001" value="'+num(profile.site_area_sqm)+'"></div><div><label>基礎コンクリート量（m³・分かる場合）</label><input id="spFoundation" type="number" inputmode="decimal" min="0" step="0.001" value="'+num(profile.foundation_volume_m3)+'"></div></div><div class="sp-grid"><div><label>工期開始</label><input id="spWorkStart" type="date" value="'+esc(profile.work_start||'')+'"></div><div><label>工期終了</label><input id="spWorkEnd" type="date" value="'+esc(profile.work_end||'')+'"></div></div><label>施工範囲</label><textarea id="spScope" maxlength="5000" placeholder="例：上屋・基礎・内部解体・整地">'+esc(profile.scope_notes||'')+'</textarea><label>対象外工事</label><textarea id="spExclusions" maxlength="5000" placeholder="例：杭撤去・アスベスト除去は別途">'+esc(profile.exclusion_notes||'')+'</textarea><label>請負金額（円・税別）</label><input id="spContract" type="number" inputmode="numeric" min="0" step="1" value="'+esc(amount)+'" placeholder="例：4000000"><h4>月別・工事別の契約内訳（任意）</h4><div id="spPhases">'+rows.map(phaseRow).join('')+'</div><button id="spAddPhase" class="btn light" type="button">＋ 契約内訳を追加</button><div id="spTotals"></div><button id="spSave" class="btn dark" style="width:100%" type="button">現場内容と契約内訳を保存</button><p id="spStatus" class="note" role="status" aria-live="polite"></p>';
  bind();updateTotals();if(message)setStatus(message,error);
 }
 function phaseValues(){return [...document.querySelectorAll('[data-sp-phase]')].map(row=>{const raw=q('[data-sp-key="amount"]',row).value.trim();return {label:q('[data-sp-key="label"]',row).value.trim(),target_month:q('[data-sp-key="target_month"]',row).value,amount:raw===''?'':Number(raw),status:q('[data-sp-key="status"]',row).value,notes:q('[data-sp-key="notes"]',row).value.trim()};});}
 function updateTotals(){
  const host=q('#spTotals');if(!host)return;const rows=phaseValues();
  if(!rows.length){host.innerHTML='<p class="note">契約内訳は未入力です。月別・工事別に分ける場合だけ追加してください。請負金額のみでも保存できます。</p>';return;}
  const total=P.totals(rows,q('#spContract')?.value);host.innerHTML='<div class="sp-total"><span>内訳合計</span><br><b>'+yen(total.total)+'</b></div>'+(total.difference===null?'':total.matches?'<p class="sp-ok">請負金額と一致しています。</p>':'<p class="sp-warning">請負金額との差額 '+yen(total.difference)+'</p>');
 }
 function captureForm(){
  if(!q('#spCategory'))return;
  profile={...profile,project_category:q('#spCategory').value,structure_type:q('#spStructure').value,floors_above:nullableNumber('#spFloorsAbove'),floors_below:nullableNumber('#spFloorsBelow'),floor_area_sqm:nullableNumber('#spFloorSqm'),site_area_sqm:nullableNumber('#spSiteSqm'),foundation_volume_m3:nullableNumber('#spFoundation'),work_start:q('#spWorkStart').value||null,work_end:q('#spWorkEnd').value||null,scope_notes:q('#spScope').value,exclusion_notes:q('#spExclusions').value,contract_breakdown:phaseValues()};
  contract={...(contract||{}),amount:nullableNumber('#spContract')};
 }
 function addPhase(){captureForm();profile.contract_breakdown.push({label:'',target_month:'',amount:0,status:'planned',notes:''});render();q('[data-sp-phase]:last-child [data-sp-key="label"]')?.focus();}
 function removePhase(index){captureForm();profile.contract_breakdown=profile.contract_breakdown.filter((_,i)=>i!==index);render();}
 function bind(){
  q('#spFloorSqm').oninput=e=>{q('#spFloorTsubo').value=P.sqmToTsubo(e.target.value);};q('#spFloorTsubo').oninput=e=>{q('#spFloorSqm').value=P.tsuboToSqm(e.target.value);};
  q('#spContract').oninput=updateTotals;q('#spPhases').addEventListener('input',updateTotals);q('#spPhases').addEventListener('change',updateTotals);q('#spAddPhase').onclick=addPhase;q('#spSave').onclick=save;q('#spPhases').querySelectorAll('[data-sp-remove]').forEach(b=>b.onclick=()=>removePhase(Number(b.dataset.spRemove)));
 }
 const nullableNumber=id=>{const raw=q(id).value.trim();return raw===''?null:Number(raw);};
 async function save(){
  if(saving||!identity()||!selectedSite())return;const site=selectedSite(),rows=phaseValues(),contractAmount=nullableNumber('#spContract');
  if(contractAmount===null||!Number.isSafeInteger(contractAmount)||contractAmount<0)return setStatus('請負金額を1円単位で入力してください。',true);
  for(const row of rows)if(!row.label||!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(row.target_month)||!Number.isSafeInteger(row.amount)||row.amount<0)return setStatus('契約内訳の工事内容・対象月・金額を確認してください。',true);
  const workStart=q('#spWorkStart').value||null,workEnd=q('#spWorkEnd').value||null;if(workStart&&workEnd&&workEnd<workStart)return setStatus('工期終了日は開始日以降にしてください。',true);
  const data={project_category:q('#spCategory').value,structure_type:q('#spStructure').value,floors_above:nullableNumber('#spFloorsAbove'),floors_below:nullableNumber('#spFloorsBelow'),floor_area_sqm:nullableNumber('#spFloorSqm'),site_area_sqm:nullableNumber('#spSiteSqm'),foundation_volume_m3:nullableNumber('#spFoundation'),work_start:workStart,work_end:workEnd,scope_notes:q('#spScope').value.trim(),exclusion_notes:q('#spExclusions').value.trim(),contract_breakdown:rows};
  if([data.floors_above,data.floors_below].some(n=>n!==null&&!Number.isSafeInteger(n))||[data.floor_area_sqm,data.site_area_sqm,data.foundation_volume_m3].some(n=>n!==null&&(!Number.isFinite(n)||n<0)))return setStatus('階数・面積・基礎数量を確認してください。',true);
  saving=true;q('#spSave').disabled=true;setStatus('保存しています…');const mine=identity(),sid=site.id;
  try{
   const r=await cloudClient.rpc('toya_save_site_project_profile',{p_site_id:sid,p_expected_updated_at:profile.updated_at||null,p_expected_contract_updated_at:contract?.updated_at||null,p_contract_amount:contractAmount,p_profile:data});if(r.error)throw r.error;
   if(identity()!==mine||selectedSite()?.id!==sid)return;const saved=r.data;if(!saved?.profile||!saved?.contract)throw new Error('保存結果を確認できませんでした。');profile={...blank(),...saved.profile,contract_breakdown:P.breakdown(saved.profile.contract_breakdown)};contract=saved.contract;render('請負金額 '+yen(contract.amount)+'（税別）を保存しました。');document.dispatchEvent(new CustomEvent('toya-site-project-profile-saved',{detail:{siteId:sid}}));
  }catch(e){if(identity()===mine&&selectedSite()?.id===sid)setStatus('保存できませんでした：'+String(e.message||e),true);}
  finally{saving=false;if(q('#spSave'))q('#spSave').disabled=false;}
 }
 const observer=new MutationObserver(()=>{if(mountedFor&&!mountedFor.isConnected){mountedFor=null;owner='';siteId='';profile=blank();contract=null;token++;}mount();});observer.observe(document.documentElement,{childList:true,subtree:true});
 document.addEventListener('toya-shared-sites-updated',()=>load(true));
 const start=()=>{mount();setInterval(()=>{if(identity())mount();else{owner='';siteId='';profile=blank();contract=null;token++;}},1000);};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
