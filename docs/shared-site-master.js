/* TOYA One shared site list v1. Only sites are read/written; report/auth data is untouched.
 * Admin additions use an authenticated, company-scoped, idempotent registration RPC.
 * Background refresh replaces site options only, never other report controls.
 */
(() => {
 'use strict';
 const arr=x=>Array.isArray(x)?x:[];
 const norm=x=>String(x??'').normalize('NFKC').replace(/[\s　]/g,'');
 const placeholder=x=>!norm(x)||['新しい現場','現場名をあとで変更','未登録現場'].includes(norm(x));
 function validateName(x){const s=String(x??'').trim();return placeholder(s)||s.length>120||/[\u0000-\u001f\u007f]/.test(s)?'実際の現場名を1〜120文字で入力してください。':'';}
 function options(rows,local,current,admin,exclude=''){
  const out=[],seen=new Set(),allKnown=new Set(arr(rows).map(r=>norm(r.name)));
  function add(value,label){const k=norm(value);if(placeholder(value)||seen.has(k)||k===norm(exclude))return;seen.add(k);out.push({value,label});}
  arr(rows).filter(r=>r.status==='active').forEach(r=>add(r.name,r.name));
  if(admin)arr(local).filter(n=>!allKnown.has(norm(n))).forEach(n=>add(n,n+'（この端末のみ・未共有）'));
  if(!placeholder(current)){
   const i=out.findIndex(o=>norm(o.value)===norm(current));
   if(i>=0)out[i]={...out[i],value:current};
   else out.unshift({value:current,label:current+(allKnown.has(norm(current))?'（過去の現場・入力を保持）':'（未共有・確認が必要）')});
  }
  return [{value:'',label:'現場を選択'},...out];
 }
 if(typeof module==='object'&&module.exports){module.exports={norm,placeholder,validateName,options};return;}
 if(window.__toyaSharedSitesV1)return;window.__toyaSharedSitesV1=true;
 const q=(s,r=document)=>r.querySelector(s),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const identity=()=>typeof cloudProfile!=='undefined'&&cloudProfile?.active===true&&cloudProfile.company_id&&typeof cloudClient!=='undefined'&&cloudClient?cloudProfile.id+':'+cloudProfile.company_id+':'+cloudProfile.role:'';
 const isAdmin=()=>!!identity()&&cloudProfile.role==='admin';
 const local=()=>{try{return typeof get==='function'&&typeof LS!=='undefined'?arr(get(LS.sites,[])):[];}catch{return [];}};
 let owner='',rows=[],loaded=false,pending=null,lastRead=0,writing=false,draftName='',message='',installed=false,scheduled=false;
 function note(s){message=s;if(q('#ssAdminStatus'))q('#ssAdminStatus').textContent=s;}
 function adoptIdentity(){
  const id=identity();if(owner===id)return !!id;
  owner=id;rows=[];loaded=false;lastRead=0;pending=null;draftName='';message='';
  q('#siteShareHint')?.remove();q('#ssEditor')?.remove();return !!id;
 }
 function setOptions(sel,exclude='',current=sel?.value||''){
  if(!sel||!loaded||document.activeElement===sel)return;
  const os=options(rows,local(),current,isAdmin(),exclude);
  const before=[...sel.options].map(o=>({value:o.value,label:o.textContent}));
  if(JSON.stringify(before)!==JSON.stringify(os))sel.replaceChildren(...os.map(o=>new Option(o.label,o.value)));
  sel.value=placeholder(current)?'':current;
 }
 function syncSelectors(){
  if(!identity()||owner!==identity()||!loaded)return;
  setOptions(q('#site'));
  document.querySelectorAll('.sm-site').forEach(sel=>setOptions(sel,q('#site')?.value||''));
 }
 function queueSync(){if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;syncSelectors();},0);}
 function mountHint(){
  if(!identity()||!q('#site'))return;
  if(!q('#siteShareHint')){
   const box=document.createElement('div');box.id='siteShareHint';box.innerHTML='<span id="ssReadStatus" role="status">会社共通の現場一覧を確認します。</span> <button type="button" class="btn light" id="ssRefresh">現場一覧を更新</button>';
   q('#site').after(box);q('#ssRefresh').onclick=()=>refresh(true);
  }
 }
 function renderMaster(){
  const host=q('#siteMaster');if(!host)return;
  if(!isAdmin()){host.textContent='現場の共有登録は管理者用です。';return;}
  const known=new Set(rows.map(r=>norm(r.name)));
  const drafts=local().filter((n,i,a)=>!placeholder(n)&&!known.has(norm(n))&&a.findIndex(v=>norm(v)===norm(n))===i);
  host.innerHTML='<div id="ssEditor"><p class="note">ここで追加した現場は社員共通です。共有済みの名前や過去の日報は、この画面では書き換えません。</p><label for="ssNewName">追加する現場名</label><input id="ssNewName" type="text" maxlength="120" placeholder="例：○○ビル解体工事"><button id="ssRegister" type="button" class="btn dark">登録して社員へ共有</button><p id="ssAdminStatus" class="note" role="status"></p><div id="ssSharedRows"></div>'+ (drafts.length?'<details open><summary>この端末だけの現場（未共有）</summary>'+drafts.map((n,i)=>'<div class="ss-row"><b>'+esc(n)+'</b><button type="button" class="btn light" data-ss-draft="'+i+'">社員へ共有</button></div>').join('')+'</details>':'')+'</div>';
  q('#ssNewName').value=draftName;q('#ssNewName').oninput=e=>{draftName=e.target.value;};
  q('#ssRegister').disabled=writing;q('#ssRegister').onclick=()=>registerName(draftName);
  q('#ssAdminStatus').textContent=message||(loaded?'共有済みの現場は下に表示しています。':'会社共通の一覧を読み込み中…');
  q('#ssSharedRows').innerHTML=rows.filter(r=>r.status==='active'&&!placeholder(r.name)).map(r=>'<div class="ss-row"><b>'+esc(r.name)+'</b><span class="ss-shared">社員と共有済み</span></div>').join('');
  host.querySelectorAll('[data-ss-draft]').forEach(b=>{b.disabled=writing;b.onclick=()=>registerName(drafts[Number(b.dataset.ssDraft)]);});
 }
 async function readRows(company){
  const out=[];for(let offset=0;offset<100000;offset+=500){
   const r=await cloudClient.from('sites').select('id,name,status').eq('company_id',company).order('name').order('id').range(offset,offset+499);
   if(r.error)throw r.error;out.push(...arr(r.data));if(arr(r.data).length<500)return out;
  }throw new Error('現場が多いため一覧を最後まで確認できませんでした。');
 }
 async function refresh(force=false){
  if(!adoptIdentity())return false;mountHint();
  if(pending)return pending;if(!force&&loaded&&Date.now()-lastRead<30000){syncSelectors();return true;}
  const mine=owner,company=cloudProfile.company_id;
  const run=(async()=>{try{
   if(q('#ssReadStatus'))q('#ssReadStatus').textContent='会社共通の現場を確認中…';
   const result=await readRows(company);if(identity()!==mine||owner!==mine)return false;
   rows=result;loaded=true;lastRead=Date.now();cloudSitesCache=result;
   syncSelectors();
   if(isAdmin()&&!q('#siteMaster')?.contains(document.activeElement))renderMaster();
   if(q('#ssReadStatus'))q('#ssReadStatus').textContent='会社共通 '+rows.filter(r=>r.status==='active'&&!placeholder(r.name)).length+'現場／更新 '+new Date().toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'});
   return true;
  }catch(e){if(identity()===mine){if(q('#ssReadStatus'))q('#ssReadStatus').textContent='現場一覧の更新に失敗しました。入力はそのままです。';note('共有一覧を確認できませんでした：'+String(e.message||e));}return false;}})();
  pending=run;try{return await run;}finally{if(pending===run)pending=null;}
 }
 async function registerName(raw){
  if(!isAdmin()||writing)return;const name=String(raw||'').trim(),problem=validateName(name);
  if(problem){note(problem);return;}
  writing=true;renderMaster();note('社員共通の現場に保存しています…');const mine=identity();let saved=false;
  try{
   const r=await cloudClient.rpc('toya_register_shared_site',{p_name:name});if(r.error)throw r.error;
   const site=arr(r.data)[0];if(!site?.id||site.status!=='active')throw new Error('保存結果を確認できませんでした。');saved=true;
   if(identity()!==mine)return;
   draftName='';if(pending)await pending;const readOK=await refresh(true);
   if(identity()!==mine)return;
   note(site.name+'：社員共通の一覧に登録しました。'+(readOK?'':' 一覧の読込だけ再試行してください。'));
  }catch(e){if(identity()===mine)note((saved?'登録は完了しましたが一覧を確認できません：':'共有できませんでした。名前は残しています：')+String(e.message||e));}
  finally{writing=false;if(identity()===mine)renderMaster();}
 }
 function install(){
  if(installed||typeof window.renderSelectors!=='function'||typeof window.renderMasters!=='function'||!q('#site'))return;
  installed=true;
  const style=document.createElement('style');style.textContent='#siteShareHint{font-size:12px;color:#666;line-height:1.6;margin:6px 0 12px}#siteShareHint .btn{font-size:13px;padding:7px 10px;margin-top:5px}#ssEditor input{width:100%;box-sizing:border-box;min-height:44px;font-size:16px}#ssRegister{width:100%;margin-top:8px}.ss-row{padding:12px;border:1px solid #ddd;border-radius:10px;display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:8px 0;overflow-wrap:anywhere}.ss-shared{font-size:12px;color:#446000;background:#eefbd7;padding:4px 8px;border-radius:8px}#ssEditor summary{font-weight:bold;padding:12px 0}';document.head.appendChild(style);
  const render=window.renderSelectors;
  window.renderSelectors=function(){const selected=q('#site')?.value||'',out=render.apply(this,arguments);if(loaded&&owner===identity()){const sel=q('#site');if([...sel.options].some(o=>o.value===selected))sel.value=selected;setOptions(sel,'',selected);queueSync();}return out;};
  const master=window.renderMasters;
  window.renderMasters=function(){const out=master.apply(this,arguments);renderMaster();refresh();return out;};
  window.addSite=function(){if(!isAdmin())return alert('現場の共有登録は管理者が行います。');renderMaster();q('#ssNewName')?.focus();q('#ssNewName')?.scrollIntoView({block:'center',behavior:'smooth'});};
  // Avoid a full renderSelectors call merely to retain a historical report's site.
  window.ensureSiteOption=function(name){const sel=q('#site');if(!sel||!name)return;if(![...sel.options].some(o=>o.value===name))sel.add(new Option(name,name));};
  window.cloudEnsureSite=async function(raw){
   if(!identity())throw new Error('ログイン状態を確認してください。');
   const name=String(raw||'').trim();if(validateName(name))throw new Error(validateName(name));
   const mine=identity(),fresh=await readRows(cloudProfile.company_id);
   if(mine!==identity())throw new Error('接続先が変わりました。保存前に確認してください。');
   const found=fresh.filter(r=>norm(r.name)===norm(name));
   if(found.length>1)throw new Error('同じ現場名が複数登録されています。管理者が確認してください。');
   if(found.length===1)return found[0].id;
   if(!isAdmin())throw new Error('この現場は社員共通の一覧に未登録です。管理者へ共有登録を依頼してください。');
   const r=await cloudClient.rpc('toya_register_shared_site',{p_name:name});if(r.error)throw r.error;
   if(mine!==identity()||!r.data?.[0]?.id)throw new Error('現場の保存結果を確認してください。');
   refresh(true);return r.data[0].id;
  };
  const observer=new MutationObserver(queueSync);observer.observe(q('#site'),{childList:true});
  if(q('#siteMoveEntries'))observer.observe(q('#siteMoveEntries'),{childList:true});
  document.addEventListener('focusout',e=>{if(e.target.matches('#site,.sm-site'))queueSync();});
  document.addEventListener('change',e=>{if(e.target.matches('#site,.sm-site'))queueSync();});
  document.addEventListener('click',e=>{if(e.target.closest('nav [data-page]')){adoptIdentity();mountHint();refresh();}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true);});
  window.addEventListener('focus',()=>refresh());window.addEventListener('online',()=>refresh(true));
  setInterval(()=>{if(!document.hidden)refresh();},30000);
  // Auth is intentionally not wrapped or changed. Only observe profile readiness.
  let tries=0;const ready=setInterval(()=>{if(adoptIdentity()){mountHint();refresh();}if(++tries>30)clearInterval(ready);},500);
  adoptIdentity();mountHint();refresh();
 }
 const start=()=>setTimeout(install,700);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
