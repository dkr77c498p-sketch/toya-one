from pathlib import Path
import re

SOURCE = Path('docs/index.html')
MIRROR = Path('docs/TOYA_One_v5_1_0_cloud_shared.html')
SNAPSHOT = Path('docs/TOYA_One_v5_2_0_calendar_edit.html')
s = SOURCE.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global s
    if old not in s:
        raise RuntimeError(f'pattern not found: {label}')
    s = s.replace(old, new, 1)

# Version text
s = s.replace('v5.1.0', 'v5.2.0')

# Styles for calendar/search/edit state
replace_once('</style>', r'''
/* v5.2 日報カレンダー・検索・編集 */
.records-mode{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
.records-mode .active{background:#111;color:#fff}
.records-filter{display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px;margin:10px 0}
.records-filter-date{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
.calendar-head{display:grid;grid-template-columns:52px 1fr 52px;gap:8px;align-items:center;margin:8px 0 10px}
.calendar-head b{text-align:center;font-size:18px}
.calendar-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:5px}
.calendar-week{font-size:11px;text-align:center;font-weight:900;color:#666;padding:4px 0}
.calendar-day{min-height:72px;border:1px solid var(--line);border-radius:10px;background:#fff;padding:6px;text-align:left;position:relative;overflow:hidden}
.calendar-day.other{opacity:.32}.calendar-day.has{border:2px solid #111}.calendar-day.selected{background:#efffc4;border-color:#7fac00}
.calendar-day .daynum{font-weight:900;font-size:13px}.calendar-day .count{display:inline-block;background:#111;color:#fff;border-radius:999px;padding:2px 6px;font-size:10px;margin-top:4px}
.calendar-day .mini{display:block;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:3px}
.edit-banner{display:none;background:#fff4d6;border:2px solid #f0b429;border-radius:12px;padding:11px 12px;margin-bottom:12px;font-weight:900}
.edit-banner.show{display:flex;justify-content:space-between;gap:8px;align-items:center}
@media(max-width:650px){.records-filter{grid-template-columns:1fr}.calendar-day{min-height:62px;padding:4px}.calendar-day .mini{display:none}}
</style>''', 'style')

# Edit banner and past-date helpers
replace_once(
    '<div class="tap-guide">v5.2.0｜<span>会社全員で共有</span>、日報・写真・利用状況をクラウド表示。</div>',
    '<div class="tap-guide">v5.2.0｜<span>会社全員で共有</span>、日報・写真・利用状況をクラウド表示。</div>\n<div id="editBanner" class="edit-banner"><span id="editBannerText">日報を編集中</span><button type="button" class="btn light" onclick="cancelReportEdit()">編集をやめる</button></div>',
    'edit banner')
replace_once(
    '<div class="grid2"><div><label>日付</label><input id="date" type="date"></div><div><label>天気</label>',
    '<div class="grid2"><div><label>日付</label><input id="date" type="date"><div class="quick-row"><button type="button" class="quick-btn" onclick="setReportDateOffset(0)">今日</button><button type="button" class="quick-btn" onclick="setReportDateOffset(-1)">昨日</button><button type="button" class="quick-btn" onclick="setReportDateOffset(-3)">3日前</button></div><div class="note">忘れた日報は過去の日付を選んで後から登録できます。</div></div><div><label>天気</label>',
    'date helpers')

# Replace saved report panel with calendar/list browser controls
replace_once(
    '<div class="card"><h2>保存済み日報</h2><div class="toolbar"><button class="btn dark" onclick="exportCSV()">CSV出力</button><button class="btn light" onclick="renderRecords()">再読み込み</button></div><div id="records"></div></div>',
    '''<div class="card"><h2>保存済み日報</h2>
<div class="records-mode"><button id="calendarModeBtn" class="btn active" type="button" onclick="setRecordView('calendar')">📅 カレンダー</button><button id="listModeBtn" class="btn light" type="button" onclick="setRecordView('list')">☰ 一覧・検索</button></div>
<div class="records-filter"><input id="recordSearch" type="text" placeholder="現場名・記入者・作業内容を検索" oninput="rerenderRecordBrowser()"><select id="recordSiteFilter" onchange="rerenderRecordBrowser()"><option value="">全現場</option></select><select id="recordWriterFilter" onchange="rerenderRecordBrowser()"><option value="">全員</option></select></div>
<div class="records-filter-date"><div><label>開始日</label><input id="recordDateFrom" type="date" onchange="rerenderRecordBrowser()"></div><div><label>終了日</label><input id="recordDateTo" type="date" onchange="rerenderRecordBrowser()"></div></div>
<div id="recordsCalendar"></div>
<div class="toolbar" style="margin-top:10px"><button class="btn dark" onclick="exportCSV()">CSV出力</button><button class="btn light" onclick="renderRecords()">再読み込み</button></div><div id="records"></div></div>''',
    'records ui')

replace_once('<button class="btn lime wide" onclick="saveReport()">日報を保存</button>', '<button id="saveReportBtn" class="btn lime wide" onclick="saveReport()">日報を保存</button>', 'save button')

# State
replace_once('let cloudSitesCache=[];', '''let cloudSitesCache=[];
let editingReport=null;
let currentRecordsData=[];
let recordViewMode='calendar';
let recordCalendarMonth='';
let recordSelectedDate='';''', 'state')

# Keep original submitter when an admin edits somebody else's report
replace_once("    cloudSubmittedById:session?.user?.id||null,\n    cloudSubmittedByName:cloudProfile.name||''\n  }));", "    cloudSubmittedById:d.cloudCreatedById||session?.user?.id||null,\n    cloudSubmittedByName:d.cloudCreatedByName||cloudProfile.name||''\n  }));", 'submitter')
replace_once("    created_by:session?.user?.id||null,\n    report_data:reportData,", "    created_by:d.cloudCreatedById||session?.user?.id||null,\n    report_data:reportData,", 'created_by')

# Photo viewer fix: the report-detail modal was above the photo modal, so close it first
replace_once(
'''async function cloudShowPhotos(reportId,title){
  if(!cloudProfile)return alert('先にログインしてください。');
  $('#photoViewerTitle').textContent=`${title||'クラウド日報'}｜クラウド写真`;
  const grid=$('#savedPhotoGrid');
  grid.innerHTML='<div class="empty">写真を読み込み中…</div>';
  $('#photoViewer').classList.add('open');''',
'''async function cloudShowPhotos(reportId,title){
  if(!cloudProfile)return alert('先にログインしてください。');
  closeCloudReportDetail();
  $('#photoViewerTitle').textContent=`${title||'クラウド日報'}｜クラウド写真`;
  const grid=$('#savedPhotoGrid');
  grid.innerHTML='<div class="empty">写真を読み込み中…</div>';
  const viewer=$('#photoViewer');
  viewer.classList.add('open');
  viewer.scrollTop=0;
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));''',
'photo modal')

# Cloud actions: detail / photos / edit / duplicate / delete
replace_once(
'''function cloudReportButtons(d){
  const title=encodeURIComponent(`${d.date||''} ${d.site||'現場未設定'}`);
  return `<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:8px"><button class="btn dark" onclick="showCloudReportDetail('${d.cloudId}')">日報詳細を見る</button>${d.photoCount?`<button class="btn light" onclick="cloudShowPhotos('${d.cloudId}',decodeURIComponent('${title}'))">クラウド写真を見る（${d.photoCount}）</button>`:''}</div>`;
}''',
'''function cloudReportButtons(d){
  const title=encodeURIComponent(`${d.date||''} ${d.site||'現場未設定'}`);
  const canDelete=cloudProfile&&(cloudProfile.role==='admin'||String(d.cloudCreatedById||'')===String(cloudProfile.id||''));
  return `<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:8px"><button class="btn dark" onclick="showCloudReportDetail('${d.cloudId}')">日報詳細を見る</button>${d.photoCount?`<button class="btn light" onclick="cloudShowPhotos('${d.cloudId}',decodeURIComponent('${title}'))">クラウド写真を見る（${d.photoCount}）</button>`:''}<button class="btn light" onclick="editCloudReport('${d.cloudId}')">編集</button><button class="btn light" onclick="duplicateCloudReport('${d.cloudId}')">別現場へ複製</button>${canDelete?`<button class="btn danger" onclick="deleteCloudReport('${d.cloudId}')">削除</button>`:''}</div>`;
}''',
'cloud buttons')

# collect() preserves report id while editing
replace_once("function collect(){return {id:Date.now(),date:$('#date').value", "function collect(){return {id:editingReport?.id??Date.now(),cloudCreatedById:editingReport?.cloudCreatedById||null,cloudCreatedByName:editingReport?.cloudCreatedByName||'',date:$('#date').value", 'collect')

# Save can update an existing report instead of always creating another one
replace_once(
'''async function saveReport(){
  const d=collect();
  if(!validate(d))return;
  try{
    d.photoCount=await savePhotosForReport(d.id);
    const a=get(LS.reports,[]);
    a.unshift(d);
    set(LS.reports,a);''',
'''async function saveReport(){
  const d=collect();
  if(!validate(d))return;
  try{
    const addedPhotos=await savePhotosForReport(d.id);
    d.photoCount=Number(editingReport?.photoCount||0)+Number(addedPhotos||0);
    const a=get(LS.reports,[]);
    const editIndex=editingReport?a.findIndex(x=>String(x.id)===String(editingReport.id)):-1;
    if(editIndex>=0)a[editIndex]=d; else a.unshift(d);
    set(LS.reports,a);''',
'save edit')
replace_once(
'''    showStatus((d.photoCount?`日報と写真${d.photoCount}枚を保存しました。`:'日報を保存しました。')+cloudNote);
    setTimeout(()=>document.querySelector('[data-page="recordsPage"]').click(),400);''',
'''    showStatus((d.photoCount?`日報と写真${d.photoCount}枚を保存しました。`:'日報を保存しました。')+cloudNote);
    clearReportEditState();
    setTimeout(()=>document.querySelector('[data-page="recordsPage"]').click(),400);''',
'save finish')

# New report-browser and editing helpers replace old renderRecords only
m = re.search(r'async function renderRecords\(\)\{.*?\n\}\nasync function copySaved', s, flags=re.S)
if not m:
    raise RuntimeError('renderRecords block not found')
new_browser = r'''function setRecordView(mode){
  recordViewMode=mode;
  const cb=$('#calendarModeBtn'),lb=$('#listModeBtn');
  if(cb)cb.className='btn '+(mode==='calendar'?'active':'light');
  if(lb)lb.className='btn '+(mode==='list'?'active':'light');
  rerenderRecordBrowser();
}
function rerenderRecordBrowser(){renderRecordBrowser(currentRecordsData)}
function recordFilters(a){
  const q=($('#recordSearch')?.value||'').trim().toLowerCase();
  const site=$('#recordSiteFilter')?.value||'';
  const writer=$('#recordWriterFilter')?.value||'';
  const from=$('#recordDateFrom')?.value||'';
  const to=$('#recordDateTo')?.value||'';
  return a.filter(d=>{
    const hay=[d.site,d.writer,d.details,d.memo,...(d.workTypes||[])].join(' ').toLowerCase();
    return (!q||hay.includes(q))&&(!site||d.site===site)&&(!writer||d.writer===writer)&&(!from||String(d.date||'')>=from)&&(!to||String(d.date||'')<=to);
  });
}
function updateRecordFilterOptions(a){
  const site=$('#recordSiteFilter'),writer=$('#recordWriterFilter');if(!site||!writer)return;
  const sv=site.value,wv=writer.value;
  const sites=[...new Set(a.map(x=>x.site).filter(Boolean))].sort();
  const writers=[...new Set(a.map(x=>x.writer).filter(Boolean))].sort();
  site.innerHTML='<option value="">全現場</option>'+sites.map(x=>`<option>${cloudHtml(x)}</option>`).join('');
  writer.innerHTML='<option value="">全員</option>'+writers.map(x=>`<option>${cloudHtml(x)}</option>`).join('');
  if(sites.includes(sv))site.value=sv;if(writers.includes(wv))writer.value=wv;
}
function recordCard(d,isCloud){
  if(isCloud)return `<div class="record"><div class="record-title">${cloudHtml(d.date)}　${cloudHtml(d.site)}</div><div class="meta">記入者：${cloudHtml(d.writer||'未設定')}／クラウド登録者：${cloudHtml(d.cloudCreatedByName)}${d.photoCount?`／写真：${d.photoCount}枚`:''}／${cloudHtml(d.start||'')}〜${cloudHtml(d.end||'')}</div><div>${(d.workTypes||[]).map(x=>`<span class="badge">${cloudHtml(x)}</span>`).join('')}</div>${cloudReportButtons(d)}</div>`;
  const id=String(d.id);
  const photoBtn=(d.photoCount||0)>0?`<button class="btn light" onclick="showSavedPhotos(Number('${id}'))">写真を見る（${d.photoCount}）</button>`:'';
  return `<div class="record"><div class="record-title">${cloudHtml(d.date)}　${cloudHtml(d.site)}</div><div class="meta">記入者：${cloudHtml(d.writer||'未設定')}${(d.photoCount||0)>0?`／写真：${d.photoCount}枚`:''}／${cloudHtml(d.start||'')}〜${cloudHtml(d.end||'')}</div><div>${(d.workTypes||[]).map(x=>`<span class="badge">${cloudHtml(x)}</span>`).join('')}</div><div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:9px"><button class="btn dark" onclick="copySaved(Number('${id}'))">LINE文コピー</button>${photoBtn}<button class="btn light" onclick="editLocalReport(Number('${id}'))">編集</button><button class="btn light" onclick="duplicateLocalReport(Number('${id}'))">別現場へ複製</button><button class="btn light" onclick="printSaved(Number('${id}'))">PDF表示</button><button class="btn danger" onclick="deleteSaved(Number('${id}'))">削除</button></div></div>`;
}
function shiftRecordMonth(delta){
  const base=recordCalendarMonth||today().slice(0,7),parts=base.split('-').map(Number);const d=new Date(parts[0],parts[1]-1+delta,1);recordCalendarMonth=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;recordSelectedDate='';rerenderRecordBrowser();
}
function selectRecordDate(date){recordSelectedDate=recordSelectedDate===date?'':date;rerenderRecordBrowser()}
function renderRecordCalendar(a){
  const box=$('#recordsCalendar');if(!box)return;
  if(!recordCalendarMonth)recordCalendarMonth=today().slice(0,7);
  const [y,m]=recordCalendarMonth.split('-').map(Number),first=new Date(y,m-1,1),start=new Date(y,m-1,1-first.getDay());
  const counts={};a.forEach(d=>{if(d.date)(counts[d.date]||(counts[d.date]=[])).push(d)});
  const weeks=['日','月','火','水','木','金','土'].map(x=>`<div class="calendar-week">${x}</div>`).join('');
  const days=[];
  for(let i=0;i<42;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);
    const ds=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,arr=counts[ds]||[],other=d.getMonth()!==m-1;
    days.push(`<button type="button" class="calendar-day${other?' other':''}${arr.length?' has':''}${recordSelectedDate===ds?' selected':''}" onclick="selectRecordDate('${ds}')"><span class="daynum">${d.getDate()}</span>${arr.length?`<span class="count">${arr.length}件</span><span class="mini">${cloudHtml(arr[0].site||'')}</span>`:''}</button>`);
  }
  box.style.display='block';box.innerHTML=`<div class="calendar-head"><button class="btn light" type="button" onclick="shiftRecordMonth(-1)">‹</button><b>${y}年 ${m}月</b><button class="btn light" type="button" onclick="shiftRecordMonth(1)">›</button></div><div class="calendar-grid">${weeks}${days.join('')}</div>`;
}
function renderRecordBrowser(data){
  currentRecordsData=data||[];updateRecordFilterOptions(currentRecordsData);
  const a=recordFilters(currentRecordsData).slice().sort((x,y)=>String(y.date||'').localeCompare(String(x.date||''))||String(y.createdAt||'').localeCompare(String(x.createdAt||''))),b=$('#records'),cal=$('#recordsCalendar');
  if(!b)return;
  if(recordViewMode==='calendar'){
    renderRecordCalendar(a);
    const shown=recordSelectedDate?a.filter(x=>x.date===recordSelectedDate):[];
    b.innerHTML=recordSelectedDate?(shown.length?`<div class="meta" style="margin-top:12px">${recordSelectedDate} の日報 ${shown.length}件</div>`+shown.map(d=>recordCard(d,!!cloudProfile)).join(''):'<div class="empty">この日の日報はありません。</div>'):'<div class="empty">日付をタップすると、その日の日報を表示します。</div>';
  }else{
    if(cal)cal.style.display='none';
    b.innerHTML=a.length?a.map(d=>recordCard(d,!!cloudProfile)).join(''):'<div class="empty">条件に合う日報はありません。</div>';
  }
}
async function renderRecords(){
  populateLedgerSites();const b=$('#records');b.innerHTML='<div class="empty">日報を読み込み中…</div>';
  try{const a=cloudProfile?await cloudFetchReports():get(LS.reports,[]);populateLedgerSites();renderRecordBrowser(a)}catch(e){b.innerHTML=`<div class="cloud-bad">日報の読込エラー：${cloudHtml(e?.message||e)}</div>`}
}
function setReportDateOffset(days){const d=new Date();d.setDate(d.getDate()+Number(days||0));const z=n=>String(n).padStart(2,'0');$('#date').value=`${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`}
function clearReportEditState(){editingReport=null;$('#editBanner')?.classList.remove('show');if($('#saveReportBtn'))$('#saveReportBtn').textContent='日報を保存'}
function cancelReportEdit(){if(confirm('編集をやめますか？入力中の変更は保存されません。'))clearReportEditState()}
function ensureSiteOption(name){if(!name)return;const sel=$('#site');if([...sel.options].some(o=>o.value===name))return;const sites=get(LS.sites,[]);if(!sites.includes(name)){sites.push(name);set(LS.sites,sites)}renderSelectors()}
function clearReportFormDynamic(){
  $$('input[name="worker"],input[name="workType"],input[name="vehicle"],input[name="machine"],input[name="attachment"]').forEach(x=>x.checked=false);
  $('#leaseVehicles').innerHTML='';$('#leaseMachines').innerHTML='';$('#leaseAttachments').innerHTML='';$('#items').innerHTML='';$('#machineHours').innerHTML='';stagedPhotos=[];renderStagedPhotos();
}
function fillReportForm(d,mode='edit'){
  clearReportFormDynamic();ensureSiteOption(d.site||'');
  $('#date').value=d.date||today();$('#weather').value=d.weather||'晴れ';$('#site').value=d.site||'';$('#writer').value=d.writer||'';$('#meikenCount').value=Number(d.meikenCount||0);$('#asahiCount').value=Number(d.asahiCount||0);$('#otherWorker').value=d.otherWorker||'';$('#start').value=d.start||'08:00';$('#end').value=d.end||'17:00';$('#overtime').value=d.overtime||0;$('#details').value=d.details||'';$('#memo').value=d.memo||'';
  const cv=(name,vals)=>$$(`input[name="${name}"]`).forEach(x=>x.checked=(vals||[]).includes(x.value));cv('worker',d.workers);cv('workType',d.workTypes);cv('vehicle',d.vehicles);cv('machine',(d.machines||[]).map(x=>x.name));cv('attachment',d.attachments);renderMachineHours();
  (d.machines||[]).forEach(x=>{const row=$$('#machineHours .mh').find(r=>r.dataset.name===x.name);if(row)row.querySelector('input[type=number]').value=x.hours||''});
  (d.leaseVehicles||[]).forEach(addLeaseVehicle);(d.leaseMachines||[]).forEach(addLeaseMachine);(d.leaseAttachments||[]).forEach(addLeaseAttachment);(d.items||[]).forEach(addItem);
  if(mode==='edit'){editingReport={...d};$('#editBanner')?.classList.add('show');if($('#editBannerText'))$('#editBannerText').textContent=`編集中：${d.date||''} ${d.site||''}`;if($('#saveReportBtn'))$('#saveReportBtn').textContent='変更を保存'}
  else{clearReportEditState();if($('#editBannerText'))$('#editBannerText').textContent='別現場用に複製しました。現場名・時間を確認してください。';$('#editBanner')?.classList.add('show')}
  document.querySelector('[data-page="reportPage"]')?.click();window.scrollTo({top:0,behavior:'smooth'});
}
function editCloudReport(id){const d=cloudReportsCache.find(x=>String(x.cloudId)===String(id));if(!d)return alert('日報が見つかりません。');closeCloudReportDetail();fillReportForm(d,'edit')}
function duplicateCloudReport(id){const d=cloudReportsCache.find(x=>String(x.cloudId)===String(id));if(!d)return;closeCloudReportDetail();fillReportForm({...d,id:Date.now(),cloudId:null,cloudCreatedById:null,cloudCreatedByName:''},'duplicate')}
function editLocalReport(id){const d=get(LS.reports,[]).find(x=>String(x.id)===String(id));if(d)fillReportForm(d,'edit')}
function duplicateLocalReport(id){const d=get(LS.reports,[]).find(x=>String(x.id)===String(id));if(d)fillReportForm({...d,id:Date.now()},'duplicate')}
async function deleteCloudReport(id){
  const d=cloudReportsCache.find(x=>String(x.cloudId)===String(id));if(!d)return;
  const allowed=cloudProfile&&(cloudProfile.role==='admin'||String(d.cloudCreatedById||'')===String(cloudProfile.id||''));if(!allowed)return alert('この日報を削除する権限がありません。');
  if(!confirm(`${d.date} ${d.site}\nこの日報とクラウド写真を削除しますか？\nこの操作は元に戻せません。`))return;
  try{
    const {data:photos,error:pErr}=await cloudClient.from('report_photos').select('storage_path').eq('company_id',cloudProfile.company_id).eq('report_id',id);if(pErr)throw pErr;
    const paths=(photos||[]).map(x=>x.storage_path).filter(Boolean);if(paths.length){const {error:rmErr}=await cloudClient.storage.from('toya-photos').remove(paths);if(rmErr)console.warn(rmErr)}
    let q=await cloudClient.from('report_photos').delete().eq('company_id',cloudProfile.company_id).eq('report_id',id);if(q.error)throw q.error;
    q=await cloudClient.from('waste_entries').delete().eq('company_id',cloudProfile.company_id).eq('report_id',id);if(q.error)throw q.error;
    q=await cloudClient.from('daily_reports').delete().eq('company_id',cloudProfile.company_id).eq('id',id);if(q.error)throw q.error;
    const locals=get(LS.reports,[]),hit=locals.find(x=>String(x.id)===String(d.id));if(hit){try{await deletePhotosForReport(hit.id)}catch(e){}set(LS.reports,locals.filter(x=>String(x.id)!==String(d.id)))}
    await cloudFetchReports();renderRecordBrowser(cloudReportsCache);renderHome();closeCloudReportDetail();alert('日報を削除しました。');
  }catch(e){alert('削除できませんでした：'+(e?.message||e))}
}

async function copySaved'''
s = s[:m.start()] + new_browser + s[m.end():]

# Robust local deletion comparison
s = s.replace("set(LS.reports,get(LS.reports,[]).filter(x=>x.id!==id));", "set(LS.reports,get(LS.reports,[]).filter(x=>String(x.id)!==String(id)));")

SOURCE.write_text(s, encoding='utf-8')
MIRROR.write_text(s, encoding='utf-8')
SNAPSHOT.write_text(s, encoding='utf-8')
print('TOYA One v5.2 patch complete', len(s))
