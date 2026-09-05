from pathlib import Path
import re

paths=[Path('docs/index.html'),Path('docs/TOYA_One_v5_2_0_calendar_edit.html'),Path('docs/TOYA_One_v5_1_0_cloud_shared.html')]

new_func=r'''function addFuelRow(d={}){
  const r=document.createElement('div');
  r.className='row fuel-row';
  const assets=['10tダンプ','4tダンプ','4tアームロール','3tダンプ','軽トラ','ハイエース','SK135（1号機）','SK135（2号機）','SK55','その他'];
  const source=d.source||d.company||'スタンド';
  const outlet=d.outlet||((d.note||'').includes('IDEX')?'IDEX':(d.note||'').includes('ENEOS')?'ENEOS':'ENEOS');
  const type=d.type||'軽油';
  const qty=d.qty??d.liters??'';
  const unit=d.unit||(type==='グリース'?'本':'L');
  r.innerHTML=`<div class="rowhead"><b>給油・油脂</b><button class="btn danger" type="button" onclick="this.closest('.fuel-row').remove()">削除</button></div>
  <label>給油先</label><div class="manifest-chips fuel-source-chips"><button type="button" class="manifest-chip ${source==='スタンド'?'active':''}" data-source="スタンド" onclick="setFuelSource(this,'スタンド')">スタンド</button><button type="button" class="manifest-chip ${source==='マルマサ'?'active':''}" data-source="マルマサ" onclick="setFuelSource(this,'マルマサ')">マルマサ</button></div><input type="hidden" class="f-source" value="${source}">
  <div class="f-outlet-wrap" style="${source==='スタンド'?'':'display:none'}"><label>スタンド</label><div class="manifest-chips fuel-outlet-chips"><button type="button" class="manifest-chip ${outlet==='ENEOS'?'active':''}" data-outlet="ENEOS" onclick="setFuelOutlet(this,'ENEOS')">ENEOS</button><button type="button" class="manifest-chip ${outlet==='IDEX'?'active':''}" data-outlet="IDEX" onclick="setFuelOutlet(this,'IDEX')">IDEX</button></div><input type="hidden" class="f-outlet" value="${outlet}"></div>
  <div class="grid2"><div><label>車両・重機</label><select class="f-asset">${assets.map(x=>`<option ${x===(d.asset||'')?'selected':''}>${x}</option>`).join('')}</select></div><div><label>種類</label><select class="f-type"></select></div></div>
  <div class="grid3"><div><label class="f-qty-label">数量（${unit}）</label><input class="f-qty f-liters" type="number" min="0" step="0.1" value="${qty}"></div><div><label class="f-unit-label">単価（円/${unit}）</label><input class="f-unit" type="number" min="0" step="0.1" value="${d.unitPrice||''}" readonly></div><div><label>金額（円）</label><input class="f-amount" type="number" min="0" step="1" value="${d.amount||''}" readonly></div></div>
  <div class="note f-price-note" style="margin-top:8px"></div><label>メモ</label><input class="f-note" value="${d.note||''}" placeholder="任意">`;
  $('#fuelRows').appendChild(r);
  updateFuelOptions(r,type);
  enhanceNumericInputs(r);
}
function fuelPrice(source,type){
  const table={
    'スタンド':{'軽油':{price:139,unit:'L'},'ガソリン':{price:159,unit:'L'}},
    'マルマサ':{'軽油':{price:177,unit:'L'},'AdBlue':{price:82.5,unit:'L'},'グリース':{price:660,unit:'本'}}
  };
  return table[source]?.[type]||{price:0,unit:'L'};
}
function updateFuelOptions(row,preferred){
  const source=row.querySelector('.f-source').value;
  const sel=row.querySelector('.f-type');
  const types=source==='マルマサ'?['軽油','AdBlue','グリース']:['軽油','ガソリン'];
  sel.innerHTML=types.map(x=>`<option ${x===preferred?'selected':''}>${x}</option>`).join('');
  if(!types.includes(sel.value))sel.value=types[0];
  sel.onchange=()=>applyFuelPrice(row);
  applyFuelPrice(row);
}
function applyFuelPrice(row){
  const source=row.querySelector('.f-source').value;
  const type=row.querySelector('.f-type').value;
  const info=fuelPrice(source,type);
  const qty=row.querySelector('.f-qty'),unit=row.querySelector('.f-unit'),amount=row.querySelector('.f-amount');
  row.dataset.qtyUnit=info.unit;
  row.querySelector('.f-qty-label').textContent=`数量（${info.unit}）`;
  row.querySelector('.f-unit-label').textContent=`単価（円/${info.unit}）`;
  unit.value=info.price;
  row.querySelector('.f-price-note').textContent=`${source}${source==='スタンド'?'（'+(row.querySelector('.f-outlet').value||'ENEOS')+'）':''}：${type} ${info.price.toLocaleString()}円/${info.unit}`;
  const calc=()=>{amount.value=qty.value?Math.round(Number(qty.value)*info.price):''};
  qty.oninput=calc;calc();
}
function setFuelSource(btn,source){
  const row=btn.closest('.fuel-row');
  row.querySelectorAll('.fuel-source-chips .manifest-chip').forEach(b=>b.classList.toggle('active',b.dataset.source===source));
  row.querySelector('.f-source').value=source;
  row.querySelector('.f-outlet-wrap').style.display=source==='スタンド'?'':'none';
  updateFuelOptions(row,'軽油');
}
function setFuelOutlet(btn,outlet){
  const row=btn.closest('.fuel-row');
  row.querySelectorAll('.fuel-outlet-chips .manifest-chip').forEach(b=>b.classList.toggle('active',b.dataset.outlet===outlet));
  row.querySelector('.f-outlet').value=outlet;
  applyFuelPrice(row);
}
'''

for p in paths:
    if not p.exists():
        continue
    s=p.read_text(encoding='utf-8')
    if 'function setFuelSource(' in s:
        continue
    s=s.replace('v5.3.0','v5.3.1')
    s,n=re.subn(r"function addFuelRow\(d=\{\}\)\{.*?\n\}\n(?=function fuelAmount)",new_func,s,count=1,flags=re.S)
    if n!=1:
        raise SystemExit(f'addFuelRow replacement failed: {p}')

    old="  fuels:$$('.fuel-row').map(r=>({asset:r.querySelector('.f-asset').value,type:r.querySelector('.f-type').value,liters:Number(r.querySelector('.f-liters').value||0),unitPrice:Number(r.querySelector('.f-unit').value||0),amount:Number(r.querySelector('.f-amount').value||0),note:esc(r.querySelector('.f-note').value)})).filter(x=>x.liters||x.amount),"
    new="  fuels:$$('.fuel-row').map(r=>({asset:r.querySelector('.f-asset').value,source:r.querySelector('.f-source').value,outlet:r.querySelector('.f-source').value==='スタンド'?r.querySelector('.f-outlet').value:'',type:r.querySelector('.f-type').value,qty:Number(r.querySelector('.f-qty').value||0),unit:r.dataset.qtyUnit||'L',liters:(r.dataset.qtyUnit||'L')==='L'?Number(r.querySelector('.f-qty').value||0):0,unitPrice:Number(r.querySelector('.f-unit').value||0),amount:Number(r.querySelector('.f-amount').value||0),note:esc(r.querySelector('.f-note').value)})).filter(x=>x.qty||x.amount),"
    if old not in s:
        raise SystemExit(f'fuel collect replacement failed: {p}')
    s=s.replace(old,new,1)

    old_line=" if((d.fuels||[]).length)t+=`\\n\\n■燃料費\\n`+d.fuels.map(x=>`・${x.asset||'未設定'} ${x.type||''} ${Number(x.liters||0).toLocaleString()}L${x.unitPrice?` @￥${Number(x.unitPrice).toLocaleString()}`:''} ／ ￥${Math.round(fuelAmount(x)).toLocaleString()}${x.note?`（${x.note}）`:''}`).join('\\n');"
    new_line=" if((d.fuels||[]).length)t+=`\\n\\n■燃料・油脂\\n`+d.fuels.map(x=>`・${x.asset||'未設定'} ${x.source||''}${x.outlet?`（${x.outlet}）`:''} ${x.type||''} ${Number(x.qty??x.liters||0).toLocaleString()}${x.unit||'L'}${x.unitPrice?` @￥${Number(x.unitPrice).toLocaleString()}`:''} ／ ￥${Math.round(fuelAmount(x)).toLocaleString()}${x.note?`（${x.note}）`:''}`).join('\\n');"
    if old_line not in s:
        raise SystemExit(f'lineText fuel replacement failed: {p}')
    s=s.replace(old_line,new_line,1)

    # Better summary: only litre-based entries count toward fuel litres; breakdown includes source/outlet.
    s=s.replace("const liters=fuels.reduce((s,x)=>s+Number(x.liters||0),0);","const liters=fuels.reduce((s,x)=>s+((x.unit||'L')==='L'?Number(x.qty??x.liters||0):0),0);",1)
    s=s.replace("const map={};fuels.forEach(x=>{const k=x.asset||'未設定';if(!map[k])map[k]={liters:0,amount:0};map[k].liters+=Number(x.liters||0);map[k].amount+=fuelAmount(x)});","const map={};fuels.forEach(x=>{const k=x.asset||'未設定';if(!map[k])map[k]={liters:0,amount:0};if((x.unit||'L')==='L')map[k].liters+=Number(x.qty??x.liters||0);map[k].amount+=fuelAmount(x)});",1)

    p.write_text(s,encoding='utf-8')
print('TOYA One v5.3.1 fuel source patch applied')
