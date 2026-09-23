from pathlib import Path
import os,re,json,math
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];engine=os.environ.get('QUOTE_TEST_BROWSER','chromium')
out=root/'test-output'/('discount-'+engine);out.mkdir(parents=True,exist_ok=True)
fixture=(root/'tests/quote-browser.html').read_text()
files={'estimate-plan-engine.js':'estimate-plan-engine.quote5-r1.js','estimate-auto-builder.js':'estimate-auto-builder.quote5-r1.js','estimate-plan-admin.js':'estimate-plan-admin.quote5-r2.js','project-documents-engine.js':'project-documents-engine.quote5-r3.js'}
fixture=re.sub(r'<script src="\.\./docs/([^"]+)"[^>]*></script>',lambda m:'<script>'+(root/'docs'/files.get(m[1],m[1])).read_text()+'</script>',fixture)
fixture=re.sub(r'<link rel="stylesheet" href="\.\./docs/([^"]+)">',lambda m:'<style>'+(root/'docs'/m[1]).read_text()+'</style>',fixture)
setup='''() => {
const Q=ToyaEstimatePlan,A=ToyaEstimateAuto,p=Q.quoteDraft();p.site_name='見積表示テスト';p.title=p.site_name;p.customer_name='検証用株式会社';p.groups[1].name='外構撤去工事';p.groups[1].quote_lines=[{...Q.blankQuoteLine(),item_no:'1',label:'外構撤去工事',quote_price:'134700'}];
p.groups=A.ensureQuoteCharge(p.groups,'overhead').groups;A.updateQuoteCharges(p.groups);p.groups=A.ensureQuoteCharge(p.groups,'discount').groups;ToyaEstimatePlanUI.useQuantity(p);
}'''
fmt=lambda n:f'{n:,}円'
with sync_playwright() as pw:
 opts={'headless':True}
 if os.environ.get('CHROMIUM_EXECUTABLE') and engine=='chromium':opts['executable_path']=os.environ['CHROMIUM_EXECUTABLE']
 browser=getattr(pw,engine).launch(**opts);ctx=browser.new_context(viewport={'width':390,'height':844});ctx.route('**/*',lambda r:r.abort())
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
 page.set_content(fixture);page.wait_for_selector('#epNew');page.evaluate(setup)
 page.locator('.ep-manual').evaluate('(e)=>e.open=true');page.locator('[data-ep-group="4"]').evaluate('(e)=>e.open=true')
 amount=page.locator('#epQuotePrice4_1');total=page.locator('[data-discount-total]')
 assert total.inner_text()=='未確定';assert page.locator('[data-discount-before]').inner_text()=='155,578円'
 # Synchronous live feedback while the input retains focus. No saves on keystrokes.
 for value in ['0','1','10','100','1000','10000']:
  amount.fill(value);price=141435-int(value);expected=price+price//10
  assert total.inner_text()==fmt(expected),(value,total.inner_text())
  assert page.locator('[data-discount-subtotal]').inner_text()==fmt(price)
  assert page.locator('[data-discount-tax]').inner_text()==fmt(price//10)
  assert page.evaluate('document.activeElement.id')=='epQuotePrice4_1'
 assert page.evaluate('window.__quoteCalls.length')==0
 # The current total is adjacent and stays inside narrow/reduced-height layouts.
 for width,height in [(320,640),(390,844),(390,430),(430,844),(1024,768)]:
  page.set_viewport_size({'width':width,'height':height});amount.evaluate('(e)=>{e.focus();e.scrollIntoView({block:"center"});}')
  a=amount.bounding_box();t=total.bounding_box();assert abs(a['y']-t['y'])<80,(width,a,t)
  assert t['x']>=0 and t['x']+t['width']<=width+1,(width,t)
  if height==430:assert t['y']>=0 and t['y']+t['height']<=height,(height,t)
 page.set_viewport_size({'width':390,'height':844});amount.evaluate('(e)=>e.scrollIntoView({block:"center"})')
 page.screenshot(path=str(out/'discount-nearby.png'))
 # A cleared or invalid amount must not leave an old confirmed total on screen.
 amount.fill('');assert total.inner_text()=='未確定';assert page.locator('[data-discount-before]').inner_text()=='155,578円'
 amount.fill('200000');assert total.inner_text()=='未確定';assert '確認' in page.locator('[data-discount-status]').inner_text()
 amount.fill('10000');assert total.inner_text()=='144,578円'
 # Other costs, overhead and tax changes drive the same nearby display.
 page.locator('#epOverheadRate4_0').fill('3');assert total.inner_text()=='141,615円'
 page.locator('#epOverheadRate4_0').fill('5');assert total.inner_text()=='144,578円'
 page.locator('#epTax').evaluate('(e)=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==="DETAILS")p.open=true;}')
 for tax,expected in [('8','141,949円'),('0','131,435円'),('10','144,578円')]:
  page.locator('#epTax').select_option(tax);assert total.inner_text()==expected
 page.locator('[data-ep-group="1"]').evaluate('(e)=>e.open=true');page.locator('#epQuotePrice1_0').fill('');assert total.inner_text()=='未確定';assert page.locator('[data-discount-before]').inner_text()=='未確定'
 page.locator('#epQuotePrice1_0').fill('134700');assert total.inner_text()=='144,578円'
 # Exclude/reinclude the discount without changing its recorded value.
 page.locator('[data-exclude-quote="4,1"]').click();assert page.locator('[data-discount-total]').count()==0;assert '155,578円' in page.locator('#epTotals').inner_text()
 page.locator('[data-include-quote="4,1"]').evaluate('(e)=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==="DETAILS")p.open=true;}');page.locator('[data-include-quote="4,1"]').click();assert total.inner_text()=='144,578円'
 # Mock save/reopen uses unchanged methods, storing negative discount only once.
 page.locator('#epSave').click();page.wait_for_function('window.__savedPlans.length===1')
 saved=page.evaluate('window.__savedPlans[0]');assert saved['groups'][4]['quote_lines'][1]['quote_amount']=='-10000';assert saved['calculation']['price']==131435;assert saved['calculation']['total']==144578
 page.locator('#epQuotePrice4_1').evaluate('(e)=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==="DETAILS")p.open=true;}')
 assert total.inner_text()=='144,578円',(total.inner_text(),total.text_content(),page.locator('#epTotals').inner_text(),errors);assert page.locator('[data-discount-before]').inner_text()=='155,578円'
 page.locator('#epCreateQuote').click();page.wait_for_function('!!window.__previewDoc')
 before=page.evaluate('JSON.stringify(window.__previewDoc)');html=page.evaluate('ToyaProjectDocuments.printHTML(window.__previewDoc)');assert page.evaluate('JSON.stringify(window.__previewDoc)')==before
 preview=ctx.new_page();preview.set_content(html);preview.emulate_media(media='print')
 overhead=preview.locator('.te2-summary tr').filter(has=preview.locator('td')).filter(has_text=re.compile('諸経費')).last
 cells=overhead.locator('td');assert cells.nth(6).inner_text()=='';assert cells.nth(5).inner_text()=='6,735';assert abs(overhead.bounding_box()['height']-29.3)<1
 assert '144,578' in preview.locator('.te2-summary').inner_text();assert '直接工事費×5%' not in preview.locator('body').inner_text()
 preview.locator('.te2-summary').screenshot(path=str(out/'summary-print.png'))
 if engine=='chromium':preview.pdf(path=str(out/'summary-tested.pdf'),format='A4',print_background=True,prefer_css_page_size=True)
 assert not errors,errors
 (out/'results.json').write_text(json.dumps({'result':'passed','browser':engine,'network':'all blocked','checks':['blank reference and unconfirmed total','6 input amounts update without blur','focus preserved','5 viewports including reduced height','invalid input clears stale output','overhead/tax/other line changes','exclude and restore discount','mock save/reopen and print','formula omitted, remarks/money preserved'],'page_errors':errors},ensure_ascii=False,indent=2))
 browser.close()
print('Passed: nearby discount display and no printed automatic overhead formula. Offline synthetic data only.')
