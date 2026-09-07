(function(){
  function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function invalidSite(x){return !x||['新しい現場','現場名をあとで変更','未登録現場'].includes(x)}
  function localReports(){try{return (typeof LS!=='undefined'&&typeof get==='function')?(get(LS.reports,[])||[]):[]}catch(e){return []}}
  function localSites(){try{return (typeof LS!=='undefined'&&typeof get==='function')?(get(LS.sites,[])||[]):[]}catch(e){return []}}
  function cloudReports(){try{return (typeof cloudReportsCache!=='undefined'&&Array.isArray(cloudReportsCache))?cloudReportsCache:[]}catch(e){return []}}
  function currentReports(){try{return (typeof currentRecordsData!=='undefined'&&Array.isArray(currentRecordsData))?currentRecordsData:[]}catch(e){return []}}
  let masterSites=[];
  function allKnownSites(data){const a=[...masterSites];const sources=[...(data||[]),...cloudReports(),...currentReports(),...localReports()];sources.forEach(d=>{if(d?.site)a.push(d.site);(d?.siteMoves||[]).forEach(m=>{if(m?.site)a.push(m.site)})});localSites().forEach(s=>a.push(typeof s==='string'?s:s?.name));return [...new Set(a.filter(x=>!invalidSite(x)))].sort()}
  async function loadMasterSites(){
    try{
      if(typeof cloudClient==='undefined'||!cloudClient||typeof cloudProfile==='undefined'||!cloudProfile?.company_id)return;
      const {data,error}=await cloudClient.from('sites').select('name,status').eq('company_id',cloudProfile.company_id).eq('status','active').order('name');
      if(error)throw error;
      masterSites=(data||[]).map(x=>x.name).filter(x=>!invalidSite(x));
    }catch(e){console.warn('現場マスター取得失敗',e)}
  }
  function fillSelect(sel,names,all){if(!sel)return;const cur=sel.value;sel.innerHTML=(all?'<option value="">全現場</option>':'')+names.map(n=>`<option>${esc(n)}</option>`).join('');if(cur&&names.includes(cur))sel.value=cur}
  function refresh(){const names=allKnownSites(currentReports().length?currentReports():cloudReports());fillSelect(document.querySelector('#recordSiteFilter'),names,true);fillSelect(document.querySelector('#ledgerSite'),names,false)}
  async function refreshAll(){await loadMasterSites();refresh()}
  if(typeof recordFilters==='function'&&!window.__moveRecordFiltersFixed4){window.recordFilters=function(a){const q=(document.querySelector('#recordSearch')?.value||'').trim().toLowerCase(),site=document.querySelector('#recordSiteFilter')?.value||'',writer=document.querySelector('#recordWriterFilter')?.value||'',from=document.querySelector('#recordDateFrom')?.value||'',to=document.querySelector('#recordDateTo')?.value||'';return (a||[]).filter(d=>{const moves=d.siteMoves||[],hay=[d.site,d.writer,d.details,d.memo,...(d.workTypes||[]),...moves.flatMap(m=>[m?.site,m?.action,m?.waste,m?.disposal,m?.vehicle])].filter(Boolean).join(' ').toLowerCase();return(!q||hay.includes(q))&&(!site||d.site===site||moves.some(m=>m?.site===site))&&(!writer||d.writer===writer)&&(!from||String(d.date||'')>=from)&&(!to||String(d.date||'')<=to)});};window.__moveRecordFiltersFixed4=true}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(refreshAll,800));else setTimeout(refreshAll,800);
  document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>setTimeout(refreshAll,350)));
  setTimeout(refreshAll,2200);
})();\n\n/* TOYA_ASAHI_RUNTIME_FIX_V2 */\n(function(){\n  function installAsahiFix(){\n    if(typeof window.cloudNormalizeReport!=='function'||window.__toyaAsahiRuntimeFixV2)return false;\n    const old=window.cloudNormalizeReport;\n    window.cloudNormalizeReport=function(r){\n      const d=old(r);\n      try{\n        const full=(r&&r.report_data&&typeof r.report_data==='object')?r.report_data:{};\n        if(Object.prototype.hasOwnProperty.call(full,'asahiCount')){\n          d.asahiCount=Number(full.asahiCount??0);\n        }else{\n          d.asahiCount=Math.max(0,Number(r?.dispatch_count||0)-Number(full.meikenCount||0));\n        }\n      }catch(e){d.asahiCount=Number(d.asahiCount||0)}\n      return d;\n    };\n    window.__toyaAsahiRuntimeFixV2=true;\n    setTimeout(()=>{try{if(window.cloudProfile&&typeof window.cloudLoadReports==='function')window.cloudLoadReports()}catch(e){}},250);\n    return true;\n  }\n  if(!installAsahiFix()){\n    let n=0;const t=setInterval(()=>{n++;if(installAsahiFix()||n>40)clearInterval(t)},100);\n  }\n})();\n