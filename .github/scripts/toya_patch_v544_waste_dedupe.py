from pathlib import Path

paths=[Path('docs/index.html'),Path('docs/TOYA_One_v5_2_0_calendar_edit.html'),Path('docs/TOYA_One_v5_1_0_cloud_shared.html')]
for p in paths:
    if not p.exists(): continue
    s=p.read_text(encoding='utf-8').replace('v5.4.3','v5.4.4')
    old="""  const siteId=await cloudEnsureSite(d.site);
  const waste=(d.items||[]).filter(x=>x.isWaste || String(x.name||'').startsWith('産廃：'));
  let ok=0,ng=0;"""
    new="""  const siteId=await cloudEnsureSite(d.site);
  const waste=(d.items||[]).filter(x=>x.isWaste || String(x.name||'').startsWith('産廃：'));
  let ok=0,ng=0;
  // The cloud report is the source of truth: editing/re-saving replaces its waste rows.
  // This prevents stale rows and duplicate accumulation after edits.
  const {error:cleanupErr}=await cloudClient.from('waste_entries')
    .delete().eq('company_id',cloudProfile.company_id).eq('report_id',cloudReportId);
  if(cleanupErr)throw cleanupErr;"""
    if old not in s: raise SystemExit(f'waste sync marker missing: {p}')
    s=s.replace(old,new,1)
    # Since rows for this report were cleared, insert directly instead of searching stale source_item ids.
    old2="""      const {data:existing,error:findErr}=await cloudClient.from('waste_entries')
        .select('id')
        .eq('company_id',row.company_id)
        .eq('source_item_id',row.source_item_id)
        .maybeSingle();
      if(findErr)throw findErr;
      if(existing?.id){
        const {error:updateErr}=await cloudClient.from('waste_entries').update(row).eq('id',existing.id);
        if(updateErr)throw updateErr;
      }else{
        const {error:insertErr}=await cloudClient.from('waste_entries').insert(row);
        if(insertErr)throw insertErr;
      }"""
    new2="""      const {error:insertErr}=await cloudClient.from('waste_entries').insert(row);
      if(insertErr)throw insertErr;"""
    if old2 not in s: raise SystemExit(f'waste upsert marker missing: {p}')
    s=s.replace(old2,new2,1)
    p.write_text(s,encoding='utf-8')
print('TOYA One v5.4.4 waste dedupe applied')
