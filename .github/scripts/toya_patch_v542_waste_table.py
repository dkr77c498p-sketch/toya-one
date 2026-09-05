from pathlib import Path

paths=[Path('docs/index.html'),Path('docs/TOYA_One_v5_2_0_calendar_edit.html'),Path('docs/TOYA_One_v5_1_0_cloud_shared.html')]
for p in paths:
    if not p.exists(): continue
    s=p.read_text(encoding='utf-8').replace('v5.4.1','v5.4.2')
    old='''    await renderHome();
    if($('#recordsPage')?.classList.contains('active'))await renderRecords();'''
    new='''    await renderHome();
    await renderWasteSummaryFromCloudTable();
    if($('#recordsPage')?.classList.contains('active'))await renderRecords();'''
    if old not in s: raise SystemExit(f'cloudLoadReports marker missing: {p}')
    s=s.replace(old,new,1)
    marker='function renderWasteSummary(reports){'
    pos=s.index(marker)
    func=r'''async function renderWasteSummaryFromCloudTable(){
  if(!cloudProfile)return;
  try{
    const month=today().slice(0,7),start=month+'-01';
    const nextDate=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),1);
    const z=n=>String(n).padStart(2,'0');
    const next=`${nextDate.getFullYear()}-${z(nextDate.getMonth()+1)}-01`;
    const {data,error}=await cloudClient.from('waste_entries')
      .select('id,report_id,site_id,report_date,waste_type,quantity,unit,manifest_type,manifest_number,disposer_name,disposal_site,notes,created_at')
      .eq('company_id',cloudProfile.company_id).gte('report_date',start).lt('report_date',next).order('report_date',{ascending:false}).order('created_at',{ascending:false});
    if(error)throw error;
    const rows=data||[];
    const paper=rows.filter(x=>x.manifest_type==='paper').length,electronic=rows.filter(x=>x.manifest_type==='electronic').length,none=rows.filter(x=>!x.manifest_type||x.manifest_type==='none').length;
    const sites=new Set(rows.map(x=>x.site_id).filter(Boolean));
    if($('#wasteEntryCount'))$('#wasteEntryCount').textContent=rows.length;
    if($('#wasteManifestOk'))$('#wasteManifestOk').textContent=paper+electronic;
    if($('#wasteManifestNone'))$('#wasteManifestNone').textContent=none;
    if($('#wasteSiteCount'))$('#wasteSiteCount').textContent=sites.size;
    const by={};rows.forEach(x=>{const key=(x.waste_type||'産廃')+'__'+(x.unit||'');if(!by[key])by[key]={name:x.waste_type||'産廃',unit:x.unit||'',qty:0,count:0};by[key].qty+=Number(x.quantity||0);by[key].count++});
    const b=$('#wasteBreakdown');if(b)b.innerHTML=Object.keys(by).length?Object.values(by).sort((a,b)=>b.qty-a.qty).map(v=>`<div class="record" style="padding:9px;margin-bottom:6px"><b>${cloudHtml(v.name)}</b><div class="meta" style="margin:3px 0 0">${v.qty.toLocaleString(undefined,{maximumFractionDigits:2})}${cloudHtml(v.unit)} ／ ${v.count}件</div></div>`).join(''):'<div class="empty" style="padding:18px 8px">今月の産廃入力はまだありません。</div>';
    const recent=$('#wasteRecent');if(recent)recent.innerHTML=rows.length?rows.slice(0,8).map(x=>{const type=x.manifest_type==='paper'?'紙':x.manifest_type==='electronic'?'電子':'なし';const no=x.manifest_number?` ／ No.${cloudHtml(x.manifest_number)}`:'';const dest=x.disposal_site?` ／ ${cloudHtml(x.disposal_site)}`:(x.disposer_name?` ／ ${cloudHtml(x.disposer_name)}`:'');return `<div class="record" style="padding:9px;margin-bottom:6px"><b>${cloudHtml(x.report_date)}　${cloudHtml(x.waste_type||'産廃')}</b><div class="meta" style="margin:3px 0 0">${Number(x.quantity||0).toLocaleString(undefined,{maximumFractionDigits:2})}${cloudHtml(x.unit||'')} ／ マニフェスト：${type}${no}${dest}</div></div>`}).join(''):'<div class="empty" style="padding:18px 8px">マニフェスト記録はまだありません。</div>';
  }catch(e){console.error('waste dashboard load',e)}
}

'''
    s=s[:pos]+func+s[pos:]
    p.write_text(s,encoding='utf-8')
print('TOYA One v5.4.2 direct waste table dashboard applied')
