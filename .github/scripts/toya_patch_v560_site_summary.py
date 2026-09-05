from pathlib import Path

paths=[Path('docs/index.html'),Path('docs/TOYA_One_v5_2_0_calendar_edit.html'),Path('docs/TOYA_One_v5_1_0_cloud_shared.html')]
for p in paths:
    if not p.exists(): continue
    s=p.read_text(encoding='utf-8').replace('v5.5.0','v5.6.0')
    marker='<div class="card admin-home-only" id="wasteDashboardCard">'
    card='''<div class="card admin-home-only" id="siteSummaryCard"><h2>現場別集計</h2><label>現場を選択</label><select id="siteSummarySelect" onchange="renderSiteSummary()"></select><div id="siteSummaryBody" style="margin-top:12px"></div></div>'''
    if marker not in s: raise SystemExit(f'admin card marker missing: {p}')
    s=s.replace(marker,card+marker,1)
    jsmarker='function applyHomeRoleVisibility(){'
    pos=s.index(jsmarker)
    func=r'''function populateSiteSummarySelect(){
  const sel=$('#siteSummarySelect');if(!sel)return;
  const current=sel.value;
  const names=[...new Set((cloudReportsCache||[]).map(d=>d.site).filter(Boolean))].sort();
  sel.innerHTML=names.length?names.map(n=>`<option>${cloudHtml(n)}</option>`).join(''):'<option value="">現場なし</option>';
  if(current&&names.includes(current))sel.value=current;
}
function timeHours(a,b){if(!a||!b)return 0;const [ah,am]=a.split(':').map(Number),[bh,bm]=b.split(':').map(Number);let v=(bh*60+bm-ah*60-am)/60;return v>0?v:0}
function renderSiteSummary(){
  if(!cloudProfile||cloudProfile.role!=='admin')return;
  populateSiteSummarySelect();const site=$('#siteSummarySelect')?.value,box=$('#siteSummaryBody');if(!box||!site)return;
  const arr=(cloudReportsCache||[]).filter(d=>d.site===site);
  let personHours=0,machineHours=0,fuel=0,adblue=0,grease=0,fuelCost=0,other=0;
  const machines={},vehicles={};
  arr.forEach(d=>{
    const hrs=timeHours(d.start,d.end)+Number(d.overtime||0),people=(d.workers||[]).length+Number(d.meikenCount||0)+Number(d.asahiCount||0)+(d.otherWorker?1:0);personHours+=hrs*people;
    (d.machines||[]).forEach(m=>{const h=Number((d.machineHours||{})[m]||hrs||0);machines[m]=(machines[m]||0)+h;machineHours+=h});
    (d.vehicles||[]).forEach(v=>vehicles[v]=(vehicles[v]||0)+1);
    (d.fuels||[]).forEach(x=>{const q=Number(x.qty??x.liters??0),a=fuelAmount(x);if(x.type==='軽油'||x.type==='ガソリン')fuel+=q;else if(x.type==='AdBlue')adblue+=q;else if(x.type==='グリース')grease+=q;fuelCost+=a});
    (d.items||[]).forEach(x=>other+=Number(x.price||0));
  });
  const yen=n=>'¥'+Math.round(n||0).toLocaleString();
  const list=(obj,unit)=>Object.keys(obj).length?Object.entries(obj).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="record" style="padding:8px;margin-bottom:5px"><b>${cloudHtml(k)}</b><div class="meta" style="margin:2px 0 0">${Number(v).toLocaleString(undefined,{maximumFractionDigits:1})}${unit}</div></div>`).join(''):'<div class="meta">まだありません。</div>';
  box.innerHTML=`<div class="statgrid"><div class="stat"><b>${arr.length}</b><span>日報 件</span></div><div class="stat"><b>${personHours.toLocaleString(undefined,{maximumFractionDigits:1})}</b><span>延べ人時</span></div><div class="stat"><b>${machineHours.toLocaleString(undefined,{maximumFractionDigits:1})}</b><span>重機稼働 h</span></div><div class="stat"><b>${yen(fuelCost+other)}</b><span>記録済み経費</span></div></div><div class="record" style="margin-top:10px"><b>燃料・油脂</b><div class="meta">燃料 ${fuel.toLocaleString()}L ／ AdBlue ${adblue.toLocaleString()}L ／ グリース ${grease.toLocaleString()}本 ／ ${yen(fuelCost)}</div></div><div style="margin-top:10px"><b>重機別 稼働時間</b>${list(machines,'h')}</div><div style="margin-top:10px"><b>車両 使用日報数</b>${list(vehicles,'回')}</div><div class="note" style="margin-top:10px">産廃は専用クラウド表から管理しています。今後、現場別の産廃・処分費・売上・粗利もこの集計へ統合できます。</div>`;
}

'''
    if 'function renderSiteSummary()' not in s:s=s[:pos]+func+s[pos:]
    old='''    applyHomeRoleVisibility();
    await renderHome();'''
    new='''    applyHomeRoleVisibility();
    await renderHome();
    if(cloudProfile?.role==='admin')renderSiteSummary();'''
    if old not in s: raise SystemExit(f'load marker missing: {p}')
    s=s.replace(old,new,1)
    p.write_text(s,encoding='utf-8')
print('TOYA One v5.6.0 site summary applied')
