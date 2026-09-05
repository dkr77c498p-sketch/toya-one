from pathlib import Path
import re

paths=[Path('docs/index.html'),Path('docs/TOYA_One_v5_2_0_calendar_edit.html'),Path('docs/TOYA_One_v5_1_0_cloud_shared.html')]

card='''<div class="card" id="wasteDashboardCard"><h2>今月の産廃・マニフェスト</h2><div class="statgrid"><div class="stat"><b id="wasteEntryCount">0</b><span>産廃入力 件</span></div><div class="stat"><b id="wasteManifestOk">0</b><span>紙・電子 件</span></div><div class="stat"><b id="wasteManifestNone">0</b><span>マニフェストなし 件</span></div><div class="stat"><b id="wasteSiteCount">0</b><span>産廃搬出 現場</span></div></div><div style="margin-top:12px"><b>品目別 搬出量</b><div id="wasteBreakdown" style="margin-top:7px"></div></div><div style="margin-top:12px"><b>最近のマニフェスト</b><div id="wasteRecent" style="margin-top:7px"></div></div></div>'''

func=r'''function renderWasteSummary(reports){
  const month=today().slice(0,7);
  const arr=(reports||[]).filter(d=>String(d.date||'').startsWith(month));
  const rows=[];
  arr.forEach(d=>(d.items||[]).forEach(x=>{
    if(x && (x.isWaste || String(x.name||'').startsWith('産廃：'))){
      rows.push({...x,_date:d.date||'',_site:d.site||'現場未設定',_writer:d.writer||''});
    }
  }));
  const paper=rows.filter(x=>x.manifestType==='paper').length;
  const electronic=rows.filter(x=>x.manifestType==='electronic').length;
  const none=rows.filter(x=>!x.manifestType||x.manifestType==='none').length;
  const sites=new Set(rows.map(x=>x._site).filter(Boolean));
  if($('#wasteEntryCount'))$('#wasteEntryCount').textContent=rows.length;
  if($('#wasteManifestOk'))$('#wasteManifestOk').textContent=paper+electronic;
  if($('#wasteManifestNone'))$('#wasteManifestNone').textContent=none;
  if($('#wasteSiteCount'))$('#wasteSiteCount').textContent=sites.size;

  const byItem={};
  rows.forEach(x=>{
    const name=String(x.name||'産廃').replace(/^産廃：/,'')||'産廃';
    const unit=x.unit||'数量';
    const key=name+'__'+unit;
    if(!byItem[key])byItem[key]={name,unit,qty:0,count:0};
    byItem[key].qty+=Number(x.qty||0);byItem[key].count++;
  });
  const breakdown=$('#wasteBreakdown');
  if(breakdown)breakdown.innerHTML=Object.keys(byItem).length?Object.values(byItem).sort((a,b)=>b.qty-a.qty).map(v=>`<div class="record" style="padding:9px;margin-bottom:6px"><b>${cloudHtml(v.name)}</b><div class="meta" style="margin:3px 0 0">${Number(v.qty||0).toLocaleString(undefined,{maximumFractionDigits:2})}${cloudHtml(v.unit)} ／ ${v.count}件</div></div>`).join(''):'<div class="empty" style="padding:18px 8px">今月の産廃入力はまだありません。</div>';

  const recent=$('#wasteRecent');
  const sorted=[...rows].sort((a,b)=>String(b._date).localeCompare(String(a._date))).slice(0,8);
  if(recent)recent.innerHTML=sorted.length?sorted.map(x=>{
    const type=x.manifestType==='paper'?'紙':x.manifestType==='electronic'?'電子':'なし';
    const name=String(x.name||'産廃').replace(/^産廃：/,'');
    const no=x.manifestNumber?` ／ No.${cloudHtml(x.manifestNumber)}`:'';
    const dest=x.disposalSite?` ／ ${cloudHtml(x.disposalSite)}`:(x.disposerName?` ／ ${cloudHtml(x.disposerName)}`:'');
    return `<div class="record" style="padding:9px;margin-bottom:6px"><b>${cloudHtml(x._date)}　${cloudHtml(x._site)}</b><div class="meta" style="margin:3px 0 0">${cloudHtml(name)} ${Number(x.qty||0).toLocaleString(undefined,{maximumFractionDigits:2})}${cloudHtml(x.unit||'')} ／ マニフェスト：${type}${no}${dest}</div></div>`;
  }).join(''):'<div class="empty" style="padding:18px 8px">マニフェスト記録はまだありません。</div>';
}
'''

for p in paths:
    if not p.exists(): continue
    s=p.read_text(encoding='utf-8')
    if 'v5.4.0' in s and 'function renderWasteSummary' in s:
        continue
    s=s.replace('v5.3.2','v5.4.0')
    marker='<div class="card"><h2>今月の燃料・経費</h2>'
    if marker not in s:
        raise SystemExit(f'fuel card marker not found: {p}')
    s=s.replace(marker,card+marker,1)
    if 'function renderWasteSummary(reports)' not in s:
        pos=s.index('function renderFuelSummary(reports){')
        s=s[:pos]+func+'\n'+s[pos:]
    # Ensure every fuel summary render also refreshes waste summary with same report list.
    s=re.sub(r'(?<!renderWasteSummary\()renderFuelSummary\(([^;]+)\);',r'renderWasteSummary(\1);renderFuelSummary(\1);',s)
    p.write_text(s,encoding='utf-8')
print('TOYA One v5.4.0 waste dashboard applied')
