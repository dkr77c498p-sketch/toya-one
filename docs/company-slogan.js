/* Company-wide home slogan. Admin writes, company-member reads, versioned saves. */
(() => {
 'use strict';
 const fallback='今日も、安全に。',q=s=>document.querySelector(s);
 const identity=()=>typeof cloudProfile!=='undefined'&&cloudProfile?.active===true&&!(typeof companyTransition!=='undefined'&&companyTransition)?cloudProfile.id+':'+cloudProfile.company_id+':'+cloudProfile.role:'';
 const admin=()=>!!identity()&&cloudProfile.role==='admin';
 let owner='',epoch=0,row=null,loaded=false,loading=false,busy=false,dirty=false,attempted=false;
 function note(text){const el=q('#uxSloganStatus');if(el)el.textContent=text;}
 function title(){const el=q('#uxSlogan');if(el)el.textContent=row?.slogan||fallback;}
 function controls(){
  const locked=!loaded||loading||busy||!admin();
  for(const id of ['uxSloganInput','uxSloganSave'])if(q('#'+id))q('#'+id).disabled=locked;
  if(q('#uxSloganReload'))q('#uxSloganReload').disabled=loading||busy;
 }
 function adopt(){
  const id=identity();if(owner!==id){
   owner=id;epoch++;row=null;loaded=false;loading=false;busy=false;dirty=false;attempted=false;
   q('#uxSloganEditor')?.remove();title();
  }
  return !!id;
 }
 function mount(){
  adopt();const heading=q('#uxSlogan');if(!heading||!admin()||q('#uxSloganEditor'))return;
  const editor=document.createElement('details');editor.id='uxSloganEditor';editor.className='ux-slogan-editor';
  editor.innerHTML='<summary>スローガンを変更</summary><label for="uxSloganInput">会社のスローガン</label><textarea id="uxSloganInput" rows="2" maxlength="80" aria-describedby="uxSloganHint" disabled></textarea><p id="uxSloganHint" class="note">80文字まで。保存すると同じ会社の社員のホームにも表示されます。</p><button id="uxSloganSave" class="btn lime" type="button" disabled>スローガンを保存</button><p id="uxSloganStatus" class="note" role="status" aria-live="polite"></p><button id="uxSloganReload" class="btn light" type="button" hidden>保存済みの内容を読み込む</button>';
  heading.after(editor);q('#uxSloganInput').value=row?.slogan||fallback;
  window.ToyaJapaneseInput.bind(editor,e=>{if(e.target.id==='uxSloganInput'){dirty=true;note('変更は未保存です。');}},note);
  q('#uxSloganSave').onclick=save;
  q('#uxSloganReload').onclick=()=>{if(dirty&&!confirm('入力中のスローガンを破棄して、保存済みの内容を読み込みますか？'))return;dirty=false;refresh(true);};
  editor.addEventListener('toggle',()=>{if(editor.open&&!loaded&&!attempted)refresh();});controls();
 }
 async function refresh(force=false){
  if(!adopt())return;mount();
  if(typeof cloudClient==='undefined'||!cloudClient||loading||busy||(!force&&loaded&&(dirty||q('#uxSloganEditor')?.open)))return;
  const mine=epoch,company=cloudProfile.company_id;loading=true;attempted=true;controls();
  if(!loaded)note('スローガンを読み込み中…');
  try{
   const r=await cloudClient.from('company_home_settings').select('slogan,version').eq('company_id',company);
   if(r.error)throw r.error;if(mine!==epoch||identity()!==owner)return;
   row=r.data?.[0]||null;loaded=true;title();
   if(!dirty&&q('#uxSloganInput'))q('#uxSloganInput').value=row?.slogan||fallback;
   note('');if(q('#uxSloganReload'))q('#uxSloganReload').hidden=true;
  }catch(e){if(mine===epoch&&identity()===owner){note('読み込めませんでした。通信状態を確認して、下のボタンで読み込み直してください。');if(q('#uxSloganReload'))q('#uxSloganReload').hidden=false;}}
  finally{if(mine===epoch&&identity()===owner){loading=false;controls();}}
 }
 async function save(){
  if(!adopt()||!admin()||!loaded||loading||busy)return;
  const slogan=q('#uxSloganInput').value.trim();
  if(!slogan||Array.from(slogan).length>80)return note('スローガンを1〜80文字で入力してください。');
  const mine=epoch,company=cloudProfile.company_id,version=row?.version??null;
  busy=true;controls();note('保存中…');
  try{
   const data={slogan,version:(version||0)+1};
   const request=version===null?cloudClient.from('company_home_settings').insert({...data,company_id:company}):cloudClient.from('company_home_settings').update(data).eq('company_id',company).eq('version',version);
   const r=await request.select('slogan,version');
   if(r.error)throw r.error;if(mine!==epoch||identity()!==owner)return;
   if(r.data?.length!==1)throw {code:'CONFLICT'};
   row=r.data[0];dirty=false;q('#uxSloganInput').value=row.slogan;title();
   note('保存しました。社員の画面はホームを開き直すと反映されます。');q('#uxSloganReload').hidden=true;
  }catch(e){if(mine===epoch&&identity()===owner){
   const conflict=e.code==='23505'||e.code==='CONFLICT';
   note(conflict?'他の端末で変更されています。入力内容を控えてから、保存済みの内容を読み込んでください。':'保存できませんでした。入力内容は残っています。通信状態を確認して、もう一度保存してください。');
   q('#uxSloganReload').hidden=!conflict;
  }}finally{if(mine===epoch&&identity()===owner){busy=false;controls();}}
 }
 function start(){
  mount();refresh();
  document.addEventListener('toya-role-changed',()=>{mount();refresh();});
  document.addEventListener('click',e=>{if(e.target.closest('nav [data-page="homePage"]'))refresh();});
  window.addEventListener('pageshow',()=>refresh());
  setInterval(()=>{if(identity()!==owner){mount();refresh();}},1000);
 }
 window.ToyaCompanySlogan={refresh};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
