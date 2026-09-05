from pathlib import Path

paths=[Path('docs/index.html'),Path('docs/TOYA_One_v5_2_0_calendar_edit.html'),Path('docs/TOYA_One_v5_1_0_cloud_shared.html')]
for p in paths:
    if not p.exists(): continue
    s=p.read_text(encoding='utf-8')
    s=s.replace('v5.4.0','v5.4.1')
    old="""if(x && (x.isWaste || String(x.name||'').startsWith('産廃：'))){
      rows.push({...x,_date:d.date||'',_site:d.site||'現場未設定',_writer:d.writer||''});
    }"""
    new="""if(x && (x.isWaste || String(x.name||'').startsWith('産廃：'))){
      const manifestRaw=String(x.manifestType||x.manifest||'none');
      const manifestType=(manifestRaw==='紙'||manifestRaw==='paper')?'paper':(manifestRaw==='電子'||manifestRaw==='electronic')?'electronic':'none';
      rows.push({...x,manifestType,qty:Number(x.qty??x.quantity??0),unit:x.unit||'',_date:d.date||'',_site:d.site||'現場未設定',_writer:d.writer||''});
    }"""
    if old not in s: raise SystemExit(f'waste row block not found: {p}')
    s=s.replace(old,new,1)
    p.write_text(s,encoding='utf-8')
print('TOYA One v5.4.1 waste compatibility applied')
