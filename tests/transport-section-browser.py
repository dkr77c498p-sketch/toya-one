from pathlib import Path
import re,json,os
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
engine=os.getenv('QUOTE_TEST_BROWSER','chromium')
files={'estimate-plan-engine.js':'estimate-plan-engine.quote5-r1.js','estimate-auto-builder.js':'estimate-auto-builder.quote5-r1.js','project-documents-engine.js':'project-documents-engine.quote5-r3.js','estimate-plan-admin.js':'estimate-plan-admin.quote5-r3.js'}
fixture=(root/'quote-browser.html').read_text()
fixture=re.sub(r'<script src="\.\./docs/([^"]+)"[^>]*></script>',lambda m:'<script>'+(root/'docs'/files.get(m[1],m[1])).read_text()+'</script>',fixture)
fixture=re.sub(r'<link rel="stylesheet" href="\.\./docs/([^"]+)">',lambda m:'<style>'+(root/'docs'/m[1]).read_text()+'</style>',fixture)
out=root/'test-output'/engine;out.mkdir(parents=True,exist_ok=True)
seed='''() => {const Q=ToyaEstimatePlan,A=ToyaEstimateAuto,p=Q.quoteDraft();p.site_name='検証用 外構撤去';p.title=p.site_name;p.customer_name='検証用宛先';const row=(label,q,u,p)=>({...Q.blankQuoteLine(),label,quantity:q,unit:u,quote_price:p});p.groups=[{name:'外構撤去工事',item_no:'A',quote_layout_version:1,quote_lines:[row('撤去工事','1','式','134700')],lines:[]},{name:'産業廃棄物処理工事',item_no:'B',quote_layout_version:1,quote_lines:[row('残置物処分費','4','m³','5000'),row('産業廃棄物運搬費','4','m³','2000')],lines:[]}];p.groups[1].quote_lines[1].item_no='001';p.groups[1].quote_lines[1].spec='残置物';p.groups=A.ensureQuoteCharge(p.groups,'overhead').groups;A.updateQuoteCharges(p.groups);window.__testSeed=p;ToyaEstimatePlanUI.useQuantity(p);}'''
with sync_playwright() as pw:
 launch={'headless':True}
 if os.getenv('LOCAL_CHROMIUM'):launch['executable_path']='/usr/bin/chromium'
 browser=getattr(pw,engine).launch(**launch)
 context=browser.new_context(viewport={'width':390,'height':844})
 context.route('**/*',lambda r:r.abort())
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 accept=[True];page.on('dialog',lambda d: d.accept() if accept[0] else d.dismiss())
 page.set_content(fixture);page.wait_for_selector('#epNew');page.evaluate(seed)
 page.locator('.ep-manual').evaluate('(e)=>e.open=true');page.locator('[data-ep-group="1"]').evaluate('(e)=>e.open=true')
 before=page.locator('#epTotals').inner_text();assert '187,918円' in before,before
 accept[0]=False;page.locator('[data-move-haul="1,1"]').click();assert page.locator('[data-ep-group]').count()==3;assert page.locator('#epQty1_1').input_value()=='4'
 accept[0]=True;page.locator('[data-move-haul="1,1"]').click()
 assert page.locator('[data-ep-group]').count()==4
 assert page.locator('#epWork3').input_value()=='産業廃棄物運搬費'
 assert page.locator('#epNo3_0').input_value()=='001';assert page.locator('#epQty3_0').input_value()=='4'
 assert page.locator('#epQuotePrice3_0').input_value()=='2000';assert page.locator('#epSpec3_0').input_value()=='残置物'
 assert page.locator('#epLabel1_0').input_value()=='残置物処分費';assert page.locator('#epLabel1_1').count()==0
 assert page.locator('#epTotals').inner_text()==before
 assert page.evaluate('window.__quoteCalls.length')==0
 page.locator('[data-transport-section]').last.click();assert page.locator('[data-ep-group]').count()==4
 page.locator('#epGroupNo3').fill('C')
 page.locator('#epQuotePrice3_0').fill('2500');assert page.locator('#epQuotePrice1_0').input_value()=='5000'
 assert page.locator('#epQuotePrice2_0').input_value()=='8235'
 assert '190,228円' in page.locator('#epTotals').inner_text()
 assert '処分費' not in page.locator('#epChoice3').inner_text()
 assert page.locator('[data-ep-group="3"] [data-separate-waste]').count()==0
 page.locator('[data-ep-group="3"]').screenshot(path=str(out/'transport-section.png'))
 page.locator('#epSave').click();page.wait_for_function('window.__savedPlans.length===1')
 p=page.evaluate('__savedPlans[0]');assert p['calculation']['total']==190228;assert p['groups'][3]['quote_lines'][0]['item_no']=='001';assert p['groups'][3]['quote_section_kind']=='waste_transport'
 assert page.locator('#epWork3').input_value()=='産業廃棄物運搬費'
 page.locator('#epCreateQuote').click();page.wait_for_function('!!__previewDoc')
 html=page.evaluate('ToyaProjectDocuments.printHTML(__previewDoc)');preview=context.new_page();preview.set_content(html)
 parts=preview.locator('.te2-detail').all_text_contents();assert len(parts)==3,parts
 assert '産業廃棄物処理工事' in parts[1] and '残置物処分費' in parts[1] and '産業廃棄物運搬費' not in parts[1]
 assert '産業廃棄物運搬費' in parts[2] and '残置物処分費' not in parts[2]
 if engine=='chromium':preview.pdf(path=str(out/'transport-print.pdf'),format='A4',print_background=True,prefer_css_page_size=True)
 page.evaluate(seed);page.evaluate("() => {const p=structuredClone(__testSeed);p.id=null;p.updated_at=null;p.groups[1].quote_lines=p.groups[1].quote_lines.slice(0,1);ToyaEstimateAuto.updateQuoteCharges(p.groups);ToyaEstimatePlanUI.useQuantity(p)}")
 page.locator('.ep-manual').evaluate('(e)=>e.open=true');page.locator('[data-transport-section]').last.click()
 assert page.locator('#epQty3_0').input_value()=='' and page.locator('#epQuotePrice3_0').input_value()==''
 assert '未入力' in page.locator('#epTotals').inner_text()
 page.locator('[data-transport-section]').last.click();assert page.locator('[data-ep-group]').count()==4;assert page.locator('[data-ep-group="3"] [data-quote-row]').count()==1
 page.evaluate(seed);page.evaluate("() => {const p=structuredClone(__testSeed);p.groups[1].lines=[{category:'labor',label:'人件費',quantity:'1',multiplier:'1',unit:'人日',unit_price:'10000'}];ToyaEstimatePlanUI.useQuantity(p)}")
 page.locator('.ep-manual').evaluate('(e)=>e.open=true');page.locator('[data-ep-group="1"]').evaluate('(e)=>e.open=true');page.locator('[data-move-haul="1,1"]').click()
 assert page.locator('[data-ep-group]').count()==3;assert page.locator('#epLabel1_1').input_value()=='産業廃棄物運搬費'
 assert '原価や調整費' in page.locator('#epFormStatus').inner_text()
 assert not errors,errors
 (out/'results.json').write_text(json.dumps({'result':'passed','browser':engine,'account_network':'blocked','checks':['cancel-safe movement','unchanged totals on move','no duplicate group','no implicit cloud saves','transport/disposal prices independent','overhead includes waste transport','mock save/reopen preserves IDs and metadata','distinct printed pages','blank rates unconfirmed','cost allocation guarded'],'errors':errors},ensure_ascii=False,indent=2))
 browser.close()
print(engine+': transport section checks passed')
