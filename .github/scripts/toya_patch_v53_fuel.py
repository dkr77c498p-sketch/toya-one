from pathlib import Path
import re

paths=[Path('docs/index.html'),Path('docs/TOYA_One_v5_2_0_calendar_edit.html'),Path('docs/TOYA_One_v5_1_0_cloud_shared.html')]
for p in paths:
    if not p.exists():
        continue
    s=p.read_text(encoding='utf-8')
    if 'id="fuelRows"' in s:
        continue

    s=s.replace('v5.2.0','v5.3.0')

    fuel_card='''<div class="card"><h2>燃料費</h2><div class="note">給油した分だけ入力してください。車両・重機ごとに月間集計します。</div><div id="fuelRows"></div><button type="button" class="btn light no-print" style="width:100%;margin-top:9px" onclick="addFuelRow()">＋ 給油を追加</button></div>\n'''
    anchor='<div class="card"><h2>材料・処分・経費</h2><div id="items"></div><button type="button" class="btn light no-print" style="width:100%;margin-top:9px" onclick="addItem()">＋ 品目を追加</button></div>'
    if anchor not in s:
        raise SystemExit(f'fuel card anchor not found: {p}')
    s=s.replace(anchor,fuel_card+anchor,1)

    home_anchor='<div class="card"><h2>本日の現場</h2><div id="todayList"></div></div>'
    fuel_summary='''<div class="card"><h2>今月の燃料・経費</h2><div class="statgrid"><div class="stat"><b id="monthFuelLiters">0</b><span>燃料 L</span></div><div class="stat"><b id="monthFuelAmount">¥0</b><span>燃料費</span></div><div class="stat"><b id="monthOtherExpense">¥0</b><span>材料・処分・経費</span></div><div class="stat"><b id="monthExpenseTotal">¥0</b><span>月間合計</span></div></div><div style="margin-top:12px"><b>車両・重機別 燃料費</b><div id="fuelBreakdown" style="margin-top:7px"></div></div></div>\n'''
    if home_anchor not in s:
        raise SystemExit(f'home anchor not found: {p}')
    s=s.replace(home_anchor,fuel_summary+home_anchor,1)

    helper='''function addFuelRow(d={}){\n  const r=document.createElement('div');\n  r.className='row fuel-row';\n  const assets=['10tダンプ','4tダンプ','4tアームロール','3tダンプ','軽トラ','ハイエース','SK135（1号機）','SK135（2号機）','SK55','その他'];\n  const fuels=['軽油','ガソリン','AdBlue','その他'];\n  r.innerHTML=`<div class="rowhead"><b>給油</b><button class="btn danger" type="button" onclick="this.closest('.fuel-row').remove()">削除</button></div><div class="grid2"><div><label>車両・重機</label><select class="f-asset">${assets.map(x=>`<option ${x===(d.asset||'')?'selected':''}>${x}</option>`).join('')}</select></div><div><label>燃料</label><select class="f-type">${fuels.map(x=>`<option ${x===(d.type||'軽油')?'selected':''}>${x}</option>`).join('')}</select></div></div><div class="grid3"><div><label>給油量（L）</label><input class="f-liters" type="number" min="0" step="0.1" value="${d.liters||''}"></div><div><label>単価（円/L）</label><input class="f-unit" type="number" min="0" step="1" value="${d.unitPrice||''}"></div><div><label>金額（円）</label><input class="f-amount" type="number" min="0" step="1" value="${d.amount||''}"></div></div><label>給油所・メモ</label><input class="f-note" value="${d.note||''}" placeholder="例：ENEOS／現金など">`;\n  const liters=r.querySelector('.f-liters'),unit=r.querySelector('.f-unit'),amount=r.querySelector('.f-amount');\n  const calc=()=>{if(liters.value&&unit.value)amount.value=Math.round(Number(liters.value)*Number(unit.value))};\n  liters.addEventListener('input',calc);unit.addEventListener('input',calc);\n  $('#fuelRows').appendChild(r);enhanceNumericInputs(r);\n}\nfunction fuelAmount(x){const a=Number(x?.amount||0);if(a>0)return a;return Number(x?.liters||0)*Number(x?.unitPrice||0)}\nfunction renderFuelSummary(reports){\n  const month=today().slice(0,7),arr=(reports||[]).filter(d=>String(d.date||'').startsWith(month));\n  const fuels=arr.flatMap(d=>(d.fuels||[]));\n  const liters=fuels.reduce((s,x)=>s+Number(x.liters||0),0);\n  const fuelTotal=fuels.reduce((s,x)=>s+fuelAmount(x),0);\n  const other=arr.reduce((s,d)=>s+(d.items||[]).reduce((q,x)=>q+Number(x.price||0),0),0);\n  const yen=n=>'¥'+Math.round(Number(n||0)).toLocaleString();\n  if($('#monthFuelLiters'))$('#monthFuelLiters').textContent=liters.toLocaleString(undefined,{maximumFractionDigits:1});\n  if($('#monthFuelAmount'))$('#monthFuelAmount').textContent=yen(fuelTotal);\n  if($('#monthOtherExpense'))$('#monthOtherExpense').textContent=yen(other);\n  if($('#monthExpenseTotal'))$('#monthExpenseTotal').textContent=yen(fuelTotal+other);\n  const map={};fuels.forEach(x=>{const k=x.asset||'未設定';if(!map[k])map[k]={liters:0,amount:0};map[k].liters+=Number(x.liters||0);map[k].amount+=fuelAmount(x)});\n  const b=$('#fuelBreakdown');if(b)b.innerHTML=Object.keys(map).length?Object.entries(map).sort((a,b)=>b[1].amount-a[1].amount).map(([k,v])=>`<div class="record" style="padding:9px;margin-bottom:6px"><b>${cloudHtml(k)}</b><div class="meta" style="margin:3px 0 0">${v.liters.toLocaleString(undefined,{maximumFractionDigits:1})}L ／ ${yen(v.amount)}</div></div>`).join(''):'<div class="empty" style="padding:18px 8px">今月の燃料入力はまだありません。</div>'}\n}\n\n'''
    if 'function collect(){return {' not in s:
        raise SystemExit(f'collect anchor not found: {p}')
    s=s.replace('function collect(){return {',helper+'function collect(){return {',1)

    old='  items:$$\'.item\''
    # safer targeted insertion before items line
    target="  items:$$('.item').map(r=>({name:esc(r.querySelector('.i-name').value)"
    if target not in s:
        raise SystemExit(f'items collect target not found: {p}')
    insert="  fuels:$$('.fuel-row').map(r=>({asset:r.querySelector('.f-asset').value,type:r.querySelector('.f-type').value,liters:Number(r.querySelector('.f-liters').value||0),unitPrice:Number(r.querySelector('.f-unit').value||0),amount:Number(r.querySelector('.f-amount').value||0),note:esc(r.querySelector('.f-note').value)})).filter(x=>x.liters||x.amount),\n"
    s=s.replace(target,insert+target,1)

    clear_target="  $('#leaseVehicles').innerHTML='';$('#leaseMachines').innerHTML='';$('#leaseAttachments').innerHTML='';$('#items').innerHTML='';$('#machineHours').innerHTML='';stagedPhotos=[];renderStagedPhotos();"
    if clear_target not in s:
        raise SystemExit(f'clear target not found: {p}')
    s=s.replace(clear_target,"  $('#leaseVehicles').innerHTML='';$('#leaseMachines').innerHTML='';$('#leaseAttachments').innerHTML='';$('#fuelRows').innerHTML='';$('#items').innerHTML='';$('#machineHours').innerHTML='';stagedPhotos=[];renderStagedPhotos();",1)

    fill_target="  (d.leaseVehicles||[]).forEach(addLeaseVehicle);(d.leaseMachines||[]).forEach(addLeaseMachine);(d.leaseAttachments||[]).forEach(addLeaseAttachment);(d.items||[]).forEach(addItem);"
    if fill_target not in s:
        raise SystemExit(f'fill target not found: {p}')
    s=s.replace(fill_target,"  (d.leaseVehicles||[]).forEach(addLeaseVehicle);(d.leaseMachines||[]).forEach(addLeaseMachine);(d.leaseAttachments||[]).forEach(addLeaseAttachment);(d.fuels||[]).forEach(addFuelRow);(d.items||[]).forEach(addItem);",1)

    text_target=" if(d.items.length)t+=`\\n\\n■材料・処分・経費\\n`+d.items.map(x=>`・${x.name} ${x.qty||''}${x.unit||''}${x.price?` ￥${Number(x.price).toLocaleString()}`:''}${x.company?`（${x.company}）`:''}${x.isWaste?`［マニフェスト：${x.manifestType==='paper'?'紙':x.manifestType==='electronic'?'電子':'なし'}］`:''}`).join('\\n');"
    if text_target not in s:
        raise SystemExit(f'lineText target not found: {p}')
    fuel_text=" if((d.fuels||[]).length)t+=`\\n\\n■燃料費\\n`+d.fuels.map(x=>`・${x.asset||'未設定'} ${x.type||''} ${Number(x.liters||0).toLocaleString()}L${x.unitPrice?` @￥${Number(x.unitPrice).toLocaleString()}`:''} ／ ￥${Math.round(fuelAmount(x)).toLocaleString()}${x.note?`（${x.note}）`:''}`).join('\\n');\n"
    s=s.replace(text_target,fuel_text+text_target,1)

    home_call="  const b=$('#todayList');"
    if home_call not in s:
        raise SystemExit(f'renderHome target not found: {p}')
    s=s.replace(home_call,"  renderFuelSummary(a);\n  const b=$('#todayList');",1)

    p.write_text(s,encoding='utf-8')

print('TOYA One v5.3 fuel patch applied')
