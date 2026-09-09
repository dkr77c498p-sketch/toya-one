/* TOYA One dispatch travel v1. Daily-report facts only; no auth or database writes.
 * Amounts are read from the private labor master by administrators, never embedded here.
 * Missing old facts are unknown, not zero. Identical shared-team records count once.
 */
(() => {
  'use strict';
  const codes = ['meiken', 'asahi'];
  const labels = {meiken:'明建', asahi:'朝日'};
  const list = v => Array.isArray(v) ? v : [];
  const number = v => v == null || String(v).trim() === '' ? null : typeof v === 'boolean' ? NaN : Number(v);
  const round = v => Math.round((v + Number.EPSILON) * 100) / 100;
  const fresh = () => ({area:'city', vehicles:null, highway:0, manualTravel:null, memo:''});
  function decode(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    return {area:v.area || '', vehicles:number(v.vehicles), highway:number(v.highway), manualTravel:number(v.manualTravel), memo:String(v.memo || '')};
  }
  function invalid(v) {
    if (!v) return '';
    if (!['', 'city', 'outside'].includes(v.area)) return '市内・市外を選択してください。';
    if (v.vehicles !== null && (!Number.isInteger(v.vehicles) || v.vehicles < 0 || v.vehicles > 100)) return '通勤台数は0〜100の整数で入力してください。';
    for (const k of ['highway','manualTravel']) if (v[k] !== null && (!Number.isFinite(v[k]) || v[k] < 0 || v[k] > 1000000000)) return '交通費・高速代は0以上の金額で入力してください。';
    if (v.memo.length > 1000) return '交通費のメモは1000文字以内です。';
    return '';
  }
  function calculate(v, cityRate) {
    const issues = [], problem = invalid(v);
    if (!v || problem) return {travel:null,highway:null,value:0,issues:[problem || '通勤台数・市内／市外・高速代が未記録です。交通費等は含めていません。']};
    let travel = null;
    if (v.manualTravel !== null) travel = round(v.manualTravel);
    else if (v.vehicles === 0) travel = 0;
    else if (v.area === 'city' && v.vehicles !== null) {
      const rate = number(cityRate);
      if (rate === null || !Number.isFinite(rate) || rate < 0) issues.push('市内交通費の単価が未登録です。');
      else travel = round(v.vehicles * rate);
    }
    if (travel === null) issues.push(v.area === 'outside' ? '市外交通費は合計金額を入力してください。不要なら0円を指定します。' : '通勤台数と市内／市外を確認してください。');
    const highway = v.highway === null ? null : round(v.highway);
    if (highway === null) issues.push('高速代が未記録です。利用なしの場合は0円を指定します。');
    return {travel,highway,value:round((travel ?? 0) + (highway ?? 0)),issues};
  }
  function resolve(reports, code, cityRate) {
    const seen = new Set();
    const working = list(reports).filter(r => {
      if (r.id && seen.has(r.id)) return false;
      if (r.id) seen.add(r.id);
      return Number(r.report_data?.[code+'Count'] || 0) > 0;
    });
    if (!working.length) return {recorded:false,conflict:false,entry:null,travel:0,highway:0,value:0,issues:[]};
    const values = working.map(r => decode(r.report_data?.dispatchTravel?.[code])).filter(Boolean);
    if (!values.length) return {recorded:false,conflict:false,entry:null,...calculate(null,cityRate)};
    const fingerprint = v => JSON.stringify([v.area,v.vehicles,v.highway,v.manualTravel]);
    if (values.some(v => invalid(v)) || new Set(values.map(fingerprint)).size > 1) return {recorded:true,conflict:true,entry:null,travel:null,highway:null,value:0,issues:['複数日報の通勤台数・交通費が不一致または不正です。交通費等の自動加算を保留しています。']};
    const entry = values[0], result = calculate(entry,cityRate);
    if (values.length > 1) result.issues.push('同一の通勤記録は同じ班の分として1回だけ計算しています。別班なら管理者が調整してください。');
    return {recorded:true,conflict:false,entry,...result};
  }
  const engine = Object.freeze({decode,invalid,calculate,resolve});
  if (typeof module === 'object' && module.exports) {module.exports=engine;return;}
  if (window.ToyaDispatchTravelEngine) return;
  window.ToyaDispatchTravelEngine=engine;
  const q = s => document.querySelector(s);
  const yen = n => Number(n).toLocaleString('ja-JP',{maximumFractionDigits:2})+'円';
  const isAdmin = () => typeof cloudProfile!=='undefined' && cloudProfile?.role==='admin' && cloudProfile.active===true;
  const identity = () => typeof cloudProfile!=='undefined' && cloudProfile ? cloudProfile.id+':'+cloudProfile.company_id+':'+cloudProfile.role : '';
  let state={},installed=false,owner='',rates={},loading=false,loadTicket=0;
  function controls(code) {
    const prefix='dt-'+code;
    return '<div class="dt-group" id="'+prefix+'"><label for="'+prefix+'-vehicles">通勤台数（人数とは別）</label>'+ 
      '<div class="dt-step"><button type="button" data-dt-delta="-1" aria-label="'+labels[code]+'の通勤台数を減らす">−</button><input id="'+prefix+'-vehicles" data-stepper="1" data-dt-key="vehicles" type="number" inputmode="numeric" min="0" max="100" step="1" placeholder="未入力"><button type="button" data-dt-delta="1" aria-label="'+labels[code]+'の通勤台数を増やす">＋</button></div>'+
      '<div class="dt-area" role="group" aria-label="'+labels[code]+'の通勤区分"><button type="button" data-dt-area="city">鹿児島市内</button><button type="button" data-dt-area="outside">市外</button></div>'+
      '<p class="note dt-preview" role="status"></p><details class="dt-options"><summary>高速代・市外料金・金額の調整</summary>'+ 
      '<label for="'+prefix+'-highway">高速代の合計（円・別途）</label><input id="'+prefix+'-highway" data-stepper="1" data-dt-key="highway" type="number" inputmode="decimal" min="0" step="0.01" placeholder="未確認"><p class="note">高速を使わなければ0円。その会社の合計額です。</p>'+ 
      '<label for="'+prefix+'-manualTravel">交通費の合計を手入力（円・任意）</label><input id="'+prefix+'-manualTravel" data-stepper="1" data-dt-key="manualTravel" type="number" inputmode="decimal" min="0" step="0.01" placeholder="市内は空欄で自動、市外は入力"><p class="note">市外・特別料金は合計額を入力。0円も指定できます。高速代は含めません。半日でも通勤費は半額にしません。</p>'+ 
      '<button type="button" class="btn light" data-dt-auto>交通費を自動に戻す</button><label for="'+prefix+'-memo">交通費のメモ（任意）</label><input id="'+prefix+'-memo" data-dt-key="memo" type="text" maxlength="1000" placeholder="別班・現場間の配分など"></details>'+ 
      '<p class="note dt-inactive"></p></div>';
  }
  function paint(code, fill=false) {
    const root=q('#dt-'+code);if(!root)return;
    const value=state[code]||fresh();
    if(fill)root.querySelectorAll('[data-dt-key]').forEach(el=>{el.value=value[el.dataset.dtKey]??'';});
    root.querySelectorAll('[data-dt-area]').forEach(b=>b.setAttribute('aria-pressed',String(value.area===b.dataset.dtArea)));
    const active=Number(q('#'+code+'Count')?.value||0)>0;
    root.querySelector('.dt-inactive').textContent=active?'同じ通勤を複数人の日報へ重ねて入力しないでください。':'人数0人の間は交通費を計上しません。入力値は保持します。';
    let text='人数ではなく実際に来た車の台数を入力します。';
    if(state[code]) {
      const problem=invalid(value);
      if(problem)text=problem;
      else if(isAdmin()&&rates[code]!=null){const c=calculate(value,rates[code]);text='交通費 '+(c.travel===null?'要確認':yen(c.travel))+' ＋ 高速代 '+(c.highway===null?'要確認':yen(c.highway));}
      else text=value.manualTravel!==null?'手入力した交通費の合計を優先します。':value.area==='outside'?'市外料金を下の調整欄へ入力してください。':'日報保存後、台数から管理者ホームで自動計算します。';
    }
    root.querySelector('.dt-preview').textContent=text;
  }
  function restore(d,mode) {
    state={};
    if(mode!=='duplicate')codes.forEach(code=>{const v=decode(d?.dispatchTravel?.[code]);if(v)state[code]=v;});
    codes.forEach(code=>paint(code,true));
  }
  function install() {
    if(installed||!q('#meikenCount')||typeof window.collect!=='function')return;
    if(!q('#dtStyles')){const s=document.createElement('style');s.id='dtStyles';s.textContent='.dt-group{border-top:1px solid #ddd;margin-top:14px;padding-top:8px}.dt-group input{width:100%;box-sizing:border-box;font-size:16px;min-height:44px}.dt-step{display:grid;grid-template-columns:48px minmax(0,1fr) 48px;gap:7px}.dt-step button{min-height:44px;border:0;border-radius:9px;background:#111;color:white;font-size:24px;font-weight:900}.dt-step input{text-align:center;margin:0}.dt-area{display:flex;gap:7px;margin-top:9px}.dt-area button{flex:1;min-height:44px;border:1px solid #aaa;border-radius:9px;background:#fff;color:#111;font-weight:800}.dt-area button[aria-pressed=true]{background:var(--lime,#b8ff00);border:2px solid #678f00}.dt-options summary{font-weight:800;padding:10px 0;cursor:pointer}.dt-options .btn{width:100%;margin-top:8px}.dt-group .note{margin:7px 0}.dt-group [hidden]{display:none!important}';document.head.appendChild(s);}
    codes.forEach(code=>{
      const input=q('#'+code+'Count'),parent=input.closest('.stepper')?.parentElement||input.parentElement;
      parent.insertAdjacentHTML('beforeend',controls(code));
      const root=q('#dt-'+code);
      root.addEventListener('input',e=>{const k=e.target.dataset.dtKey;if(!k)return;if(!state[code])state[code]=fresh();state[code][k]=k==='memo'?e.target.value:number(e.target.value);paint(code);});
      root.addEventListener('click',e=>{
        const b=e.target.closest('button');if(!b)return;
        if(!state[code])state[code]=fresh();const v=state[code];
        if(b.dataset.dtDelta){v.vehicles=Math.max(0,Math.min(100,(Number(v.vehicles)||0)+Number(b.dataset.dtDelta)));q('#dt-'+code+'-vehicles').value=v.vehicles;}
        if(b.dataset.dtArea){v.area=b.dataset.dtArea;if(v.area==='outside')root.querySelector('details').open=true;}
        if(b.hasAttribute('data-dt-auto')){v.manualTravel=null;q('#dt-'+code+'-manualTravel').value='';}
        // A new fact uses the visible default of no highway use; past missing facts remain missing.
        q('#dt-'+code+'-highway').value=v.highway??'';paint(code);
      });
      input.addEventListener('input',()=>paint(code));input.addEventListener('change',()=>paint(code));
      paint(code,true);
    });
    const originalCollect=window.collect;
    window.collect=function(){const d=originalCollect.apply(this,arguments),values={};codes.forEach(code=>{if(state[code])values[code]={...state[code]};});if(Object.keys(values).length)d.dispatchTravel=values;return d;};
    const originalClear=window.clearReportFormDynamic;
    if(typeof originalClear==='function')window.clearReportFormDynamic=function(){const out=originalClear.apply(this,arguments);restore(null);return out;};
    const originalFill=window.fillReportForm;
    if(typeof originalFill==='function')window.fillReportForm=function(d,mode){const out=originalFill.apply(this,arguments);restore(d,mode);return out;};
    const originalValidate=window.validate;
    window.validate=function(d){if(!originalValidate.apply(this,arguments))return false;for(const code of codes){if(Number(d[code+'Count']||0)<=0)continue;const p=invalid(decode(d.dispatchTravel?.[code]));if(p){alert(labels[code]+'：'+p);return false;}}return true;};
    const originalText=window.lineText;
    window.lineText=function(d){let text=originalText.apply(this,arguments);const parts=codes.filter(code=>Number(d[code+'Count']||0)>0&&d.dispatchTravel?.[code]).map(code=>{const v=decode(d.dispatchTravel[code]);return '・'+labels[code]+' '+(v.area==='city'?'鹿児島市内':v.area==='outside'?'市外':'区分未確認')+'／通勤 '+(v.vehicles===null?'未確認':v.vehicles+'台')+'／高速代 '+(v.highway===null?'未確認':yen(v.highway))+(v.manualTravel!==null?'／交通費合計 '+yen(v.manualTravel):'')+(v.memo?'／'+v.memo:'');});if(parts.length){const extra='\n\n■通勤・交通費\n'+parts.join('\n'),pos=text.lastIndexOf('\n\n※');text=pos<0?text+extra:text.slice(0,pos)+extra+text.slice(pos);}return text;};
    installed=true;
  }
  async function loadRates() {
    const next=identity();
    if(next!==owner){owner=next;rates={};loading=false;loadTicket++;codes.forEach(code=>paint(code));}
    if(!isAdmin()||loading||Object.keys(rates).length||typeof cloudClient==='undefined'||!cloudClient)return;
    const mine=owner,ticket=++loadTicket;loading=true;
    try{const r=await cloudClient.from('labor_rate_master').select('code,city_per_vehicle,active').eq('company_id',cloudProfile.company_id).in('code',codes);if(r.error)throw r.error;if(ticket!==loadTicket||identity()!==mine)return;rates=Object.fromEntries(list(r.data).filter(r=>r.active!==false).map(r=>[r.code,Number(r.city_per_vehicle)]));codes.forEach(code=>paint(code));}catch(e){/* Input remains usable; no amount is guessed when the private master cannot load. */}finally{if(ticket===loadTicket)loading=false;}
  }
  function start(){install();loadRates();document.addEventListener('click',e=>{if(e.target.closest?.('nav [data-page="reportPage"]')){install();loadRates();}});window.addEventListener('pageshow',()=>{install();loadRates();});let tries=0;const timer=setInterval(()=>{install();loadRates();if(++tries>=20)clearInterval(timer);},1000);setInterval(()=>{if(identity()!==owner)loadRates();},1000);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
