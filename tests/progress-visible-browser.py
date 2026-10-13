from pathlib import Path
import json, os
# Reuse the reviewed whole-app fixture, tenant-aware read stub and account bootstrap.
# No real credentials or external requests enter this browser test.
fixture_source=(Path(__file__).parent/'monthly-selection-browser.py').read_text().split('with sync_playwright() as pw:')[0]
fixture_source=fixture_source.replace('monthly-selection.cjs','progress-visible.cjs').replace("'monthly-selection'","'progress-visible'")
exec(compile(fixture_source,'monthly-selection-fixture','exec'),globals())
original_html=html
freeze="""<script>(()=>{const RealDate=Date;window.Date=class extends RealDate{constructor(...a){super(...(a.length?a:['2026-10-13T04:00:00Z']));}static now(){return +new RealDate('2026-10-13T04:00:00Z');}};})();</script>"""
def content(old=False,seed=[]):
 global html
 html=original_html.replace('company-monthly-summary.progress-r2.js?v=20261013-month-and-cumulative-r2','company-monthly-summary.autoselect-r1.js?v=20261013-profit-r1') if old else original_html
 h=fixture(False,seed);html=original_html
 return h.replace('<head>','<head>'+freeze,1)
with sync_playwright() as pw:
 browser=getattr(pw,engine).launch(headless=True)
 ctx=browser.new_context(viewport={'width':390,'height':844},locale='ja-JP')
 blocked=[];ctx.route('**/*',lambda r:(blocked.append(r.request.url),r.abort()))
 baseline=ctx.new_page();old_errors=[];baseline.on('pageerror',lambda e:old_errors.append(str(e)))
 baseline.set_content(content(True));baseline.wait_for_timeout(1700);baseline.evaluate(setup);baseline.wait_for_timeout(1200);baseline.close()
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.set_default_timeout(15000)
 checks=[]
 def check(ok,name):
  assert ok,(name,errors,page.evaluate('__writes'));checks.append(name);print('PASS',name,flush=True)
 def ready():
  page.wait_for_function('document.querySelector("#companyMonthlySummary")?.getAttribute("aria-busy")==="false"&&document.querySelectorAll("#cmSiteChoices input").length>0')
 def click(s):page.locator(s).evaluate('(e)=>e.click()')
 def month(m):
  page.locator('#cmMonth').fill(m);page.locator('#cmMonth').dispatch_event('change');ready()
 def change_site(s,value):page.locator('#cmSiteChoices input[data-site-id="'+s+'"]').evaluate('(e,v)=>{e.checked=v;e.dispatchEvent(new Event("change",{bubbles:true}));}',value)
 page.set_content(content());page.wait_for_timeout(1700)
 check(page.locator('#companyMonthlySummary').count()==0,'no financial home card without administrator')
 page.evaluate(setup);ready();original_db=page.evaluate('JSON.stringify(__db)')
 check(errors==old_errors,'no new full-app runtime errors')
 check(page.locator('#cmMonth').input_value()=='2026-10','current October selected')
 check(page.locator('#cmCumulative').inner_text()=='500,000円','September progress remains visible in October')
 check(page.locator('#cmContract').inner_text()=='未入力','October missing amount is not zero or September carry')
 check(page.locator('#cmProfit').inner_text()=='出来高未入力','missing revenue has a clear explanation not a dash')
 check(page.locator('#cmCost').inner_text()=='80,000円','October cost remains October only')
 check('2026年9月 500,000円' in page.locator('#cmCumulativeInfo').inner_text(),'work month visible beside cumulative')
 check('2026年10月' in page.locator('#cmCurrentProgressLabel').inner_text(),'month printed on metric itself')
 check(page.locator('#cmNotice').inner_text()!='','previously hidden missing-data notice now visible')
 month('2026-09')
 check(page.locator('#cmContract').inner_text()=='500,000円','September progress from October-issued claim')
 check(page.locator('#cmProfit').inner_text()=='480,000円','September margin uses September cost')
 month('2026-10')
 for width in [320,390,430]:
  page.set_viewport_size({'width':width,'height':844});page.wait_for_timeout(200)
  check(page.locator('#cmCumulative').evaluate('(e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.right<=document.documentElement.clientWidth+1}'),'cumulative value fits width '+str(width))
 page.set_viewport_size({'width':390,'height':844})
 page.locator('#companyMonthlySummary .cm-metrics').screenshot(path=str(out/'october-cumulative.png'))
 page.locator('#companyMonthlySummary').screenshot(path=str(out/'october-home.png'))
 check(page.evaluate('JSON.stringify(__db)')==original_db,'viewing months does not alter source records')
 change_site('a',False)
 check(page.locator('#cmCumulative').inner_text()=='未登録','unchecking site removes its cumulative value')
 click('#cmRefresh');ready()
 check(not page.locator('#cmSiteChoices input[data-site-id="a"]').is_checked(),'manual selection retained on refresh')
 change_site('a',True)
 # Simulate separately saved progress arriving on the next read, without any real write.
 page.evaluate('(c)=>__db.site_project_profiles.push({company_id:c,site_id:"a",contract_breakdown:[{target_month:"2026-10",amount:100000,status:"planned"}]})',company)
 click('#cmRefresh');ready()
 check(page.locator('#cmContract').inner_text()=='100,000円','new October monthly input appears')
 check(page.locator('#cmCumulative').inner_text()=='600,000円','September plus new October amount once each')
 check(page.locator('#cmProfit').inner_text()=='20,000円','October profit is not cumulative minus monthly cost')
 page.evaluate('__mode="fail"');click('#cmRefresh')
 page.wait_for_function('document.querySelector("#cmStatus").textContent.includes("集計できません")')
 check(page.locator('#cmCumulative').inner_text()=='—','failed read clears stale cumulative amount')
 check(page.locator('#cmCumulativeInfo').inner_text()=='','failed read clears old month provenance')
 page.evaluate('__mode="ok"');click('#cmRefresh');ready()
 check(page.locator('#cmCumulative').inner_text()=='600,000円','reread recovery restores correctly')
 for tab in ['homePage','reportPage','recordsPage','attachmentPage','masterPage']:
  click('nav [data-page="'+tab+'"]');check(page.locator('#'+tab).evaluate('(e)=>e.classList.contains("active")'),'existing '+tab+' navigation works')
 check(page.evaluate('__writes.length')==0,'no save issue cancel or business-data mutation calls')
 check(page.evaluate('__db.sites[0].status')=='active' and page.evaluate('__db.sites[0].completed_on') is None,'ongoing job never marked completed')
 check(errors==old_errors,'no new runtime errors after refresh and navigation')
 page.evaluate('cloudProfile={...cloudProfile,company_id:"other-test-company"}');page.wait_for_timeout(1500)
 check(page.locator('#cmCumulative').inner_text() not in ['500,000円','600,000円'],'tenant switch clears prior cumulative amount')
 (out/'results.json').write_text(json.dumps({'browser':engine,'checks':checks,'baseline_errors':old_errors,'financial_writes':0,'real_account_calls':0},ensure_ascii=False,indent=2))
 browser.close()
