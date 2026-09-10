/* TOYA One equipment costs v1: isolated admin UI. Never changes auth or daily reports. */
(() => {
  'use strict';
  if(window.__toyaEquipmentCostsV1)return;
  window.__toyaEquipmentCostsV1=true;
  let hoursImportBlocked='';
  const q=(s,r=document)=>r.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v||'').normalize('NFKC').replace(/[\s　]/g,'').toLowerCase();
  const key=v=>['sk55','sk55sr'].includes(norm(v))?'sk55':norm(v);
  const assetName=v=>typeof v==='string'?v:String(v?.name||'');
  const num=v=>Number(v==null||v===''?0:v);
  const optional=v=>v==null||v===''?null:Number(v);
  const money=v=>Math.round(num(v)*100)/100;
  const yen=v=>Number(v).toLocaleString('ja-JP',{maximumFractionDigits:2})+'円';
  const arr=v=>Array.isArray(v)?v:[];
  function calculate(r){
    const gross=r.used?money(optional(r.manualGross)??(Number.isFinite(r.hourlyMinutes)?r.dayRate*r.hourlyMinutes*(r.hourlyQuantity||1)/480:r.dayRate)):0;
    const fuel=r.used?money(r.recordedFuel):0;
    return {gross,fuel,net:gross,manual:optional(r.manualGross)!==null};
  }
  function signature(reports){return arr(reports).map(r=>String(r.id)+':'+String(r.updated_at)).sort().join('|');}
  function derive(all,rates,site){
    const warnings=[],seen=new Set();
    const reports=arr(all).filter(r=>{if(seen.has(r.id))return false;seen.add(r.id);return true;});
    const own=reports.filter(r=>r.site_id===site.id),used=new Set(),fuels=new Map(),fuelCounts=new Map(),fuelSeen=new Map();
    const labels=new Set(rates.map(r=>key(r.label)));
    own.forEach(r=>{
      const d=r.report_data||{};
      arr(d.machines).forEach(m=>{const name=assetName(m),k=key(name);if(!k)return;used.add(k);if(!labels.has(k))warnings.push('単価未登録の重機：'+name);});
      arr(d.fuels).filter(f=>['軽油','ガソリン'].includes(f?.type)).forEach(f=>{
        const k=key(f.asset);if(!labels.has(k))return; // Keep equipment fuel visible; vehicle fuel and oil stay in their own category.
        const amount=f.amount!==''&&f.amount!=null?num(f.amount):num(f.qty??f.liters)*num(f.unitPrice);
        if(!Number.isFinite(amount)||amount<0){warnings.push(String(f.asset)+'：燃料額の記録を確認してください。');return;}
        fuels.set(k,money((fuels.get(k)||0)+amount));fuelCounts.set(k,(fuelCounts.get(k)||0)+1);
        const fp=[k,f.type,f.source||'',f.outlet||'',f.qty??f.liters,amount].join('|');
        if(fuelSeen.has(fp)&&fuelSeen.get(fp)!==r.id)warnings.push(String(f.asset)+'：複数の日報に同じ給油内容があります。二重記録でないか確認してください。');
        fuelSeen.set(fp,r.id);
      });
      if(arr(d.siteMoves).length)warnings.push('現場移動のある日報です。重機使用料を現場間で重複させないよう配分を確認してください。燃料費は日報から別に加算します。');
      if(arr(d.leaseMachines).length)warnings.push('リース重機の記録があります。この欄は自社重機だけです。リース代は含めていません。');
    });
    // A move record has a vehicle but no reliable excavator assignment. Never infer one from the truck.
    if(reports.some(r=>r.site_id!==site.id&&arr(r.report_data?.siteMoves).some(m=>m?.site===site.name)))warnings.push('別現場からの移動記録があります。重機が移動したかは日報だけでは確定できません。実際の使用と金額配分を確認してください。');
    const counts=new Map();own.forEach(r=>{const k=r.recorder_name||r.report_data?.writer||'';counts.set(k,(counts.get(k)||0)+1);});
    if([...counts.values()].some(n=>n>1))warnings.push('同じ記入者の日報が複数あります。重機代は1台につき日額1回、燃料は各記録を加算しています。');
    const entries=rates.filter(r=>r.active!==false).map(r=>{
      const k=key(r.label),isUsed=used.has(k);
      if(isUsed&&reports.some(other=>other.site_id!==site.id&&arr(other.report_data?.machines).some(m=>key(assetName(m))===k)))warnings.push(r.label+'：同じ日に別現場にも使用記録があります。金額配分を確認してください。');
      if(!isUsed&&fuels.has(k))warnings.push(r.label+'：給油記録はありますが、使用重機の選択がありません。');
      return {code:r.code,label:r.label,used:isUsed,dayRate:num(r.daily_rate),recordedFuel:fuels.get(k)||0,fuelCount:fuelCounts.get(k)||0,manualGross:null,manualFuel:null,memo:''};
    });
    let resultEntries=entries,resultWarnings=warnings;hoursImportBlocked='';
    if(window.ToyaUsageHoursEngine && reports.some(r=>r.report_data?.usageHours?.version===1)){
      const data={reports,sites:typeof sites!=='undefined'&&sites.length?sites:[site],equipmentRates:rates,laborRates:[],vehicleSheets:[],equipmentSheets:[],laborSheets:[]};
      const getFuel=f=>f.amount!==''&&f.amount!=null?num(f.amount):num(f.qty??f.liters)*num(f.unitPrice);
      const result=window.ToyaUsageHoursEngine.adjust('equipment',reports[0]?.report_date,data,site,{sheet:{entries},issues:warnings},getFuel,window.ToyaDispatchTravelEngine);
      resultEntries=result.sheet.entries.map(r=>({memo:'',...r,...(Number.isFinite(r.minutes)?{hourlyMinutes:r.minutes,hourlyQuantity:r.quantity||1}:{})}));resultWarnings=result.issues;hoursImportBlocked=(result.pendingResources||[]).join('・');
    }
    return {entries:resultEntries,warnings:[...new Set(resultWarnings)],sourceReports:reports.map(r=>({id:r.id,updated_at:r.updated_at})),count:own.length};
  }
  window.ToyaEquipmentCostEngine=Object.freeze({calculate,derive,signature});
  const admin=()=>typeof cloudProfile!=='undefined'&&cloudProfile?.role==='admin'&&cloudProfile.active===true&&cloudProfile.company_id&&typeof cloudClient!=='undefined'&&!!cloudClient;
  const identity=()=>admin()?cloudProfile.id+':'+cloudProfile.company_id:'';
  let owner='',initialized=false,busy=false,dirty=false,token=0,rates=[],sites=[],rows=[],sources=[],warnings=[],sheet=null,date='',siteId='',stale=false;
  const same=mine=>Boolean(mine)&&mine===owner&&mine===identity();
  const msg=(text,bad=false)=>{const el=q('#ecStatus');if(el){el.textContent=text;el.className='note'+(bad?' cloud-bad':'');}};
  function setBusy(value){busy=value;const card=q('#ecCard');if(card){card.setAttribute('aria-busy',String(value));card.querySelectorAll('button,input,select').forEach(el=>el.disabled=value);}}
  function clear(){q('#ecCard')?.remove();owner='';initialized=false;busy=false;dirty=false;rows=[];rates=[];sites=[];sheet=null;token++;}
  function ui(){
    if(q('#ecCard')||!q('#masterPage'))return;
    if(!q('#ecStyles')){const s=document.createElement('style');s.id='ecStyles';s.textContent=`#ecCard .ec-wide{width:100%}#ecCard .ec-head{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-weight:900}#ecCard .ec-use{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}#ecCard .ec-use button{min-height:44px;border:1px solid #bbb;border-radius:9px;background:#fff;font-weight:800;color:#111}#ecCard .ec-use [aria-pressed=true]{background:var(--lime,#b8ff00);border:2px solid #678f00}#ecCard summary{cursor:pointer;font-weight:800;padding:10px 0}#ecCard .ec-total{font-size:19px;font-weight:900}#ecCard .ec-warn{color:#853900;background:#fff3d8;padding:10px;border-radius:9px;margin:10px 0}#ecCard input{font-size:16px}#ecCard .ec-note{font-size:12px;color:#555;line-height:1.6}`;document.head.appendChild(s);}
    const c=document.createElement('div');c.id='ecCard';c.className='card';
    c.innerHTML=`<h2>重機使用料（管理者用）</h2><p class="note">重機の日額・時間換算額を計算します。燃料費は差し引かず、日報の燃料欄から別に加算します。人工は別計算です。</p>
      <div class="grid2"><div><label for="ecDate">作業日</label><input id="ecDate" type="date"></div><div><label for="ecSite">現場</label><select id="ecSite"><option value="">現場を選択</option></select></div></div>
      <button id="ecOpen" type="button" class="btn dark ec-wide" style="margin-top:10px">この日の重機費を開く</button>
      <p id="ecStatus" class="note" role="status" aria-live="polite">単価を読み込み中…</p><div id="ecBody"></div><div id="ecTotals" hidden class="row"></div><div id="ecWarnings" hidden class="ec-warn"></div>
      <button id="ecSave" type="button" class="btn lime ec-wide" style="margin-top:10px" hidden>確認した重機費を保存</button>
      <details><summary>日報を読み直す・単価設定</summary><p class="note">保存済みの金額は、単価を変えても勝手に変わりません。</p><button id="ecReload" type="button" class="btn light ec-wide">日報・燃料から計算し直す</button><div id="ecRates"></div></details>`;
    q('#masterPage').prepend(c);
    q('#ecDate').value=typeof today==='function'?today():new Date().toLocaleDateString('sv-SE');
    q('#ecOpen').onclick=()=>openSheet(false);q('#ecReload').onclick=()=>openSheet(true);q('#ecSave').onclick=save;
    ['ecDate','ecSite'].forEach(id=>q('#'+id).addEventListener('change',()=>{
      if(!rows.length)return;
      q('#ecBody').hidden=true;q('#ecTotals').hidden=true;q('#ecWarnings').hidden=true;q('#ecSave').hidden=true;
      msg('日付・現場を変更しました。「この日の重機費を開く」を押してください。');
    }));
    q('#ecBody').addEventListener('input',edit);q('#ecBody').addEventListener('click',tap);
    q('#ecRates').addEventListener('click',e=>{const b=e.target.closest('[data-ec-rate-save]');if(b)saveRate(Number(b.dataset.ecRateSave));});
  }
  async function init(){
    const next=identity();if(!next){if(owner)clear();return;}
    if(owner!==next){clear();owner=next;}
    if(initialized||busy)return;
    ui();if(!q('#ecCard'))return;const mine=owner;setBusy(true);
    try{
      const [rr,ss]=await Promise.all([cloudClient.from('equipment_rate_master').select('*').eq('company_id',cloudProfile.company_id).order('sort_order'),cloudClient.from('sites').select('id,name,status').eq('company_id',cloudProfile.company_id).order('name')]);
      if(!same(mine))return;if(rr.error)throw rr.error;if(ss.error)throw ss.error;
      rates=rr.data||[];sites=ss.data||[];initialized=true;renderRates();
      q('#ecSite').innerHTML='<option value="">現場を選択</option>'+sites.filter(s=>s.status==='active'&&!['新しい現場','現場名をあとで変更','未登録現場'].includes(s.name)).map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
      const current=q('#site')?.value,match=sites.find(s=>String(s.name).normalize('NFKC').replace(/[\s　]/g,'')===String(current||'').normalize('NFKC').replace(/[\s　]/g,''));if(match)q('#ecSite').value=match.id;
      window.ToyaSharedSiteUI?.syncBrowse(q('#ecSite'));
      msg('日付・現場を選ぶと、使用重機と燃料代を日報から読み込みます。');
    }catch(e){if(same(mine))msg('読込エラー：'+e.message,true);}finally{if(same(mine))setBusy(false);}
  }
  function field(i,k,label,value,placeholder=''){return `<div><label for="ec-${i}-${k}">${label}</label><input id="ec-${i}-${k}" data-ec-key="${k}" type="number" inputmode="decimal" min="0" step="0.01" value="${value??''}" placeholder="${esc(placeholder)}"></div>`;}
  function render(){
    if(!same(owner))return;
    q('#ecBody').hidden=false;
    q('#ecBody').innerHTML=rows.map((r,i)=>`<div class="row" data-ec-index="${i}"><div class="ec-head"><span>${esc(r.label)}</span><span data-ec-net></span></div>
      <div class="ec-use" role="group" aria-label="${esc(r.label)}の使用"><button type="button" data-ec-use="no" aria-pressed="false">使用なし</button><button type="button" data-ec-use="yes" aria-pressed="false">${Number.isFinite(r.hourlyMinutes)?(r.hourlyMinutes/60)+'時間使用':'1日使用'}</button></div>
      <div data-ec-calc class="ec-note"></div><details data-ec-adjust ${optional(r.manualGross)!==null||r.memo?'open':''}><summary>金額を直す（必要なときだけ）</summary>
      <p class="note">空欄＝自動、0円も指定可能。短時間・現場移動の配分額はここで調整します。使用の切替や単価の変更で手入力は消えません。</p>
      <div>${field(i,'manualGross','重機使用料（円）',r.manualGross,'自動：'+yen(Number.isFinite(r.hourlyMinutes)?r.dayRate*r.hourlyMinutes*(r.hourlyQuantity||1)/480:r.dayRate))}</div>
      <button type="button" class="btn light ec-wide" style="margin-top:8px" data-ec-auto="manualGross">重機使用料を自動に戻す</button>
      <label for="ec-${i}-memo">配分・調整のメモ</label><input id="ec-${i}-memo" type="text" data-ec-key="memo" value="${esc(r.memo)}" placeholder="まとめ給油・別現場への配分など">
      <div class="note">燃料の元の日報は変更しません。給油日に記録した金額であり、その日の消費額とは限りません。</div></details></div>`).join('');
    q('#ecTotals').hidden=false;q('#ecSave').hidden=false;renderTotals();
  }
  function totals(){return rows.reduce((t,r)=>{const c=calculate(r);t.gross=money(t.gross+c.gross);t.fuel=money(t.fuel+c.fuel);t.net=money(t.net+c.net);return t;},{gross:0,fuel:0,net:0});}
  function renderTotals(){
    rows.forEach((r,i)=>{const el=q(`[data-ec-index="${i}"]`);if(!el)return;const c=calculate(r);
      q('[data-ec-net]',el).textContent=yen(c.net)+(r.used&&c.manual?'［手入力］':'');
      el.querySelectorAll('[data-ec-use]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.ecUse==='yes')===r.used)));
      q('[data-ec-calc]',el).textContent=r.used?`${yen(c.gross)}（燃料 ${yen(c.fuel)} は燃料費へ別加算）`:'使用なし。手入力した調整値は保持しています。';
    });
    const t=totals();q('#ecTotals').innerHTML=`<div class="ec-total">重機使用料：${yen(t.gross)}</div><div>記録済み燃料費（別加算）：${yen(t.fuel)}</div><p class="note">人工・回送費・車両費は含みません。ホームの現場原価では、重機使用料に日報の燃料費を別途加算します。保存済みの旧計算値は使用しません。未確定の費用は別表示です。消費税は自動加算しません。</p>`;
    const list=[...new Set(warnings)],box=q('#ecWarnings');
    const was=q('#ecReviewed')?.checked||false;box.hidden=!list.length;
    box.innerHTML=list.map(w=>`<p>${esc(w)}</p>`).join('')+(list.length?`<label class="choice"><input type="checkbox" id="ecReviewed" ${was?'checked':''}>記録と金額の配分を確認した</label>`:'');
  }
  function edit(e){if(!same(owner)||busy)return;const el=e.target.closest('[data-ec-index]'),k=e.target.dataset.ecKey;if(!el||!['manualGross','memo'].includes(k))return;
    rows[Number(el.dataset.ecIndex)][k]=k==='memo'?e.target.value:optional(e.target.value);dirty=true;if(q('#ecReviewed'))q('#ecReviewed').checked=false;renderTotals();msg('変更は未保存です。手入力した金額を優先しています。');}
  function tap(e){if(!same(owner)||busy)return;const b=e.target.closest('button'),el=b?.closest('[data-ec-index]');if(!el)return;const r=rows[Number(el.dataset.ecIndex)];
    if(b.hasAttribute('data-ec-use'))r.used=b.dataset.ecUse==='yes';else if(b.dataset.ecAuto==='manualGross'){r.manualGross=null;q('[data-ec-key="manualGross"]',el).value='';}else return;
    dirty=true;if(q('#ecReviewed'))q('#ecReviewed').checked=false;renderTotals();msg('使用・計算方法を変更しました。まだ保存していません。');}
  async function fetchDay(day){const result=await cloudClient.from('daily_reports').select('id,site_id,report_date,recorder_name,report_data,updated_at').eq('company_id',cloudProfile.company_id).eq('report_date',day).limit(1001);if(result.error)throw result.error;if((result.data||[]).length>1000)throw new Error('日報件数が多いため一括処理を中止しました。');return result.data||[];}
  async function openSheet(rebuild){
    if(!same(owner)||busy)return;const day=q('#ecDate').value,site=sites.find(s=>s.id===q('#ecSite').value);if(!day||!site)return msg('日付と現場を選択してください。',true);
    if((dirty||rebuild)&&!confirm('入力中の重機費を読み直します。手入力の調整をやり直してよいですか？'))return;
    const mine=owner,t=++token;setBusy(true);msg('重機費と燃料代を読み込み中…');
    try{
      const [saved,all]=await Promise.all([cloudClient.from('equipment_cost_sheets').select('*').eq('company_id',cloudProfile.company_id).eq('work_date',day).eq('site_id',site.id).maybeSingle(),fetchDay(day)]);
      if(!same(mine)||t!==token)return;if(saved.error)throw saved.error;
      const result=derive(all,rates,site);sheet=saved.data;date=day;siteId=site.id;
      if(sheet&&!rebuild){hoursImportBlocked='';rows=structuredClone(sheet.entries);sources=sheet.source_reports||[];warnings=[...arr(sheet.review_warnings),...result.warnings];stale=signature(sources)!==signature(all);dirty=false;
        msg(stale?'保存後に日報が変わっています。保存済み金額は保持しています。「日報・燃料から計算し直す」で確認してください。':'保存済みの重機費を開きました。手入力と当時の単価を保持しています。',stale);
      }else{rows=result.entries;sources=result.sourceReports;warnings=result.warnings;stale=false;dirty=true;msg(`日報${result.count}件から仮計算しました。同じ重機は1台につき日額1回（時間単価ではありません）。燃料費は別に加算します。`);}
      render();
    }catch(e){if(same(mine))msg('読込エラー：'+e.message,true);}finally{if(same(mine))setBusy(false);}
  }
  async function save(){
    if(!same(owner)||busy||!rows.length)return;
    if(date!==q('#ecDate').value||siteId!==q('#ecSite').value)return msg('日付・現場が変わっています。重機費を開き直してください。',true);
    if(hoursImportBlocked)return msg('時間・単価等が未確認：'+hoursImportBlocked+'。日報の時間欄で確認するまで確定保存しません。',true);
    if(stale)return msg('日報が更新されています。計算し直してから保存してください。',true);
    for(const r of rows)for(const k of ['dayRate','recordedFuel','manualGross']){const v=r[k];if(v!=null&&(!Number.isFinite(num(v))||num(v)<0||num(v)>1e9))return msg('金額は0以上の有効な数値にしてください。',true);}
    if(q('#ecReviewed')&&!q('#ecReviewed').checked)return msg('重複・金額配分の注意を確認し、チェックしてください。',true);
    const mine=owner;setBusy(true);
    try{
      const latest=await fetchDay(date);if(!same(mine))return;
      if(signature(latest)!==signature(sources)){stale=true;throw new Error('日報が更新されました。入力は残しています。計算し直して確認してください。');}
      const t=totals(),payload={company_id:cloudProfile.company_id,site_id:siteId,work_date:date,entries:structuredClone(rows).map(r=>{const x=Number.isFinite(r.hourlyMinutes)&&optional(r.manualGross)===null?{...r,manualGross:calculate(r).gross}:{...r};return {...x,manualFuel:null};}),source_reports:sources,review_warnings:warnings,gross_total:t.gross,fuel_deduction_total:0,net_total:t.gross};
      const response=sheet?await cloudClient.from('equipment_cost_sheets').update(payload).eq('id',sheet.id).eq('company_id',cloudProfile.company_id).eq('updated_at',sheet.updated_at).select('*'):await cloudClient.from('equipment_cost_sheets').insert(payload).select('*');
      if(!same(mine))return;if(response.error)throw response.error;if(!response.data?.length)throw new Error('別端末で保存されています。開き直して確認してください。');
      sheet=response.data[0];dirty=false;msg('重機使用料をクラウド保存しました。燃料費は別に加算します。');
    }catch(e){if(same(mine))msg('重機費は未保存です：'+e.message,true);}finally{if(same(mine))setBusy(false);}
  }
  function renderRates(){q('#ecRates').innerHTML=rates.map((r,i)=>`<div class="row" data-ec-rate="${i}"><b>${esc(r.label)}</b><label>1台1日の重機使用料（人工・燃料別）</label><input type="number" min="0" step="0.01" inputmode="decimal" value="${num(r.daily_rate)}"><button type="button" data-ec-rate-save="${i}" class="btn light ec-wide" style="margin-top:8px">この重機の単価を保存</button></div>`).join('');}
  async function saveRate(i){if(!same(owner)||busy)return;const r=rates[i],v=Number(q(`[data-ec-rate="${i}"] input`).value);if(!Number.isFinite(v)||v<0||v>1e9)return msg('単価は0以上の数値で入力してください。',true);
    const mine=owner;setBusy(true);try{const result=await cloudClient.from('equipment_rate_master').update({daily_rate:v,updated_at:new Date().toISOString()}).eq('id',r.id).eq('company_id',cloudProfile.company_id).eq('updated_at',r.updated_at).select('*');if(!same(mine))return;if(result.error)throw result.error;if(!result.data?.length)throw new Error('別端末で変更されています。再読み込みしてください。');rates[i]=result.data[0];msg('単価を保存しました。次の新規計算から反映します。開いている計算・保存済み金額は変えません。');}catch(e){if(same(mine))msg('単価は未保存です：'+e.message,true);}finally{if(same(mine))setBusy(false);}}
  function start(){
    init();const logged=q('#cloudLoggedIn');if(logged)new MutationObserver(init).observe(logged,{attributes:true,attributeFilter:['style']});
    document.addEventListener('click',e=>{if(e.target.closest?.('nav [data-page="masterPage"]'))init();});
    window.addEventListener('pageshow',init);document.addEventListener('visibilitychange',()=>{if(!document.hidden)init();});
    window.addEventListener('beforeunload',e=>{if(dirty&&same(owner)){e.preventDefault();e.returnValue='';}});
    let count=0;const t=setInterval(()=>{init();if(initialized||++count>=30)clearInterval(t);},1000);
    setInterval(()=>{if(owner&&!same(owner))clear();},1000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  document.addEventListener('toya-shared-sites-updated',event=>{
    if(typeof cloudProfile==='undefined'||!cloudProfile?.active||cloudProfile.role!=='admin'||event.detail?.companyId!==cloudProfile.company_id)return;
    sites=(Array.isArray(event.detail.sites)?event.detail.sites:[]).map(s=>({...s}));
    window.ToyaSharedSiteUI?.syncBrowse(q('#ecSite'));
  });
})();
