from pathlib import Path

paths=[Path('docs/index.html'),Path('docs/TOYA_One_v5_2_0_calendar_edit.html'),Path('docs/TOYA_One_v5_1_0_cloud_shared.html')]
for p in paths:
    if not p.exists(): continue
    s=p.read_text(encoding='utf-8').replace('v5.4.4','v5.5.0')
    marker='<div class="card"><h2>現場作業者</h2>'
    box='''<div class="card no-print" id="siteMoveCard"><h2>現場移動</h2><div class="note">午前と午後など、同じ日に別の現場へ移動したときに使います。現在の入力を引き継いで2現場目・3現場目の日報を作れます。</div><button type="button" class="btn dark" style="width:100%;margin-top:10px;font-size:16px" onclick="createMovedSiteReport()">＋ 現場移動・次の現場を追加</button></div>'''
    if marker not in s: raise SystemExit(f'worker card marker missing: {p}')
    s=s.replace(marker,box+marker,1)
    jsmarker='function setTimeQuick(id,v){'
    pos=s.index(jsmarker)
    func='''function createMovedSiteReport(){
  const current=collect();
  const sites=get(LS.sites,[]).filter(Boolean);
  const choices=sites.filter(x=>x!==current.site);
  if(!choices.length){alert('別の現場がまだ登録されていません。先に現場を登録してください。');return;}
  const selected=prompt('移動先の現場名を入力してください。\\n登録済み：'+choices.join(' ／ '),choices[0]||'');
  if(!selected)return;
  if(!sites.includes(selected)){alert('登録済みの現場名から選んでください。');return;}
  $('#site').value=selected;
  // Keep date/writer/workers/equipment as a convenient starting point, but clear site-specific values.
  $('#details').value='';
  $('#memo').value='';
  $('#start').value=current.end||'13:00';
  $('#end').value='17:00';
  $('#overtime').value=0;
  $('#items').innerHTML='';addItem();
  if($('#fuelRows'))$('#fuelRows').innerHTML='';
  editingCloudReportId=null;editingLocalReportId=null;editingOriginalCreatorId=null;editingOriginalCreatorName='';
  updateEditBanner();
  window.scrollTo({top:0,behavior:'smooth'});
  setTimeout(()=>alert('移動先「'+selected+'」の日報入力に切り替えました。必要なところだけ変更して保存してください。'),250);
}

'''
    if 'function createMovedSiteReport()' not in s:s=s[:pos]+func+s[pos:]
    p.write_text(s,encoding='utf-8')
print('TOYA One v5.5.0 site move applied')
