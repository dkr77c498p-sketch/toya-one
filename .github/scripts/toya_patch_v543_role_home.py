from pathlib import Path

paths=[Path('docs/index.html'),Path('docs/TOYA_One_v5_2_0_calendar_edit.html'),Path('docs/TOYA_One_v5_1_0_cloud_shared.html')]
for p in paths:
    if not p.exists(): continue
    s=p.read_text(encoding='utf-8').replace('v5.4.2','v5.4.3')
    s=s.replace('<div class="card" id="wasteDashboardCard">','<div class="card admin-home-only" id="wasteDashboardCard">',1)
    s=s.replace('<div class="card"><h2>今月の燃料・経費</h2>','<div class="card admin-home-only"><h2>今月の燃料・経費</h2>',1)
    marker='async function renderWasteSummaryFromCloudTable(){'
    pos=s.index(marker)
    rolefunc='''function applyHomeRoleVisibility(){\n  const isAdmin=Boolean(cloudProfile&&cloudProfile.role==='admin');\n  $$('.admin-home-only').forEach(el=>el.style.display=isAdmin?'':'none');\n}\n\n'''
    if 'function applyHomeRoleVisibility()' not in s:s=s[:pos]+rolefunc+s[pos:]
    old='''    await renderHome();
    await renderWasteSummaryFromCloudTable();'''
    new='''    applyHomeRoleVisibility();
    await renderHome();
    if(cloudProfile?.role==='admin')await renderWasteSummaryFromCloudTable();'''
    if old not in s: raise SystemExit(f'home render marker missing: {p}')
    s=s.replace(old,new,1)
    p.write_text(s,encoding='utf-8')
print('TOYA One v5.4.3 role home applied')
