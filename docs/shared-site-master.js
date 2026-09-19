/* TOYA One shared site list. Renames keep reports and document labels connected.
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
  arr(rows).filter(r=>r.status==='active').sort((a,b)=>a.name.localeCompare(b.name,'ja')).forEach(r=>add(r.name,r.name));
  // Unshared local drafts stay in Registration Management, not ordinary choices.
  if(String(current||'').trim()){
   const i=out.findIndex(o=>norm(o.value)===norm(current));
   if(i>=0)out[i]={...out[i],value:current};
   else out.unshift({value:current,label:current+(allKnown.has(norm(current))?'（過去の現場・入力を保持）':'（未共有・確認が必要）')});
  }
  return [{value:'',label:'現場を選択'},...out];
 }

 // One catalog for every selector. Names are normalized for display matching only;
 // original report values and distinct database IDs are never merged or rewritten.
 function historyNames(reports){
  return [...new Set(arr(reports).flatMap(d=>[d.site,...arr(d.siteMoves).map(m=>m?.site),...arr(d.usageHours?.entries).flatMap(e=>arr(e.allocations).map(a=>a.site))]).filter(n=>typeof n==='string'&&n.trim()))];
 }
 function browseOptions(catalog,history,current='',byId=false,showHistory=false,empty='現場を選択'){
  const out=[{value:'',label:empty}],seen=new Set();
  const list=arr(catalog).filter(r=>r?.id&&typeof r.name==='string'&&r.name.trim());
  const ordinary=r=>r.status==='active'&&!placeholder(r.name);
  const duplicates=new Map();list.forEach(r=>duplicates.set(norm(r.name),(duplicates.get(norm(r.name))||0)+1));
  function add(r,historical=false){
   const id=byId?String(r.id):norm(r.name);if(seen.has(id))return;
   seen.add(id);out.push({value:byId?String(r.id):r.name,label:r.name+(historical?(r.completed_on?'（完工）':'（過去・未整理）'):'')+(byId&&duplicates.get(norm(r.name))>1?'［ID末尾 '+String(r.id).slice(-6)+'］':'')});
  }
  list.filter(ordinary).sort((a,b)=>a.name.localeCompare(b.name,'ja')).forEach(r=>add(r));
  if(showHistory){
   list.filter(r=>!ordinary(r)&&!placeholder(r.name)).sort((a,b)=>a.name.localeCompare(b.name,'ja')).forEach(r=>add(r,true));
   if(!byId)arr(history).filter(n=>typeof n==='string'&&n.trim()&&!placeholder(n)).forEach(n=>add({id:'history:'+n,name:n},true));
  }
  if(current){
   const known=list.find(r=>byId?String(r.id)===current:norm(r.name)===norm(current));
   if(known)add(known,!ordinary(known));
   else if(!byId)add({id:'retained',name:current},true);
   if(!byId){const found=out.find(o=>norm(o.value)===norm(current));if(found)found.value=current;}
  }
  return out;
 }
 if(typeof module==='object'&&module.exports){module.exports={norm,placeholder,validateName,options,browseOptions,historyNames};return;}
 if(window.__toyaSharedSitesV1)return;window.__toyaSharedSitesV1=true;
 const q=(s,r=document)=>r.querySelector(s),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const identity=()=>typeof cloudProfile!=='undefined'&&cloudProfile?.active===true&&cloudProfile.company_id&&typeof cloudClient!=='undefined'&&cloudClient?cloudProfile.id+':'+cloudProfile.company_id+':'+cloudProfile.role:'';
 const isAdmin=()=>!!identity()&&cloudProfile.role==='admin';
 const local=()=>{try{return typeof get==='function'&&typeof LS!=='undefined'?arr(get(LS.sites,[])):[];}catch{return [];}};
 let owner='',rows=[],loaded=false,pending=null,lastRead=0,writing=false,draftName='',editingId='',editName='',message='',installed=false,scheduled=false;
 function note(s){message=s;if(q('#ssAdminStatus'))q('#ssAdminStatus').textContent=s;}
 function adoptIdentity(){
  const id=identity();if(owner===id)return !!id;
  owner=id;rows=[];loaded=false;lastRead=0;pending=null;draftName='';editingId='';editName='';message='';
  q('#siteShareHint')?.remove();q('#ssEditor')?.remove();return !!id;
 }

 const selectSpecs={siteSummarySelect:[false,'現場を選択'],ledgerSite:[false,'現場を選択'],recordSiteFilter:[false,'全現場'],lcSite:[true,'現場を選択'],vcSite:[true,'現場を選択'],ecSite:[true,'現場を選択'],esSite:[true,'現場を選択']};
 const ready=()=>!!identity()&&owner===identity()&&loaded;
 const reportHistory=()=>historyNames(typeof cloudReportsCache!=='undefined'?cloudReportsCache:[]);
 function replaceOptions(sel,os,current){
  const before=[...sel.options].map(o=>({value:o.value,label:o.textContent}));
  if(JSON.stringify(before)!==JSON.stringify(os))sel.replaceChildren(...os.map(o=>new Option(o.label,o.value)));
  sel.value=os.some(o=>o.value===current)?current:'';
 }
 function historyToggle(sel){
  const id='ssHistory-'+sel.id;let box=document.getElementById(id);
  if(!box){
   box=document.createElement('div');box.id=id;box.className='ss-history';
   const label=document.createElement('label'),input=document.createElement('input');
   input.type='checkbox';input.checked=sel.dataset.ssHistory==='true';
   label.append(input,document.createTextNode('過去・未整理の現場も表示'));box.append(label);
   const anchor=sel.parentElement?.tagName==='LABEL'?sel.parentElement:sel;anchor.after(box);
   input.addEventListener('change',()=>{sel.dataset.ssHistory=String(input.checked);syncBrowse(sel,true);});
  }
 }
 function syncBrowse(sel,force=false,current=sel?.value||''){
  if(!sel||!selectSpecs[sel.id]||!ready())return false;
  historyToggle(sel);
  if(!force&&document.activeElement===sel)return true;
  const [byId,empty]=selectSpecs[sel.id],show=sel.dataset.ssHistory==='true';
  const os=browseOptions(rows,reportHistory(),current,byId,show,empty);
  // Retain a selected ID even if a refreshed catalog no longer contains it.
  // Cost editors will reject an unknown ID rather than save to a different site.
  if(current&&byId&&!os.some(o=>o.value===current))os.push({value:current,label:(sel.selectedOptions[0]?.textContent||'現場未確認')+'（選択を保持）'});
  replaceOptions(sel,os,current);return true;
 }
 window.ToyaSharedSiteUI=Object.freeze({ready,syncBrowse,norm,same:(a,b)=>norm(a)===norm(b)});
 function setOptions(sel,exclude='',current=sel?.value||''){
  if(!sel||!loaded||document.activeElement===sel)return;
  const os=options(rows,local(),current,isAdmin(),exclude);
  replaceOptions(sel,os,current);
 }
 function syncSelectors(){
  if(!identity()||owner!==identity()||!loaded)return;
  setOptions(q('#site'));
  document.querySelectorAll('.sm-site').forEach(sel=>setOptions(sel,q('#site')?.value||''));
  Object.keys(selectSpecs).forEach(id=>syncBrowse(q('#'+id)));
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
  const sharedRow=r=>{
   if(editingId===r.id)return '<div class="ss-row ss-edit"><label for="ssRenameName">新しい現場名</label><input id="ssRenameName" type="text" maxlength="120" value="'+esc(editName)+'"><div class="ss-edit-actions"><button type="button" class="btn lime" id="ssRenameSave">この名前に変更</button><button type="button" class="btn light" id="ssRenameCancel">やめる</button></div></div>';
   return '<div class="ss-row"><b>'+esc(r.name)+(r.status==='active'?'':'（完工・過去）')+'</b><div class="ss-row-actions"><span class="ss-shared">社員と共有済み</span><button type="button" class="btn light" data-ss-rename="'+esc(r.id)+'">名前を変更</button><button type="button" class="btn danger" data-ss-delete="'+esc(r.id)+'">削除</button></div></div>';
  };
  const active=rows.filter(r=>r.status==='active'&&!placeholder(r.name));
  const past=rows.filter(r=>r.status!=='active'&&!placeholder(r.name));
  host.innerHTML='<div id="ssEditor"><p class="note">ここで追加・変更した現場名は社員共通です。名前を変更すると、日報・写真・集計・積算表・見積書・請求書の現場名に反映されます。確定済みの書類も対象です。</p><label for="ssNewName">追加する現場名</label><input id="ssNewName" type="text" maxlength="120" placeholder="例：○○ビル解体工事"><button id="ssRegister" type="button" class="btn dark">登録して社員へ共有</button><p id="ssAdminStatus" class="note" role="status"></p><div id="ssSharedRows">'+active.map(sharedRow).join('')+'</div>'+(past.length?'<details><summary>完工・過去の現場</summary>'+past.map(sharedRow).join('')+'</details>':'')+ (drafts.length?'<details open><summary>この端末だけの現場（未共有）</summary>'+drafts.map((n,i)=>'<div class="ss-row"><b>'+esc(n)+'</b><button type="button" class="btn light" data-ss-draft="'+i+'">社員へ共有</button></div>').join('')+'</details>':'')+'</div>';
  q('#ssNewName').value=draftName;q('#ssNewName').oninput=e=>{draftName=e.target.value;};
  q('#ssRegister').disabled=writing;q('#ssRegister').onclick=()=>registerName(draftName);
  q('#ssAdminStatus').textContent=message||(loaded?'共有済みの現場は下に表示しています。':'会社共通の一覧を読み込み中…');
  host.querySelectorAll('[data-ss-rename]').forEach(b=>{b.disabled=writing;b.onclick=()=>startRename(b.dataset.ssRename);});
  host.querySelectorAll('[data-ss-delete]').forEach(b=>{b.disabled=writing;b.onclick=()=>deleteSite(b.dataset.ssDelete);});
  if(q('#ssRenameName'))q('#ssRenameName').oninput=e=>{editName=e.target.value;};
  if(q('#ssRenameSave')){q('#ssRenameSave').disabled=writing;q('#ssRenameSave').onclick=saveRename;}
  if(q('#ssRenameCancel')){q('#ssRenameCancel').disabled=writing;q('#ssRenameCancel').onclick=()=>{editingId='';editName='';message='';renderMaster();};}
  host.querySelectorAll('[data-ss-draft]').forEach(b=>{b.disabled=writing;b.onclick=()=>registerName(drafts[Number(b.dataset.ssDraft)]);});
 }
 async function deleteSite(id){
  if(!isAdmin()||writing)return;const site=rows.find(r=>r.id===id);if(!site)return;
  if(!confirm('「'+site.name+'」を削除しますか？\n\n日報・書類・請負金などの記録がある現場は削除できません。'))return;
  writing=true;message='削除できる現場か確認しています…';renderMaster();const mine=identity();
  try{const r=await cloudClient.rpc('toya_delete_empty_site',{p_site_id:site.id,p_expected_version:site.lifecycle_version});if(r.error)throw r.error;if(identity()!==mine)return;rows=rows.filter(x=>x.id!==site.id);message=site.name+'：削除しました。';renderMaster();await refresh(true);document.dispatchEvent(new CustomEvent('toya-shared-sites-updated'));}
  catch(e){if(identity()===mine){message='削除できませんでした：'+String(e.message||e);renderMaster();}}
  finally{writing=false;if(identity()===mine)renderMaster();}
 }
 function startRename(id){
  const site=rows.find(r=>r.id===id);if(!site||writing)return;
  editingId=id;editName=site.name;message='新しい現場名を入力してください。';renderMaster();
  q('#ssRenameName')?.focus();q('#ssRenameName')?.select();
 }
 function replaceOpenName(oldName,newName){
  try{
   if(typeof get==='function'&&typeof set==='function'&&typeof LS!=='undefined'){
    const saved=local(),next=saved.map(name=>norm(name)===norm(oldName)?newName:name);
    if(JSON.stringify(saved)!==JSON.stringify(next))set(LS.sites,next);
   }
  }catch{}
  document.querySelectorAll('#site,.sm-site').forEach(sel=>{
   if(norm(sel.value)!==norm(oldName))return;
   const option=[...sel.options].find(o=>norm(o.value)===norm(oldName));
   if(option){option.value=newName;option.textContent=newName;}else sel.add(new Option(newName,newName));
   sel.value=newName;
  });
 }
 async function saveRename(){
  if(!isAdmin()||writing)return;
  const site=rows.find(r=>r.id===editingId),name=String(editName||'').trim(),problem=validateName(name);
  if(!site){message='変更する現場を確認してください。';editingId='';renderMaster();return;}
  if(problem){message=problem;renderMaster();q('#ssRenameName')?.focus();return;}
  if(norm(site.name)===norm(name)){editingId='';editName='';message='現場名は変更されていません。';renderMaster();return;}
  if(!confirm('「'+site.name+'」を「'+name+'」へ変更しますか？\n\n日報・写真・集計・積算表・見積書・請求書の現場名に反映します。確定済み・取消済みの書類も新しい名前になります。金額・書類番号は変わりません。'))return;
  writing=true;message='現場名を変更しています…';renderMaster();const mine=identity(),oldName=site.name;
  try{
   const result=await cloudClient.rpc('toya_rename_shared_site',{p_site_id:site.id,p_expected_version:site.lifecycle_version,p_name:name});
   if(result.error)throw result.error;
   const saved=Array.isArray(result.data)?result.data[0]:result.data;if(!saved?.id||saved.id!==site.id||saved.name!==name)throw new Error('変更結果を確認できませんでした。');
   if(identity()!==mine)return;
   rows=rows.map(r=>r.id===saved.id?{...r,...saved}:r);replaceOpenName(oldName,saved.name);
   document.dispatchEvent(new CustomEvent('toya-site-renamed',{detail:{companyId:cloudProfile.company_id,siteId:saved.id,oldName,newName:saved.name}}));
   editingId='';editName='';renderMaster();
   const readOK=await refresh(true);
   if(typeof cloudFetchReports==='function')try{await cloudFetchReports();if(typeof renderHome==='function')renderHome();}catch{}
   if(identity()!==mine)return;
   message=saved.name+'：現場名を変更しました。'+(readOK?' 社員の画面にも反映されます。':' 一覧の更新だけ再度お試しください。');renderMaster();
  }catch(e){if(identity()===mine){message='変更できませんでした：'+String(e.message||e);renderMaster();q('#ssRenameName')?.focus();}}
  finally{writing=false;if(identity()===mine)renderMaster();}
 }
 async function readRows(company){
  const out=[];for(let offset=0;offset<100000;offset+=500){
   const r=await cloudClient.from('sites').select('id,name,status,completed_on,lifecycle_version').eq('company_id',company).order('name').order('id').range(offset,offset+499);
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
   const changed=!loaded||JSON.stringify(rows)!==JSON.stringify(result);
   rows=result;loaded=true;lastRead=Date.now();cloudSitesCache=result;
   if(changed)document.dispatchEvent(new CustomEvent('toya-shared-sites-updated',{detail:{companyId:company,sites:result.map(s=>({...s}))}}));
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
  const style=document.createElement('style');style.textContent='#siteShareHint{font-size:12px;color:#666;line-height:1.6;margin:6px 0 12px}#siteShareHint .btn{font-size:13px;padding:7px 10px;margin-top:5px}#ssEditor input{width:100%;box-sizing:border-box;min-height:44px;font-size:16px}#ssRegister{width:100%;margin-top:8px}.ss-row{padding:12px;border:1px solid #ddd;border-radius:10px;display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:8px 0;overflow-wrap:anywhere}.ss-row b{flex:1;min-width:170px}.ss-row-actions,.ss-edit-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.ss-edit{display:block}.ss-edit label{margin-top:0}.ss-edit-actions{margin-top:8px}.ss-edit-actions .btn{flex:1}.ss-shared{font-size:12px;color:#446000;background:#eefbd7;padding:4px 8px;border-radius:8px}#ssEditor summary{font-weight:bold;padding:12px 0}.ss-history{margin:6px 0 10px;font-size:12px;color:#555}.ss-history label{display:flex;align-items:center;gap:7px;font-size:12px;min-height:36px;margin:0}.ss-history input[type=checkbox]{width:18px!important;height:18px!important;min-height:18px!important;flex:0 0 18px;margin:0}';document.head.appendChild(style);
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
  const selectorQuery=Object.keys(selectSpecs).map(id=>'#'+id).join(',');
  const browseObserver=new MutationObserver(changes=>{
   if(changes.some(c=>c.target instanceof Element&&c.target.matches(selectorQuery)||[...c.addedNodes].some(n=>n instanceof Element&&(n.matches(selectorQuery)||n.querySelector(selectorQuery)))))queueSync();
  });
  if(q('main'))browseObserver.observe(q('main'),{childList:true,subtree:true});
  document.addEventListener('focusout',e=>{if(e.target.matches('#site,.sm-site,'+Object.keys(selectSpecs).map(id=>'#'+id).join(',')))queueSync();});
  document.addEventListener('change',e=>{if(e.target.matches('#site,.sm-site,'+Object.keys(selectSpecs).map(id=>'#'+id).join(',')))queueSync();});
  document.addEventListener('click',e=>{if(e.target.closest('nav [data-page]')){adoptIdentity();mountHint();refresh();}});
  document.addEventListener('toya-site-lifecycle-changed',()=>refresh(true));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true);});
  window.addEventListener('focus',()=>refresh());window.addEventListener('online',()=>refresh(true));
  setInterval(()=>{if(!document.hidden)refresh();},30000);
  // Auth is intentionally not wrapped or changed. Only observe profile readiness.
  let tries=0;const ready=setInterval(()=>{if(adoptIdentity()){mountHint();refresh();}if(++tries>30)clearInterval(ready);},500);
  adoptIdentity();mountHint();refresh();
 }
 const start=()=>setTimeout(install,700);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
