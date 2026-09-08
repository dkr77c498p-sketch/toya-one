/* TOYA One 廃材処分単価マスター（税別） v1.0 */
(() => {
  'use strict';

  let wpmRows = [];
  let wpmLoaded = false;
  let wpmLoading = false;

  const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const yen = (n) => '¥' + Math.round(Number(n || 0)).toLocaleString();

  function wpmFindWasteCard(){
    const cards = [...document.querySelectorAll('#reportPage .card')];
    return cards.find(c => (c.querySelector('h2')?.textContent || '').includes('産業廃棄物')) || null;
  }

  function wpmEnsureUI(){
    if(document.getElementById('wastePriceCard')) return;
    const wasteCard = wpmFindWasteCard();
    if(!wasteCard) return;

    const card = document.createElement('div');
    card.className = 'card no-print';
    card.id = 'wastePriceCard';
    card.innerHTML = `
      <h2>廃材処分単価（税別）</h2>
      <div class="note">処分場と品目を選ぶと、処分費を自動計算して日報へ追加できます。</div>
      <div class="grid2" style="margin-top:10px">
        <div><label>処分場</label><select id="wpmFacility"><option value="">読込中…</option></select></div>
        <div><label>品目・単価</label><select id="wpmRate"><option value="">処分場を選択</option></select></div>
      </div>
      <div class="grid2" style="margin-top:8px">
        <div><label>数量</label><input id="wpmQty" type="number" min="0" step="0.1" value="1"></div>
        <div><label>入力単位</label><select id="wpmQtyUnit"><option value="kg">kg</option><option value="t">t</option><option value="m3">m³</option><option value="vehicle">台</option></select></div>
      </div>
      <div id="wpmCalc" class="row" style="margin-top:10px"><b>単価を選択してください。</b></div>
      <button id="wpmAdd" type="button" class="btn dark" style="width:100%;margin-top:10px" disabled>＋ この廃材を日報へ追加</button>
      <div class="note" style="margin-top:8px">金額はすべて税別。kg単価はt入力にも自動換算します（1t＝1,000kg）。</div>`;
    wasteCard.insertAdjacentElement('afterend', card);

    const fac = document.getElementById('wpmFacility');
    const rate = document.getElementById('wpmRate');
    const qty = document.getElementById('wpmQty');
    const unit = document.getElementById('wpmQtyUnit');
    const add = document.getElementById('wpmAdd');
    fac.addEventListener('change', wpmRenderRates);
    rate.addEventListener('change', wpmRenderCalc);
    qty.addEventListener('input', wpmRenderCalc);
    unit.addEventListener('change', wpmRenderCalc);
    add.addEventListener('click', wpmAddToReport);
  }

  function wpmRateLabel(r){
    const vehicle = r.vehicle_class ? ` ${r.vehicle_class}` : '';
    return `${r.waste_type}${vehicle}｜${yen(r.unit_price)} / ${r.display_unit}`;
  }

  function wpmRenderFacilities(){
    const fac = document.getElementById('wpmFacility');
    if(!fac) return;
    const current = fac.value;
    const names = [...new Set(wpmRows.map(r => r.facility).filter(Boolean))];
    fac.innerHTML = '<option value="">処分場を選択</option>' + names.map(n => `<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');
    if(names.includes(current)) fac.value = current;
    wpmRenderRates();
  }

  function wpmRenderRates(){
    const fac = document.getElementById('wpmFacility');
    const rate = document.getElementById('wpmRate');
    if(!fac || !rate) return;
    const rows = wpmRows.filter(r => r.facility === fac.value && r.active !== false);
    rate.innerHTML = rows.length
      ? '<option value="">品目を選択</option>' + rows.map(r => `<option value="${escHtml(r.id)}">${escHtml(wpmRateLabel(r))}</option>`).join('')
      : '<option value="">品目を選択</option>';
    wpmRenderCalc();
  }

  function wpmSelected(){
    const id = document.getElementById('wpmRate')?.value;
    return wpmRows.find(r => String(r.id) === String(id)) || null;
  }

  function wpmSetAllowedUnit(r){
    const unit = document.getElementById('wpmQtyUnit');
    if(!unit || !r) return;
    if(r.rate_basis === 'kg'){
      unit.innerHTML = '<option value="kg">kg</option><option value="t">t</option>';
      if(unit.value !== 'kg' && unit.value !== 't') unit.value = 't';
      else if(!unit.dataset.userChosen) unit.value = 't';
    }else if(r.rate_basis === 'm3'){
      unit.innerHTML = '<option value="m3">m³</option>';
      unit.value = 'm3';
    }else{
      unit.innerHTML = '<option value="vehicle">台</option>';
      unit.value = 'vehicle';
    }
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
    const basisText = r.rate_basis === 'kg' ? 'kg' : r.rate_basis === 'm3' ? 'm³' : (r.vehicle_class ? `${r.vehicle_class} 1台` : '1台');
    box.innerHTML = `<div><b>${escHtml(r.facility)}｜${escHtml(r.waste_type)}</b></div><div class="meta" style="margin-top:5px">単価：${yen(r.unit_price)} / ${escHtml(basisText)}（税別）</div><div style="font-size:20px;font-weight:900;margin-top:7px">処分費：${yen(amount)} <span style="font-size:12px;font-weight:700">税別</span></div>`;
    add.disabled = !(qty > 0);
  }

  function wpmAddToReport(){
    const r = wpmSelected();
    const qtyEl = document.getElementById('wpmQty');
    const unitEl = document.getElementById('wpmQtyUnit');
    if(!r || !qtyEl || !unitEl) return;
    const qty = Number(qtyEl.value || 0);
    if(!(qty > 0)) return alert('数量を入力してください。');
    const amount = wpmCalcAmount(r, qty, unitEl.value);
    const reportUnit = unitEl.value === 'm3' ? 'm³' : unitEl.value === 'vehicle' ? '台' : unitEl.value;
    const name = r.vehicle_class ? `${r.waste_type}（${r.vehicle_class}）` : r.waste_type;
    if(typeof addItem !== 'function') return alert('日報入力を初期化できませんでした。');
    addItem({
      name: '産廃：' + name,
      unit: reportUnit,
      qty,
      price: Math.round(amount),
      company: r.facility,
      isWaste: true,
      manifestType: 'none'
    });
    const rows = [...document.querySelectorAll('#items .item')];
    const last = rows[rows.length - 1];
    if(last){
      const tag = document.createElement('div');
      tag.className = 'note';
      tag.style.marginTop = '7px';
      tag.textContent = `処分単価：${r.facility} ${yen(r.unit_price)}/${r.display_unit}（税別）`;
      last.appendChild(tag);
      last.scrollIntoView({behavior:'smooth', block:'center'});
    }
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
      wpmRenderFacilities();
    }catch(e){
      console.error('廃材単価マスター読込エラー', e);
      const fac = document.getElementById('wpmFacility');
      if(fac) fac.innerHTML = '<option value="">単価表を読み込めませんでした</option>';
    }finally{
      wpmLoading = false;
    }
  }

  document.addEventListener('change', (e) => {
    if(e.target && e.target.id === 'wpmQtyUnit') e.target.dataset.userChosen = '1';
  });

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => {wpmEnsureUI(); wpmLoad();});
  else {wpmEnsureUI(); wpmLoad();}

  setTimeout(wpmLoad, 1500);
  setTimeout(wpmLoad, 3500);
})();
