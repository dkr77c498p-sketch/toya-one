from pathlib import Path
import hashlib
import subprocess

# Generate only the new equipment module. Do not edit the tested vehicle module.
root = Path(__file__).resolve().parents[1]
source = root / 'docs/vehicle-cost-admin.js'
page = root / 'docs/index.html'
target = root / 'docs/equipment-cost-admin.js'
def blob_sha(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()

assert blob_sha(source.read_bytes()) == '0804e662af11d8595e7fb4316ed2ac932f38fb73', 'Vehicle module changed; review first'
s = source.read_text().replace('Vehicle','Equipment').replace('vehicle','equipment').replace('vc','ec').replace('車両','重機').replace('その車の','その重機の')
s = s.replace("const key=v=>['アームロール','4tアームロール'].map(norm).includes(norm(v))?norm('4tアームロール'):norm(v);", "const key=v=>/^sk55(?:sr)?$/.test(norm(v))?'sk55':norm(v);\n  const machineName=v=>typeof v==='string'?v:String(v?.name||'');")
start = s.index('  function derive(')
end = s.index('  window.ToyaEquipmentCostEngine=',start)
s = s[:start] + '''  function derive(all,rates,site){
    const warnings=[],seen=new Set();
    const reports=arr(all).filter(r=>{if(seen.has(r.id))return false;seen.add(r.id);return true;});
    const own=reports.filter(r=>r.site_id===site.id),used=new Set(),fuels=new Map(),fuelCounts=new Map(),fuelSeen=new Map();
    const labels=new Set(rates.filter(r=>r.active!==false).map(r=>key(r.label)));
    own.forEach(r=>{
      const d=r.report_data||{};
      // Read only self-owned machines, not leased machines or attachments.
      arr(d.machines).forEach(m=>{const name=machineName(m),k=key(name);if(!name)return;used.add(k);if(!labels.has(k))warnings.push('単価未登録の重機：'+name);});
      arr(d.fuels).filter(f=>['軽油','ガソリン'].includes(f?.type)).forEach(f=>{
        const k=key(f.asset);if(!labels.has(k))return; // Never subtract vehicle fuel or AdBlue/grease.
        const amount=f.amount!==''&&f.amount!=null?num(f.amount):num(f.qty??f.liters)*num(f.unitPrice);
        if(!Number.isFinite(amount)||amount<0){warnings.push(String(f.asset)+'：燃料額の記録を確認してください。');return;}
        fuels.set(k,money((fuels.get(k)||0)+amount));fuelCounts.set(k,(fuelCounts.get(k)||0)+1);
        const fp=[k,f.type,f.source||'',f.outlet||'',f.qty??f.liters,amount].join('|');
        if(fuelSeen.has(fp)&&fuelSeen.get(fp)!==r.id)warnings.push(String(f.asset)+'：複数の日報に同じ給油内容があります。二重記録でないか確認してください。');
        fuelSeen.set(fp,r.id);
      });
      if(arr(d.siteMoves).length)warnings.push('現場移動のある日報です。重機の使用現場と日額・燃料の配分を確認してください。');
    });
    if(reports.some(r=>r.site_id!==site.id&&arr(r.report_data?.siteMoves).some(m=>m?.site===site.name)))warnings.push('現場移動先の記録があります。重機が移動したかは自動判断しません。使用の有無・配分額を確認してください。');
    const counts=new Map();own.forEach(r=>{const k=r.recorder_name||r.report_data?.writer||'';counts.set(k,(counts.get(k)||0)+1);});
    if([...counts.values()].some(n=>n>1))warnings.push('同じ記入者の日報が複数あります。重機代は1日1回、燃料は各記録を加算しています。');
    const entries=rates.filter(r=>r.active!==false).map(r=>{
      const k=key(r.label),isUsed=used.has(k);
      if(isUsed&&reports.some(other=>other.site_id!==site.id&&arr(other.report_data?.machines).some(m=>key(machineName(m))===k)))warnings.push(r.label+'：同じ日に別現場にも使用記録があります。金額配分を確認してください。');
      if(!isUsed&&fuels.has(k))warnings.push(r.label+'：給油記録はありますが、使用重機の選択がありません。');
      return {code:r.code,label:r.label,used:isUsed,dayRate:num(r.daily_rate),recordedFuel:fuels.get(k)||0,fuelCount:fuelCounts.get(k)||0,manualGross:null,manualFuel:null,memo:''};
    });
    return {entries,warnings:[...new Set(warnings)],sourceReports:reports.map(r=>({id:r.id,updated_at:r.updated_at})),count:own.length};
  }
''' + s[end:]
s = s.replace('人工・高速代・重機費は含みません。','人工・車両費・回送費・アタッチメント代は含みません。')
s = s.replace('社員の操作は不要です。</p>', '社員の操作は不要です。時間単価ではなく1台・1日で計算します。</p>')
s = s.replace("const same=mine=>mine===owner&&mine===identity();", "const same=mine=>!!mine&&mine===owner&&mine===identity();")
s = s.replace('#ecCard input{font-size:16px}', '#ecCard input{font-size:16px;min-width:0;max-width:100%}#ecCard .grid2{grid-template-columns:repeat(2,minmax(0,1fr))}#ecCard .grid2>div{min-width:0}')
assert blob_sha(s.encode()) == '46581d345309815026a3706007b648f8e603a671', 'Output differs from browser-tested module; stop'
if target.exists():
    assert target.read_text() == s, 'Existing equipment module differs; stop'

tag = '<script src="equipment-cost-admin.js?v=20260909-equipment-v1"></script>'
before = page.read_text()
if tag not in before:
    assert blob_sha(page.read_bytes()) == '13c3820f234004a02d482b59903a0407b04e2913', 'App changed; review first'
    document_end = '\n</body>\n</html>'
    assert before.count(document_end) == 1, 'Document end ambiguous; stop'
    after = before.replace(document_end, '\n'+tag+document_end)
    assert after.replace(tag+'\n','') == before, 'Only one script reference may be added'
else:
    after = before

target.write_text(s)
subprocess.run(['node','--check',str(target)],check=True)
# The tested JavaScript hash is checked above, before enabling it.
page.write_text(after)
print('Verified equipment cost module and isolated loader are ready')
