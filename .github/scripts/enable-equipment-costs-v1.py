from pathlib import Path
import re, hashlib
w=Path('docs')
p=w/'index.html'
before=p.read_text()
tag='<script src="equipment-cost-admin.js?v=20260909-equipment-v1"></script>'
if tag not in before:
    assert hashlib.sha1(b'blob '+str(len(p.read_bytes())).encode()+b'\0'+p.read_bytes()).hexdigest()=='13c3820f234004a02d482b59903a0407b04e2913', 'App changed; stop for review'
s=(w/'vehicle-cost-admin.js').read_text()
assert hashlib.sha1(b'blob '+str(len(s.encode())).encode()+b'\0'+s.encode()).hexdigest()=='0804e662af11d8595e7fb4316ed2ac932f38fb73'
s=s.replace('vehicle costs v1','equipment costs v1').replace('__toyaVehicleCostsV1','__toyaEquipmentCostsV1').replace('ToyaVehicleCostEngine','ToyaEquipmentCostEngine')
s=s.replace('vehicle_rate_master','equipment_rate_master').replace('vehicle_cost_sheets','equipment_cost_sheets')
s=s.replace('vc','ec').replace('Vc','Ec')
s=s.replace("const key=v=>['アームロール','4tアームロール'].map(norm).includes(norm(v))?norm('4tアームロール'):norm(v);", "const key=v=>['sk55','sk55sr'].includes(norm(v))?'sk55':norm(v);\n  const assetName=v=>typeof v==='string'?v:String(v?.name||'');")
start=s.index('  function derive(');end=s.index('  window.ToyaEquipmentCostEngine',start)
s=s[:start]+'''  function derive(all,rates,site){
    const warnings=[],seen=new Set();
    const reports=arr(all).filter(r=>{if(seen.has(r.id))return false;seen.add(r.id);return true;});
    const own=reports.filter(r=>r.site_id===site.id),used=new Set(),fuels=new Map(),fuelCounts=new Map(),fuelSeen=new Map();
    const labels=new Set(rates.map(r=>key(r.label)));
    own.forEach(r=>{
      const d=r.report_data||{};
      arr(d.machines).forEach(m=>{const name=assetName(m),k=key(name);if(!k)return;used.add(k);if(!labels.has(k))warnings.push('単価未登録の重機：'+name);});
      arr(d.fuels).filter(f=>['軽油','ガソリン'].includes(f?.type)).forEach(f=>{
        const k=key(f.asset);if(!labels.has(k))return; // Only fuel for these owned machines; no vehicle, AdBlue or grease amounts.
        const amount=f.amount!==''&&f.amount!=null?num(f.amount):num(f.qty??f.liters)*num(f.unitPrice);
        if(!Number.isFinite(amount)||amount<0){warnings.push(String(f.asset)+'：燃料額の記録を確認してください。');return;}
        fuels.set(k,money((fuels.get(k)||0)+amount));fuelCounts.set(k,(fuelCounts.get(k)||0)+1);
        const fp=[k,f.type,f.source||'',f.outlet||'',f.qty??f.liters,amount].join('|');
        if(fuelSeen.has(fp)&&fuelSeen.get(fp)!==r.id)warnings.push(String(f.asset)+'：複数の日報に同じ給油内容があります。二重記録でないか確認してください。');
        fuelSeen.set(fp,r.id);
      });
      if(arr(d.siteMoves).length)warnings.push('現場移動のある日報です。重機の日額と燃料を現場間で二重計上しないよう手入力で配分してください。');
      if(arr(d.leaseMachines).length)warnings.push('リース重機の記録があります。この欄は自社重機だけです。リース代は含めていません。');
    });
    // A move record has a vehicle but no reliable excavator assignment. Never infer one from the truck.
    if(reports.some(r=>r.site_id!==site.id&&arr(r.report_data?.siteMoves).some(m=>m?.site===site.name)))warnings.push('別現場からの移動記録があります。重機が移動したかは日報だけでは確定できません。実際の使用と金額配分を確認してください。');
    const counts=new Map();own.forEach(r=>{const k=r.recorder_name||r.report_data?.writer||'';counts.set(k,(counts.get(k)||0)+1);});
    if([...counts.values()].some(n=>n>1))warnings.push('同じ記入者の日報が複数あります。重機代は1台につき日額1回、燃料は各記録を加算しています。');
    const entries=rates.filter(r=>r.active!==false).map(r=>{
      const k=key(r.label),isUsed=used.has(k);
      if(isUsed&&reports.some(other=>other.site_id!==site.id&&arr(other.report_data?.machines).some(m=>key(assetName(m))===k)))warnings.push(r.label+'：同じ日に別現場にも使用記録があります。金額配分を確認してください。');
      if(!isUsed&&fuels.has(k))warnings.push(r.label+'：給油記録はありますが、使用重機の選択がありません。');
      return {code:r.code,label:r.label,used:isUsed,dayRate:num(r.daily_rate),recordedFuel:fuels.get(k)||0,fuelCount:fuelCounts.get(k)||0,manualGross:null,manualFuel:null,memo:''};
    });
    return {entries,warnings:[...new Set(warnings)],sourceReports:reports.map(r=>({id:r.id,updated_at:r.updated_at})),count:own.length};
  }
'''+s[end:]
s=s.replace('車両','重機').replace('その車の','その重機の').replace('同じ車の','同じ重機の')
s=s.replace('人工・高速代・重機費は含みません。','人工・回送費・車両費は含みません。')
s=s.replace('重機の日額 − その重機の記録済み燃料費。人工は別計算です。社員の操作は不要です。','1台1日の日額 − その重機の記録済み燃料費。人工は別計算です。社員の操作は不要です。')
s=s.replace('勤務や単価の変更で手入力は消えません。','使用の切替や単価の変更で手入力は消えません。')
s=s.replace('const same=mine=>mine===owner&&mine===identity();','const same=mine=>Boolean(mine)&&mine===owner&&mine===identity();')
s=s.replace("['ecDate','ecSite'].forEach(id=>q('#'+id).addEventListener('change',()=>{if(rows.length)msg('日付・現場を変更しました。「この日の重機費を開く」を押してください。');}));", """['ecDate','ecSite'].forEach(id=>q('#'+id).addEventListener('change',()=>{
      if(!rows.length)return;
      q('#ecBody').hidden=true;q('#ecTotals').hidden=true;q('#ecWarnings').hidden=true;q('#ecSave').hidden=true;
      msg('日付・現場を変更しました。「この日の重機費を開く」を押してください。');
    }));""")
s=s.replace("    q('#ecBody').innerHTML=rows.map", "    q('#ecBody').hidden=false;\n    q('#ecBody').innerHTML=rows.map")
s=s.replace('日報${result.count}件から仮計算しました。同じ重機は日額1回。燃料はその重機の記録分だけ差し引いています。','日報${result.count}件から仮計算しました。同じ重機は1台につき日額1回（時間単価ではありません）。燃料はその重機の記録分だけ差し引いています。')
# Read the informational status and await a load; invalid controls never publish stale rows.
s=s.replace("q('#ecSave').onclick=save;", "q('#ecSave').onclick=save;")
assert 'vc' not in s and 'vehicle_cost_sheets' not in s
assert 'cloudClient.auth' not in s and '.from(\'daily_reports\').update' not in s
assert hashlib.sha1(b'blob '+str(len(s.encode())).encode()+b'\0'+s.encode()).hexdigest()=='cc0fdee20b1efb34fec7ce67049ed8292a480050', 'Module differs from tested version'
(w/'equipment-cost-admin.js').write_text(s)
if tag not in before:
    end='\n</body>\n</html>'
    assert before.count(end)==1, 'Document ending is not unique'
    after=before.replace(end,'\n'+tag+end)
    assert after.replace(tag+'\n','')==before
    p.write_text(after)
print('Enabled tested equipment cost module; existing logic unchanged')
