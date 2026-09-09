from pathlib import Path
import hashlib, subprocess, sys, re, tempfile
root=Path(__file__).resolve().parents[1]
p=root/'docs'
def blob(path):
    b=path.read_bytes()
    return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
base={'index.html':'aac7bcb68b0680945b1072319d92e1d86e81daad','site-financial-summary.js':'15d8a19cf1d6a790cbf6e36e5f2841ad683f268e','site-waste-cost-summary.js':'57d73fcb6675731d94fa23b4aa81f967cfc077e5'}
expected={'index.html':'877c2d4e6213e716df9924f074a5b92058fc4b94','site-financial-summary.js':'457a8a389ad4123da60f390f7dfc27fc4ce5db8e','site-waste-cost-summary.js':'6d02f602065255406878735297c1f850098f51bb','site-move-allocation.js':'2ab5e247091106f8584bac8132c265ff155e9061','sale-records.js':'71afa4a8c02b1f78acd779981db670893e13ae5e'}
if all(blob(p/f)==h for f,h in expected.items()):
    print('Already enabled; no changes')
    sys.exit(0)
for f,h in base.items():
    assert blob(p/f)==h,'Baseline changed; stop without publishing: '+f
for f in ['site-move-allocation.js','sale-records.js']:
    assert blob(p/f)==expected[f],'Helper differs from browser-tested version: '+f
s=(p/'site-financial-summary.js').read_text()
def rep(old,new):
    global s
    assert s.count(old)==1,(s.count(old),old[:140])
    s=s.replace(old,new)
rep("  const travelEngine =", "  const moveEngine = typeof module === 'object' && module.exports ? require('./site-move-allocation.js') : window.ToyaMoveAllocationEngine;\n  const saleEngine = typeof module === 'object' && module.exports ? require('./sale-records.js') : window.ToyaSaleRecordEngine;\n  const travelEngine =")
rep("    const issues = new Set(), entries = [];", "    const issues = new Set(), entries = [];\n    const allocation=data._allocation||moveEngine.build(data,reports);\n    const splitGroups=allocation.forSite(kind,date,site);")
rep("    const sheet = {id: 'automatic:'", "    splitGroups.filter(g=>!g.valid).forEach(g=>g.errors.forEach(e=>note(g.label+'：'+e)));\n    const sheet = {id: 'automatic:'")
rep("      workers.forEach(({label, reports: rs}, k) => {", """      splitGroups.forEach(g=>{if(!workers.has(normal(g.label)))workers.set(normal(g.label),{label:g.label,reports:[]});});
      workers.forEach(({label, reports: rs}, k) => {
        const group=allocation.get('labor',date,label);
        if(group){
          if(!group.valid)return;
          const share=allocation.share(group,site);if(!share)return;
          const rate=findRate(data.laborRates,r=>r.kind==='own'&&normal(r.label)===k,label);if(!rate)return;
          const value=rateValue(rate,share===0.5?'half_rate':'day_rate',label);if(value===null)return;
          const cost=share===0.5?value:round(value*share);
          entries.push({key:rate.code,label,kind:'own',full:share===1?1:0,half:share===0.5?1:0,cost,allocatedDays:share});
          sheet.cost_total=round(sheet.cost_total+cost);return;
        }""")
rep("        if (rs.some(hasMoves) || others.some(r => list(raw(r).workers).some(w => normal(named(w)) === k))) {", "        if (rs.some(r=>list(raw(r).siteMoves).some(m=>!m.costSplit || list(m.costSplit.workers).some(w=>normal(w)===k))) || others.some(r => list(raw(r).workers).some(w => normal(named(w)) === k))) {")
rep("      if (incoming.length) note('移動先としての作業があります。", "      if (incoming.some(m=>!m.costSplit)) note('移動先としての作業があります。")
rep("      used.forEach(({label, reports: rs}, k) => {", """      splitGroups.forEach(g=>{if(!used.has(assetKey(g.label)))used.set(assetKey(g.label),{label:g.label,reports:[]});});
      used.forEach(({label, reports: rs}, k) => {
        const group=allocation.get(kind,date,label);
        if(group){
          if(!group.valid)return;
          const share=allocation.share(group,site);if(!share)return;
          const rate=findRate(rates,r=>assetKey(r.label)===k,label);if(!rate)return;
          const dayRate=rateValue(rate,'daily_rate',label);if(dayRate===null)return;
          const gross=round(dayRate*share);let fuel=0,fuelCount=0;
          allocation.fuelRows(site,date,fuelAmount).forEach(({fuel:f})=>{
            if(!['軽油','ガソリン'].includes(f.type)||assetKey(f.asset)!==k)return;
            const value=amount(f.amount);if(value===null||value<0){note(label+'の燃料額が未入力です。');return;}
            fuel=round(fuel+value);fuelCount++;
          });
          entries.push({code:rate.code,label:rate.label,used:true,dayRate,allocatedDays:share,recordedFuel:fuel,fuelCount,manualGross:gross,manualFuel:null,memo:'日報の現場移動で指定した配分'});
          sheet.gross_total=round(sheet.gross_total+gross);sheet.fuel_deduction_total=round(sheet.fuel_deduction_total+fuel);return;
        }""")
rep("      if (kind === 'vehicle' && incoming.some(m => m.vehicle)) note(", "      if (kind === 'vehicle' && incoming.some(m => m.vehicle&&!m.costSplit)) note(")
rep("    const reports = uniqueReports(data.reports), own = reports.filter(r => r.site_id === site.id);", "    const reports = uniqueReports(data.reports), own = reports.filter(r => r.site_id === site.id);\n    if(!moveEngine||!saleEngine)throw new Error('現場配分・売却記録の計算処理を読み込めませんでした。');\n    const allocation=moveEngine.build(data,reports);data={...data,_allocation:allocation};\n    const saleRecords=[];")
start=s.index("      list(d.fuels).forEach(f => {",s.index('function analyze'))
end=s.index("      list(d.items).forEach(x => {",start)
old=s[start:end]
assert 'fuelFingerprints.set' in old
s=s[:start]+s[end:]
rep("      list(d.items).forEach(x => {", "      list(d.items).forEach(x => {\n        if(saleEngine.isRecordOnly(x)){saleRecords.push({date,name:saleEngine.label(x),qty:x.qty,unit:x.unit,company:x.company||x.disposalSite||''});return;}")
rep("      if (list(d.siteMoves).length) warnings.add(date + '：現場移動あり。", "      if (list(d.siteMoves).some(m=>!m.costSplit)) warnings.add(date + '：現場移動あり。")
rep("    reports.forEach(r => list(r.report_data?.siteMoves).forEach(m => {", """    allocation.fuelRows(site,null,fuelAmount).forEach(({report:r,fuel:f,original,index,allocated})=>{
      const date=r.report_date,k=assetKey(f.asset),n=amount(f.amount);
      addExpense('fuel',n,date);
      if(vehicleKeys.has(k))needed.vehicle.add(date);
      if(equipmentKeys.has(k))needed.equipment.add(date);
      const fp=JSON.stringify([date,k,f.type,f.source,f.outlet,original.qty??original.liters,fuelAmount(original)]);
      if(fuelFingerprints.has(fp)&&fuelFingerprints.get(fp)!==r.id)warnings.add(date+'：複数日報に同じ給油内容があります。燃料の二重記録を確認してください。');
      fuelFingerprints.set(fp,r.id);
    });
    allocation.groups.forEach(g=>{
      if(g.claims.some(c=>allocation.matches(c.from,site)||(c.to&&allocation.matches(c.to,site)))){
        day(g.date);needed[g.kind].add(g.date);
        if(!g.valid)g.errors.forEach(e=>warnings.add(g.date+'：'+g.label+'：'+e));
      }
    });
    reports.forEach(r => list(r.report_data?.siteMoves).forEach(m => {""")
rep("      warnings.add(r.report_date + '：別現場からの移動記録があります。", "      if(!m.costSplit)warnings.add(r.report_date + '：別現場からの移動記録があります。")
rep("          const recorded = own.filter(r => r.report_date === s.work_date).flatMap(r => list(r.report_data?.fuels))", "          const recorded = allocation.fuelRows(site,s.work_date,fuelAmount).map(x=>x.fuel)")
rep("return {categories, expenses, days, subtotal, partial, warnings: [...warnings], reportCount: own.length, hasData: byDay.size > 0};", "return {categories, expenses, days, subtotal, partial, saleRecords, warnings: [...warnings], reportCount: own.length, hasData: byDay.size > 0};")
rep("    const pending = Object.entries(result.categories)", """    if(result.saleRecords.length)html+='<details><summary>金属売却の記録（金額集計なし・'+result.saleRecords.length+'件）</summary>'+result.saleRecords.map(x=>'<div class="sf-day"><b>'+escape(x.date)+' '+escape(x.name)+'</b><div class="sf-note">'+escape(x.qty||'数量未入力')+escape(x.unit||'')+' ／ '+escape(x.company||'売却先未入力')+'</div></div>').join('')+'</details>';
    const pending = Object.entries(result.categories)""")
rep("    html += '<details><summary>計算方法・燃料の二重計上防止</summary>", "    html += '<details><summary>計算方法・燃料の二重計上防止</summary><p class=\"sf-note\">現場移動で対象者・車両・重機と配分を指定した分は、各現場へ半日等で計上します。日額と記録燃料を同じ比率で配分します。保存済み金額がある場合は優先し、配分との整合は要確認です。売却・記録のみの品目は金額を原価・売上へ加算しません。</p>")
for key,table in [('laborSheets','labor_cost_sheets'),('vehicleSheets','vehicle_cost_sheets'),('equipmentSheets','equipment_cost_sheets')]:
    lines=s.splitlines(True)
    hits=[i for i,v in enumerate(lines) if "['"+key+"', '"+table in v]
    assert len(hits)==1
    i=hits[0];lines[i]=lines[i].replace("'work_date', site.id]", "'work_date', null]")
    if key=='laborSheets':lines[i]=lines[i].replace("work_date,cost_total", "work_date,entries,cost_total")
    s=''.join(lines)
rep("const data = Object.fromEntries(definitions.map(([name], i) => [name, values[i]]));", "const data = {...Object.fromEntries(definitions.map(([name], i) => [name, values[i]])),sites};")
(p/'site-financial-summary.js').write_text(s)
s=(p/'index.html').read_text()
needle='q+Number(x.price||0)'
assert s.count(needle)==1
s=s.replace(needle,"q+((x.costTreatment==='record_only_sale'||String(x.name||'').startsWith('売却記録：'))?0:Number(x.price||0))")
s=s.replace('<script src="site-financial-summary.js?v=20260909-travel-v1"></script>', '<script src="site-move-allocation.js?v=20260909-move-v1"></script>\n<script src="sale-records.js?v=20260909-sale-v1"></script>\n<script src="site-financial-summary.js?v=20260909-move-v1"></script>')
assert 'site-move-allocation.js' in s
s=s.replace('site-waste-cost-summary.js?v=20260908-1220','site-waste-cost-summary.js?v=20260909-sale-v1')
(p/'index.html').write_text(s)
s=(p/'site-waste-cost-summary.js').read_text()
s=s.replace('if(!isWaste(x)) return;',"if(!isWaste(x)||x.costTreatment==='record_only_sale'||String(x.name||'').startsWith('売却記録：')) return;")
(p/'site-waste-cost-summary.js').write_text(s)
for f,h in expected.items():
    assert blob(p/f)==h,'Generated bytes differ from tested version: '+f
for f in expected:
    if f.endswith('.js'):subprocess.run(['node','--check',str(p/f)],check=True)
for js in re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>',(p/'index.html').read_text(),re.S):
    with tempfile.NamedTemporaryFile(suffix='.js',mode='w') as t:
        t.write(js);t.flush();subprocess.run(['node','--check',t.name],check=True)
subprocess.run(['node',str(root/'scripts/test-site-move-costs-v1.cjs'),str(p)],check=True)
print('Verified isolated move allocation and sale records. No database or authentication changes.')
