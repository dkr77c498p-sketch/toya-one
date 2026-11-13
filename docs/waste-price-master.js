/* TOYA One 廃材処分単価マスター（税別） v1.3 前回選択・自動反映対応 */
(() => {
  'use strict';

  let wpmRows = [];
  let wpmLoaded = false;
  let wpmLoading = false;
  let wpmRestoring = false;
  let wpmCloudLast = null;

  const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const yen = (n) => '¥' + Math.round(Number(n || 0)).toLocaleString();
  const unitYen = (n) => '¥' + Number(n || 0).toLocaleString('ja-JP', {maximumFractionDigits: 6});
  const norm = (s) => String(s ?? '').normalize('NFKC').replace(/[\s　]/g,'');

  function wpmStorageKey(){
    return typeof cloudProfile !== 'undefined' && cloudProfile?.company_id ? `toya-waste-last:v1:${cloudProfile.company_id}` : '';
  }
  function wpmReadSaved(){
    try{const key=wpmStorageKey(),raw=key&&localStorage.getItem(key);const value=raw?JSON.parse(raw):null;return value&&typeof value==='object'?value:{};}catch{return {};}
  }
  function wpmRemember(){
    if(wpmRestoring) return;
    const key=wpmStorageKey(),fac=document.getElementById('wpmFacility'),rate=document.getElementById('wpmRate'),unit=document.getElementById('wpmQtyUnit');
    if(!key||!fac||!rate) return;
    try{localStorage.setItem(key,JSON.stringify({facility:fac.value,rateId:rate.value,unit:unit?.value||''}));}catch{}
  }
  function wpmLastWasteFromForm(){
    const rows=[...document.querySelectorAll('#items .item[data-is-waste="1"],#items .waste-item')],row=rows.at(-1);
    if(!row) return {};
    return {facility:row.querySelector('.i-company')?.value||'',item:(row.querySelector('.i-name')?.value||'').replace(/^産廃：/,'').replace(/（.*）$/,'')};
  }

  function wpmFindWasteCard(){
    const cards = [...document.querySelectorAll('#reportPage .card')];
    return cards.find(c => (c.querySelector('h2')?.textContent || '').includes('産業廃棄物')) || null;
  }

  function wpmEnsureUI(){
    const wasteCard = wpmFindWasteCard();
    if(!wasteCard) return;

    wasteCard.style.display = 'none';
    wasteCard.setAttribute('aria-hidden','true');

    if(document.getElementById('wastePriceCard')) return;

    const card = document.createElement('div');
    card.className = 'card no-print';
    card.id = 'wastePriceCard';
    card.innerHTML = `
      <h2>廃材処分単価（税別）</h2>
      <div class="note">処分場と品目を選ぶと、処分費を自動計算して日報へ追加できます。前回の処分場・品目を初期表示します。今回の搬入先・廃材が正しいか確認して追加してください。</div>
      <div class="grid2" style="margin-top:10px">
        <div><label>処分場</label><select id="wpmFacility"><option value="">読込中…</option></select></div>
        <div><label>品目・単価</label><select id="wpmRate"><option value="">処分場を選択</option></select></div>
      </div>
      <div class="grid2" style="margin-top:8px">
        <div><label>数量</label><input id="wpmQty" type="number" min="0" step="0.1" value="1"></div>
        <div><label>入力単位</label><select id="wpmQtyUnit"><option value="kg">kg</option><option value="t">t</option><option value="m3">m³</option><option value="vehicle">台</option><option value="piece">枚</option></select></div>
      </div>
      <div id="wpmCalc" class="row" style="margin-top:10px"><b>単価を選択してください。</b></div>
      <button id="wpmAdd" type="button" class="btn dark" style="width:100%;margin-top:10px" disabled>＋ この廃材を日報へ追加</button>
      <div class="note" style="margin-top:8px">追加後は処分場・品目・単価・金額を日報へ自動反映します。金額は税別。kg単価はt入力にも自動換算します（1t＝1,000kg）。</div>`;
    wasteCard.insertAdjacentElement('afterend', card);

    const fac = document.getElementById('wpmFacility');
    const rate = document.getElementById('wpmRate');
    const qty = document.getElementById('wpmQty');
    const unit = document.getElementById('wpmQtyUnit');
    const add = document.getElementById('wpmAdd');
    fac.addEventListener('change', () => {wpmRenderRates();wpmRemember();});
    rate.addEventListener('change', () => {wpmRenderCalc();wpmRemember();});
    qty.addEventListener('input', wpmRenderCalc);
    unit.addEventListener('change', () => {wpmRenderCalc();wpmRemember();});
    add.addEventListener('click', wpmAddToReport);
  }

  function wpmRateLabel(r){
    const vehicle = r.vehicle_class ? ` ${r.vehicle_class}` : '';
    return `${r.waste_type}${vehicle}｜${unitYen(r.unit_price)} / ${r.display_unit}`;
  }

  // Reuse only a real, previously saved waste row whose facility and item
  // exactly match an active master entry. Never invent a disposal destination.
  async function wpmCloudPrevious(){
    if(!cloudClient||!cloudProfile?.company_id)return null;
    const {data,error}=await cloudClient.from('daily_reports')
      .select('company_id,report_date,report_data')
      .eq('company_id',cloudProfile.company_id)
      .order('report_date',{ascending:false}).limit(80);
    if(error)throw error;
    for(const report of data||[]){
      if(report.company_id!==cloudProfile.company_id)continue;
      const items=Array.isArray(report.report_data?.items)?report.report_data.items:[];
      for(const item of [...items].reverse()){
        if(item?.isWaste!==true&&item?.isWaste!=='true')continue;
        const facility=String(item.company||'').trim();
        const itemName=norm(String(item.name||'').replace(/^産廃：/,''));
        const match=wpmRows.find(r=>r.active!==false&&r.facility===facility&&norm(r.waste_type+(r.vehicle_class?'（'+r.vehicle_class+'）':''))===itemName);
        if(match)return {facility:match.facility,rateId:String(match.id),item:match.waste_type,unit:item.unit||''};
      }
    }
    return null;
  }

  function wpmRenderFacilities(){
    const fac = document.getElementById('wpmFacility');
    if(!fac) return;
    const current = fac.value, saved=wpmReadSaved(), fromRow=wpmLastWasteFromForm();
    const names = [...new Set(wpmRows.map(r => r.facility).filter(Boolean))];
    fac.innerHTML = '<option value="">処分場を選択</option>' + names.map(n => `<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');
    const desired=names.includes(current)?current:names.includes(fromRow.facility)?fromRow.facility:names.includes(saved.facility)?saved.facility:names.includes(wpmCloudLast?.facility)?wpmCloudLast.facility:names.length===1?names[0]:'';
    fac.value=desired;
    const preferred=desired===fromRow.facility?fromRow.item:'';
    const preferredId=desired===saved.facility?saved.rateId:desired===wpmCloudLast?.facility?wpmCloudLast.rateId:'';
    wpmRenderRates(preferredId||'',preferred||wpmCloudLast?.item||'');
  }

  function wpmRenderRates(preferredId='',preferredItem=''){
    const fac = document.getElementById('wpmFacility');
    const rate = document.getElementById('wpmRate');
    if(!fac || !rate) return;
    const current=rate.value, rows = wpmRows.filter(r => r.facility === fac.value && r.active !== false);
    rate.innerHTML = rows.length
      ? '<option value="">品目を選択</option>' + rows.map(r => `<option value="${escHtml(r.id)}">${escHtml(wpmRateLabel(r))}</option>`).join('')
      : '<option value="">品目を選択</option>';
    let desired=rows.some(r=>String(r.id)===String(current))?current:rows.some(r=>String(r.id)===String(preferredId))?String(preferredId):'';
    if(!desired&&preferredItem){const matched=rows.find(r=>norm(r.waste_type)===norm(preferredItem)||norm(wpmRateLabel(r)).startsWith(norm(preferredItem)));if(matched)desired=String(matched.id);}
    if(!desired&&rows.length===1)desired=String(rows[0].id);
    rate.value=desired;
    const saved=wpmReadSaved(),unit=document.getElementById('wpmQtyUnit');
    wpmRenderCalc();
    if(unit&&saved.unit&&[...unit.options].some(option=>option.value===saved.unit)){wpmRestoring=true;unit.value=saved.unit;wpmRestoring=false;wpmRenderCalc();}
    wpmRemember();
  }

  function wpmSelected(){
    const id = document.getElementById('wpmRate')?.value;
    return wpmRows.find(r => String(r.id) === String(id)) || null;
  }

  function wpmSetAllowedUnit(r){
    const unit = document.getElementById('wpmQtyUnit');
    const qty = document.getElementById('wpmQty');
    if(!unit || !r) return;
    const allowed = r.rate_basis === 'kg' ? [['kg','kg'],['t','t']]
      : r.rate_basis === 'm3' ? [['m3','m³']]
      : r.rate_basis === 'piece' ? [['piece','枚']]
      : r.rate_basis === 'vehicle' ? [['vehicle','台']] : [];
    const previous = unit.value;
    const html = allowed.map(([value,label]) => `<option value="${value}">${label}</option>`).join('');
    if(unit.dataset.rateBasis !== r.rate_basis){
      unit.innerHTML = html;
      unit.dataset.rateBasis = r.rate_basis;
    }
    unit.value = allowed.some(([value]) => value === previous) ? previous : (allowed[0]?.[0] || '');
    if(qty) qty.step = r.rate_basis === 'piece' ? '1' : '0.1';
  }

  function wpmCalcAmount(r, qty, inputUnit){
    if(!r || !Number.isFinite(qty)) return 0;
    if(r.rate_basis === 'kg'){
      const kg = inputUnit === 't' ? qty * 1000 : qty;
      return kg * Number(r.unit_price || 0);
    }
    return qty * Number(r.unit_price || 0);
  }

  function wpmRenderCalc(){
    const r = wpmSelected();
    const box = document.getElementById('wpmCalc');
    const add = document.getElementById('wpmAdd');
    const qtyEl = document.getElementById('wpmQty');
    const unitEl = document.getElementById('wpmQtyUnit');
    if(!box || !add || !qtyEl || !unitEl) return;
    if(!r){
      box.innerHTML = '<b>単価を選択してください。</b>';
      add.disabled = true;
      return;
    }
    wpmSetAllowedUnit(r);
    const qty = Number(qtyEl.value || 0);
    const amount = wpmCalcAmount(r, qty, unitEl.value);
    const basisText = r.rate_basis === 'kg' ? 'kg' : r.rate_basis === 'm3' ? 'm³' : r.rate_basis === 'piece' ? '1枚' : (r.vehicle_class ? `${r.vehicle_class} 1台` : '1台');
    box.innerHTML = `<div><b>${escHtml(r.facility)}｜${escHtml(r.waste_type)}</b></div><div class="meta" style="margin-top:5px">単価：${unitYen(r.unit_price)} / ${escHtml(basisText)}（税別）</div><div style="font-size:20px;font-weight:900;margin-top:7px">処分費：${yen(amount)} <span style="font-size:12px;font-weight:700">税別</span></div>`;
    const valid = Number.isFinite(qty) && qty > 0 && !!unitEl.value && (r.rate_basis !== 'piece' || Number.isInteger(qty));
    add.disabled = !valid;
    if(r.rate_basis === 'piece' && qty > 0 && !Number.isInteger(qty)) box.innerHTML += '<div class="cloud-bad">枚数は1枚単位で入力してください。</div>';
  }

  function wpmAddToReport(){
    const r = wpmSelected();
    const qtyEl = document.getElementById('wpmQty');
    const unitEl = document.getElementById('wpmQtyUnit');
    if(!r || !qtyEl || !unitEl) return;
    const qty = Number(qtyEl.value || 0);
    if(!Number.isFinite(qty) || !(qty > 0) || !unitEl.value) return alert('数量を入力してください。');
    if(r.rate_basis === 'piece' && !Number.isInteger(qty)) return alert('枚数は1枚単位で入力してください。');
    const amount = wpmCalcAmount(r, qty, unitEl.value);
    const reportUnit = unitEl.value === 'm3' ? 'm³' : unitEl.value === 'vehicle' ? '台' : unitEl.value === 'piece' ? '枚' : unitEl.value;
    const name = r.vehicle_class ? `${r.waste_type}（${r.vehicle_class}）` : r.waste_type;
    if(typeof addItem !== 'function') return alert('日報入力を初期化できませんでした。');
    addItem({
      name: '産廃：' + name,
      unit: reportUnit,
      qty,
      price: Math.round(amount),
      company: r.facility,
      disposalSite: r.facility,
      isWaste: true,
      manifestType: 'none'
    });
    const rows = [...document.querySelectorAll('#items .item')];
    const last = rows[rows.length - 1];
    if(last){
      last.dataset.wpmRateBasis = r.rate_basis;
      last.dataset.wpmUnitPrice = String(r.unit_price);
      last.dataset.wpmFacility = r.facility || '';
      last.dataset.wpmRateId = String(r.id);
      const nameInput=last.querySelector('.i-name'),companyInput=last.querySelector('.i-company'),qtyInput=last.querySelector('.i-qty'),unitInput=last.querySelector('.i-unit'),priceInput=last.querySelector('.i-price');
      const recalc=()=>{
        if(!qtyInput||!unitInput||!priceInput)return;
        const q=Number(qtyInput.value||0),u=unitInput.value;
        const auto=wpmCalcAmount(r,q,u==='m³'?'m3':u==='台'?'vehicle':u==='枚'?'piece':u);
        priceInput.value=Number.isFinite(auto)?String(Math.round(auto)):'';
      };
      qtyInput?.addEventListener('input',recalc);
      unitInput?.addEventListener('input',recalc);
      for(const input of [nameInput,companyInput])if(input){input.readOnly=true;input.style.background='#f3f3f3';input.setAttribute('aria-label',(input===nameInput?'品目':'処分場')+'（単価マスターから自動反映）');}
      if(priceInput){priceInput.readOnly=true;priceInput.setAttribute('aria-label','処分金額（単価マスターから自動計算）');priceInput.style.background='#f3f3f3';}
      const tag = document.createElement('div');
      tag.className = 'note wpm-auto-note';
      tag.style.marginTop = '7px';
      tag.textContent = `自動反映｜処分場：${r.facility}｜品目：${name}｜単価：${unitYen(r.unit_price)}/${r.display_unit}（税別）｜数量変更で金額も自動変更`;
      last.appendChild(tag);
      recalc();
      last.scrollIntoView({behavior:'smooth', block:'center'});
    }
    wpmRemember();
    qtyEl.value='1';
    wpmRenderCalc();
  }

  async function wpmLoad(){
    if(wpmLoading || wpmLoaded) return;
    wpmEnsureUI();
    try{
      if(typeof cloudClient === 'undefined' || !cloudClient || typeof cloudProfile === 'undefined' || !cloudProfile){
        setTimeout(wpmLoad, 1200);
        return;
      }
      wpmLoading = true;
      const {data, error} = await cloudClient.from('waste_price_master')
        .select('id,facility,waste_type,rate_basis,unit_price,vehicle_class,display_unit,notes,active,sort_order')
        .eq('company_id', cloudProfile.company_id)
        .eq('active', true)
        .order('facility')
        .order('sort_order');
      if(error) throw error;
      wpmRows = data || [];
      wpmLoaded = true;
      try{wpmCloudLast=await wpmCloudPrevious();}catch(e){console.warn('前回の廃材を取得できませんでした。手動選択できます。',e);}
      wpmRestoring=true;
      wpmRenderFacilities();
      wpmRestoring=false;
      wpmRemember();
    }catch(e){
      console.error('廃材単価マスター読込エラー', e);
      const fac = document.getElementById('wpmFacility');
      if(fac) fac.innerHTML = '<option value="">単価表を読み込めませんでした</option>';
    }finally{
      wpmLoading = false;
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => {wpmEnsureUI(); wpmLoad();});
  else {wpmEnsureUI(); wpmLoad();}

  setTimeout(wpmLoad, 1500);
  setTimeout(wpmLoad, 3500);
})();
