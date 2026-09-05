from pathlib import Path

paths=[Path('docs/index.html'),Path('docs/TOYA_One_v5_2_0_calendar_edit.html'),Path('docs/TOYA_One_v5_1_0_cloud_shared.html')]
for p in paths:
    if not p.exists(): continue
    s=p.read_text(encoding='utf-8').replace('v5.6.0','v5.6.1')
    old="""  const selected=prompt('移動先の現場名を入力してください.\\n登録済み：'+choices.join(' ／ '),choices[0]||'');"""
    # accommodate Japanese punctuation version actually deployed
    if old not in s:
        old="""  const selected=prompt('移動先の現場名を入力してください。\\n登録済み：'+choices.join(' ／ '),choices[0]||'');"""
    new="""  const menu=choices.map((x,i)=>`${i+1}：${x}`).join('\\n');
  const answer=prompt('移動先を番号で選んでください。\\n\\n'+menu,'1');
  if(!answer)return;
  const index=Number(answer)-1;
  const selected=choices[index];"""
    if old not in s: raise SystemExit(f'prompt marker missing: {p}')
    s=s.replace(old,new,1)
    old2="""  if(!selected)return;
  if(!sites.includes(selected)){alert('登録済みの現場名から選んでください。');return;}"""
    new2="""  if(!selected){alert('表示された番号を入力してください。');return;}"""
    if old2 not in s: raise SystemExit(f'selection validation marker missing: {p}')
    s=s.replace(old2,new2,1)
    p.write_text(s,encoding='utf-8')
print('TOYA One v5.6.1 site move numbered select applied')
