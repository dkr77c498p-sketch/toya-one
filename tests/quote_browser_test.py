from pathlib import Path
import json,re,os
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
engine=os.environ.get('QUOTE_TEST_BROWSER','chromium')
assert engine in ('chromium','webkit')
out=root/'test-output'/engine;out.mkdir(parents=True,exist_ok=True)
fixture=(root/'tests/quote-browser.html').read_text()
fixture=re.sub(r'<script src="(\.\./docs/[^"]+)"[^>]*></script>',lambda m:'<script>'+((root/'tests')/m[1]).resolve().read_text()+'</script>',fixture)
fixture=re.sub(r'<link rel="stylesheet" href="(\.\./docs/[^"]+)">',lambda m:'<style>'+((root/'tests')/m[1]).resolve().read_text()+'</style>',fixture)
with sync_playwright() as pw:
 browser=getattr(pw,engine).launch(headless=True)
 context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1)
 context.route('**/*',lambda r:r.abort())
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
 page.set_content(fixture);page.wait_for_selector('#epNew')
 page.evaluate('''() => {const Q=ToyaEstimatePlan,p=Q.quoteDraft();p.site_name='検証用 外構撤去工事';p.title=p.site_name;p.customer_name='サンプル工事株式会社';p.groups[1].name='外構撤去工事';p.groups[1].quote_lines=[['残置物撤去','4','m³','10000'],['スレート撤去','1','式','35000'],['ステンレス煙突撤去','1','式','3000'],['CBカッター入れ','17.8','m','1500'],['CB撤去','1','式','30000']].map(([label,quantity,unit,quote_price],i)=>({...Q.blankQuoteLine(),item_no:String(i+1),label,quantity,unit,quote_price}));ToyaEstimatePlanUI.useQuantity(p);}''')
 page.locator('.ep-manual').evaluate('(e)=>e.open=true');page.locator('[data-ep-group="1"]').evaluate('(e)=>e.open=true')
 page.locator('#epNo1_0').fill('001');page.locator('#epGroupNo1').fill('2')
 assert '148,170円' in page.locator('#epTotals').inner_text()
 page.locator('[data-quote-charge="overhead"]').click();page.locator('#epOverheadRate4_0').fill('5')
 assert page.locator('#epQuotePrice4_0').input_value()=='6735'
 page.locator('[data-quote-charge="transport"]').click();page.locator('#epQuotePrice4_1').fill('10000')
 page.locator('[data-quote-charge="discount"]').click();page.locator('#epQuotePrice4_2').fill('8170')
 assert '157,591円' in page.locator('#epTotals').inner_text(),page.locator('#epTotals').inner_text()
 page.locator('[data-ep-group="1"]').evaluate('(e)=>e.open=true')
 page.locator('[data-separate-waste="1,0"]').click()
 page.locator('#epNo2_0').fill('1');page.locator('#epNo2_1').fill('2')
 page.locator('#epQuotePrice2_0').fill('2000');page.locator('#epQuotePrice2_1').fill('5000')
 assert '189,931円' in page.locator('#epTotals').inner_text(),page.locator('#epTotals').inner_text()
 assert page.locator('#epQuotePrice4_0').input_value()=='8135'
 page.locator('#epTotals').screenshot(path=str(out/'quote-totals.png'))
 page.locator('#epSave').click();page.wait_for_function('window.__savedPlans.length===1')
 p=page.evaluate('window.__savedPlans[0]');assert p['groups'][1]['quote_lines'][0]['item_no']=='001'
 assert p['groups'][1]['item_no']=='2';assert p['calculation']['price']==172665
 assert p['groups'][4]['quote_lines'][2]['quote_amount']=='-8170'
 assert page.locator('#epNo1_0').input_value()=='001';assert page.locator('#epOverheadRate4_0').input_value()=='5'
 page.locator('#epCreateQuote').click();page.wait_for_function('!!window.__previewDoc')
 html=page.evaluate('ToyaProjectDocuments.printHTML(window.__previewDoc)')
 (out/'sample-estimate.html').write_text(html)
 preview=context.new_page();preview.set_content(html);preview.emulate_media(media='print')
 if engine=='chromium':preview.pdf(path=str(out/'sample-estimate.pdf'),format='A4',print_background=True,prefer_css_page_size=True)
 text=preview.locator('body').inner_text();assert '産業廃棄物運搬費' in text and '産業廃棄物処分費' in text
 assert '001' in text and '189,931' in text and '-8,170' in text
 assert page.locator('#epAutoWelfare').count()==0
 assert '法定福利費' not in text
 assert not errors,errors
 (out/'browser-results.json').write_text(json.dumps({'browser':engine,'viewport':'390x844','network':'offline in-memory page; all network blocked','checks':['numeric group and row IDs','positive discount input stored negative','automatic overhead recalculation','separate haul and disposal entries','mock save and reload preserves fields','customer print totals'],'page_errors':errors,'result':'passed'},ensure_ascii=False,indent=2))
 browser.close()
print('Browser quote-only checks passed; no real account or data was used.')
