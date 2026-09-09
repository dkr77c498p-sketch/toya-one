/* TOYA One equipment transport v1. One machine, one way. No auth or DB writes.
 * Transport choices use existing daily-report items; blank price means automatic,
 * explicit price (including zero) means an administrator's fixed row total.
 */
(() => {
  'use strict';
  const prefix = '重機回送：';
  const norm = v => String(v ?? '').normalize('NFKC').replace(/[\s　]/g, '').toLowerCase();
  const machineKey = v => ['sk55', 'sk55sr'].includes(norm(v)) ? 'sk55' : norm(v);
  const numeric = v => v == null || String(v).trim() === '' || typeof v === 'boolean' ? null : Number(v);
  const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
  function parse(item) {
    const name = String(item?.name || '');
    if (!name.startsWith(prefix)) return null;
    const parts = name.slice(prefix.length).split(/[｜|]/).map(s => s.trim());
    return parts.length === 3 && parts.every(Boolean) ? {carrier:parts[0],machine:parts[1],distance:parts[2]} : {invalid:true};
  }
  function encode(rate) {
    const parts = [rate.carrier, rate.machine_name, rate.distance_label];
    if (parts.some(v => !String(v || '').trim() || /[｜|<>]/.test(String(v)))) throw new Error('運搬項目の名称を確認してください。');
    return prefix + parts.join('｜');
  }
  function calculate(item, rates) {
    const p = parse(item);
    if (!p) return {tagged:false};
    const bad = issue => ({tagged:true,value:null,issue});
    if (p.invalid || item.isWaste) return bad('回送の会社・重機・距離区分を確認してください。');
    const count = numeric(item.qty);
    if (!Number.isInteger(count) || count < 1 || count > 1000 || item.unit !== '片道回') return bad('回送回数は重機1台ごと、片道1回単位で入力してください。');
    if (item.company && norm(item.company) !== norm(p.carrier)) return bad('回送の運搬会社と品目の会社名が一致しません。');
    const manual = numeric(item.price);
    if (manual !== null) return Number.isFinite(manual) && manual >= 0 && manual <= 1e9
      ? {tagged:true,value:round(manual),manual:true,count} : bad('回送費の手入力金額を確認してください。');
    const matches = (Array.isArray(rates) ? rates : []).filter(r => r.active !== false &&
      norm(r.carrier) === norm(p.carrier) && machineKey(r.machine_name) === machineKey(p.machine) && norm(r.distance_label) === norm(p.distance));
    if (matches.length !== 1 || matches[0].price_basis !== 'one_way_per_machine') return bad('回送の片道単価が未登録・未確認です。金額を推測していません。');
    const unit = numeric(matches[0].unit_price);
    if (!Number.isFinite(unit) || unit === null || unit < 0 || unit * count > 1e9) return bad('回送単価の金額を確認してください。');
    return {tagged:true,value:round(unit * count),manual:false,count,unit};
  }
  const engine = Object.freeze({parse,encode,calculate});
  if (typeof module === 'object' && module.exports) {module.exports = engine; return;}
  if (window.__toyaTransportV1) return;
  window.__toyaTransportV1 = true;
  window.ToyaTransportEngine = engine;
  const q = (s, r = document) => r.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const yen = n => Number(n).toLocaleString('ja-JP', {maximumFractionDigits:2}) + '円';
  const identity = () => typeof cloudProfile !== 'undefined' && cloudProfile?.active === true && cloudProfile.company_id && typeof cloudClient !== 'undefined' && cloudClient ? cloudProfile.id + ':' + cloudProfile.company_id + ':' + cloudProfile.role : '';
  const isAdmin = () => !!identity() && cloudProfile.role === 'admin';
  let owner = '', catalog = [], rates = [], loading = false, loaded = false, ticket = 0;
  const rowData = row => ({name:q('.i-name',row).value,unit:q('.i-unit',row).value,qty:q('.i-qty',row).value,price:q('.i-price',row).value,company:q('.i-company',row).value});
  function paintRow(row) {
    const item = rowData(row), result = calculate(item, rates), info = q('[data-et-result]',row);
    const manual = String(item.price).trim() !== '';
    q('[data-et-adjust]',row).hidden = !isAdmin();
    info.textContent = !isAdmin() ? (manual ? '金額は管理者が指定済み。回数を変えた場合は管理者に確認してください。' : '保存後、管理者のホームで回送費を自動計算します。') :
      result.value === null ? result.issue : result.manual ? '手入力の合計金額：' + yen(result.value) : yen(result.unit) + ' × ' + result.count + '回 ＝ ' + yen(result.value);
  }
  function transportRow(d) {
    const p = parse(d); if (!p || p.invalid) return null;
    const box = q('#items'); if (!box) return null;
    const row = document.createElement('div'); row.className = 'row item et-item';
    row.innerHTML = '<div class="rowhead"><b>重機回送</b><button type="button" class="btn danger" data-et-remove>削除</button></div>' +
      '<div class="note et-description"></div><input type="hidden" class="i-name"><input type="hidden" class="i-company"><input type="hidden" class="i-unit">' +
      '<label>片道の回数（この重機1台分）</label><div class="et-count"><button type="button" class="btn light" data-et-delta="-1">−</button><input class="i-qty" type="number" inputmode="numeric" min="1" max="1000" step="1"><button type="button" class="btn light" data-et-delta="1">＋</button></div>' +
      '<p class="note" data-et-result></p><details data-et-adjust><summary>金額を直す（管理者・必要なときだけ）</summary><label>回送費の合計（円）</label><input class="i-price" type="number" inputmode="decimal" min="0" step="0.01" placeholder="空欄なら単価×回数で自動計算"><button type="button" class="btn light et-wide" data-et-auto>自動計算に戻す</button>' +
      '<p class="note">0円も指定できます。手入力は合計金額で、回数を変えても保持します。自動計算分は現行の登録単価を参照します。金額を固定するときは合計金額を入力してください。</p></details>';
    q('.et-description',row).textContent = p.carrier + ' ／ ' + p.machine + ' ／ ' + p.distance;
    q('.i-name',row).value = d.name; q('.i-company',row).value = d.company || p.carrier;
    q('.i-unit',row).value = d.unit || '片道回'; q('.i-qty',row).value = d.qty ?? 1;
    q('.i-price',row).value = d.price ?? '';
    row.addEventListener('input', () => paintRow(row));
    row.addEventListener('click', e => {
      const delta = e.target.closest('[data-et-delta]');
      if (delta) {const input = q('.i-qty',row); input.value = Math.max(1, Math.min(1000, Number(input.value || 1) + Number(delta.dataset.etDelta))); paintRow(row);}
      if (e.target.closest('[data-et-remove]')) row.remove();
      if (e.target.closest('[data-et-auto]') && isAdmin()) {q('.i-price',row).value='';paintRow(row);}
    });
    box.appendChild(row); paintRow(row); return row;
  }
  function installHooks() {
    if (typeof window.addItem !== 'function' || typeof window.validate !== 'function') return false;
    if (!window.addItem.__toyaTransport) {
      const original = window.addItem;
      const wrapped = function(d={}) {const p = parse(d); return p && !p.invalid ? transportRow(d) : original.apply(this,arguments);};
      wrapped.__toyaTransport = true; window.addItem = wrapped;
      // Old drafts already rendered before this script retain their original values.
      document.querySelectorAll('#items .item:not(.et-item)').forEach(row => {
        const d=rowData(row),p=parse(d);if (!p || p.invalid) return;
        const replacement=transportRow(d);if(replacement)row.replaceWith(replacement);
      });
    }
    if (!window.validate.__toyaTransport) {
      const original = window.validate;
      const wrapped = function(d) {
        if (!original.apply(this,arguments)) return false;
        for (const item of d.items || []) {
          if (!parse(item)) continue;
          // Validation of syntax/count is independent of confidential price access.
          const probe=calculate({...item,price:String(item.price??'').trim()===''?0:item.price},[]);
          if(probe.value===null){alert(probe.issue);return false;}
        }
        return true;
      };wrapped.__toyaTransport=true;window.validate=wrapped;
    }
    return true;
  }
  function options(select, values, placeholder) {
    const current=select.value;select.innerHTML='<option value="">'+placeholder+'</option>'+values.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');
    if(values.includes(current))select.value=current;
  }
  function refreshOptions(level=0) {
    if (!q('#etCarrier')) return;
    if(level===0)options(q('#etCarrier'),[...new Set(catalog.map(r=>r.carrier))],'運搬会社を選択');
    if(level<=1)options(q('#etMachine'),[...new Set(catalog.filter(r=>r.carrier===q('#etCarrier').value).map(r=>r.machine_name))],'重機を選択');
    if(level<=2)options(q('#etDistance'),[...new Set(catalog.filter(r=>r.carrier===q('#etCarrier').value&&r.machine_name===q('#etMachine').value).map(r=>r.distance_label))],'距離区分を選択');
    preview();
  }
  function selected() {return catalog.find(r=>r.carrier===q('#etCarrier')?.value&&r.machine_name===q('#etMachine')?.value&&r.distance_label===q('#etDistance')?.value);}
  function preview() {
    if(!q('#etPreview'))return;
    const r=selected(),count=Number(q('#etCount').value);
    q('#etAdd').disabled=!identity()||!r||!Number.isInteger(count)||count<1||count>1000;
    if(!r){q('#etPreview').textContent='運搬会社・重機・距離区分を選んでください。';return;}
    const value=calculate({name:encode(r),unit:'片道回',qty:count,price:'',company:r.carrier},rates);
    q('#etPreview').textContent=isAdmin()?(value.value===null?value.issue:yen(value.unit)+' × '+count+'回 ＝ '+yen(value.value)):'この内容を日報へ追加し、日報を保存してください。金額入力は不要です。';
  }
  function ui() {
    if(q('#etCard')||!q('#items'))return;
    const card=document.createElement('div');card.id='etCard';card.className='card';
    card.innerHTML='<h2>重機回送（宝友・横手重機など）</h2><p class="note">運搬会社・重機・距離・回数を選びます。重機1台・片道1回が基準です。往復は2回。同じ運搬を複数人の日報に重ねて入力しないでください。</p>'+
      '<label for="etCarrier">運搬会社</label><select id="etCarrier"></select><label for="etMachine">運ぶ重機</label><select id="etMachine"></select><label for="etDistance">距離区分</label><select id="etDistance"></select>'+
      '<label for="etCount">片道の回数（この重機1台分）</label><input id="etCount" type="number" inputmode="numeric" min="1" max="1000" step="1" value="1"><div class="et-count" style="margin-top:8px"><button type="button" class="btn light" data-et-count="1">片道1回</button><button type="button" class="btn light" data-et-count="2">往復2回</button></div>'+
      '<p id="etPreview" class="note" role="status"></p><button id="etAdd" type="button" class="btn dark et-wide" disabled>＋ この回送を日報へ追加</button><p id="etMessage" class="note" role="status"></p><p class="note">選択だけでは未登録です。追加後、日報を保存すると管理者ホームの「重機回送費」へ反映します。提示単価に消費税・高速代等は自動加算しません。入庫日と出庫日が違う場合は各日に1回ずつ入力してください。</p>';
    q('#items').closest('.card').before(card);
    if(!q('#etStyles')){const s=document.createElement('style');s.id='etStyles';s.textContent='#etCard select,#etCard input,.et-item input{width:100%;box-sizing:border-box;min-height:44px;font-size:16px}.et-wide{width:100%}.et-count{display:flex;align-items:center;gap:8px}.et-count input{min-width:0;flex:1}.et-count button{min-height:44px;flex:1}.et-item summary{font-weight:700;cursor:pointer;padding:10px 0}.et-item [hidden]{display:none!important}.et-description{word-break:break-word}';document.head.appendChild(s);}
    q('#etCarrier').onchange=()=>refreshOptions(1);q('#etMachine').onchange=()=>refreshOptions(2);q('#etDistance').onchange=preview;q('#etCount').oninput=preview;
    card.addEventListener('click',e=>{const b=e.target.closest('[data-et-count]');if(b){q('#etCount').value=b.dataset.etCount;preview();}});
    q('#etAdd').onclick=()=>{
      const r=selected();if(!r||q('#etAdd').disabled)return;
      const name=encode(r),duplicates=[...document.querySelectorAll('#items .i-name')].some(x=>x.value===name);
      if(duplicates&&!confirm('同じ会社・重機・距離の回送が既にあります。別の運搬分として追加しますか？'))return;
      const row=transportRow({name,company:r.carrier,unit:'片道回',qty:Number(q('#etCount').value),price:''});
      if(row){q('#etMessage').textContent='日報に追加しました。最後に「日報を保存」を押してください。';q('#etCount').value='1';q('#etDistance').value='';preview();row.scrollIntoView({behavior:'smooth',block:'center'});}
    };
    refreshOptions();
  }
  async function init() {
    installHooks();ui();
    const next=identity();
    if(next!==owner){owner=next;catalog=[];rates=[];loaded=false;loading=false;ticket++;refreshOptions();document.querySelectorAll('.et-item').forEach(paintRow);}
    if(!next){if(q('#etMessage'))q('#etMessage').textContent='ログイン後に選択できます。';return;}
    if(loading||loaded)return;loading=true;const mine=owner,t=++ticket;
    try{
      const result=await cloudClient.rpc('equipment_transport_catalog_v1');if(result.error)throw result.error;
      let rr=[];
      if(isAdmin()){const res=await cloudClient.from('equipment_transport_rate_master').select('id,carrier,machine_name,distance_label,unit_price,price_basis,active').eq('company_id',cloudProfile.company_id).eq('active',true);if(res.error)throw res.error;rr=res.data||[];}
      if(owner!==mine||identity()!==mine||t!==ticket)return;
      catalog=result.data||[];rates=rr;loaded=true;refreshOptions();document.querySelectorAll('.et-item').forEach(paintRow);q('#etMessage').textContent='';
    }catch(e){if(owner===mine&&t===ticket&&q('#etMessage'))q('#etMessage').textContent='回送の選択肢を読み込めませんでした。日報入力タブを開き直してください。';}
    finally{if(t===ticket)loading=false;}
  }
  function start(){
    init();document.addEventListener('click',e=>{if(e.target.closest?.('nav [data-page="reportPage"]'))init();});
    window.addEventListener('pageshow',init);
    let n=0;const timer=setInterval(()=>{init();if(loaded||++n>=20)clearInterval(timer);},1000);
    setInterval(()=>{if(identity()!==owner)init();},1000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
