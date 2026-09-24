from pathlib import Path
root=Path(__file__).resolve().parents[1]
def once(s,a,b):
    if s.count(a)!=1: raise RuntimeError(f'Expected exactly one target: {a[:100]} ({s.count(a)})')
    return s.replace(a,b,1)
p=root/'docs/estimate-plan-admin.quote5-r3.js';s=p.read_text()
helpers=r'''
 // Reopening an already-linked pair is a navigation action, not a duplicate insert.
 // Names may have changed since the pair was added. Never infer a new role or
 // overwrite any linked row's quantities, names, exclusions, costs or prices.
 function wasteLinks(source){
  return [...new Set([source?.separate_waste_v1,...(Array.isArray(source?.separate_waste_history_v1)?source.separate_waste_history_v1:[])].filter(x=>typeof x==='string'&&x))];
 }
 function relatedWasteRows(source){
  const links=new Set(wasteLinks(source)),found=[];
  if(links.size)plan.groups.forEach((g,i)=>g.quote_lines.forEach((r,j)=>{if(links.has(r.waste_source_v1))found.push({i,j,g,r});}));
  return found;
 }
 function separateWasteButton(r,i,j){
  const linked=relatedWasteRows(r).length;
  return '<button type="button" class="btn light pb-wide" data-separate-waste="'+i+','+j+'">'+(linked?'前に追加した明細を確認・追加':'運搬費・処分費を別行で追加')+'</button>';
 }
 function wasteActionError(error){
  const text=error?.message||'明細を開けませんでした。入力内容を確認してください。';
  note(text,true);window.alert(text);
 }
 function wasteFeedback(target,text){
  q('#epWasteActionFeedback')?.remove();
  const p=document.createElement('p');p.id='epWasteActionFeedback';p.className='note';p.setAttribute('role','status');p.textContent=text;
  p.style.cssText='padding:10px;background:#f0f8e5;border:1px solid #bfd29f;border-radius:8px;color:#304417;line-height:1.6';target.prepend(p);
 }
 function openRelatedWaste(target){
  const g=plan.groups[target.i],r=g?.quote_lines?.[target.j];
  if(!r)throw Error('明細の位置が変わりました。もう一度ボタンを押してください。');
  q('.ep-manual').open=true;renderSimpleGroups(target.i);updateTotals();
  const group=q('[data-ep-group="'+target.i+'"]'),row=q('[data-quote-row="'+target.j+'"]',group);
  const message='前に追加した「'+r.label+'」を開きました。重複追加・金額変更はしていません。'+(r.excluded?'「今回使わない」の設定もそのままです。':'');
  if(r.excluded){
   const details=q('.ep-excluded',group);if(details)details.open=true;
   const entry=q('[data-include-quote="'+target.i+','+target.j+'"]',group)?.closest('.ep-excluded-row')||group;
   wasteFeedback(entry,message);entry.tabIndex=-1;entry.focus({preventScroll:true});entry.scrollIntoView({block:'center'});
  }else{wasteFeedback(row||group,message);focusInput('#epQuotePrice'+target.i+'_'+target.j);}
  note(message);
 }
 function insertSeparateWaste(i,j,additional=false){
  const input=copy(plan.groups),source=input[i]?.quote_lines?.[j];
  if(!source)throw Error('追加元の明細を確認してください。');
  const history=wasteLinks(source);
  // Explicit additional-pair confirmation is required by the caller. Keep old
  // associations for navigation and keep every old row unchanged.
  if(additional)delete source.separate_waste_v1;
  const next=A.addSeparateWaste(input,i,j);
  if(additional&&history.length)next.groups[i].quote_lines[j].separate_waste_history_v1=history;
  plan.groups=next.groups;dirty=true;q('.ep-manual').open=true;renderSimpleGroups(next.groupIndex);updateTotals();
  const row=q('[data-ep-group="'+next.groupIndex+'"] [data-quote-row="'+next.rowIndex+'"]');
  const message='運搬費と処分費を2行追加しました。数量・単価を入力し、保存してください。既存の明細は変更していません。';
  if(row)wasteFeedback(row,message);note(message);focusInput('#epQty'+next.groupIndex+'_'+next.rowIndex);
 }
 function showRelatedWasteDialog(i,j,targets){
  q('#epWasteRelatedDialog')?.remove();
  const dialog=document.createElement('dialog');dialog.id='epWasteRelatedDialog';dialog.setAttribute('aria-labelledby','epWasteRelatedTitle');
  dialog.style.cssText='width:calc(100% - 24px);max-width:520px;max-height:80dvh;padding:18px;border:1px solid #ddd;border-radius:16px;overflow:auto;background:white;color:#171717;box-sizing:border-box';
  const amount=r=>{try{const a=C.quoteLine(r);return a.complete?yen(a.amount):'未入力';}catch(_){return '入力を確認';}};
  dialog.innerHTML='<h3 id="epWasteRelatedTitle" style="margin:0 0 10px">前に追加した明細があります</h3><p style="font-size:14px;line-height:1.6">重複追加を防ぐため、前の明細を確認してください。品名を変更した明細も表示しています。</p>'+targets.map((x,n)=>'<button type="button" class="btn light pb-wide" data-open-related-waste="'+n+'" style="display:block;width:100%;margin:8px 0;text-align:left;white-space:normal"><b>'+esc(x.r.label||'品名未入力')+'</b><small style="display:block;line-height:1.5">'+esc(x.g.name)+' ／ '+esc(amount(x.r))+(x.r.excluded?' ／ 今回使わない':'')+'</small></button>').join('')+'<p style="font-size:13px;line-height:1.6">前の明細を別の用途に使った場合は、下から新しい2行を追加できます。費用の二重計上に注意してください。</p><button type="button" class="btn light pb-wide" data-add-another-waste style="display:block;width:100%;margin:12px 0">別の2行を新しく追加</button><button type="button" class="btn dark pb-wide" data-close-related-waste style="width:100%">閉じる</button>';
  const close=()=>{dialog.close();dialog.remove();};
  dialog.querySelectorAll('[data-open-related-waste]').forEach(b=>b.onclick=()=>{const target=targets[Number(b.dataset.openRelatedWaste)];close();try{openRelatedWaste(target);}catch(error){wasteActionError(error);}});
  q('[data-add-another-waste]',dialog).onclick=()=>{
   if(!confirm('前に追加した明細と入力金額は残したまま、新しい運搬費と処分費を2行追加します。\n必要な費用が二重にならないか確認してください。新しい2行の単価は空欄です。\n追加しますか？'))return;
   close();try{gather();insertSeparateWaste(i,j,true);}catch(error){wasteActionError(error);}
  };
  q('[data-close-related-waste]',dialog).onclick=close;dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
 }
 function handleSeparateWaste(i,j){
  if(busy||!identity()||window.ToyaProjectBusiness?.isBusy())return;
  try{
   gather();const source=plan.groups[i]?.quote_lines?.[j],targets=relatedWasteRows(source);
   if(targets.length){showRelatedWasteDialog(i,j,targets);return;}
   if(!confirm('撤去の明細を残し、運搬費と処分費を別行で追加します。\n既存の撤去単価が運搬・処分込みなら、撤去のみの単価へ調整してください。追加する2行の単価は空欄です。'))return;
   insertSeparateWaste(i,j);
  }catch(error){wasteActionError(error);}
 }
'''
s=once(s,' function simpleRow(r,i,j){',helpers+'\n function simpleRow(r,i,j){')
s=once(s,"?'<button type=\"button\" class=\"btn light pb-wide\" data-separate-waste=\"'+i+','+j+'\">運搬費・処分費を別行で追加</button>':''", "?separateWasteButton(r,i,j):''")
s=once(s,"  host.querySelectorAll('[data-separate-waste]').forEach(b=>b.onclick=()=>{\n   if(!confirm('撤去の明細を残し、運搬費と処分費を別行で追加します。\\n既存の撤去単価が運搬・処分込みなら、撤去のみの単価へ調整してください。追加する2行の単価は空欄です。'))return;\n   try{gather();const [i,j]=b.dataset.separateWaste.split(',').map(Number),next=A.addSeparateWaste(plan.groups,i,j);plan.groups=next.groups;dirty=true;renderSimpleGroups(next.groupIndex);updateTotals();focusInput('#epQty'+next.groupIndex+'_'+next.rowIndex);}catch(error){note(error.message,true);}\n  });", "  host.querySelectorAll('[data-separate-waste]').forEach(b=>b.onclick=()=>{const [i,j]=b.dataset.separateWaste.split(',').map(Number);handleSeparateWaste(i,j);});")
# Remove the quote-only transient dialog when an existing owner is cleared.
s=once(s,"q('#epPreview')?.remove();}","q('#epPreview')?.remove();q('#epWasteRelatedDialog')?.remove();}")
(root/'docs/estimate-plan-admin.quote5-r4.js').write_text(s)
p=root/'docs/index.html';s=p.read_text();s=once(s,'estimate-plan-admin.quote5-r3.js?v=20260924-transport-r1','estimate-plan-admin.quote5-r4.js?v=20260924-waste-reopen-r1');p.write_text(s)
print('Patched only new quote editor and one loader reference.')
