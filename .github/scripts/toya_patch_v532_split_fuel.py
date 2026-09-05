from pathlib import Path
import re

paths=[Path('docs/index.html'),Path('docs/TOYA_One_v5_2_0_calendar_edit.html'),Path('docs/TOYA_One_v5_1_0_cloud_shared.html')]
for p in paths:
    if not p.exists(): continue
    s=p.read_text(encoding='utf-8')
    s=s.replace('v5.3.1','v5.3.2')
    # Home summary cards: split actual fuel, AdBlue and grease.
    old='''<div class="card"><h2>今月の燃料・経費</h2><div class="statgrid"><div class="stat"><b id="monthFuelLiters">0</b><span>燃料 L</span></div><div class="stat"><b id="monthFuelAmount">¥0</b><span>燃料費</span></div><div class="stat"><b id="monthOtherExpense">¥0</b><span>材料・処分・経費</span></div><div class="stat"><b id="monthExpenseTotal">¥0</b><span>月間合計</span></div></div><div style="margin-top:12px"><b>車両・重機別 燃料費</b><div id="fuelBreakdown" style="margin-top:7px"></div></div></div>'''
    new='''<div class="card"><h2>今月の燃料・経費</h2><div class="statgrid"><div class="stat"><b id="monthFuelLiters">0</b><span>軽油・ガソリン L</span></div><div class="stat"><b id="monthAdBlueLiters">0</b><span>AdBlue L</span></div><div class="stat"><b id="monthGreaseCount">0</b><span>グリース 本</span></div><div class="stat"><b id="monthFuelAmount">¥0</b><span>燃料・油脂費</span></div><div class="stat"><b id="monthOtherExpense">¥0</b><span>材料・処分・経費</span></div><div class="stat"><b id="monthExpenseTotal">¥0</b><span>月間合計</span></div></div><div style="margin-top:12px"><b>車両・重機別 燃料・油脂費</b><div id="fuelBreakdown" style="margin-top:7px"></div></div></div>'''
    if old not in s: raise SystemExit(f'summary html not found: {p}')
    s=s.replace(old,new,1)
    start=s.index('function renderFuelSummary(reports){')
    end=s.index('\nfunction collect()',start)
    func='''function renderFuelSummary(reports){
  const month=today().slice(0,7),arr=(reports||[]).filter(d=>String(d.date||'').startsWith(month));
  const fuels=arr.flatMap(d=>(d.fuels||[]));
  const qty=x=>Number((x.qty??x.liters)||0);
  const fuelLiters=fuels.filter(x=>x.type==='軽油'||x.type==='ガソリン').reduce((s,x)=>s+qty(x),0);
  const adblueLiters=fuels.filter(x=>x.type==='AdBlue').reduce((s,x)=>s+qty(x),0);
  const greaseCount=fuels.filter(x=>x.type==='グリース').reduce((s,x)=>s+qty(x),0);
  const fuelTotal=fuels.reduce((s,x)=>s+fuelAmount(x),0);
  const other=arr.reduce((s,d)=>s+(d.items||[]).reduce((q,x)=>q+Number(x.price||0),0),0);
  const yen=n=>'¥'+Math.round(Number(n||0)).toLocaleString();
  if($('#monthFuelLiters'))$('#monthFuelLiters').textContent=fuelLiters.toLocaleString(undefined,{maximumFractionDigits:1});
  if($('#monthAdBlueLiters'))$('#monthAdBlueLiters').textContent=adblueLiters.toLocaleString(undefined,{maximumFractionDigits:1});
  if($('#monthGreaseCount'))$('#monthGreaseCount').textContent=greaseCount.toLocaleString(undefined,{maximumFractionDigits:1});
  if($('#monthFuelAmount'))$('#monthFuelAmount').textContent=yen(fuelTotal);
  if($('#monthOtherExpense'))$('#monthOtherExpense').textContent=yen(other);
  if($('#monthExpenseTotal'))$('#monthExpenseTotal').textContent=yen(fuelTotal+other);
  const map={};fuels.forEach(x=>{const k=x.asset||'未設定';if(!map[k])map[k]={fuel:0,adblue:0,grease:0,amount:0};if(x.type==='軽油'||x.type==='ガソリン')map[k].fuel+=qty(x);else if(x.type==='AdBlue')map[k].adblue+=qty(x);else if(x.type==='グリース')map[k].grease+=qty(x);map[k].amount+=fuelAmount(x)});
  const b=$('#fuelBreakdown');if(b)b.innerHTML=Object.keys(map).length?Object.entries(map).sort((a,b)=>b[1].amount-a[1].amount).map(([k,v])=>{const parts=[];if(v.fuel)parts.push(`燃料 ${v.fuel.toLocaleString()}L`);if(v.adblue)parts.push(`AdBlue ${v.adblue.toLocaleString()}L`);if(v.grease)parts.push(`グリース ${v.grease.toLocaleString()}本`);return `<div class="record" style="padding:9px;margin-bottom:6px"><b>${cloudHtml(k)}</b><div class="meta" style="margin:3px 0 0">${parts.join(' ／ ')} ／ ${yen(v.amount)}</div></div>`}).join(''):'<div class="empty" style="padding:18px 8px">今月の燃料・油脂入力はまだありません。</div>';
}
'''
    s=s[:start]+func+s[end:]
    p.write_text(s,encoding='utf-8')
print('TOYA One v5.3.2 split fuel summary applied')
