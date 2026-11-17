"""Exercise real monthly and lifetime modules, with synthetic same-origin fixtures only."""
import json,os,subprocess
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
ROOT=Path.cwd();out=ROOT/'test-output/monthly-revenue'/os.environ.get('TOYA_TEST_BROWSER','chromium');out.mkdir(parents=True,exist_ok=True)
subprocess.run(['node','tests/monthly-revenue.cjs'],env={**os.environ,'TOYA_FIXTURE_OUTPUT':str(out/'fixture.json')},check=True,stdout=subprocess.DEVNULL)
f=json.loads((out/'fixture.json').read_text());data=f['data'];company=f['company']
setup='''
var cloudProfile={id:'fixture-admin',company_id:'fixture-company',role:'admin',active:true};
var __writes=[],__queries=[],__fail=false;
var __data=DATA;
const tables={sites:'sites',daily_reports:'reports',labor_cost_sheets:'laborSheets',vehicle_cost_sheets:'vehicleSheets',equipment_cost_sheets:'equipmentSheets',labor_rate_master:'laborRates',dispatch_crew_confirmations:'dispatchCrews',vehicle_rate_master:'vehicleRates',equipment_rate_master:'equipmentRates',equipment_transport_rate_master:'transportRates',small_tool_rate_master:'toolRates',attachment_rate_master:'attachmentRates',revenues:'revenues',project_documents:'documents',site_project_profiles:'profiles'};
class ReadQuery{
 constructor(table){this.table=table;this.filters=[];this.fields='';}
 select(fields){this.fields=fields;return this;}
 eq(k,v){this.filters.push(r=>r[k]===v);return this;}
 in(k,vs){this.filters.push(r=>vs.includes(r[k]));return this;}
 gte(k,v){this.filters.push(r=>r[k]>=v);return this;}
 lt(k,v){this.filters.push(r=>r[k]<v);return this;}
 order(){return this;}
 range(a,b){__queries.push({table:this.table,fields:this.fields});return new Promise(resolve=>setTimeout(()=>resolve(__fail?{data:null,error:{message:'synthetic read failure'}}:{data:JSON.parse(JSON.stringify((__data[tables[this.table]]||[]).filter(r=>this.filters.every(fn=>fn(r))).slice(a,b+1))),error:null}),15));}
 update(){__writes.push('update');throw Error('Forbidden update');} insert(){__writes.push('insert');throw Error('Forbidden insert');} delete(){__writes.push('delete');throw Error('Forbidden delete');}
}
var cloudClient={from:t=>new ReadQuery(t),rpc:()=>{__writes.push('rpc');throw Error('Forbidden RPC');}};
'''.replace('DATA',json.dumps(data,ensure_ascii=False))
styles='''body{margin:0;background:#f3f4f4;font-family:Arial,'Noto Sans CJK JP',sans-serif;color:#111;--lime:#bcff00}*{box-sizing:border-box}header{background:#080808;color:white;padding:20px;font-weight:bold}header b{color:#bcff00}nav{background:#111;color:white;padding:16px}.card{background:white;border:1px solid #ddd;border-top:4px solid #bcff00;border-radius:14px;padding:14px;margin:12px}.btn{border:0;border-radius:10px;padding:12px;font-size:15px;font-weight:700}.light{background:#eee}.dark{background:#111;color:white}.lime{background:#bcff00}input,select{padding:9px;max-width:100%;font-size:16px}h2{font-size:20px}.note{font-size:13px}.cm-card h2{margin-top:0}'''
scripts=['site-financial-summary.js','monthly-revenue.r1.js','company-monthly-summary.revenue-r1.js','site-period-ledger.revenue-r1.js','site-period-ledger-ui.revenue-r1.js']
html='<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>'+styles+'</style><link rel="stylesheet" href="/company-monthly-summary.css"><body><header>TOYA <b>One</b>　検証用</header><nav><button data-page="homePage">ホーム</button></nav><main id="homePage" class="active"><div id="uxDailyHome"></div></main><script>'+setup+'</script>'+''.join('<script src="/'+s+'"></script>' for s in scripts)+'</body></html>'
checks=[];errors=[];network=[]
with sync_playwright() as p:
 browser=getattr(p,os.environ.get('TOYA_TEST_BROWSER','chromium')).launch(headless=True)
 context=browser.new_context(viewport={'width':390,'height':844},locale='ja-JP')
 page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  u=urlparse(r.request.url)
  if u.scheme in ['blob','data']:return r.continue_()
  if u.hostname!='localhost':network.append(r.request.url);return r.abort()
  if u.path=='/fixture':return r.fulfill(content_type='text/html',body=html)
  name=u.path.lstrip('/')
  if name not in scripts+['company-monthly-summary.css']:network.append(r.request.url);return r.abort()
  return r.fulfill(content_type='text/css' if name.endswith('.css') else 'application/javascript',body=(ROOT/'docs'/name).read_text())
 page.route('**/*',route)
 def check(ok,name):
  assert ok,(name,errors);checks.append(name);print('ok',name,flush=True)
 def click(s):page.locator(s).evaluate('(e)=>e.click()')
 def month(m):
  page.locator('#cmMonth').evaluate('(e,m)=>{e.value=m;e.dispatchEvent(new Event("change",{bubbles:true}));}',m)
  page.wait_for_function('document.querySelector("#cmRefresh")?.disabled===false && !document.querySelector("#companyMonthlySummary").hasAttribute("aria-busy") || document.querySelector("#companyMonthlySummary")?.getAttribute("aria-busy")==="false"')
 def refresh():
  click('#cmRefresh');page.wait_for_function('document.querySelector("#cmRefresh").disabled===false')
 try:
  page.goto('http://localhost/fixture');page.wait_for_selector('#cmMonth');page.wait_for_timeout(1700)
  check(not errors,'modules load without runtime errors')
  month('2026-09');page.wait_for_function('document.querySelector("#cmProfit").textContent==="100,000円"')
  check(page.locator('#cmContract').inner_text()=='200,000円','September revenue automatically derived')
  check('自動反映' in page.locator('#cmContractInfo').inner_text(),'automatic source explained')
  check(page.locator('#cmSales').inner_text()=='0円','October invoice not issued in September')
  for width in [320,390,430]:
   page.set_viewport_size({'width':width,'height':844});page.wait_for_timeout(150)
   check(page.locator('#cmProfit').inner_text()=='100,000円','profit stays visible '+str(width))
   check(page.locator('#cmProfit').evaluate('(e)=>e.getBoundingClientRect().right<=document.documentElement.clientWidth'), 'amount fits mobile '+str(width))
  page.set_viewport_size({'width':390,'height':844});page.locator('#companyMonthlySummary').screenshot(path=str(out/'september-auto.png'))
  month('2026-10');page.wait_for_function('document.querySelector("#cmProfit").textContent==="計算待ち"')
  check(page.locator('#cmContract').inner_text()=='売上未入力','unknown October revenue never silently zero')
  check(page.locator('#cmCost').inner_text()=='86,400円','October cost unchanged')
  check('2026-09' in page.locator('#cmNotice').inner_text() and '加算しません' in page.locator('#cmNotice').inner_text(),'cross month notice visible not discarded')
  check(page.locator('#cmSales').inner_text()=='200,000円','issue-month reference retained separately')
  page.locator('#companyMonthlySummary').screenshot(path=str(out/'october-pending.png'))
  before=page.evaluate('JSON.stringify(__data)');click('#cmProgressOpen')
  page.wait_for_selector('#slAddBase');click('#slAddBase')
  check(page.locator('[data-sl-key=target_month]').input_value()=='2026-10','entry shortcut targets October')
  check('自動表示の請求分も含めた' in page.locator('#slEditor').inner_text(),'manual entry explains replacement not addition')
  check(page.evaluate('JSON.stringify(__data)')==before,'opening editor does not create amounts')
  # Simulate a newly saved monthly profile in the isolated fixture, not through any save endpoint.
  page.evaluate('''()=>{__data.profiles=[{company_id:'fixture-company',site_id:'site-a',contract_breakdown:[{label:'10月 本工事',target_month:'2026-10',amount:300000,status:'planned'}]}];}''')
  refresh();page.wait_for_function('document.querySelector("#cmProfit").textContent==="213,600円"')
  check(page.locator('#cmContract').inner_text()=='300,000円','manual month plus invoice not double counted')
  month('2026-09');check(page.locator('#cmProfit').inner_text()=='100,000円','other month manual entry does not block auto')
  page.evaluate("document.querySelector('#cmSiteFilter').open=true")
  page.locator('[data-site-id="site-a"]').uncheck();check(page.locator('#cmProfit').inner_text()=='記録なし','manual checkbox excludes site')
  refresh();check(not page.locator('[data-site-id="site-a"]').is_checked(),'manual choice survives refresh')
  month('2026-10');check(page.locator('[data-site-id="site-a"]').is_checked(),'selections independent per month')
  month('2026-09');check(not page.locator('[data-site-id="site-a"]').is_checked(),'prior month choice restored')
  page.locator('[data-site-id="site-a"]').check()
  page.evaluate("__data.documents[0].status='void'");refresh()
  check(page.locator('#cmProfit').inner_text()=='計算待ち','cancelled invoice removed from automatic revenue')
  page.evaluate("__fail=true");refresh();check('集計できません' in page.locator('#cmStatus').inner_text(),'failed reads do not show stale profit')
  check(page.locator('#cmProfit').inner_text()=='—','stale value cleared on read failure')
  page.evaluate("__fail=false;cloudProfile={id:'other-user',company_id:'other-company',role:'admin',active:true};document.dispatchEvent(new Event('toya-role-changed'))")
  page.wait_for_function('!document.querySelector("#cmNotice").textContent.includes("架空現場A")')
  check('架空現場A' not in page.locator('#companyMonthlySummary').inner_text(),'company change clears previous financial data')
  check(page.evaluate('__writes.length')==0,'no database save issue or ledger writes')
  check(not network,'no external account/network requests')
  check(not errors,'no runtime errors after interaction')
  (out/'results.json').write_text(json.dumps({'checks':checks,'count':len(checks),'writes':page.evaluate('__writes'),'errors':errors,'external_requests':network},ensure_ascii=False,indent=2))
 except Exception:
  page.screenshot(path=str(out/'failure.png'),full_page=True);(out/'failure.txt').write_text(page.locator('body').inner_text());raise
 finally:browser.close()
