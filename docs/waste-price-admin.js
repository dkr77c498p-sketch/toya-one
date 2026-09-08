/* TOYA One 廃材単価 登録管理 v1.0 */
(() => {
  'use strict';

  const $ = (s, r=document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let rows = [];

  function readyAdmin(){
    return typeof cloudClient !== 'undefined' && cloudClient && typeof cloudProfile !== 'undefined' && cloudProfile && cloudProfile.role === 'admin';
  }

  function ensureCard(){
    if(!readyAdmin()) return null;
    const page = document.getElementById('masterPage');
    if(!page) return null;
    let card = document.getElementById('wpaCard');
    if(card) return card;
    card = document.createElement('div');
    card.id = 'wpaCard';
    card.className = 'card';
    card.innerHTML = `
      <h2>廃材処分単価</h2>
      <div class="note">ここから処分場・品目・単価を追加／変更できます。金額はすべて税別です。</div>
      <div class="row" style="margin-top:10px">
        <div class="rowhead"><b>新しい単価を追加</b></div>
        <div class="grid2"><div><label>処分場</label><input id="wpaNewFacility" placeholder="例：田上リサイクル"></div><div><label>品目</label><input id="wpaNewWaste" placeholder="例：コンクリート無筋"></div></div>
        <div class="grid3"><div><label>単価区分</label><select id="wpaNewBasis"><option value="kg">kg</option><option value="m3">m³</option><option value="vehicle">車両1台</option></select></div><div><label>税別単価</label><input id="wpaNewPrice" type="number" min="0" step="0.01"></div><div><label>車両</label><input id="wpaNewVehicle" placeholder="例：10tダンプ"></div></div>
        <label>表示単位</label><input id="wpaNewDisplay" placeholder="例：1kg / 1m³ / 10tダンプ 1台">
        <button id="wpaAdd" type="button" class="btn dark" style="width:100%;margin-top:10px">＋ 単価を追加</button>
      </div>
      <div style="margin-top:14px"><div class="rowhead"><b>登録済み単価</b><button id="wpaReload" type="button" class="btn light">再読み込み</button></div><div id="wpaList" style="margin-top:8px"><div class="empty">読み込み中…</div></div></div>
      <div id="wpaStatus" class="status" style="margin-top:10px"></div>`;
    page.appendChild(card);
    $('#wpaAdd').addEventListener('click', addRow);
    $('#wpaReload').addEventListener('click', loadRows);
    return card;
  }

  function status(msg){
    const el = document.getElementById('wpaStatus');
    if(!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(()=>{el.style.display='none';},3000);
  }

  async function loadRows(){
    if(!readyAdmin()) return;
    ensureCard();
    const box = document.getElementById('wpaList');
    if(box) box.innerHTML = '<div class="empty">読み込み中…</div>';
    const {data,error} = await cloudClient.from('waste_price_master')
      .select('id,facility,waste_type,rate_basis,unit_price,vehicle_class,display_unit,notes,active,sort_order')
      .eq('company_id', cloudProfile.company_id)
      .order('facility').order('sort_order');
    if(error){ if(box) box.innerHTML = `<div class="cloud-bad">読込エラー：${esc(error.message)}</div>`; return; }
    rows = data || [];
    renderRows();
  }

  function renderRows(){
    const box = document.getElementById('wpaList');
    if(!box) return;
    if(!rows.length){ box.innerHTML='<div class="empty">登録がありません。</div>'; return; }
    box.innerHTML = rows.map((r,i)=>`
      <div class="row" data-wpa-id="${esc(r.id)}">
        <div class="rowhead"><b>${esc(r.facility)}｜${esc(r.waste_type)}</b><button type="button" class="btn danger" data-wpa-delete="${i}">削除</button></div>
        <div class="grid2"><div><label>処分場</label><input data-k="facility" value="${esc(r.facility)}"></div><div><label>品目</label><input data-k="waste_type" value="${esc(r.waste_type)}"></div></div>
        <div class="grid3"><div><label>単価区分</label><select data-k="rate_basis"><option value="kg" ${r.rate_basis==='kg'?'selected':''}>kg</option><option value="m3" ${r.rate_basis==='m3'?'selected':''}>m³</option><option value="vehicle" ${r.rate_basis==='vehicle'?'selected':''}>車両1台</option></select></div><div><label>税別単価</label><input data-k="unit_price" type="number" min="0" step="0.01" value="${Number(r.unit_price||0)}"></div><div><label>車両</label><input data-k="vehicle_class" value="${esc(r.vehicle_class||'')}"></div></div>
        <div class="grid2"><div><label>表示単位</label><input data-k="display_unit" value="${esc(r.display_unit||'')}"></div><div><label>表示</label><select data-k="active"><option value="true" ${r.active!==false?'selected':''}>有効</option><option value="false" ${r.active===false?'selected':''}>停止</option></select></div></div>
        <button type="button" class="btn dark" style="width:100%;margin-top:9px" data-wpa-save="${i}">変更を保存</button>
      </div>`).join('');
    box.querySelectorAll('[data-wpa-save]').forEach(b=>b.addEventListener('click',()=>saveRow(Number(b.dataset.wpaSave))));
    box.querySelectorAll('[data-wpa-delete]').forEach(b=>b.addEventListener('click',()=>deleteRow(Number(b.dataset.wpaDelete))));
  }

  async function addRow(){
    if(!readyAdmin()) return alert('管理者でログインしてください。');
    const facility = $('#wpaNewFacility').value.trim();
    const waste = $('#wpaNewWaste').value.trim();
    const basis = $('#wpaNewBasis').value;
    const price = Number($('#wpaNewPrice').value || 0);
    const vehicle = $('#wpaNewVehicle').value.trim();
    let display = $('#wpaNewDisplay').value.trim();
    if(!facility || !waste) return alert('処分場と品目を入力してください。');
    if(!(price >= 0)) return alert('単価を入力してください。');
    if(!display) display = basis==='kg' ? '1kg' : basis==='m3' ? '1m³' : (vehicle ? `${vehicle} 1台` : '1台');
    const row = {company_id:cloudProfile.company_id,facility,waste_type:waste,rate_basis:basis,unit_price:price,vehicle_class:vehicle||null,display_unit:display,active:true,sort_order:999,notes:'税別'};
    const {error} = await cloudClient.from('waste_price_master').insert(row);
    if(error) return alert('追加できませんでした：'+error.message);
    $('#wpaNewWaste').value=''; $('#wpaNewPrice').value=''; $('#wpaNewVehicle').value=''; $('#wpaNewDisplay').value='';
    status('追加しました。日報入力は再読み込みすると反映されます。');
    await loadRows();
  }

  async function saveRow(i){
    const r = rows[i]; if(!r) return;
    const el = document.querySelector(`[data-wpa-id="${CSS.escape(String(r.id))}"]`); if(!el) return;
    const v = k => el.querySelector(`[data-k="${k}"]`)?.value ?? '';
    const patch = {facility:v('facility').trim(),waste_type:v('waste_type').trim(),rate_basis:v('rate_basis'),unit_price:Number(v('unit_price')||0),vehicle_class:v('vehicle_class').trim()||null,display_unit:v('display_unit').trim(),active:v('active')==='true',updated_at:new Date().toISOString()};
    if(!patch.facility || !patch.waste_type) return alert('処分場と品目を入力してください。');
    const {error} = await cloudClient.from('waste_price_master').update(patch).eq('id',r.id).eq('company_id',cloudProfile.company_id);
    if(error) return alert('保存できませんでした：'+error.message);
    status('変更を保存しました。日報入力は再読み込みすると反映されます。');
    await loadRows();
  }

  async function deleteRow(i){
    const r = rows[i]; if(!r) return;
    if(!confirm(`${r.facility}｜${r.waste_type} を削除しますか？`)) return;
    const {error} = await cloudClient.from('waste_price_master').delete().eq('id',r.id).eq('company_id',cloudProfile.company_id);
    if(error) return alert('削除できませんでした：'+error.message);
    status('削除しました。');
    await loadRows();
  }

  function boot(){
    if(!readyAdmin()){ setTimeout(boot,1200); return; }
    ensureCard();
    loadRows();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
