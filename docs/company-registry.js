/* Company-owned shared registration. All mutations require admin RLS and version CAS. */
(() => {
 'use strict';
 const kinds={vehicles:'車両',machines:'重機',attachments:'アタッチメント',employees:'社員名簿'};
 const q=s=>document.querySelector(s),list=x=>Array.isArray(x)?x:[],clone=x=>JSON.parse(JSON.stringify(x));
 const identity=()=>typeof cloudProfile!=='undefined'&&cloudProfile?.active===true&&!companyTransition?cloudProfile.id+':'+cloudProfile.company_id+':'+cloudProfile.role:'';
 const admin=()=>!!identity()&&cloudProfile.role==='admin';
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let owner='',rows={},ready=false,busy=false,loading=false,dirty=false,error='',kind='vehicles',draft=[],editVersion=null;
 function note(t){error=t;const el=q('#crStatus');if(el)el.textContent=t;}
 function adopt(){const id=identity();if(owner===id)return !!id;owner=id;rows={};ready=false;busy=false;loading=false;dirty=false;draft=[];error='';q('#companyRegistry')?.remove();return !!id;}
 function active(k){return list(rows[k]?.entries).filter(e=>e.active!==false);}
 function people(){return ready&&rows.employees?active('employees').map(e=>e.name):null;}
 function preserveChoices(fn){
  const site=q('#site')?.value,writer=q('#writer')?.value;
  const selected=[...document.querySelectorAll('input[name=vehicle]:checked,input[name=machine]:checked,input[name=attachment]:checked,input[name=worker]:checked')].map(e=>({name:e.name,value:e.value}));
  fn();if(site){const s=q('#site');if(![...s.options].some(o=>o.value===site))s.add(new Option(site,site));s.value=site;}
  if(writer){const s=q('#writer');if(![...s.options].some(o=>o.value===writer))s.add(new Option(writer,writer));s.value=writer;}
  for(const item of selected){let el=[...document.querySelectorAll('input[name="'+item.name+'"]')].find(e=>e.value===item.value);if(!el){const host=q(item.name==='vehicle'?'#vehicleChoices':item.name==='machine'?'#machineChoices':item.name==='worker'?'#companyWorkerChoices':'#machineAttachmentChoices');if(host){const label=document.createElement('label');label.className='choice';el=document.createElement('input');el.type='checkbox';el.name=item.name;el.value=item.value;label.append(el,document.createTextNode(item.value+'（入力中の記録）'));host.append(label);}}if(el)el.checked=true;}
 }
 function useRows(){
  document.documentElement.classList.add('company-registry-ready');
  for(const k of ['vehicles','machines','attachments'])if(rows[k])set(LS[k],active(k).map(e=>k==='attachments'?{name:e.name,category:e.category||'',location:e.location||'',mountedOn:e.mountedOn||'',memo:e.memo||''}:e.name));
  preserveChoices(()=>{renderSelectors();renderCompanyPeople();});
  for(const id of ['vehicleMaster','machineMaster','attachmentMaster']){const card=q('#'+id)?.closest('.card');if(card)card.hidden=true;}
 }
 function selectKind(k){kind=k;draft=clone(list(rows[k]?.entries));editVersion=rows[k]?.version??null;dirty=false;if(!rows[k]&&k!=='employees'&&typeof isToyaCompany==='function'&&isToyaCompany()){draft=list(get(LS[k],[])).map(e=>({...(typeof e==='string'?{name:e}:e),id:crypto.randomUUID(),active:true}));}paintEditor();}
 function mount(){
  if(!adopt())return;
  if(!q('#companyRegistry')){
   const card=document.createElement('div');card.className='card';card.id='companyRegistry';
   card.innerHTML='<h2>自社の登録・はじめての設定</h2><p class="note">必要なものから登録できます。保存した内容は同じ会社の社員にも共有されます。</p><div class="toolbar"><button class="btn light" id="crCompany" type="button">① 会社名・住所・振込先</button><button class="btn light" id="crReload" type="button">登録内容を読み込む</button></div><p class="note">② 社員名簿 → ③ 車両・重機など → 現場登録の順に進めると、日報を入力できます。使わない項目は後で登録できます。</p><label for="crKind">登録する項目</label><select id="crKind">'+Object.entries(kinds).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')+'</select><p id="crStatus" class="note" role="status" aria-live="polite"></p><div id="crEditor"></div>';
   q('#masterPage').prepend(card);
   q('#crCompany').onclick=()=>window.ToyaProjectBusiness?.openSettings?.();
   q('#crReload').onclick=()=>{if(dirty&&!confirm('保存していない変更を破棄して読み込み直しますか？'))return;dirty=false;refresh(true);};
   q('#crKind').onchange=e=>{if(dirty&&!confirm('保存していない変更を破棄しますか？')){e.target.value=kind;return;}selectKind(e.target.value);};
  }
  q('#companyRegistry').hidden=!admin();
 }
 function paintEditor(){
  if(!q('#crEditor'))return;q('#crKind').value=kind;
  const editable=ready&&admin()&&!busy;
  q('#crEditor').innerHTML='<p class="note">'+(!rows[kind]&&draft.length?'この端末の登録内容です。内容を確認して保存すると会社内で共有されます。<br>':'')+(kind==='employees'?'日報で選ぶ名前を登録します。ログイン用アカウントの発行・停止とは別です。':kind==='attachments'?'名称と必要な補足を入力してください。単価は単価設定で別に登録します。':'例：車両は「３ｔダンプ １号」、重機は「０．４５ １号」。同じ種類が複数ある場合は番号で区別してください。')+'<br>「使用停止」は今後の選択肢から外す操作です。過去の日報は変わりません。</p>'+draft.map((e,i)=>'<div class="row"><label>名称・氏名<input data-cr-index="'+i+'" data-cr-key="name" maxlength="120" value="'+esc(e.name)+'"></label>'+(kind==='attachments'?['category','location','mountedOn','memo'].map((key,j)=>'<label>'+['種類','保管場所','装着中の重機','メモ'][j]+'<input data-cr-index="'+i+'" data-cr-key="'+key+'" maxlength="1000" value="'+esc(e[key])+'"></label>').join(''):'')+'<button class="btn light" type="button" data-cr-toggle="'+i+'">'+(e.active===false?'使用を再開する':'使用停止にする')+'</button><span class="note">'+(e.active===false?' 使用停止中':' 使用中')+'</span></div>').join('')+(!draft.length?'<p class="note">まだ登録されていません。「追加」から登録できます。</p>':'')+'<div class="toolbar"><button class="btn light" id="crAdd" type="button">＋ 追加</button><button class="btn lime" id="crSave" type="button">この項目を保存・共有</button><button class="btn light" id="crImport" type="button">この端末の登録を取り込む</button></div>';
  q('#crEditor').querySelectorAll('input,button').forEach(e=>e.disabled=!editable);
  q('#crKind').disabled=busy;q('#crReload').disabled=busy||loading;
  q('#crImport').hidden=!!rows[kind]||kind==='employees';
  q('#crEditor').oninput=e=>{if(e.target.dataset.crKey){draft[Number(e.target.dataset.crIndex)][e.target.dataset.crKey]=e.target.value;dirty=true;note('変更は未保存です。「この項目を保存・共有」を押してください。');}};
  q('#crEditor').onclick=e=>{const b=e.target.closest('[data-cr-toggle]');if(b){const entry=draft[Number(b.dataset.crToggle)];entry.active=entry.active===false;dirty=true;paintEditor();note('変更は未保存です。');}};
  q('#crAdd').onclick=()=>{if(draft.length>=500)return note('1項目につき500件まで登録できます。');draft.push({id:crypto.randomUUID(),name:'',active:true});dirty=true;paintEditor();const inputs=q('#crEditor').querySelectorAll('[data-cr-key=name]');inputs[inputs.length-1]?.focus();};
  q('#crImport').onclick=()=>{draft=list(get(LS[kind],[])).map(e=>({...(typeof e==='string'?{name:e}:e),id:crypto.randomUUID(),active:true}));dirty=true;paintEditor();note('取り込んだ内容を確認して、保存してください。');};
  q('#crSave').onclick=save;
 }
 async function refresh(force=false){
  if(!adopt()||loading||busy)return;mount();const mine=owner;loading=true;
  note('会社の登録内容を読み込み中…');
  try{const r=await cloudClient.from('company_registries').select('kind,entries,version').eq('company_id',cloudProfile.company_id);if(r.error)throw r.error;if(identity()!==mine)return;
   const next=Object.fromEntries(list(r.data).map(r=>[r.kind,r]));const changed=!ready||JSON.stringify(next)!==JSON.stringify(rows);rows=next;ready=true;if(changed)useRows();if(!dirty)selectKind(kind);note(dirty?'共有内容を読み込みました。編集中の内容は保持しています。':'読み込みました。必要な項目を選んで登録してください。');
  }catch(e){if(identity()===mine)note('読み込めませんでした。「登録内容を読み込む」で再試行してください。'+(e.message||''));}
  finally{if(identity()===mine){loading=false;if(q('#crReload'))q('#crReload').disabled=false;}}
 }
 async function save(){
  if(!ready||!admin()||busy)return;const entries=clone(draft),names=new Set();
  for(const e of entries){e.name=e.name.trim();if(!e.name||e.name.length>120)return note('名称・氏名を1〜120文字で入力してください。');for(const key of ['name','category','location','mountedOn','memo'])if(/[<>"&'\x00-\x1f\x7f]/.test(e[key]||''))return note('記号 < > & 引用符や改行は全角文字に置き換えてください。');if(e.active!==false){if(names.has(e.name))return note('同じ名前が重複しています。号機などで区別してください。');names.add(e.name);}}
  const mine=owner,k=kind,version=editVersion;busy=true;paintEditor();note('保存中…');
  try{const data={entries,version:(version||0)+1};let request=version===null?cloudClient.from('company_registries').insert({...data,company_id:cloudProfile.company_id,kind:k}):cloudClient.from('company_registries').update(data).eq('company_id',cloudProfile.company_id).eq('kind',k).eq('version',version);const r=await request.select('kind,entries,version');if(r.error)throw r.error;if(identity()!==mine)return;if(r.data?.length!==1)throw new Error('他の端末で変更されています。内容を控えてから読み込み直してください。');rows[k]=r.data[0];dirty=false;editVersion=rows[k].version;draft=clone(rows[k].entries);useRows();note('保存しました。同じ会社の社員は画面を開き直すと登録内容が反映されます。');
  }catch(e){if(identity()===mine)note('保存できませんでした。入力内容は保持しています。'+(e.code==='23505'?'他の端末で登録済みです。内容を控えてから読み込み直してください。':e.message||''));}
  finally{if(identity()===mine){busy=false;paintEditor();}}
 }
 window.ToyaCompanyRegistry={people,refresh,has:k=>ready&&!!rows[k]};
 const originalGet=window.get;window.get=function(key,fallback){if(identity()===owner&&ready){for(const k of ['vehicles','machines','attachments'])if(rows[k]&&key===LS[k])return active(k).map(e=>k==='attachments'?{name:e.name,category:e.category||'',location:e.location||'',mountedOn:e.mountedOn||'',memo:e.memo||''}:e.name);}return originalGet.apply(this,arguments);};
 const style=document.createElement('style');style.textContent='.company-registry-ready #smallToolMasterCard{display:none!important}#companyRegistry input{box-sizing:border-box;max-width:100%;font-size:16px}#companyRegistry .toolbar{flex-wrap:wrap}#companyRegistry button{min-height:44px}';document.head.appendChild(style);
 function start(){mount();refresh();document.addEventListener('click',e=>{if(e.target.closest('nav [data-page]')){mount();if(!dirty)refresh();}});window.addEventListener('pageshow',()=>refresh());setInterval(()=>{if(identity()!==owner){mount();refresh();}},1000);}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
