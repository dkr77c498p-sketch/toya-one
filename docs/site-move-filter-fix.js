(function(){
  function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function invalidSite(x){return !x||['新しい現場','現場名をあとで変更','未登録現場'].includes(x)}
  function localSites(){try{return (window.LS&&typeof window.get==='function')?(get(LS.sites,[])||[]):[]}catch(e){return []}}
  function allKnownSites(data){
    const a=[];
    (data||window.cloudReportsCache||[]).forEach(d=>{if(d?.site)a.push(d.site);(d?.siteMoves||[]).forEach(m=>{if(m?.site)a.push(m.site)})});
    (window.cloudSitesCache||[]).forEach(s=>a.push(s?.name));
    localSites().forEach(s=>a.push(s));
    return [...new Set(a.filter(x=>!invalidSite(x)))].sort();
  }
  function moveMatches(d,site){return !!(d?.site===site||(d?.siteMoves||[]).some(m=>m&&m.site===site))}
  if(typeof window.updateRecordFilterOptions==='function'&&!window.__moveFilterOptionsFixed){
    const old=window.updateRecordFilterOptions;
    window.updateRecordFilterOptions=function(a){
      old(a);
      const site=document.querySelector('#recordSiteFilter'); if(!site)return;
      const current=site.value,names=allKnownSites(a);
      site.innerHTML='<option value="">全現場</option>'+names.map(n=>`<option>${esc(n)}</option>`).join('');
      if(current&&names.includes(current))site.value=current;
    };
    window.__moveFilterOptionsFixed=true;
  }
  if(typeof window.recordFilters==='function'&&!window.__moveRecordFiltersFixed){
    window.recordFilters=function(a){
      const q=(document.querySelector('#recordSearch')?.value||'').trim().toLowerCase();
      const site=document.querySelector('#recordSiteFilter')?.value||'';
      const writer=document.querySelector('#recordWriterFilter')?.value||'';
      const from=document.querySelector('#recordDateFrom')?.value||'';
      const to=document.querySelector('#recordDateTo')?.value||'';
      return (a||[]).filter(d=>{
        const moveText=(d.siteMoves||[]).flatMap(m=>[m.site,m.action,m.waste,m.disposal,m.vehicle]).filter(Boolean);
        const hay=[d.site,d.writer,d.details,d.memo,...(d.workTypes||[]),...moveText].join(' ').toLowerCase();
        return (!q||hay.includes(q))&&(!site||moveMatches(d,site))&&(!writer||d.writer===writer)&&(!from||String(d.date||'')>=from)&&(!to||String(d.date||'')<=to);
      });
    };
    window.__moveRecordFiltersFixed=true;
  }
  if(typeof window.populateLedgerSites==='function'&&!window.__moveLedgerSitesFixed){
    window.populateLedgerSites=function(){
      const sel=document.querySelector('#ledgerSite'); if(!sel)return;
      const reports=window.cloudProfile?(window.cloudReportsCache||[]):((window.LS&&typeof window.get==='function')?get(LS.reports,[]):[]);
      const current=sel.value,names=allKnownSites(reports);
      sel.innerHTML=names.map(n=>`<option>${esc(n)}</option>`).join('');
      if(current&&names.includes(current))sel.value=current;
    };
    window.__moveLedgerSitesFixed=true;
  }
  if(typeof window.cloudSaveReport==='function'&&!window.__moveCloudSaveFixed){
    const oldSave=window.cloudSaveReport;
    window.cloudSaveReport=async function(d){
      if(typeof window.collectSiteMoves==='function'&&(!Array.isArray(d.siteMoves)||!d.siteMoves.length))d.siteMoves=collectSiteMoves();
      for(const m of (d.siteMoves||[])){
        if(m?.site&&!invalidSite(m.site)&&typeof window.cloudEnsureSite==='function'){
          try{await cloudEnsureSite(m.site)}catch(e){console.warn('移動先現場のクラウド登録に失敗',e)}
        }
      }
      return oldSave(d);
    };
    window.__moveCloudSaveFixed=true;
  }
  function refresh(){
    try{window.updateRecordFilterOptions?.(window.currentRecordsData||window.cloudReportsCache||[])}catch(e){}
    try{window.populateLedgerSites?.()}catch(e){}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(refresh,200));else setTimeout(refresh,200);
  document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>setTimeout(refresh,150)));
})();