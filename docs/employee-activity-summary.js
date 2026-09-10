/* TOYA One employee activity summary: read-only, no prices, rates or financial totals.
 * A separate employee-only card. Administrator views and authentication are unchanged.
 * Time is aggregated only from recorded minutes; missing times are not invented.
 */
(() => {
  'use strict';
  const arr = x => Array.isArray(x) ? x : [];
  const norm = x => String(x ?? '').normalize('NFKC').replace(/[\s　]/g, '').toLowerCase();
  const key = x => ['sk55', 'sk55sr'].includes(norm(x)) ? 'sk55' : norm(x) === 'アームロール' ? norm('4tアームロール') : norm(x);
  const num = x => x == null || typeof x === 'boolean' || String(x).trim() === '' || !Number.isFinite(Number(x)) || Number(x) < 0 ? null : Number(x);
  const safe = x => {
    const t = String(x ?? '').slice(0, 160);
    return /[¥￥$€£]|[0-9０-９][0-9０-９.,，．]*\s*円/.test(t) ? '名称を確認してください' : t;
  };
  const name = x => safe(typeof x === 'string' ? x : x?.name);
  const kinds = {labor:'自社の作業者', dispatch:'明建・朝日', vehicle:'車両', equipment:'重機', attachment:'アタッチメント', tool:'小型機械・工具'};
  const cleanResource = x => {
    const n = name(x), m = n.match(/\s*[×x]\s*(\d+)\s*[台本個]$/);
    return {label:m ? n.slice(0,m.index).trim() : n, quantity:m ? Number(m[1]) : 1, minutes:x && typeof x === 'object' && num(x.hours) !== null ? Number(x.hours)*60 : null};
  };
  // Strict projection: prices, free-form notes, rates and entire report objects never enter the result.
  function project(r, sites) {
    const d = r.report_data || r;
    const site = sites.find(s => s.id === r.site_id);
    return {
      id:String(r.id), date:String(r.report_date || '').slice(0,10), siteId:r.site_id, site:safe(site?.name || d.site),
      workers:arr(d.workers).map(name),
      dispatch:[['明建','meikenCount'],['朝日','asahiCount']].map(([label,f])=>({label,quantity:num(d[f]) || 0})),
      vehicles:arr(d.vehicles).map(cleanResource), machines:arr(d.machines).map(cleanResource), attachments:arr(d.attachments).map(cleanResource),
      hours:d.usageHours?.version === 1 ? arr(d.usageHours.entries).filter(e=>Object.hasOwn(kinds,e.kind)).map(e=>({
        kind:e.kind, label:safe(e.label), quantity:num(e.quantity),
        allocations:arr(e.allocations).map(a=>({site:safe(a.site),minutes:num(a.minutes)}))
      })) : [],
      moves:arr(d.siteMoves).map(m=>({site:safe(m.site),vehicle:safe(m.vehicle),start:String(m.start||''),end:String(m.end||''),waste:safe(m.waste),quantity:num(m.qty),unit:safe(m.unit)})),
      waste:arr(d.items).filter(x=>x.isWaste || /^産廃[：:]/.test(String(x.name))).map(x=>({label:safe(String(x.name).replace(/^産廃[：:]/,'')),quantity:num(x.qty ?? x.quantity),unit:safe(x.unit)})),
      fuels:arr(d.fuels).map(f=>({label:safe(f.type),quantity:num(f.qty ?? f.liters),unit:safe(f.unit || (['グリース','ブルーグリス'].includes(f.type)?'本':'L'))}))
    };
  }
  function analyze(raw, sites, target, toolNames=[]) {
    const reports=[...new Map(arr(raw).map(r=>[String(r.id),project(r,sites)])).values()];
    const own=reports.filter(r=>r.siteId === target.id), days=new Set(own.map(r=>r.date)), daily=new Map(), warnings=new Set(), groups=new Map();
    const gid=(date,kind,label)=>JSON.stringify([date,kind,key(label)]);
    const tools=new Set(toolNames.map(key));
    function touch(date,kind,label,quantity=1,minutes=null) {
      if(!label)return;
      const id=gid(date,kind,label);
      if(!daily.has(id))daily.set(id,{date,kind,label,quantity,oldTimes:[],minutes:null,explicit:false});
      const row=daily.get(id);row.quantity=Math.max(row.quantity,quantity);
      if(minutes!==null)row.oldTimes.push(minutes);
      days.add(date);return row;
    }
    for(const r of reports)for(const e of r.hours) {
      const id=gid(r.date,e.kind,e.label);
      if(!groups.has(id))groups.set(id,{date:r.date,kind:e.kind,label:e.label,entries:[]});
      groups.get(id).entries.push(e);
    }
    for(const r of own) {
      r.workers.forEach(n=>touch(r.date,'labor',n));
      r.dispatch.filter(x=>x.quantity>0).forEach(x=>touch(r.date,'dispatch',x.label,x.quantity));
      r.vehicles.forEach(x=>touch(r.date,'vehicle',x.label,x.quantity));
      r.machines.forEach(x=>touch(r.date,'equipment',x.label,x.quantity,x.minutes));
      r.attachments.forEach(x=>{
        const kind=groups.has(gid(r.date,'tool',x.label)) || tools.has(key(x.label)) ? 'tool' : 'attachment';
        touch(r.date,kind,x.label,x.quantity);
      });
    }
    const moves=[];
    for(const r of reports)for(const m of r.moves)if(r.siteId===target.id || norm(m.site)===norm(target.name)) {
      days.add(r.date);moves.push({date:r.date,from:r.site,to:m.site,vehicle:m.vehicle,start:m.start,end:m.end,waste:m.waste,quantity:m.quantity,unit:m.unit});
      if(r.siteId!==target.id && m.vehicle)touch(r.date,'vehicle',m.vehicle);
    }
    for(const g of groups.values()) {
      const relevant=g.entries.some(e=>e.allocations.some(a=>norm(a.site)===norm(target.name)));
      if(!relevant)continue;
      const canonical=e=>JSON.stringify([e.quantity,e.allocations.map(a=>[norm(a.site),a.minutes]).sort()]);
      const same=new Set(g.entries.map(canonical)).size===1, e=g.entries[0];
      const allocation=e.allocations.find(a=>norm(a.site)===norm(target.name));
      const row=touch(g.date,g.kind,g.label,e.quantity || 1);row.explicit=true;
      const valid=same && Number.isInteger(e.quantity) && e.quantity>0 && e.quantity<=100 && e.allocations.length>0 &&
        e.allocations.every(a=>sites.some(s=>norm(s.name)===norm(a.site)) && Number.isInteger(a.minutes) && a.minutes>=0 && a.minutes<=1440) &&
        new Set(e.allocations.map(a=>norm(a.site))).size===e.allocations.length && e.allocations.reduce((n,a)=>n+(a.minutes||0),0)<=1440;
      if(valid && allocation) {row.quantity=e.quantity;row.minutes=allocation.minutes;}
      else warnings.add('時間未入力・配分の不一致がある対象は、時間の合計に含めていません。');
    }
    for(const row of daily.values())if(!row.explicit) {
      const times=[...new Set(row.oldTimes.filter(n=>Number.isFinite(n)&&n>=0&&n<=1440))];
      if(times.length===1)row.minutes=times[0];
      else if(times.length>1)warnings.add('同じ機械の同日の記録時間が異なるため、時間は確認待ちです。');
    }
    const resourceRows=Object.fromEntries(Object.keys(kinds).map(k=>[k,[]])), aggregated=new Map();
    for(const d of daily.values()) {
      const id=JSON.stringify([d.kind,key(d.label)]);
      if(!aggregated.has(id))aggregated.set(id,{kind:d.kind,label:d.label,days:0,knownDays:0,missingDays:0,minutes:0,maxQuantity:0});
      const a=aggregated.get(id);a.days++;a.maxQuantity=Math.max(a.maxQuantity,d.quantity);
      if(d.minutes===null)a.missingDays++;else{a.knownDays++;a.minutes+=d.minutes*d.quantity;}
    }
    for(const a of aggregated.values())resourceRows[a.kind].push(a);
    Object.values(resourceRows).forEach(xs=>xs.sort((a,b)=>a.label.localeCompare(b.label,'ja')));
    const quantityRows=field=>{
      const map=new Map();let missing=0;
      for(const r of own)for(const x of r[field]) {
        if(!x.label||x.quantity===null||!x.unit){missing++;continue;}
        const id=JSON.stringify([norm(x.label),norm(x.unit)]);
        if(!map.has(id))map.set(id,{label:x.label,unit:x.unit,quantity:0,rows:0});
        const a=map.get(id);a.quantity=Math.round((a.quantity+x.quantity)*1e6)/1e6;a.rows++;
      }
      return {rows:[...map.values()],missing};
    };
    const labor=[...resourceRows.labor,...resourceRows.dispatch];
    return {reportCount:own.length,days:days.size,laborMinutes:labor.reduce((n,x)=>n+x.minutes,0),missingLaborDays:labor.reduce((n,x)=>n+x.missingDays,0),resources:resourceRows,waste:quantityRows('waste'),fuels:quantityRows('fuels'),moves,warnings:[...warnings]};
  }
  function period(mode, month, day) {
    if(mode==='all')return {};
    if(mode==='month' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      const [y,m]=month.split('-').map(Number);
      return {start:month+'-01',end:(m===12?y+1:y)+'-'+String(m===12?1:m+1).padStart(2,'0')+'-01'};
    }
    if(mode==='day' && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
      const dt=new Date(day+'T00:00:00Z');if(!Number.isFinite(dt.getTime())||dt.toISOString().slice(0,10)!==day)throw new Error('invalid period');
      dt.setUTCDate(dt.getUTCDate()+1);return {start:day,end:dt.toISOString().slice(0,10)};
    }
    throw new Error('invalid period');
  }
  const engine=Object.freeze({analyze,project,period});
  if(typeof module==='object' && module.exports){module.exports=engine;return;}
  if(window.__toyaEmployeeSummaryV1)return;window.__toyaEmployeeSummaryV1=true;
  const q=s=>document.querySelector(s), esc=x=>safe(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const identity=()=>typeof cloudProfile!=='undefined'&&cloudProfile?.role==='employee'&&cloudProfile.active===true&&cloudProfile.company_id&&typeof cloudClient!=='undefined'&&cloudClient?cloudProfile.id+':'+cloudProfile.company_id:'';
  const active=()=>!!q('#homePage')?.classList.contains('active');
  let owner='',ticket=0,loading=false,sites=[],lastRead=0,subscribedClient=null;
  const fmt=n=>Number(n).toLocaleString('ja-JP',{maximumFractionDigits:2});
  const duration=n=>Math.floor(n/60)+'時間'+fmt(n%60)+'分';
  function reset(){ticket++;owner='';loading=false;sites=[];lastRead=0;q('#employeeSummaryCard')?.remove();}
  function mount(){
    const id=identity();if(!id){if(owner||q('#employeeSummaryCard'))reset();return false;}
    if(owner!==id){reset();owner=id;}
    if(!q('#homePage'))return false;
    if(!q('#employeeSummaryStyle')){const s=document.createElement('style');s.id='employeeSummaryStyle';s.textContent='#employeeSummaryCard .es-controls{display:grid;grid-template-columns:1fr 1fr;gap:10px}#employeeSummaryCard input,#employeeSummaryCard select{width:100%;min-width:0;box-sizing:border-box;font-size:16px;min-height:44px}#employeeSummaryCard .btn{width:100%;margin:12px 0}#employeeSummaryCard .es-top{padding:14px;border-radius:12px;background:#111;color:#fff;line-height:1.8;margin:12px 0}#employeeSummaryCard .es-top strong{color:var(--lime,#b8ff00);font-size:22px;display:block}#employeeSummaryCard .es-row{border-bottom:1px solid #ddd;padding:12px 0;overflow-wrap:anywhere}#employeeSummaryCard details>summary{font-weight:800;font-size:16px;cursor:pointer;padding:14px 0}#employeeSummaryCard .es-warning{background:#fff5dd;padding:12px;border-radius:10px;color:#634500;line-height:1.6}#employeeSummaryCard [hidden]{display:none!important}';document.head.appendChild(s);}
    if(!q('#employeeSummaryCard')) {
      const box=document.createElement('div');box.id='employeeSummaryCard';box.className='card';
      box.innerHTML='<h2>現場の集計（金額なし）</h2><p class="note">作業時間・使用状況・搬出数量を共有します。金額・単価は表示しません。</p><label>現場<select id="esSite"><option value="">読み込み中</option></select></label><div class="es-controls"><div><label>期間<select id="esMode"><option value="month">月ごと</option><option value="day">1日だけ</option><option value="all">全期間</option></select></label></div><div><label id="esPeriodLabel">対象月</label><input type="month" id="esMonth"><input type="date" id="esDay" hidden></div></div><button type="button" class="btn dark" id="esRefresh">集計を更新</button><p class="note" role="status" id="esStatus"></p><div id="esResult"></div>';
      const home=q('#homePage'),anchor=q('#siteSummaryCard');if(anchor?.parentElement===home)anchor.after(box);else home.appendChild(box);
      const today=typeof window.today==='function'?window.today():new Date().toLocaleDateString('sv-SE');q('#esMonth').value=today.slice(0,7);q('#esDay').value=today;
      q('#esMode').onchange=()=>{const m=q('#esMode').value;q('#esMonth').hidden=m!=='month';q('#esDay').hidden=m!=='day';q('#esPeriodLabel').hidden=m==='all';q('#esPeriodLabel').textContent=m==='day'?'作業日':'対象月';invalidate();};
      ['esSite','esMonth','esDay'].forEach(n=>q('#'+n).onchange=invalidate);q('#esRefresh').onclick=invalidate;
    }
    return true;
  }
  function invalidate(){ticket++;loading=false;lastRead=0;if(q('#esResult'))q('#esResult').innerHTML='';load();}
  async function read(table,fields,company,bounds,t){
    const rows=[];
    for(let offset=0;offset<100000;offset+=500){
      if(t!==ticket||owner!==identity())throw new Error('stale');
      let req=cloudClient.from(table).select(fields).eq('company_id',company).order('id').range(offset,offset+499);
      if(bounds?.start)req=req.gte('report_date',bounds.start).lt('report_date',bounds.end);
      const r=await req;if(r.error)throw r.error;rows.push(...arr(r.data));if(arr(r.data).length<500)return rows;
    }
    throw new Error('too many records');
  }
  function render(a){
    let html='<div class="es-top">日報 '+a.reportCount+'件 ／ 記録のある日 '+a.days+'日<strong>延べ作業時間 '+duration(a.laborMinutes)+'</strong><span>時間入力済みの自社・応援分の合計です。'+(a.missingLaborDays?'時間未入力 '+a.missingLaborDays+'件（日・対象別）は含めません。':'')+'</span></div>';
    if(!a.days)html+='<p class="note">この条件の記録はありません。</p>';
    for(const [kind,title] of Object.entries(kinds)) {
      const xs=a.resources[kind];
      html+='<details'+(['labor','vehicle'].includes(kind)?' open':'')+'><summary>'+title+'（'+xs.length+(kind==='labor'?'人':'種類')+'）</summary>'+(xs.length?xs.map(x=>'<div class="es-row"><b>'+esc(x.label)+'</b><div>'+x.days+'日記録 ／ '+(x.knownDays?duration(x.minutes):'時間未入力')+'</div><div class="note">'+(x.maxQuantity>1?'最大 '+x.maxQuantity+(kind==='dispatch'?'人':'台・本')+'。時間は人数・数量を掛けた延べ時間です。':'')+(x.missingDays?' 時間未入力 '+x.missingDays+'日':'')+'</div></div>').join(''):'<p class="note">記録なし</p>')+'</details>';
    }
    for(const [field,title] of [['waste','搬出数量（品目・単位別）'],['fuels','給油・油脂の数量']]) {
      const x=a[field];html+='<details open><summary>'+title+'</summary>'+(x.rows.length?x.rows.map(r=>'<div class="es-row"><b>'+esc(r.label)+'</b>　'+fmt(r.quantity)+esc(r.unit)+'<div class="note">'+r.rows+'行の記録</div></div>').join(''):'<p class="note">記録なし</p>')+(x.missing?'<p class="es-warning">数量・単位未入力 '+x.missing+'件は合計に含めていません。</p>':'')+'</details>';
    }
    html+='<details><summary>現場移動の記録（'+a.moves.length+'件）</summary>'+a.moves.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,30).map(m=>'<div class="es-row"><b>'+esc(m.date)+'</b><div>'+esc(m.from)+' → '+esc(m.to)+'</div><div>'+esc(m.vehicle||'車両未記入')+(m.waste&&m.waste!=='なし'?' ／ '+esc(m.waste)+' '+(m.quantity===null?'数量未入力':fmt(m.quantity)+esc(m.unit)):'')+'</div></div>').join('')+(a.moves.length>30?'<p class="note">最新30件を表示。期間を絞ると過去分も確認できます。</p>':'')+'</details>';
    if(a.warnings.length)html+='<p class="es-warning">'+a.warnings.map(esc).join('<br>')+'</p>';
    html+='<details><summary>集計の見方</summary><p class="note">同じ対象の同日の時間は、同じ配分記録なら1回だけ集計します。違う時間が重なったときは要確認にします。古い日報の開始・終了だけから休憩や実働時間を推測しません。重機の旧入力時間は記録分として扱います。車両などの「種類」は登録名の数で、実際の総台数とは異なります。リース機械の時間はこの一覧にはまだ含みません。</p><p class="note">数量はこの現場の日報の行を集計します。kg・t・㎥・台などの単位は混ぜません。現場移動欄の数量は別表示で、搬出数量へ重ねて加えません。同じ搬出・給油を複数人で重複登録していないか確認してください。</p></details>';
    q('#esResult').innerHTML=html;
  }
  async function load(){
    if(!mount()||loading||!active())return;const mine=identity(),t=++ticket;loading=true;
    q('#esRefresh').disabled=true;q('#esStatus').textContent='記録を読み込み中…';q('#esResult').innerHTML='';
    try {
      const company=cloudProfile.company_id,bounds=period(q('#esMode').value,q('#esMonth').value,q('#esDay').value);
      const rawSites=await read('sites','id,name,status',company,null,t);
      if(t!==ticket||mine!==identity())return;
      sites=rawSites.map(s=>({id:s.id,name:safe(s.name),status:s.status})).filter(s=>s.name).sort((a,b)=>a.name.localeCompare(b.name,'ja'));
      const chosen=q('#esSite').value,mainSite=q('#site')?.value;
      q('#esSite').innerHTML='<option value="">現場を選択</option>'+sites.filter(s=>s.status==='active'&&!['新しい現場','現場名をあとで変更','未登録現場'].includes(s.name)||s.id===chosen).map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>').join('');
      q('#esSite').value=sites.find(s=>s.id===chosen)?.id || sites.find(s=>norm(s.name)===norm(mainSite)&&s.status==='active')?.id || '';
      window.ToyaSharedSiteUI?.syncBrowse(q('#esSite'));
      const target=sites.find(s=>s.id===q('#esSite').value);if(!target){q('#esStatus').textContent='現場を選んでください。';return;}
      // Read shared report facts only. Never query pricing masters or confirmed cost sheets.
      const fields='id,site_id,report_date,workers:report_data->workers,meikenCount:report_data->meikenCount,asahiCount:report_data->asahiCount,vehicles:report_data->vehicles,machines:report_data->machines,attachments:report_data->attachments,usageHours:report_data->usageHours,siteMoves:report_data->siteMoves,items:report_data->items,fuels:report_data->fuels';
      const rows=await read('daily_reports',fields,company,bounds,t);
      if(t!==ticket||mine!==identity())return;
      const names=[...document.querySelectorAll('#smallToolChoices input[name="attachment"]')].map(e=>e.value);
      render(analyze(rows,sites,target,names));lastRead=Date.now();q('#esStatus').textContent=target.name+' ／ '+(bounds.start?bounds.start+(q('#esMode').value==='month'?' からの1か月':''):'全期間')+' ／ 更新済み';
    }catch(e){if(t===ticket&&mine===identity()){q('#esResult').innerHTML='';q('#esStatus').textContent='集計を読み込めませんでした。接続を確認して「集計を更新」を押してください。';lastRead=Date.now();}}
    finally{if(t===ticket&&mine===identity()){loading=false;if(q('#esRefresh'))q('#esRefresh').disabled=false;}}
  }
  function tick(){
    if(!mount())return;
    if(cloudClient!==subscribedClient&&cloudClient.auth?.onAuthStateChange){subscribedClient=cloudClient;cloudClient.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')reset();});}
    if(active()&&!loading&&Date.now()-lastRead>60000)load();
  }
  document.addEventListener('click',e=>{if(e.target.closest('nav [data-page="homePage"]'))setTimeout(()=>{mount();load();},0);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(tick,350),{once:true});else setTimeout(tick,350);
  setInterval(tick,2000);
})();
