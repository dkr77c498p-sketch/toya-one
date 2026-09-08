/* TOYA One: admin-only labor costing. Does not alter auth, daily-report saves or payroll. */
(() => {
  'use strict';
  if (window.__toyaLaborAdminV1) return;
  window.__toyaLaborAdminV1 = true;
  const q = (s, root = document) => root.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = s => String(s || '').replace(/[\s　]/g, '');
  const yen = n => Math.round(n).toLocaleString('ja-JP') + '円';
  const kinds = {own:'自社人件費',dispatch:'応援・派遣費',incoming:'常用・来てもらう（費用）',outgoing:'常用・応援に行く（売上）'};
  const num = v => Number(v === '' || v == null ? 0 : v);
  const optional = v => v === '' || v == null ? null : Number(v);
  const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
  function calculate(r) {
    const autoLabor = round(num(r.full) * num(r.dayRate) + num(r.half) * num(r.halfRate));
    const manualLabor = optional(r.manualLabor), manualTravel = optional(r.manualTravel);
    const autoTravel = r.area === 'outside' ? null : round(num(r.vehicles) * num(r.cityRate));
    const labor = manualLabor === null ? autoLabor : manualLabor;
    const travel = manualTravel === null ? autoTravel : manualTravel;
    const active = num(r.full) + num(r.half) > 0 || manualLabor !== null || num(r.vehicles) > 0 || manualTravel !== null || num(r.highway) > 0 || num(r.extra) > 0;
    const missingTravel = active && travel === null;
    const total = Math.round(labor + (travel ?? 0) + num(r.highway) + num(r.extra));
    return {autoLabor, autoTravel, labor, travel, active, missingTravel, total, manual:manualLabor !== null || manualTravel !== null};
  }
  function newEntry(rate, full = 0) {
    return {key:rate.code,label:rate.label,kind:rate.kind,full,half:0,dayRate:Number(rate.day_rate),halfRate:Number(rate.half_rate),cityRate:Number(rate.city_per_vehicle),vehicles:0,area:'city',manualLabor:null,manualTravel:null,highway:0,extra:0,memo:''};
  }
  function fromReports(reports, rates) {
    const names = new Set();
    let meiken = 0, asahi = 0;
    reports.forEach(r => {
      const d = r.report_data || {};
      (Array.isArray(d.workers) ? d.workers : []).forEach(n => names.add(norm(n)));
      meiken = Math.max(meiken, num(d.meikenCount));
      asahi = Math.max(asahi, num(d.asahiCount));
    });
    return rates.filter(r => r.active !== false).map(r => newEntry(r,
      r.kind === 'own' && names.has(norm(r.label)) ? 1 : r.code === 'meiken' ? meiken : r.code === 'asahi' ? asahi : 0));
  }
  // Pure calculations exposed for regression tests; no account or rate data is exposed here.
  window.ToyaLaborEngine = Object.freeze({calculate,newEntry,fromReports});
  let owner = '', rates = [], sites = [], rows = [], sources = [], sheet = null, dirty = false, busy = false, initialized = false;
  let selectedDate = '', selectedSite = '', request = 0;
  const admin = () => typeof cloudProfile !== 'undefined' && cloudProfile?.role === 'admin' && cloudProfile.active === true && cloudProfile.company_id && typeof cloudClient !== 'undefined' && !!cloudClient;
  const sameOwner = () => admin() && owner === cloudProfile.id + ':' + cloudProfile.company_id;
  const dateToday = () => typeof today === 'function' ? today() : new Date().toLocaleDateString('sv-SE');
  function msg(s, bad = false) {const el=q('#lcStatus'); if(el){el.textContent=s;el.className='note '+(bad?'cloud-bad':'');}}
  function setBusy(v) {busy=v; q('#lcCard')?.setAttribute('aria-busy', String(v)); ['lcOpen','lcImport','lcSave','lcAddRate'].forEach(id=>{if(q('#'+id))q('#'+id).disabled=v;});}
  function ui() {
    if(q('#lcCard')) return;
    const card=document.createElement('div'); card.id='lcCard'; card.className='card';
    card.innerHTML=`<h2>人件費・常用費（管理者用）</h2>
      <p class="note">日報の人数をもとに計算し、半日・通勤台数・金額を確認して保存します。給与計算ではなく現場原価の管理用です。消費税は自動加算しません。</p>
      <div class="grid2"><div><label for="lcDate">作業日</label><input id="lcDate" type="date"></div><div><label for="lcSite">現場</label><select id="lcSite"><option value="">読み込み中…</option></select></div></div>
      <div class="grid2" style="margin-top:10px"><button id="lcOpen" type="button" class="btn dark">この日の人件費を開く</button><button id="lcImport" type="button" class="btn light">日報から人数を読み直す</button></div>
      <p id="lcStatus" class="note" role="status" aria-live="polite">単価を読み込み中…</p>
      <div id="lcBody"></div><div id="lcTotals" class="row" hidden></div>
      <button id="lcSave" type="button" class="btn lime" style="width:100%;margin-top:10px" hidden>確認した人件費を保存</button>
      <details style="margin-top:14px"><summary style="font-weight:900;cursor:pointer;padding:10px 0">人ごと・応援先ごとの単価設定</summary>
      <p class="note">変更は次の新規計算から反映します。保存済みの金額・手入力は勝手に変更しません。</p><div id="lcRates"></div>
      <button id="lcAddRate" type="button" class="btn light" style="width:100%;margin-top:8px">＋ 人・応援先を追加</button></details>`;
    const first=q('#masterPage'); if(!first)return; first.prepend(card);
    q('#lcDate').value=dateToday();
    q('#lcOpen').onclick=()=>loadSheet(false);
    q('#lcImport').onclick=()=>loadSheet(true);
    q('#lcSave').onclick=saveSheet;
    q('#lcAddRate').onclick=addRate;
    // Context is switched only with an explicit open/import; never save rows under a changed date/site.
    ['lcDate','lcSite'].forEach(id=>q('#'+id).addEventListener('change',()=>{if(rows.length)msg('日付・現場を変更しました。「この日の人件費を開く」を押してください。');}));
    q('#lcBody').addEventListener('input', editRow);
    q('#lcBody').addEventListener('change', editRow);
    q('#lcBody').addEventListener('click', e=>{
      const b=e.target.closest('[data-lc-auto]'); if(!b)return;
      const i=Number(b.closest('[data-lc-index]').dataset.lcIndex), key=b.dataset.lcAuto;
      if(rows[i]){rows[i][key]=null;dirty=true;renderEntries();msg('この項目を自動計算に戻しました。保存前です。');}
    });
    q('#lcRates').addEventListener('click',e=>{const b=e.target.closest('[data-lc-rate-save]');if(b)saveRate(Number(b.dataset.lcRateSave));});
  }
  async function init() {
    if(!admin()) {q('#lcCard')?.remove();owner='';initialized=false;rates=[];rows=[];sheet=null;dirty=false;request++;return;}
    const next=cloudProfile.id+':'+cloudProfile.company_id;
    if(owner!==next){q('#lcCard')?.remove();owner=next;initialized=false;rates=[];rows=[];sheet=null;dirty=false;request++;}
    if(initialized || busy)return;
    ui();initialized=true;setBusy(true);
    const mine=owner;
    try {
      const [rr,ss]=await Promise.all([
        cloudClient.from('labor_rate_master').select('*').eq('company_id',cloudProfile.company_id).order('sort_order'),
        cloudClient.from('sites').select('id,name,status').eq('company_id',cloudProfile.company_id).order('name')
      ]);
      if(rr.error)throw rr.error;if(ss.error)throw ss.error;
      if(owner!==mine || !sameOwner())return;
      rates=rr.data||[];sites=ss.data||[];renderRates();
      q('#lcSite').innerHTML='<option value="">現場を選択</option>'+sites.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
      const current=q('#site')?.value; const match=sites.find(s=>s.name===current);if(match)q('#lcSite').value=match.id;
      msg('現場を選んで開くと、保存済みの金額または日報から計算した人数を表示します。');
    } catch(e){initialized=false;msg('人件費の読込エラー：'+e.message,true);}
    finally {setBusy(false);}
  }
  const numberInput=(i,key,value,label,step='1',placeholder='')=>`<div><label for="lc-${i}-${key}">${label}</label><input id="lc-${i}-${key}" data-lc-key="${key}" type="number" inputmode="decimal" min="0" step="${step}" value="${value??''}" placeholder="${placeholder}"></div>`;
  function renderEntries(){
    if(!sameOwner())return;
    q('#lcBody').innerHTML=rows.map((r,i)=>`<details class="row" data-lc-index="${i}" ${calculate(r).active?'open':''}>
      <summary style="font-weight:900;cursor:pointer;line-height:1.8">${esc(r.label)} <span class="note">${esc(kinds[r.kind]||r.kind)}</span> <span data-lc-row-total></span></summary>
      <div class="note">全日 ${yen(r.dayRate)}／半日 ${yen(r.halfRate)}${r.kind==='dispatch'?`・市内通勤 ${yen(r.cityRate)}／台（半日も同額）`:''}</div>
      <div class="grid2">${numberInput(i,'full',r.full,'全日人数')}${numberInput(i,'half',r.half,'半日人数')}</div>
      <div class="grid2"><div><label>交通費の区分</label><select data-lc-key="area"><option value="city" ${r.area==='city'?'selected':''}>鹿児島市内</option><option value="outside" ${r.area==='outside'?'selected':''}>市外・交通費手入力</option></select></div>${numberInput(i,'vehicles',r.vehicles,'通勤台数（人数とは別）')}</div>
      <details style="margin-top:8px" ${r.manualLabor!==null||r.manualTravel!==null||r.area==='outside'?'open':''}><summary style="cursor:pointer;font-weight:800">金額の手入力・調整</summary>
      <p class="note">空欄＝自動。0円も指定できます。手入力はその項目の合計金額を優先し、人数変更でも消しません。</p>
      <div class="grid2">${numberInput(i,'manualLabor',r.manualLabor,'人件費／常用代 合計（円）','1','空欄なら自動')}${numberInput(i,'manualTravel',r.manualTravel,'交通費 合計（円）','1',r.area==='outside'?'市外は金額を入力':'空欄なら自動')}</div>
      <div class="grid2" style="margin-top:6px"><button type="button" class="btn light" data-lc-auto="manualLabor">人件費を自動に戻す</button><button type="button" class="btn light" data-lc-auto="manualTravel">交通費を自動に戻す</button></div></details>
      <div class="grid2">${numberInput(i,'highway',r.highway,'高速代（円・別途）')}${numberInput(i,'extra',r.extra,'その他加算（円・任意）')}</div>
      <label>調整理由・メモ</label><input type="text" data-lc-key="memo" value="${esc(r.memo)}" placeholder="例：先方との取り決め・残業分など">
      <div data-lc-calculation class="note" style="margin-top:8px"></div></details>`).join('');
    q('#lcTotals').hidden=false;q('#lcSave').hidden=false;renderTotals();
  }
  function totals(){let cost=0,revenue=0,pending=false;rows.forEach(r=>{const c=calculate(r);pending ||= c.missingTravel;if(r.kind==='outgoing')revenue+=c.total;else cost+=c.total;});return {cost,revenue,pending};}
  function renderTotals(){
    rows.forEach((r,i)=>{const el=q(`[data-lc-index="${i}"]`);if(!el)return;const c=calculate(r);
      q('[data-lc-row-total]',el).textContent=yen(c.total)+(c.manual?'［手入力優先］':'');
      q('[data-lc-calculation]',el).textContent=`人件費 ${yen(c.labor)}＋交通費 ${c.travel===null?'要入力':yen(c.travel)}＋高速代 ${yen(num(r.highway))}＋その他 ${yen(num(r.extra))}${c.missingTravel?' ／ 市外交通費を入力してください。':''}`;
    });
    const t=totals();q('#lcTotals').innerHTML=`<b>費用合計：${yen(t.cost)}</b><br><b>常用に行く分の売上：${yen(t.revenue)}</b><div class="note">常用売上と人件費は別計上です。応援に行く自社作業員の人件費も自社欄に残してください。処分費・燃料費・車両費はこの合計に含みません。${t.pending?' 市外交通費が未入力です。':''}</div>`;
  }
  function editRow(e){
    const key=e.target.dataset.lcKey, el=e.target.closest('[data-lc-index]');if(!key||!el||!sameOwner())return;
    const r=rows[Number(el.dataset.lcIndex)];if(!r)return;
    r[key]=['area','memo'].includes(key)?e.target.value:key.startsWith('manual')?optional(e.target.value):num(e.target.value);
    dirty=true;renderTotals();msg('変更はまだ保存されていません。手入力した金額は優先して保持されます。');
  }
  function renderRates(){
    if(!sameOwner())return;
    q('#lcRates').innerHTML=rates.map((r,i)=>`<details class="row" data-lc-rate="${i}"><summary style="font-weight:800;cursor:pointer">${esc(r.label)}｜全日${yen(r.day_rate)}・半日${yen(r.half_rate)}</summary><label>名前・会社名</label><input data-rate-key="label" value="${esc(r.label)}"><div class="grid2"><div><label>全日単価（円）</label><input data-rate-key="day_rate" type="number" min="0" step="0.01" value="${Number(r.day_rate)}"></div><div><label>半日単価（円）</label><input data-rate-key="half_rate" type="number" min="0" step="0.01" value="${Number(r.half_rate)}"></div></div><label>市内交通費／通勤1台（円）</label><input data-rate-key="city_per_vehicle" type="number" min="0" step="0.01" value="${Number(r.city_per_vehicle)}"><button type="button" class="btn dark" style="margin-top:8px;width:100%" data-lc-rate-save="${i}">この単価を保存</button></details>`).join('');
  }
  async function saveRate(i){
    if(!sameOwner()||busy)return;const r=rates[i], el=q(`[data-lc-rate="${i}"]`);if(!r||!el)return;
    const patch={label:q('[data-rate-key="label"]',el).value.trim(),updated_at:new Date().toISOString()};
    for(const k of ['day_rate','half_rate','city_per_vehicle']){const v=q(`[data-rate-key="${k}"]`,el).value;if(v===''||!Number.isFinite(Number(v))||Number(v)<0)return alert('単価は0以上の数値で入力してください。');patch[k]=Number(v);}
    if(!patch.label)return alert('名前・会社名を入力してください。');setBusy(true);
    try{const {data,error}=await cloudClient.from('labor_rate_master').update(patch).eq('id',r.id).eq('company_id',cloudProfile.company_id).eq('updated_at',r.updated_at).select('*');if(error)throw error;if(!data?.length)throw new Error('別端末で変更されています。開き直して確認してください。');if(!sameOwner())return;rates[i]=data[0];renderRates();msg('単価を保存しました。表示中・保存済みの計算金額は変更していません。');}
    catch(e){msg('単価を保存できません：'+e.message,true);}finally{setBusy(false);}
  }
  async function addRate(){
    if(!sameOwner()||busy)return;
    const label=(prompt('追加する人・会社名')||'').trim();if(!label)return;
    const kind=prompt('区分：1 自社／2 応援・派遣／3 常用で来る／4 常用で行く','1');const selected={1:'own',2:'dispatch',3:'incoming',4:'outgoing'}[kind];if(!selected)return;
    const day=prompt('1人・全日の単価（円）');if(day===null||day.trim()==='')return;
    const half=prompt('半日の単価（円）');if(half===null||half.trim()==='')return;
    const travel=prompt('市内交通費：通勤車両1台あたり（円）','0');if(travel===null||travel.trim()==='')return;
    if([day,half,travel].some(v=>!Number.isFinite(Number(v))||Number(v)<0))return alert('0以上の金額を入力してください。');
    setBusy(true);
    try{const row={company_id:cloudProfile.company_id,code:'custom-'+crypto.randomUUID(),label,kind:selected,day_rate:Number(day),half_rate:Number(half),city_per_vehicle:Number(travel),sort_order:rates.length*10+100,active:true};const {data,error}=await cloudClient.from('labor_rate_master').insert(row).select('*').single();if(error)throw error;if(!sameOwner())return;rates.push(data);renderRates();msg('単価を追加しました。日報から人数を読み直すと計算欄に追加されます。');}
    catch(e){msg('追加できません：'+e.message,true);}finally{setBusy(false);}
  }
  async function loadSheet(rebuild){
    if(!sameOwner()||busy)return;
    const date=q('#lcDate').value, site=q('#lcSite').value;
    if(!date||!site)return alert('作業日と現場を選択してください。');
    if((dirty||rebuild&&rows.length)&&!confirm(rebuild?'表示中の手入力・半日・交通費を破棄し、日報人数から読み直しますか？保存済み金額は「保存」するまで変わりません。':'未保存の変更を破棄して、選んだ現場・日付を開きますか？'))return;
    const token=++request, mine=owner;setBusy(true);msg('人件費を読み込み中…');
    try{
      const saved=await cloudClient.from('labor_cost_sheets').select('*').eq('company_id',cloudProfile.company_id).eq('work_date',date).eq('site_id',site).maybeSingle();if(saved.error)throw saved.error;
      let reports=[];
      if(rebuild||!saved.data){const rs=await cloudClient.from('daily_reports').select('id,report_data,updated_at,recorder_name').eq('company_id',cloudProfile.company_id).eq('report_date',date).eq('site_id',site);if(rs.error)throw rs.error;reports=rs.data||[];}
      if(token!==request||mine!==owner||!sameOwner())return;
      sheet=saved.data;selectedDate=date;selectedSite=site;
      if(sheet&&!rebuild){rows=structuredClone(sheet.entries);sources=sheet.source_reports||[];dirty=false;msg('保存済みの金額を読み込みました。手入力と当時の単価を保持しています。');}
      else{rows=fromReports(reports,rates);sources=reports.map(r=>({id:r.id,updated_at:r.updated_at}));dirty=true;
        msg(`日報${reports.length}件から人数を読み込みました。全日・半日、通勤台数、市外交通費、高速代を確認してください。${reports.length>1?' 同じ人は1人、明建・朝日は最大人数で仮入力しています。別班の場合は人数を修正してください。':''}${reports.some(r=>r.report_data?.siteMoves?.length)?' 現場移動あり：各現場の人工配分と交通費の重複を確認してください。':''}${reports.some(r=>r.report_data?.otherWorker)?' その他の作業者は自動算入していません。単価設定から追加してください。':''}`);
      }
      renderEntries();
    }catch(e){msg('読込エラー：'+e.message,true);}finally{setBusy(false);}
  }
  function validateRows(){
    for(const r of rows){
      for(const k of ['full','half','vehicles','highway','extra','dayRate','halfRate','cityRate'])if(!Number.isFinite(num(r[k]))||num(r[k])<0)return '人数・金額は0以上の数値で入力してください。';
      for(const k of ['full','half','vehicles'])if(!Number.isInteger(num(r[k])))return '人数と通勤台数は整数で入力してください。';
      for(const k of ['manualLabor','manualTravel'])if(r[k]!==null&&(!Number.isFinite(r[k])||r[k]<0))return '手入力金額は空欄または0以上の数値にしてください。';
      if(calculate(r).missingTravel)return r.label+'：市外の交通費を手入力してください。不要なら0円を入力します。';
      if(r.kind==='own'&&num(r.full)+num(r.half)>1)return r.label+'：自社の1人は全日または半日のどちらかにしてください。';
    }return '';
  }
  async function saveSheet(){
    if(!sameOwner()||busy||!rows.length)return;
    if(selectedDate!==q('#lcDate').value||selectedSite!==q('#lcSite').value)return alert('現場・日付が変わっています。「この日の人件費を開く」を押してください。');
    const problem=validateRows();if(problem)return alert(problem);
    setBusy(true);const t=totals(),mine=owner;
    const payload={company_id:cloudProfile.company_id,site_id:selectedSite,work_date:selectedDate,entries:structuredClone(rows),source_reports:sources,cost_total:t.cost,revenue_total:t.revenue,updated_at:new Date().toISOString()};
    try{
      let result;
      if(sheet)result=await cloudClient.from('labor_cost_sheets').update(payload).eq('id',sheet.id).eq('company_id',cloudProfile.company_id).eq('updated_at',sheet.updated_at).select('*');
      else result=await cloudClient.from('labor_cost_sheets').insert(payload).select('*');
      if(result.error)throw result.error;if(!result.data?.length)throw new Error('別端末で変更されています。読み直して確認してください。');
      if(mine!==owner||!sameOwner())return;
      sheet=result.data[0];dirty=false;
      msg('人件費をクラウド保存しました。手入力した金額も保存済みです。');
    }catch(e){msg('人件費は未保存です：'+e.message+'。入力はこの画面に残しています。',true);}
    finally{setBusy(false);}
  }
  function start(){
    init();
    // Observe only the existing visibility of the logged-in area. No auth callbacks or clients are modified.
    const logged=q('#cloudLoggedIn');if(logged)new MutationObserver(()=>{init();}).observe(logged,{attributes:true,attributeFilter:['style']});
    document.addEventListener('click',e=>{if(e.target.closest?.('nav [data-page="masterPage"]'))init();});
    window.addEventListener('pageshow',init);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)init();});
    // Clear confidential UI even if another UI module has replaced the observed node.
    setInterval(()=>{if(owner && !sameOwner())init();},1000);
    let tries=0;const timer=setInterval(()=>{init();if(initialized||++tries>=30)clearInterval(timer);},1000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
