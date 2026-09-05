from pathlib import Path

paths=[Path('docs/index.html'),Path('docs/TOYA_One_v5_1_0_cloud_shared.html'),Path('docs/TOYA_One_v5_2_0_calendar_edit.html')]

old='''<div class="card"><h2>今日の状況</h2><div class="statgrid">
<div class="stat"><b id="todayReports">0</b><span>本日の日報</span></div>
<div class="stat"><b id="activeSites">0</b><span>登録現場</span></div>
<div class="stat"><b id="todayWorkers">0</b><span>本日の作業人数</span></div>
<div class="stat"><b id="todayMachines">0</b><span>本日の重機稼働</span></div>
</div></div>'''

new='''<div class="card"><h2>今日の状況</h2><div class="statgrid">
<div class="stat"><b id="todayReports">0</b><span>本日の日報</span></div>
<div class="stat"><b id="todaySubmitted">0</b><span>提出済み</span></div>
<div class="stat"><b id="todayPending">0</b><span>未提出</span></div>
<div class="stat"><b id="todayWorkers">0</b><span>本日の作業人数</span></div>
<div class="stat"><b id="todayMachines">0</b><span>本日の重機稼働</span></div>
<div class="stat"><b id="activeSites">0</b><span>登録現場</span></div>
</div>
<div style="margin-top:12px"><div style="font-weight:900;margin-bottom:7px">日報提出状況</div><div id="dailySubmissionList"></div><div class="note" style="margin-top:7px">夕方に日報を入力すると「提出済み」に変わります。1日に複数現場の日報があっても、提出者は1人として数えます。</div></div>
</div>'''

oldfn='''async function renderHome(){
  let a=cloudProfile?cloudReportsCache:get(LS.reports,[]);
  if(cloudProfile&&!a.length){try{a=await cloudFetchReports()}catch(e){console.warn(e)}}
  const td=today(),todayA=a.filter(x=>x.date===td);
  $('#todayReports').textContent=todayA.length;
  $('#activeSites').textContent=cloudProfile?cloudSitesCache.filter(x=>x.status!=='inactive').length:get(LS.sites,[]).filter(x=>x!=='未登録現場').length;
  $('#todayWorkers').textContent=todayA.reduce((s,d)=>s+(d._hasFullData?((d.workers||[]).length+(d.meikenCount||0)+(d.asahiCount||0)+(d.otherWorker?1:0)):Number(d._workerTotal||0)),0);
  $('#todayMachines').textContent=todayA.reduce((s,d)=>s+(d.machines||[]).length+(d.leaseMachines||[]).reduce((q,x)=>q+(Number(x.count)||1),0),0);
  const b=$('#todayList');
  b.innerHTML=todayA.length?todayA.map(d=>`<div class="record"><div class="record-title">${cloudHtml(d.site)}</div><div class="meta">記入者：${cloudHtml(d.writer||'未設定')}${cloudProfile?`／クラウド登録者：${cloudHtml(d.cloudCreatedByName)}`:''}／${cloudHtml(d.start)}〜${cloudHtml(d.end)}</div>${cloudProfile?cloudReportButtons(d):''}</div>`).join(''):'<div class="empty">本日の日報はまだありません。</div>';
}'''

newfn='''const DAILY_REPORT_STAFF=['上村 凌太','宮下 哲也'];
async function renderHome(){
  let a=cloudProfile?cloudReportsCache:get(LS.reports,[]);
  if(cloudProfile&&!a.length){try{a=await cloudFetchReports()}catch(e){console.warn(e)}}
  const td=today(),todayA=a.filter(x=>x.date===td);
  const submittedNames=new Set(todayA.map(d=>String(d.writer||'').trim()).filter(Boolean));
  const submitted=DAILY_REPORT_STAFF.filter(n=>submittedNames.has(n));
  const pending=DAILY_REPORT_STAFF.filter(n=>!submittedNames.has(n));
  $('#todayReports').textContent=todayA.length;
  if($('#todaySubmitted'))$('#todaySubmitted').textContent=submitted.length;
  if($('#todayPending'))$('#todayPending').textContent=pending.length;
  $('#activeSites').textContent=cloudProfile?cloudSitesCache.filter(x=>x.status!=='inactive').length:get(LS.sites,[]).filter(x=>x!=='未登録現場').length;
  $('#todayWorkers').textContent=todayA.reduce((s,d)=>s+(d._hasFullData?((d.workers||[]).length+(d.meikenCount||0)+(d.asahiCount||0)+(d.otherWorker?1:0)):Number(d._workerTotal||0)),0);
  $('#todayMachines').textContent=todayA.reduce((s,d)=>s+(d.machines||[]).length+(d.leaseMachines||[]).reduce((q,x)=>q+(Number(x.count)||1),0),0);
  const sub=$('#dailySubmissionList');
  if(sub){
    sub.innerHTML=DAILY_REPORT_STAFF.map(name=>{
      const reports=todayA.filter(d=>String(d.writer||'').trim()===name);
      const done=reports.length>0;
      const sites=[...new Set(reports.map(d=>d.site).filter(Boolean))];
      return `<div class="record" style="margin-bottom:7px;padding:10px;display:flex;align-items:center;justify-content:space-between;gap:10px"><div><b>${cloudHtml(name)}</b><div class="meta" style="margin:3px 0 0">${done?(sites.length?cloudHtml(sites.join('・')):`日報 ${reports.length}件`):'夕方の日報入力待ち'}</div></div><span class="badge" style="background:${done?'#111':'#ececec'};color:${done?'#b8ff00':'#777'}">${done?'提出済み':'未提出'}</span></div>`;
    }).join('');
  }
  const b=$('#todayList');
  b.innerHTML=todayA.length?todayA.map(d=>`<div class="record"><div class="record-title">${cloudHtml(d.site)}</div><div class="meta">記入者：${cloudHtml(d.writer||'未設定')}${cloudProfile?`／クラウド登録者：${cloudHtml(d.cloudCreatedByName)}`:''}／${cloudHtml(d.start)}〜${cloudHtml(d.end)}</div>${cloudProfile?cloudReportButtons(d):''}</div>`).join(''):'<div class="empty">本日の日報はまだありません。夕方の提出後にここへ表示されます。</div>';
}'''

for p in paths:
    if not p.exists():
        continue
    s=p.read_text(encoding='utf-8')
    if 'id="todaySubmitted"' not in s:
        if old not in s:
            raise SystemExit(f'today status block not found in {p}')
        s=s.replace(old,new,1)
    if 'const DAILY_REPORT_STAFF=' not in s:
        if oldfn not in s:
            raise SystemExit(f'renderHome block not found in {p}')
        s=s.replace(oldfn,newfn,1)
    p.write_text(s,encoding='utf-8')
