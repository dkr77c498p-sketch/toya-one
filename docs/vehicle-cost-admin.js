/* TOYA One vehicle costs v1: isolated admin UI. Never changes auth or daily reports. */
(() => {
  'use strict';
  if(window.__toyaVehicleCostsV1)return;
  window.__toyaVehicleCostsV1=true;
  const q=(s,r=document)=>r.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v||'').normalize('NFKC').replace(/[\s　]/g,'').toLowerCase();
  const key=v=>['アームロール','4tアームロール'].map(norm).includes(norm(v))?norm('4tアームロール'):norm(v);
  const num=v=>Number(v==null||v===''?0:v);
  const optional=v=>v==null||v===''?null:Number(v);
  const money=v=>Math.round(num(v)*100)/100;
  const yen=v=>Number(v).toLocaleString('ja-JP',{maximumFractionDigits:2})+'円';
  const arr=v=>Array.isArray(v)?v:[];
  function calculate(r){
    const gross=r.used?money(optional(r.manualGross)??r.dayRate):0;
    const fuel=r.used?money(optional(r.manualFuel)??r.recordedFuel):0;
    return {gross,fuel,net:money(gross-fuel),manual:optional(r.manualGross)!==null||optional(r.manualFuel)!==null};
  }
  function signature(reports){return arr(reports).map(r=>String(r.id)+':'+String(r.updated_at)).sort().join('|');}
  function derive(all,rates,site){
    const warnings=[],seen=new Set();
    const reports=arr(all).filter(r=>{if(seen.has(r.id))return false;seen.add(r.id);return true;});
    const own=reports.filter(r=>r.site_id===site.id), used=new Set(),fuels=new Map(),fuelCounts=new Map(),fuelSeen=new Map(),moveUse=new Set();
    const labels=new Set(rates.map(r=>key(r.label)));
    own.forEach(r=>{
      const d=r.report_data||{};
      arr(d.vehicles).forEach(v=>{const k=key(typeof v==='string'?v:v?.name);used.add(k);if(!labels.has(k))warnings.push('単価未登録の車両：'+String(v));});
      arr(d.fuels).filter(f=>['軽油','ガソリン'].includes(f?.type)).forEach(f=>{
        const k=key(f.asset);if(!labels.has(k))return; // Do not subtract excavator fuel or AdBlue/grease.
        const amount=f.amount!==''&&f.amount!=null?num(f.amount):num(f.qty??f.liters)*num(f.unitPrice);
        if(!Number.isFinite(amount)||amount<0){warnings.push(String(f.asset)+'：燃料額の記録を確認してください。');return;}
        fuels.set(k,money((fuels.get(k)||0)+amount));fuelCounts.set(k,(fuelCounts.get(k)||0)+1);
        const fp=[k,f.type,f.source||'',f.outlet||'',f.qty??f.liters,amount].join('|');
        if(fuelSeen.has(fp)&&fuelSeen.get(fp)!==r.id)warnings.push(String(f.asset)+'：複数の日報に同じ給油内容があります。二重記録でないか確認してください。');
        fuelSeen.set(fp,r.id);
      });
      if(arr(d.siteMoves).length)warnings.push('現場移動のある日報です。車両の日額と燃料を現場間で二重計上しないよう手入力で配分してください。');
    });
    reports.forEach(r=>arr(r.report_data?.siteMoves).forEach(m=>{if(m?.site===site.name&&m.vehicle){moveUse.add(key(m.vehicle));warnings.push('移動先として使った車両があります。1日分を仮表示するため、必要な配分額に直してください。');}}));
    const counts=new Map();own.forEach(r=>{const k=r.recorder_name||r.report_data?.writer||'';counts.set(k,(counts.get(k)||0)+1);});
    if([...counts.values()].some(n=>n>1))warnings.push('同じ記入者の日報が複数あります。車両代は1日1回、燃料は各記録を加算しています。');
    const entries=rates.filter(r=>r.active!==false).map(r=>{
      const k=key(r.label), isUsed=used.has(k)||moveUse.has(k);
      if(isUsed&&reports.some(other=>other.site_id!==site.id&&arr(other.report_data?.vehicles).some(v=>key(typeof v==='string'?v:v?.name)===k)))warnings.push(r.label+'：同じ日に別現場にも使用記録があります。金額配分を確認してください。');
      if(!isUsed&&fuels.has(k))warnings.push(r.label+'：給油記録はありますが、使用車両の選択がありません。');
      return {code:r.code,label:r.label,used:isUsed,dayRate:num(r.daily_rate),recordedFuel:fuels.get(k)||0,fuelCount:fuelCounts.get(k)||0,manualGross:null,manualFuel:null,memo:''};
    });
    return {entries,warnings:[...new Set(warnings)],sourceReports:reports.map(r=>({id:r.id,updated_at:r.updated_at})),count:own.length};
  }
  window.ToyaVehicleCostEngine=Object.freeze({calculate,derive,signature});
  const admin=()=>typeof cloudProfile!=='undefined'&&cloudProfile?.role==='admin'&&cloudProfile.active===true&&cloudProfile.company_id&&typeof cloudClient!=='undefined'&&!!cloudClient;
  const identity=()=>admin()?cloudProfile.id+':'+cloudProfile.company_id:'';
  let owner='',initialized=false,busy=false,dirty=false,token=0,rates=[],sites=[],rows=[],sources=[],warnings=[],sheet=null,date='',siteId='',stale=false;
  const same=mine=>mine===owner&&mine===identity();
  const msg=(text,bad=false)=>{const el=q('#vcStatus');if(el){el.textContent=text;el.className='note'+(bad?' cloud-bad':'');}};
  function setBusy(value){busy=value;const card=q('#vcCard');if(card){card.setAttribute('aria-busy',String(value));card.querySelectorAll('button,input,select').forEach(el=>el.disabled=value);}}
  function clear(){q('#vcCard')?.remove();owner='';initialized=false;busy=false;dirty=false;rows=[];rates=[];sites=[];sheet=null;token++;}
  function ui(){
    if(q('#vcCard')||!q('#masterPage'))return;
    if(!q('#vcStyles')){const s=document.createElement('style');s.id='vcStyles';s.textContent=`#vcCard .vc-wide{width:100%}#vcCard .vc-head{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-weight:900}#vcCard .vc-use{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}#vcCard .vc-use button{min-height:44px;border:1px solid #bbb;border-radius:9px;background:#fff;font-weight:800;color:#111}#vcCard .vc-use [aria-pressed=true]{background:var(--lime,#b8ff00);border:2px solid #678f00}#vcCard summary{cursor:pointer;font-weight:800;padding:10px 0}#vcCard .vc-total{font-size:19px;font-weight:900}#vcCard .vc-warn{color:#853900;background:#fff3d8;padding:10px;border-radius:9px;margin:10px 0}#vcCard input{font-size:16px}#vcCard .vc-note{font-size:12px;color:#555;line-height:1.6}`;document.head.appendChild(s);}
    const c=document.createElement('div');c.id='vcCard';c.className='card';
    c.innerHTML=`<h2>車両費・燃料差引（管理者用）</h2><p class="note">車両の日額 − その車の記録済み燃料費。人工は別計算です。社員の操作は不要です。</p>
      <div class="grid2"><div><label for="vcDate">作業日</label><input id="vcDate" type="date"></div><div><label for="vcSite">現場</label><select id="vcSite"><option value="">現場を選択</option></select></div></div>
      <button id="vcOpen" type="button" class="btn dark vc-wide" style="margin-top:10px">この日の車両費を開く</button>
      <p id="vcStatus" class="note" role="status" aria-live="polite">単価を読み込み中…</p><div id="vcBody"></div><div id="vcTotals" hidden class="row"></div><div id="vcWarnings" hidden class="vc-warn"></div>
      <button id="vcSave" type="button" class="btn lime vc-wide" style="margin-top:10px" hidden>確認した車両費を保存</button>
      <details><summary>日報を読み直す・単価設定</summary><p class="note">保存済みの金額は、単価を変えても勝手に変わりません。</p><button id="vcReload" type="button" class="btn light vc-wide">日報・燃料から計算し直す</button><div id="vcRates"></div></details>`;
    q('#masterPage').prepend(c);
    q('#vcDate').value=typeof today==='function'?today():new Date().toLocaleDateString('sv-SE');
    q('#vcOpen').onclick=()=>openSheet(false);q('#vcReload').onclick=()=>openSheet(true);q('#vcSave').onclick=save;
    ['vcDate','vcSite'].forEach(id=>q('#'+id).addEventListener('change',()=>{if(rows.length)msg('日付・現場を変更しました。「この日の車両費を開く」を押してください。');}));
    q('#vcBody').addEventListener('input',edit);q('#vcBody').addEventListener('click',tap);
    q('#vcRates').addEventListener('click',e=>{const b=e.target.closest('[data-vc-rate-save]');if(b)saveRate(Number(b.dataset.vcRateSave));});
  }
  async function init(){
    const next=identity();if(!next){if(owner)clear();return;}
    if(owner!==next){clear();owner=next;}
    if(initialized||busy)return;
    ui();if(!q('#vcCard'))return;const mine=owner;setBusy(true);
    try{
      const [rr,ss]=await Promise.all([cloudClient.from('vehicle_rate_master').select('*').eq('company_id',cloudProfile.company_id).order('sort_order'),cloudClient.from('sites').select('id,name,status').eq('company_id',cloudProfile.company_id).order('name')]);
      if(!same(mine))return;if(rr.error)throw rr.error;if(ss.error)throw ss.error;
      rates=rr.data||[];sites=ss.data||[];initialized=true;renderRates();
      q('#vcSite').innerHTML='<option value="">現場を選択</option>'+sites.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
      const current=q('#site')?.value,match=sites.find(s=>s.name===current);if(match)q('#vcSite').value=match.id;
      msg('日付・現場を選ぶと、使用車両と燃料代を日報から読み込みます。');
    }catch(e){if(same(mine))msg('読込エラー：'+e.message,true);}finally{if(same(mine))setBusy(false);}
  }
  function field(i,k,label,value,placeholder=''){return `<div><label for="vc-${i}-${k}">${label}</label><input id="vc-${i}-${k}" data-vc-key="${k}" type="number" inputmode="decimal" min="0" step="0.01" value="${value??''}" placeholder="${esc(placeholder)}"></div>`;}
  function render(){
    if(!same(owner))return;
    q('#vcBody').innerHTML=rows.map((r,i)=>`<div class="row" data-vc-index="${i}"><div class="vc-head"><span>${esc(r.label)}</span><span data-vc-net></span></div>
      <div class="vc-use" role="group" aria-label="${esc(r.label)}の使用"><button type="button" data-vc-use="no" aria-pressed="false">使用なし</button><button type="button" data-vc-use="yes" aria-pressed="false">1日使用</button></div>
      <div data-vc-calc class="vc-note"></div><details data-vc-adjust ${optional(r.manualGross)!==null||optional(r.manualFuel)!==null||r.memo?'open':''}><summary>金額を直す（必要なときだけ）</summary>
      <p class="note">空欄＝自動、0円も指定可能。短時間・現場移動の配分額はここで調整します。勤務や単価の変更で手入力は消えません。</p>
      <div class="grid2">${field(i,'manualGross','差引前の車両代（円）',r.manualGross,'自動：'+yen(r.dayRate))}${field(i,'manualFuel','差し引く燃料代（円）',r.manualFuel,'自動：'+yen(r.recordedFuel))}</div>
      <div class="grid2" style="margin-top:8px"><button type="button" class="btn light" data-vc-auto="manualGross">車両代を自動に戻す</button><button type="button" class="btn light" data-vc-auto="manualFuel">燃料差引を自動に戻す</button></div>
      <label for="vc-${i}-memo">配分・調整のメモ</label><input id="vc-${i}-memo" type="text" data-vc-key="memo" value="${esc(r.memo)}" placeholder="まとめ給油・別現場への配分など">
      <div class="note">燃料の元の日報は変更しません。給油日に記録した金額であり、その日の消費額とは限りません。</div></details></div>`).join('');
    q('#vcTotals').hidden=false;q('#vcSave').hidden=false;renderTotals();
  }
  function totals(){return rows.reduce((t,r)=>{const c=calculate(r);t.gross=money(t.gross+c.gross);t.fuel=money(t.fuel+c.fuel);t.net=money(t.net+c.net);return t;},{gross:0,fuel:0,net:0});}
  function renderTotals(){
    const extra=[];rows.forEach((r,i)=>{const el=q(`[data-vc-index="${i}"]`);if(!el)return;const c=calculate(r);
      q('[data-vc-net]',el).textContent=yen(c.net)+(r.used&&c.manual?'［手入力］':'');
      el.querySelectorAll('[data-vc-use]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.vcUse==='yes')===r.used)));
      q('[data-vc-calc]',el).textContent=r.used?`${yen(c.gross)} − 燃料 ${yen(c.fuel)} ＝ ${yen(c.net)}${!r.fuelCount&&optional(r.manualFuel)===null?'（燃料欄の記録なし・暫定0円）':''}`:'使用なし。手入力した調整値は保持しています。';
      if(c.net<0)extra.push(r.label+'：燃料代が日額を超えています。まとめ給油・配分額を確認してください。マイナスを勝手に0円にはしません。');
    });
    const t=totals();q('#vcTotals').innerHTML=`<div>差引前の車両代：${yen(t.gross)}</div><div>差し引く燃料代：${yen(t.fuel)}</div><div class="vc-total">車両費（燃料差引後）：${yen(t.net)}</div><p class="note">人工・高速代・重機費は含みません。燃料費を別途合算する際は「差引後の車両費＋燃料費」にします。日額に燃料代を重ねて足しません。ホームの総原価への統合はまだありません。消費税は自動加算しません。</p>`;
    const list=[...new Set([...warnings,...extra])],box=q('#vcWarnings');
    const was=q('#vcReviewed')?.checked||false;box.hidden=!list.length;
    box.innerHTML=list.map(w=>`<p>${esc(w)}</p>`).join('')+(list.length?`<label class="choice"><input type="checkbox" id="vcReviewed" ${was?'checked':''}>記録と金額の配分を確認した</label>`:'');
  }
  function edit(e){if(!same(owner)||busy)return;const el=e.target.closest('[data-vc-index]'),k=e.target.dataset.vcKey;if(!el||!['manualGross','manualFuel','memo'].includes(k))return;
    rows[Number(el.dataset.vcIndex)][k]=k==='memo'?e.target.value:optional(e.target.value);dirty=true;if(q('#vcReviewed'))q('#vcReviewed').checked=false;renderTotals();msg('変更は未保存です。手入力した金額を優先しています。');}
  function tap(e){if(!same(owner)||busy)return;const b=e.target.closest('button'),el=b?.closest('[data-vc-index]');if(!el)return;const r=rows[Number(el.dataset.vcIndex)];
    if(b.hasAttribute('data-vc-use'))r.used=b.dataset.vcUse==='yes';else if(['manualGross','manualFuel'].includes(b.dataset.vcAuto)){r[b.dataset.vcAuto]=null;q(`[data-vc-key="${b.dataset.vcAuto}"]`,el).value='';}else return;
    dirty=true;if(q('#vcReviewed'))q('#vcReviewed').checked=false;renderTotals();msg('使用・計算方法を変更しました。まだ保存していません。');}
  async function fetchDay(day){const result=await cloudClient.from('daily_reports').select('id,site_id,report_date,recorder_name,report_data,updated_at').eq('company_id',cloudProfile.company_id).eq('report_date',day).limit(1001);if(result.error)throw result.error;if((result.data||[]).length>1000)throw new Error('日報件数が多いため一括処理を中止しました。');return result.data||[];}
  async function openSheet(rebuild){
    if(!same(owner)||busy)return;const day=q('#vcDate').value,site=sites.find(s=>s.id===q('#vcSite').value);if(!day||!site)return msg('日付と現場を選択してください。',true);
    if((dirty||rebuild)&&!confirm('入力中の車両費を読み直します。手入力の調整をやり直してよいですか？'))return;
    const mine=owner,t=++token;setBusy(true);msg('車両費と燃料代を読み込み中…');
    try{
      const [saved,all]=await Promise.all([cloudClient.from('vehicle_cost_sheets').select('*').eq('company_id',cloudProfile.company_id).eq('work_date',day).eq('site_id',site.id).maybeSingle(),fetchDay(day)]);
      if(!same(mine)||t!==token)return;if(saved.error)throw saved.error;
      const result=derive(all,rates,site);sheet=saved.data;date=day;siteId=site.id;
      if(sheet&&!rebuild){rows=structuredClone(sheet.entries);sources=sheet.source_reports||[];warnings=[...arr(sheet.review_warnings),...result.warnings];stale=signature(sources)!==signature(all);dirty=false;
        msg(stale?'保存後に日報が変わっています。保存済み金額は保持しています。「日報・燃料から計算し直す」で確認してください。':'保存済みの車両費を開きました。手入力と当時の単価を保持しています。',stale);
      }else{rows=result.entries;sources=result.sourceReports;warnings=result.warnings;stale=false;dirty=true;msg(`日報${result.count}件から仮計算しました。同じ車両は日額1回。燃料はその車の記録分だけ差し引いています。`);}
      render();
    }catch(e){if(same(mine))msg('読込エラー：'+e.message,true);}finally{if(same(mine))setBusy(false);}
  }
  async function save(){
    if(!same(owner)||busy||!rows.length)return;
    if(date!==q('#vcDate').value||siteId!==q('#vcSite').value)return msg('日付・現場が変わっています。車両費を開き直してください。',true);
    if(stale)return msg('日報が更新されています。計算し直してから保存してください。',true);
    for(const r of rows)for(const k of ['dayRate','recordedFuel','manualGross','manualFuel']){const v=r[k];if(v!=null&&(!Number.isFinite(num(v))||num(v)<0||num(v)>1e9))return msg('金額は0以上の有効な数値にしてください。',true);}
    if(q('#vcReviewed')&&!q('#vcReviewed').checked)return msg('重複・金額配分の注意を確認し、チェックしてください。',true);
    const mine=owner;setBusy(true);
    try{
      const latest=await fetchDay(date);if(!same(mine))return;
      if(signature(latest)!==signature(sources)){stale=true;throw new Error('日報が更新されました。入力は残しています。計算し直して確認してください。');}
      const t=totals(),payload={company_id:cloudProfile.company_id,site_id:siteId,work_date:date,entries:structuredClone(rows),source_reports:sources,review_warnings:warnings,gross_total:t.gross,fuel_deduction_total:t.fuel,net_total:t.net};
      const response=sheet?await cloudClient.from('vehicle_cost_sheets').update(payload).eq('id',sheet.id).eq('company_id',cloudProfile.company_id).eq('updated_at',sheet.updated_at).select('*'):await cloudClient.from('vehicle_cost_sheets').insert(payload).select('*');
      if(!same(mine))return;if(response.error)throw response.error;if(!response.data?.length)throw new Error('別端末で保存されています。開き直して確認してください。');
      sheet=response.data[0];dirty=false;msg('車両費をクラウド保存しました。差引額・手入力も保存済みです。');
    }catch(e){if(same(mine))msg('車両費は未保存です：'+e.message,true);}finally{if(same(mine))setBusy(false);}
  }
  function renderRates(){q('#vcRates').innerHTML=rates.map((r,i)=>`<div class="row" data-vc-rate="${i}"><b>${esc(r.label)}</b><label>1台1日の金額（人工別・燃料差引前）</label><input type="number" min="0" step="0.01" inputmode="decimal" value="${num(r.daily_rate)}"><button type="button" data-vc-rate-save="${i}" class="btn light vc-wide" style="margin-top:8px">この車両の単価を保存</button></div>`).join('');}
  async function saveRate(i){if(!same(owner)||busy)return;const r=rates[i],v=Number(q(`[data-vc-rate="${i}"] input`).value);if(!Number.isFinite(v)||v<0||v>1e9)return msg('単価は0以上の数値で入力してください。',true);
    const mine=owner;setBusy(true);try{const result=await cloudClient.from('vehicle_rate_master').update({daily_rate:v,updated_at:new Date().toISOString()}).eq('id',r.id).eq('company_id',cloudProfile.company_id).eq('updated_at',r.updated_at).select('*');if(!same(mine))return;if(result.error)throw result.error;if(!result.data?.length)throw new Error('別端末で変更されています。再読み込みしてください。');rates[i]=result.data[0];msg('単価を保存しました。次の新規計算から反映します。開いている計算・保存済み金額は変えません。');}catch(e){if(same(mine))msg('単価は未保存です：'+e.message,true);}finally{if(same(mine))setBusy(false);}}
  function start(){
    init();const logged=q('#cloudLoggedIn');if(logged)new MutationObserver(init).observe(logged,{attributes:true,attributeFilter:['style']});
    document.addEventListener('click',e=>{if(e.target.closest?.('nav [data-page="masterPage"]'))init();});
    window.addEventListener('pageshow',init);document.addEventListener('visibilitychange',()=>{if(!document.hidden)init();});
    window.addEventListener('beforeunload',e=>{if(dirty&&same(owner)){e.preventDefault();e.returnValue='';}});
    let count=0;const t=setInterval(()=>{init();if(initialized||++count>=30)clearInterval(t);},1000);
    setInterval(()=>{if(owner&&!same(owner))clear();},1000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
