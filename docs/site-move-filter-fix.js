(function(){
  function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function invalidSite(x){return !x||['新しい現場','現場名をあとで変更','未登録現場'].includes(x)}
  function localReports(){try{return (typeof LS!=='undefined'&&typeof get==='function')?(get(LS.reports,[])||[]):[]}catch(e){return []}}
  function localSites(){try{return (typeof LS!=='undefined'&&typeof get==='function')?(get(LS.sites,[])||[]):[]}catch(e){return []}}
  function cloudReports(){try{return (typeof cloudReportsCache!=='undefined'&&Array.isArray(cloudReportsCache))?cloudReportsCache:[]}catch(e){return []}}
  function cloudSites(){try{return (typeof cloudSitesCache!=='undefined'&&Array.isArray(cloudSitesCache))?cloudSitesCache:[]}catch(e){return []}}
  function currentReports(){try{return (typeof currentRecordsData!=='undefined'&&Array.isArray(currentRecordsData))?currentRecordsData:[]}catch(e){return []}}
  function allKnownSites(data){
    const a=[];
    const sources=[...(data||[]),...cloudReports(),...currentReports(),...localReports()];
    sources.forEach(d=>{if(d&&d.site)a.push(d.site);(d&&Array.isArray(d.siteMoves)?d.siteMoves:[]).forEach(m=>{if(m&&m.site)a.push(m.site)})});
    cloudSites().forEach(s=>a.push(s&&s.name));
    localSites().forEach(s=>a.push(typeof s==='string'?s:(s&&s.name)));
    return [...new Set(a.filter(x=>!invalidSite(x)))].sort();
  }
  function moveMatches(d,site){return !!(d&&((d.site===site)||(Array.isArray(d.siteMoves)&&d.siteMoves.some(m=>m&&m.site===site))))}

  if(typeof updateRecordFilterOptions==='function'&&!window.__moveFilterOptionsFixed2){
    const old=updateRecordFilterOptions;
    window.updateRecordFilterOptions=function(a){
      old(a);
      const site=document.querySelector('#recordSiteFilter'); if(!site)return;
      const current=site.value,names=allKnownSites(a||[]);
      site.innerHTML='<option value="">全現場</option>'+names.map(n=>`<option>${esc(n)}</option>`).join('');
      if(current&&names.includes(current))site.value=current;
    };
    window.__moveFilterOptionsFixed2=true;
  }

  if(typeof recordFilters==='function'&&!window.__moveRecordFiltersFixed2){
    window.recordFilters=function(a){
      const q=(document.querySelector('#recordSearch')?.value||'').trim().toLowerCase();
      const site=document.querySelector('#recordSiteFilter')?.value||'';
      const writer=document.querySelector('#recordWriterFilter')?.value||'';
      const from=document.querySelector('#recordDateFrom')?.value||'';
      const to=document.querySelector('#recordDateTo')?.value||'';
      return (a||[]).filter(d=>{
        const moveText=(Array.isArray(d.siteMoves)?d.siteMoves:[]).flatMap(m=>[m?.site,m?.action,m?.waste,m?.disposal,m?.vehicle]).filter(Boolean);
        const hay=[d.site,d.writer,d.details,d.memo,...(d.workTypes||[]),...moveText].join(' ').toLowerCase();
        return (!q||hay.includes(q))&&(!site||moveMatches(d,site))&&(!writer||d.writer===writer)&&(!from||String(d.date||'')>=from)&&(!to||String(d.date||'')<=to);
      });
    };
    window.__moveRecordFiltersFixed2=true;
  }

  if(typeof populateLedgerSites==='function'&&!window.__moveLedgerSitesFixed2){
    window.populateLedgerSites=function(){
      const sel=document.querySelector('#ledgerSite'); if(!sel)return;
      const current=sel.value,names=allKnownSites([]);
      sel.innerHTML=names.map(n=>`<option>${esc(n)}</option>`).join('');
      if(current&&names.includes(current))sel.value=current;
    };
    window.__moveLedgerSitesFixed2=true;
  }

  function refresh(){
    try{updateRecordFilterOptions(currentReports().length?currentReports():cloudReports())}catch(e){console.warn('現場絞り込み更新失敗',e)}
    try{populateLedgerSites()}catch(e){console.warn('写真台帳現場更新失敗',e)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(refresh,500));else setTimeout(refresh,500);
  document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>setTimeout(refresh,300)));
  setTimeout(refresh,1500);
})();