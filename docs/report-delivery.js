/* TOYA One: protect in-progress report input and retry only explicitly failed final saves. */
(() => {
  'use strict';
  const q=(s,r=document)=>r.querySelector(s);
  let retrying=false,draftTimer=0,lastDraft='';
  const identity=()=>typeof cloudProfile!=='undefined'&&cloudProfile?.active===true?cloudProfile.id+':'+cloudProfile.company_id:'';
  const reports=()=>{try{return typeof get==='function'?get(LS.reports,[]):[];}catch{return [];}};
  const pending=()=>reports().filter(r=>r?.cloudPending===true);
  const meaningful=d=>d&&d.date&&d.site&&d.writer;
  function card(){
    let el=q('#reportDeliveryCard');
    if(el)return el;
    el=document.createElement('div');el.id='reportDeliveryCard';el.className='card';el.hidden=true;
    el.innerHTML='<h2>会社へ未送信の日報があります</h2><p id="reportDeliveryText" class="note"></p><button id="retryReportDelivery" type="button" class="btn lime" style="width:100%">会社へ再送する</button><p id="reportDeliveryStatus" class="note" role="status" aria-live="polite"></p>';
    q('#homePage')?.prepend(el);q('#retryReportDelivery').onclick=()=>retry(true);return el;
  }
  function refresh(){
    const el=card(),rows=pending();if(!el)return;
    el.hidden=!rows.length;
    if(rows.length)q('#reportDeliveryText').textContent=rows.map(r=>(r.date||'日付なし')+'／'+(r.site||'現場なし')+'／'+(r.writer||'記入者なし')).join('、')+'。入力内容はこのiPhoneに残っています。';
    const button=q('#retryReportDelivery');if(button)button.disabled=retrying;
  }
  function replaceLocal(d){
    const rows=reports(),i=rows.findIndex(r=>String(r.id)===String(d.id));if(i>=0){rows[i]=d;set(LS.reports,rows);}
  }
  async function retry(manual=false){
    if(retrying)return;
    const rows=pending();if(!rows.length){refresh();return;}
    if(!identity()){
      if(manual)alert('ログインしてから再送してください。入力内容はこのiPhoneに残っています。');
      return;
    }
    retrying=true;refresh();const status=q('#reportDeliveryStatus');if(status)status.textContent='会社へ再送中…';
    let ok=0,ng=0;
    for(const original of rows){
      try{
        const d={...original,cloudPending:false,cloudLastError:''},result=await cloudSaveReport(d);
        if(!result?.verified)throw new Error('クラウドの保存結果を確認できませんでした。');
        d.cloudId=result.id;d.cloudUpdatedAt=result.updatedAt;d.cloudPending=false;d.cloudLastError='';replaceLocal(d);
        await cloudLogActivity('report_save',result.id,{site:d.site,date:d.date,verified:true,retry:true});
        const photo=await cloudSyncPhotosForReport(d.id,result.id),waste=await cloudSyncWasteForReport(d,result.id);
        if(photo.ok)await cloudLogActivity('photo_save',result.id,{count:photo.ok,retry:true});
        if(waste.ok)await cloudLogActivity('waste_save',result.id,{count:waste.ok,retry:true});
        const savedDraft=typeof get==='function'?get(LS.draft,null):null;
        if(String(savedDraft?.id||'')===String(d.id))localStorage.removeItem(LS.draft);
        ok++;
      }catch(e){
        const d={...original,cloudPending:true,cloudLastError:String(e?.message||e),cloudAttemptedAt:new Date().toISOString()};replaceLocal(d);ng++;
      }
    }
    retrying=false;refresh();
    if(status)status.textContent=ng?'送信できない日報が'+ng+'件あります。通信とログインを確認して、もう一度押してください。':'会社への保存を確認しました（'+ok+'件）。';
    if(ok){cloudLoadReports();if(typeof renderHome==='function')renderHome();}
  }
  function autoDraft(){
    clearTimeout(draftTimer);draftTimer=setTimeout(()=>{
      if(!identity()||typeof collect!=='function'||window.__toyaReportSaveBusy)return;
      try{
        const d=collect();if(!meaningful(d))return;
        const value=JSON.stringify(d);if(value===lastDraft)return;
        set(LS.draft,d);lastDraft=value;
        const status=q('#status');if(status&&!status.offsetParent){status.textContent='入力内容をこのiPhoneに自動保存しました。';}
      }catch(e){console.warn('日報の入力保護に失敗',e);}
    },700);
  }
  document.addEventListener('input',e=>{if(e.target.closest('#reportPage'))autoDraft();});
  document.addEventListener('change',e=>{if(e.target.closest('#reportPage'))autoDraft();});
  document.addEventListener('click',e=>{if(e.target.closest('#reportPage button'))autoDraft();});
  window.addEventListener('online',()=>retry(false));
  window.ToyaReportDelivery={refresh,retry};
  const start=()=>{refresh();setTimeout(()=>retry(false),1800);setInterval(()=>{refresh();if(identity()&&navigator.onLine)retry(false);},30000);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
