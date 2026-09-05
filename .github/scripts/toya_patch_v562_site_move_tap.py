from pathlib import Path

paths=[Path('docs/index.html'),Path('docs/TOYA_One_v5_2_0_calendar_edit.html'),Path('docs/TOYA_One_v5_1_0_cloud_shared.html')]
for p in paths:
    if not p.exists(): continue
    s=p.read_text(encoding='utf-8').replace('v5.6.1','v5.6.2')
    old="""  const menu=choices.map((x,i)=>`${i+1}：${x}`).join('\\n');
  const answer=prompt('移動先を番号で選んでください。\\n\\n'+menu,'1');
  if(!answer)return;
  const index=Number(answer)-1;
  const selected=choices[index];
  if(!selected){alert('表示された番号を入力してください。');return;}
  $('#site').value=selected;"""
    new="""  openSiteMovePicker(choices);
  return;"""
    if old not in s: raise SystemExit(f'number picker block missing: {p}')
    s=s.replace(old,new,1)
    marker='function createMovedSiteReport(){'
    pos=s.index(marker)
    picker=r'''function openSiteMovePicker(choices){
  let modal=$('#siteMovePicker');
  if(!modal){modal=document.createElement('div');modal.id='siteMovePicker';modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:flex-end;justify-content:center;padding:16px';document.body.appendChild(modal)}
  modal.innerHTML=`<div style="background:#fff;border-radius:22px 22px 12px 12px;padding:18px;width:min(100%,620px);max-height:75vh;overflow:auto"><div style="font-size:20px;font-weight:900;margin-bottom:6px">移動先の現場を選択</div><div class="meta" style="margin-bottom:12px">現場名をタップしてください。</div><div style="display:grid;gap:9px">${choices.map(x=>`<button type="button" class="btn light" style="width:100%;text-align:left;font-size:17px;padding:15px" data-move-site="${cloudHtml(x)}">${cloudHtml(x)}</button>`).join('')}</div><button type="button" class="btn light" style="width:100%;margin-top:12px" onclick="closeSiteMovePicker()">キャンセル</button></div>`;
  modal.style.display='flex';
  modal.querySelectorAll('[data-move-site]').forEach(b=>b.onclick=()=>applyMovedSite(b.getAttribute('data-move-site')));
}
function closeSiteMovePicker(){const m=$('#siteMovePicker');if(m)m.style.display='none'}
function applyMovedSite(selected){
  closeSiteMovePicker();
  const current=collect();
  $('#site').value=selected;
  $('#details').value='';$('#memo').value='';$('#start').value=current.end||'13:00';$('#end').value='17:00';$('#overtime').value=0;
  $('#items').innerHTML='';addItem();if($('#fuelRows'))$('#fuelRows').innerHTML='';
  editingCloudReportId=null;editingLocalReportId=null;editingOriginalCreatorId=null;editingOriginalCreatorName='';updateEditBanner();
  window.scrollTo({top:0,behavior:'smooth'});
  setTimeout(()=>alert('移動先「'+selected+'」の日報入力に切り替えました。必要なところだけ変更して保存してください。'),200);
}

'''
    if 'function openSiteMovePicker(' not in s:s=s[:pos]+picker+s[pos:]
    # Remove now-unreachable legacy continuation after return, up to end of function, and make create function only open picker.
    start=s.index('function createMovedSiteReport(){')
    end=s.index('\n}\n\nfunction setTimeQuick',start)+2
    replacement="""function createMovedSiteReport(){
  const current=collect();
  const sites=get(LS.sites,[]).filter(Boolean);
  const choices=sites.filter(x=>x!==current.site);
  if(!choices.length){alert('別の現場がまだ登録されていません。先に現場を登録してください。');return;}
  openSiteMovePicker(choices);
}"""
    s=s[:start]+replacement+s[end:]
    p.write_text(s,encoding='utf-8')
print('TOYA One v5.6.2 tap site move picker applied')
