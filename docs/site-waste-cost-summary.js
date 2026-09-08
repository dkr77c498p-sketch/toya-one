/* TOYA One 現場別 廃材・処分費集計 v1.1 */
(() => {
  'use strict';

  const yen = n => '¥' + Math.round(Number(n || 0)).toLocaleString();
  const html = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const isWaste = x => !!(x && (x.isWaste || String(x.name || '').startsWith('産廃：')));
  const cleanName = x => String(x?.name || '産廃').replace(/^産廃：/, '') || '産廃';

  function getCloudReports(){
    try{
      return (typeof cloudReportsCache !== 'undefined' && Array.isArray(cloudReportsCache)) ? cloudReportsCache : [];
    }catch(e){ return []; }
  }

  function getCloudSites(){
    try{
      return (typeof cloudSitesCache !== 'undefined' && Array.isArray(cloudSitesCache)) ? cloudSitesCache : [];
    }catch(e){ return []; }
  }

  function buildRows(site){
    const reports = getCloudReports();
    const mine = reports.filter(d => String(d.site || '') === String(site || ''));
    const rows = [];
    mine.forEach(d => {
      (Array.isArray(d.items) ? d.items : []).forEach(x => {
        if(!isWaste(x)) return;
        rows.push({
          date: d.date || '',
          name: cleanName(x),
          unit: x.unit || '',
          qty: Number(x.qty ?? x.quantity ?? 0),
          amount: Number(x.price || 0),
          facility: x.company || '処分場未設定'
        });
      });
    });
    return rows;
  }

  async function ensureSiteOptions(){
    const sel = document.getElementById('siteSummarySelect');
    if(!sel) return false;

    let sites = getCloudSites().filter(x => x && x.status !== 'inactive' && x.name);

    if(!sites.length){
      try{
        if(typeof cloudClient !== 'undefined' && cloudClient && typeof cloudProfile !== 'undefined' && cloudProfile?.company_id){
          const {data,error} = await cloudClient.from('sites')
            .select('id,name,status')
            .eq('company_id', cloudProfile.company_id)
            .neq('status','inactive')
            .order('name');
          if(!error && Array.isArray(data)) sites = data.filter(x => x?.name);
        }
      }catch(e){ console.warn('現場別集計の現場取得に失敗', e); }
    }

    const names = [...new Set(sites.map(x => String(x.name || '').trim()).filter(Boolean))];
    if(!names.length) return false;

    const current = sel.value;
    const existing = [...sel.options].map(o => o.value).filter(Boolean);
    const same = existing.length === names.length && names.every(n => existing.includes(n));
    if(!same){
      sel.innerHTML = '<option value="">現場を選択</option>' + names.map(n => `<option value="${html(n)}">${html(n)}</option>`).join('');
    }
    if(current && names.includes(current)) sel.value = current;
    else if(!sel.value && names.length === 1) sel.value = names[0];
    return true;
  }

  function renderWasteCostSummary(){
    const body = document.getElementById('siteSummaryBody');
    const sel = document.getElementById('siteSummarySelect');
    if(!body || !sel || !sel.value) return;

    const old = document.getElementById('siteWasteCostSummary');
    if(old) old.remove();

    const rows = buildRows(sel.value);
    const total = rows.reduce((s,x) => s + Number(x.amount || 0), 0);

    const byItem = {};
    rows.forEach(x => {
      const key = `${x.name}__${x.unit}`;
      if(!byItem[key]) byItem[key] = {name:x.name, unit:x.unit, qty:0, amount:0, count:0};
      byItem[key].qty += Number(x.qty || 0);
      byItem[key].amount += Number(x.amount || 0);
      byItem[key].count++;
    });

    const byFacility = {};
    rows.forEach(x => {
      const k = x.facility || '処分場未設定';
      if(!byFacility[k]) byFacility[k] = {amount:0, count:0};
      byFacility[k].amount += Number(x.amount || 0);
      byFacility[k].count++;
    });

    const itemHtml = Object.values(byItem).length
      ? Object.values(byItem).sort((a,b)=>b.amount-a.amount || b.qty-a.qty).map(v =>
          `<div class="record" style="padding:9px;margin-bottom:6px"><b>${html(v.name)}</b><div class="meta" style="margin:3px 0 0">${Number(v.qty).toLocaleString(undefined,{maximumFractionDigits:2})}${html(v.unit)} ／ ${v.count}件 ／ 処分費 ${yen(v.amount)}</div></div>`
        ).join('')
      : '<div class="meta">この現場には廃材処分の登録がまだありません。</div>';

    const facilityHtml = Object.keys(byFacility).length
      ? Object.entries(byFacility).sort((a,b)=>b[1].amount-a[1].amount).map(([k,v]) =>
          `<div class="record" style="padding:9px;margin-bottom:6px"><b>${html(k)}</b><div class="meta" style="margin:3px 0 0">${v.count}件 ／ ${yen(v.amount)}</div></div>`
        ).join('')
      : '<div class="meta">処分場の登録はまだありません。</div>';

    const wrap = document.createElement('div');
    wrap.id = 'siteWasteCostSummary';
    wrap.innerHTML = `
      <div style="margin-top:14px;border-top:2px solid #e5e5e5;padding-top:14px">
        <h3 style="margin:0 0 10px;font-size:16px">産廃・処分費</h3>
        <div class="statgrid">
          <div class="stat"><b>${rows.length}</b><span>廃材登録 件</span></div>
          <div class="stat"><b>${yen(total)}</b><span>処分費合計（税別）</span></div>
        </div>
        <div class="note" style="margin-top:8px">日報の「材料・処分・経費」に登録された廃材だけを集計します。単価未入力の過去日報は数量には含みますが処分費は0円扱いです。</div>
        <div style="margin-top:12px"><b>品目別</b><div style="margin-top:7px">${itemHtml}</div></div>
        <div style="margin-top:12px"><b>処分場別</b><div style="margin-top:7px">${facilityHtml}</div></div>
      </div>`;
    body.appendChild(wrap);
  }

  async function refreshAll(){
    const ok = await ensureSiteOptions();
    if(ok){
      const sel = document.getElementById('siteSummarySelect');
      if(sel?.value && typeof renderSiteSummary === 'function'){
        try { renderSiteSummary(); } catch(e) {}
      }
      try { renderWasteCostSummary(); } catch(e) {}
    }
  }

  function install(){
    if(window.__toyaWasteCostSummaryInstalled) return;
    if(typeof renderSiteSummary !== 'function') { setTimeout(install, 700); return; }
    window.__toyaWasteCostSummaryInstalled = true;
    const original = renderSiteSummary;
    window.renderSiteSummary = function(...args){
      const out = original.apply(this, args);
      Promise.resolve().then(async()=>{
        try { await ensureSiteOptions(); renderWasteCostSummary(); } catch(e) { console.error('現場別処分費集計', e); }
      });
      return out;
    };
    refreshAll();
    setTimeout(refreshAll, 1200);
    setTimeout(refreshAll, 3000);
    setTimeout(refreshAll, 6000);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
