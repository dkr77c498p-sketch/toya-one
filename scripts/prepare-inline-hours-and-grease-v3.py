from pathlib import Path
import hashlib,json,re,subprocess
ROOT=Path(__file__).resolve().parents[1]
def blob(b): return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
expected={'docs/usage-hours.js':'fab43f246aa5de4ca160b435f5a6f279a26b8ab0','docs/site-financial-summary.js':'f6a39642f406f5d5eaa952521f43ce1a190cbab4','docs/index.html':'29c840bfa3d4d236d940c3bd299f3b7d21c4a398','scripts/inline-hours-ui-v2.js':'e7e78bcf8e010d7b1b823fff1398e3302db080ff','docs/attachment-rate-admin.js':'5d606067-placeholder'}
# The staged rate editor is read, not rewritten; its source is included in the build artifact.
expected.pop('docs/attachment-rate-admin.js')
for p,sha in expected.items():
 if blob((ROOT/p).read_bytes())!=sha: raise RuntimeError('Concurrent source change: '+p)
def replace(s,a,b,count=1):
 if s.count(a)!=count: raise RuntimeError('Patch anchor count differs: '+a[:90])
 return s.replace(a,b)
h=(ROOT/'docs/usage-hours.js').read_text()
h=replace(h,"equipment:'重機',tool:","equipment:'重機',attachment:'アタッチメント',tool:")
h=replace(h,"equipment:'machines',tool:'attachments'","equipment:'machines',attachment:'attachments',tool:'attachments'")
h=replace(h,"if(g.kind!=='tool'&&g.sites.length>1", "if(!['tool','attachment'].includes(g.kind)&&g.sites.length>1")
addon=''' function attachments(data,site){
  const out=[];
  for(const g of build(data).values()){
   if(g.kind!=='attachment'||!g.sites.includes(norm(site.name)))continue;
   if(!g.valid){out.push({date:g.date,label:g.label,value:null,issue:g.errors.join(' ')});continue;}
   const e=g.entry,m=e.allocations.find(a=>norm(a.site)===norm(site.name))?.minutes||0;
   if(!m)continue;
   const rates=arr(data.attachmentRates).filter(r=>r.active!==false&&key(r.label)===key(e.label));
   const rate=rates.length===1?num(rates[0].hourly_rate):null;
   if(rate===null||!Number.isFinite(rate)||rate<0){out.push({date:g.date,label:e.label,value:null,issue:e.label+'のアタッチメント時間単価が未登録・不正です。使用時間は記録済みです。'});continue;}
   out.push({date:g.date,label:e.label,value:round(rate*m*e.quantity/60),issue:''});
  }
  return out;
 }
'''
h=replace(h,' const engine=Object.freeze({workMinutes,validateEntry,build,fuelRows,adjust,tools,key});',addon+' const engine=Object.freeze({workMinutes,validateEntry,build,fuelRows,adjust,tools,attachments,key});')
pos=h.index(' const groups=')
h=h[:pos]+(ROOT/'scripts/inline-hours-ui-v2.js').read_text()
s=(ROOT/'docs/site-financial-summary.js').read_text()
s=replace(s,'transport: 0, tools: 0, other: 0','transport: 0, tools: 0, attachments: 0, other: 0')
s=replace(s,'const expenses = {tools:', 'const expenses = {attachments: {value: 0, count: 0, missing: 0}, tools:')
s=replace(s,'    const categories = {};',"    hoursEngine.attachments(data, site).forEach(x => {\n      addExpense('attachments', x.value, x.date);\n      if (x.issue) warnings.add(x.date + '：' + x.issue);\n    });\n    const categories = {};")
s=replace(s,'d.transport + d.tools + d.other','d.transport + d.tools + d.attachments + d.other')
s=replace(s,'expenses.transport.value + expenses.tools.value + expenses.other.value','expenses.transport.value + expenses.tools.value + expenses.attachments.value + expenses.other.value')
s=replace(s,"['tools', '小型機械・工具費（時間計算）'],", "['attachments', 'アタッチメント費（時間計算）'], ['tools', '小型機械・工具費（時間計算）'],")
s=replace(s,"['toolRates', 'small_tool_rate_master', 'id,label,hourly_rate,fuel_included,active', null, null]", "['toolRates', 'small_tool_rate_master', 'id,label,hourly_rate,fuel_included,active', null, null],\n        ['attachmentRates', 'attachment_rate_master', 'id,label,hourly_rate,active', null, null]")
p=(ROOT/'docs/index.html').read_text()
mar='<button type="button" class="manifest-chip ${source===\'マルマサ\'?\'active\':\'\'}" data-source="マルマサ" onclick="setFuelSource(this,\'マルマサ\')">マルマサ</button>'
kaw='<button type="button" class="manifest-chip ${source===\'川崎建機\'?\'active\':\'\'}" data-source="川崎建機" onclick="setFuelSource(this,\'川崎建機\')">川崎建機</button>'
p=replace(p,mar,mar+kaw)
p=replace(p,"'グリース':{price:660,unit:'本'}}", "'グリース':{price:660,unit:'本'}},\n    '川崎建機':{'ブルーグリス':{price:1000,unit:'本'}}")
p=replace(p,"source==='マルマサ'?['軽油','AdBlue','グリース']:['軽油','ガソリン']", "source==='川崎建機'?['ブルーグリス']:source==='マルマサ'?['軽油','AdBlue','グリース']:['軽油','ガソリン']")
p=replace(p,"type==='グリース'?'本':'L'", "['グリース','ブルーグリス'].includes(type)?'本':'L'")
p=replace(p,"x.type==='グリース'", "['グリース','ブルーグリス'].includes(x.type)",3)
p=replace(p,'  row.dataset.qtyUnit=info.unit;', "  row.dataset.qtyUnit=info.unit;\n  qty.step=info.unit==='本'?'1':'0.1';")
p=replace(p,'<script src="usage-hours.js?v=20260909-hours-v1"></script>', '<script src="usage-hours.js?v=20260909-inline-v3"></script>\n<script src="attachment-rate-admin.js?v=20260909-inline-v3"></script>')
p=replace(p,'<script src="site-financial-summary.js?v=20260909-hours-v1"></script>', '<script src="site-financial-summary.js?v=20260909-inline-v3"></script>')
outputs={'docs/usage-hours.js':h,'docs/site-financial-summary.js':s,'docs/index.html':p}
for name,text in outputs.items(): (ROOT/name).write_text(text)
# Validate inline script syntax as well as both isolated regression suites.
for name in ['docs/usage-hours.js','docs/site-financial-summary.js','docs/attachment-rate-admin.js']:
 subprocess.run(['node','--check',str(ROOT/name)],check=True)
for i,text in enumerate(re.findall(r'<script(?:\\s[^>]*)?>(.*?)</script>',p,re.S)):
 f=ROOT/('inline-script-'+str(i)+'.js');f.write_text(text);subprocess.run(['node','--check',str(f)],check=True);f.unlink()
for name in ['tests/hourly-usage-and-transport.cjs','tests/inline-hours-attachments.cjs']:
 subprocess.run(['node',str(ROOT/name)],check=True)
manifest={name:blob((ROOT/name).read_bytes()) for name in outputs}
manifest['docs/attachment-rate-admin.js']=blob((ROOT/'docs/attachment-rate-admin.js').read_bytes())
(ROOT/'prepared-inline-manifest.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps(manifest,indent=2))
