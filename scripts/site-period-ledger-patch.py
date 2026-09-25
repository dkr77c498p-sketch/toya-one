from pathlib import Path
import hashlib
p=Path('docs')
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
expected_helpers={
 'site-period-ledger.r1.js':'f424f6427acfadacc62a9e7b167ed25890606bc5a5169d4a73b2ea238b7650ec',
 'site-period-ledger-ui.r1.js':'1415f95c2b021fbbaf74fa87f686b7765ccc01aa106deab74ddd872f09609bb1'
}
for name,sha in expected_helpers.items(): assert digest(p/name)==sha,name
assert digest(p/'company-monthly-summary.js')=='d3d779e72cf0d288b755d244744895ed24f83e2a593a3c2360dd13be89f10fad'
output_index='d0aeb6eb47bed4253c6fd4de3c401f4e9cea4f127d7bc8ef86306ec63b44c704'
output_monthly='cd6863ca95d005c677d8f674e3090ccc5ce0f8d0272a7c591d3eed0e529fe6f0'
if digest(p/'index.html')==output_index:
 assert digest(p/'company-monthly-summary.period-r1.js')==output_monthly
 print('Already staged exact reviewed files')
 raise SystemExit(0)
assert digest(p/'index.html')=='a520bc764e91bdecb5187e13aa819007a832c6c5821c93635b7cf8971dbbc51c'
s=(p/'company-monthly-summary.js').read_text()
a=s.index(' function renderProgressEditor(){');b=s.index(' async function saveProgress(){',a)
s=s[:a]+''' function renderProgressEditor(){
  if(!snapshot||!window.ToyaSitePeriodUI){setStatus('現場別の売上画面を読み込めません。画面を更新してください。',true);return;}
  const candidates=snapshot.sites.filter(s=>!excluded.has(s.id));
  window.ToyaSitePeriodUI.open({siteId:candidates.length===1?candidates[0].id:'',month,edit:true});
 }
'''+s[b:]
a=s.index(' async function saveProgress(){');b=s.index(' function render(result){',a);s=s[:a]+s[b:]
s=s.replace('着工中の請負金 合計','選択現場の請負総額（参考）')
s=s.replace('<p id="cmContractInfo" class="cm-contract-note"></p>','<p id="cmContractInfo" class="cm-contract-note"></p><button id="cmPeriodOpen" class="btn light" type="button" style="width:100%;margin:10px 0">現場別の月別・工事全体を見る</button>')
s=s.replace("q('#cmProgressOpen').onclick=()=>renderProgressEditor();return true;","q('#cmProgressOpen').onclick=()=>renderProgressEditor();q('#cmPeriodOpen').onclick=()=>{if(!window.ToyaSitePeriodUI)return setStatus('現場別集計を読み込めません。画面を更新してください。',true);const selected=list(snapshot?.sites).filter(s=>!excluded.has(s.id));window.ToyaSitePeriodUI.open({siteId:selected.length===1?selected[0].id:'',month});};return true;")
assert hashlib.sha256(s.encode()).hexdigest()==output_monthly
(p/'company-monthly-summary.period-r1.js').write_text(s)
s=(p/'index.html').read_text().replace('company-monthly-summary.js?v=20260919-progress-button-v19','company-monthly-summary.period-r1.js?v=20260925-site-period-r1')
# Only the real final closing body tag; earlier occurrences belong to print templates.
head,tail=s.rsplit('</body>',1)
s=head+'<script src="site-period-ledger.r1.js?v=20260925-site-period-r1"></script>\n<script src="site-period-ledger-ui.r1.js?v=20260925-site-period-r1"></script>\n</body>'+tail
assert hashlib.sha256(s.encode()).hexdigest()==output_index
(p/'index.html').write_text(s)
print('Reviewed index and monthly entry module generated; no database changes')
