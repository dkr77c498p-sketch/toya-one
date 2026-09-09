/* Restore an explicitly saved text draft after a safe app refresh.
 * No automatic report writes, draft deletion, account changes, or photo uploads.
 */
(() => {
 'use strict';
 const q=s=>document.querySelector(s),norm=s=>String(s??'').normalize('NFKC').replace(/[\s　]/g,'');
 let restored='',busy=false;
 const identity=()=>typeof cloudProfile!=='undefined'&&cloudProfile?.active===true?cloudProfile.id+':'+cloudProfile.company_id:'';
 function draft(){try{return typeof get==='function'&&typeof LS!=='undefined'?get(LS.draft,null):null;}catch{return null;}}
 function allowed(d){
  if(!identity()||!d||typeof d!=='object'||!d.id||!d.date||!d.site||!d.writer)return false;
  return cloudProfile.role==='admin'||norm(d.writer)===norm(cloudProfile.name);
 }
 function show(){
  const d=draft(),key=identity()+':'+String(d?.id||'');
  if(!allowed(d)||restored===key){q('#savedDraftRecovery')?.remove();return;}
  let box=q('#savedDraftRecovery');
  if(!box){
   box=document.createElement('div');box.id='savedDraftRecovery';box.className='card';
   box.innerHTML='<h2>一時保存した入力があります</h2><p id="savedDraftLabel" class="note"></p><button id="restoreSavedDraft" type="button" class="btn dark" style="width:100%">一時保存を復元</button><p class="note">入力内容をこの画面へ戻します。クラウドにはまだ保存しません。追加中だった未保存の写真は含まれません。</p><p id="savedDraftStatus" class="note" role="status"></p>';
   const anchor=q('#editBanner');if(!anchor)return;anchor.before(box);
   q('#restoreSavedDraft').onclick=restore;
  }
  q('#savedDraftLabel').textContent=d.date+' ／ '+d.site+' ／ '+d.writer;
  q('#restoreSavedDraft').disabled=busy;
 }
 async function restore(){
  const d=draft(),mine=identity();if(busy||!allowed(d))return;
  if(typeof stagedPhotos!=='undefined'&&stagedPhotos.length){q('#savedDraftStatus').textContent='この画面で写真を追加中です。写真を失わないよう、今は復元を中止しました。';return;}
  if(!confirm('一時保存した日付・現場・時間・明細をこの画面へ戻します。\nいま画面に入力している内容は置き換わります。クラウドの日報は変更しません。\n復元しますか？'))return;
  busy=true;q('#restoreSavedDraft').disabled=true;q('#savedDraftStatus').textContent='一時保存を復元しています…';
  try{
   if(typeof cloudFetchReports==='function')await cloudFetchReports();
   if(identity()!==mine)throw new Error('ログインが切り替わりました。復元していません。');
   const locals=typeof get==='function'?get(LS.reports,[]):[];
   const shared=typeof cloudReportsCache!=='undefined'?cloudReportsCache:[];
   const saved=[...shared,...locals].find(r=>String(r.id)===String(d.id));
   const value={...saved,...d};
   if(saved){value.photoCount=saved.photoCount;value.cloudId=saved.cloudId;}
   window.fillReportForm(value,'edit');
   if(!saved){q('#editBannerText').textContent='一時保存から復元：'+d.date+' '+d.site;q('#saveReportBtn').textContent='日報を保存';}
   restored=mine+':'+String(d.id);q('#savedDraftRecovery')?.remove();
   if(typeof showStatus==='function')showStatus('一時保存を復元しました。内容を確認して日報を保存してください。');
  }catch(e){if(q('#savedDraftStatus'))q('#savedDraftStatus').textContent='復元できませんでした：'+String(e.message||e)+' 一時保存は残っています。';}
  finally{busy=false;if(q('#restoreSavedDraft'))q('#restoreSavedDraft').disabled=false;}
 }
 const start=()=>setTimeout(show,450);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
 document.addEventListener('click',e=>{if(e.target.closest('nav [data-page="reportPage"]'))setTimeout(show,0);});
 setInterval(()=>{if(!busy)show();},3000);
})();
