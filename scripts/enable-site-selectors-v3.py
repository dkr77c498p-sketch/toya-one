from pathlib import Path
import hashlib,re,subprocess
ROOT=Path(__file__).resolve().parents[1]
D=ROOT/'docs'
def blob(b): return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
checks={
 'employee-activity-summary.js':('341e9966177efc2396b8586305001e023973a6e3','2b849bda91b3fa17b086bdf590ce33578b68c03e'),
 'equipment-cost-admin.js':('e52fca9a9b0c7bdb23761b97645d134dfc07a9c5','16780c8a20066fc4e14b5d1fd3617f24683b505e'),
 'index.html':('982e403cf4c7ced3b1791ab0f1b44a3ac65598dd','66c6058c08c2edd86ad4c11e79d9ce98016a1c73'),
 'labor-cost-admin.js':('10116eb668027a8bea3ac19f2f7fdcfced8274c0','f9cd30b402648f998242935ecba35122e78061a4'),
 'midway.js':('02a9f059144e10e0c2f08a6efb5461fc5c98c179','406205ae1c79918a292c9826a000adcd85cb316a'),
 'shared-site-master.js':('1e77d1bd9f81049f7ad68bc0fd77bb316283b3f0','11d6b954e5084674e8e9e1c7499d2263d215b889'),
 'site-financial-summary.js':('4b9112b3ef71854f8194a9ea6b759d0811751021','66cac3aec0e66c27907a9c0f1ab3fa9dc35b585e'),
 'site-move-filter-fix.js':('3c704786e9fe62ec55936b3fb1259130bdcbcfae','44d5e6d7a67ebe16c6a2ceb900a502eecc404bc2'),
 'site-waste-cost-summary.js':('57d73fcb6675731d94fa23b4aa81f967cfc077e5','e56b57da75ee88e64714c7148f851ed3add57f16'),
 'vehicle-cost-admin.js':('b782611f63c0c6e42328cb93558010c69a3d7568','68fb170146d690e6689396a69b6655aaa1436ba2')
}
original={name:(D/name).read_text() for name in checks}
current={name:blob((D/name).read_bytes()) for name in checks}
if all(current[n]==checks[n][1] for n in checks):
 print('Already published. Rechecking regressions.')
else:
 for name,(before,after) in checks.items():
  if current[name]!=before:raise RuntimeError('Concurrent change; no files written: '+name)
 generated=dict(original)
 def replace(s,old,new):
  if s.count(old)!=1:raise RuntimeError('Replacement must match exactly once: '+old[:100])
  return s.replace(old,new)
 def edit(name,fn):generated[name]=fn(generated[name])
 pure,browser=(ROOT/'scripts/selector-helpers-v3.js').read_text().split('//===BROWSER===\n')
 for part in ['selector-apply-shared-v3.py','selector-apply-views-v3.py']:
  exec(compile((ROOT/'scripts'/part).read_text(),part,'exec'))
 for name,text in generated.items():
  if blob(text.encode())!=checks[name][1]:raise RuntimeError('Generated file differs from browser-tested file: '+name+' '+blob(text.encode()))
 a=original['index.html'];b=generated['index.html']
 for start,end in [('async function cloudRefreshSession(){','async function cloudEnsureSite(name){'),('/* TOYA One verified report writes.','function cloudSafePhotoId(v){'),('async function saveReport(){','const PHOTO_CATEGORIES=')]:
  if a[a.index(start):a.index(end)]!=b[b.index(start):b.index(end)]:raise RuntimeError('Protected save/auth code changed')
 for name,text in generated.items():(D/name).write_text(text)
# Adjust one obsolete expectation: local-only drafts now live in Registration Management.
p=ROOT/'tests/shared-site-master.cjs';s=p.read_text()
old="t('local-only admin option is marked not shared',()=>assert.match(S.options(rows,['ローカル'],'',true).find(x=>x.value==='ローカル').label,/未共有/));"
new="t('local-only admin draft stays out of shared picker until registered',()=>assert.ok(!S.options(rows,['ローカル'],'',true).some(x=>x.value==='ローカル')));"
if old in s:
 if blob(p.read_bytes())!='7bd8c4f0b8c91e01ac64b8288f352c139634d08e':raise RuntimeError('Shared tests changed concurrently')
 p.write_text(s.replace(old,new))
elif new not in s:raise RuntimeError('Unexpected shared-site tests')
(ROOT/'tests/site-selector-unified.cjs').write_text((ROOT/'scripts/test-site-selectors-v3.cjs').read_text())
for name in checks:
 if name.endswith('.js'):subprocess.run(['node','--check',str(D/name)],check=True)
for p in sorted((ROOT/'tests').glob('*.cjs')):
 print('RUN',p.name,flush=True);subprocess.run(['node',str(p)],check=True,cwd=ROOT)
print('All selector, existing calculation, travel and verified-save regressions passed. No database writes.')
