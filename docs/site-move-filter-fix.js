(function(){
  function invalidSite(x){return !x||['新しい現場','現場名をあとで変更','未登録現場'].includes(x)}
  function localReports(){try{return (typeof LS!=='undefined'&&typeof get==='function')?(get(LS.reports,[])||[]):[]}catch(e){return []}}
  function cloudReports(){try{return (typeof cloudReportsCache!=='undefined'&&Array.isArray(cloudReportsCache))?cloudReportsCache:[]}catch(e){return []}}
  function currentReports(){try{return (typeof currentRecordsData!=='undefined'&&Array.isArray(currentRecordsData))?currentRecordsData:[]}catch(e){return []}}

  async function loadActiveSites(){
    try{
      if(typeof cloudClient==='undefined'||!cloudClient||typeof cloudProfile==='undefined'||!cloudProfile?.company_id)return [];
      const {data,error}=await cloudClient.from('sites').select('name,status').eq('company_id',cloudProfile.company_id).eq('status','active').order('name');
      if(error)throw error;
      return (data||[]).map(x=>x.name).filter(x=>!invalidSite(x));
    }catch(e){console.warn('現場マスター取得失敗',e);return []}
  }

  async function refreshNonRecordSiteSelectors(){
    const names=await loadActiveSites();
    if(!names.length)return;
    const fill=(sel,all)=>{if(!sel)return;const cur=sel.value;sel.innerHTML=(all?'<option value="">現場を選択</option>':'')+names.map(n=>`<option>${String(n).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</option>`).join('');if(cur&&names.includes(cur))sel.value=cur};
    fill(document.querySelector('#ledgerSite'),false);
    fill(document.querySelector('#siteSummarySelect'),true);
  }

  function installRecordFilters(){
    if(typeof recordFilters!=='function'||window.__moveRecordFiltersFixed5)return false;
    window.recordFilters=function(a){
      const q=(document.querySelector('#recordSearch')?.value||'').trim().toLowerCase();
      const site=document.querySelector('#recordSiteFilter')?.value||'';
      const writer=document.querySelector('#recordWriterFilter')?.value||'';
      const from=document.querySelector('#recordDateFrom')?.value||'';
      const to=document.querySelector('#recordDateTo')?.value||'';
      return (a||[]).filter(d=>{
        const moves=d.siteMoves||[];
        const hay=[d.site,d.writer,d.details,d.memo,...(d.workTypes||[]),...moves.flatMap(m=>[m?.site,m?.action,m?.waste,m?.disposal,m?.vehicle])].filter(Boolean).join(' ').toLowerCase();
        return(!q||hay.includes(q))&&(!site||d.site===site||moves.some(m=>m?.site===site))&&(!writer||d.writer===writer)&&(!from||String(d.date||'')>=from)&&(!to||String(d.date||'')<=to);
      });
    };
    window.__moveRecordFiltersFixed5=true;
    return true;
  }

  function installAsahiFix(){
    if(typeof window.cloudNormalizeReport!=='function'||window.__toyaAsahiRuntimeFixV3)return false;
    const old=window.cloudNormalizeReport;
    window.cloudNormalizeReport=function(r){
      const d=old(r);
      try{
        const full=(r&&r.report_data&&typeof r.report_data==='object')?r.report_data:{};
        if(Object.prototype.hasOwnProperty.call(full,'asahiCount'))d.asahiCount=Number(full.asahiCount??0);
        else d.asahiCount=Math.max(0,Number(r?.dispatch_count||0)-Number(full.meikenCount||0));
      }catch(e){d.asahiCount=Number(d.asahiCount||0)}
      return d;
    };
    window.__toyaAsahiRuntimeFixV3=true;
    return true;
  }

  function allCalendarReports(){
    const seen=new Set(),out=[];
    [...cloudReports(),...currentReports(),...localReports()].forEach(d=>{
      if(!d)return;
      const key=String(d.cloudId??d.id??'')+'|'+String(d.date||'')+'|'+String(d.site||'')+'|'+String(d.writer||'');
      if(seen.has(key))return;
      seen.add(key);out.push(d);
    });
    return out;
  }

  function installCalendarFix(){
    if(typeof window.selectRecordDate!=='function'||typeof window.renderRecordCalendar!=='function'||typeof window.rerenderRecordBrowser!=='function'||window.__toyaCalendarStableV1)return false;

    window.selectRecordDate=function(date){
      recordSelectedDate=date;
      const f=document.querySelector('#recordDateFrom'),t=document.querySelector('#recordDateTo');
      if(f)f.value=date;if(t)t.value=date;
      window.rerenderRecordBrowser();
    };

    const oldRerender=window.rerenderRecordBrowser;
    window.rerenderRecordBrowser=function(){
      const f=document.querySelector('#recordDateFrom')?.value||'';
      const t=document.querySelector('#recordDateTo')?.value||'';
      if(f&&f===t)recordSelectedDate=f;
      const out=oldRerender.apply(this,arguments);
      try{if(typeof recordViewMode!=='undefined'&&recordViewMode==='calendar')window.renderRecordCalendar(allCalendarReports())}catch(e){console.warn('カレンダー表示補正',e)}
      return out;
    };

    const oldRender=window.renderRecordBrowser;
    if(typeof oldRender==='function'){
      window.renderRecordBrowser=function(){
        const out=oldRender.apply(this,arguments);
        try{if(typeof recordViewMode!=='undefined'&&recordViewMode==='calendar')window.renderRecordCalendar(allCalendarReports())}catch(e){console.warn('カレンダー表示補正',e)}
        return out;
      };
    }

    window.__toyaCalendarStableV1=true;
    return true;
  }

  function installAll(){
    installRecordFilters();installAsahiFix();installCalendarFix();refreshNonRecordSiteSelectors();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(installAll,300));else setTimeout(installAll,300);
  let n=0;const timer=setInterval(()=>{n++;installAll();if(n>30)clearInterval(timer)},200);
  document.addEventListener('click',e=>{if(e.target?.closest?.('nav button'))setTimeout(refreshNonRecordSiteSelectors,400)});
})();
