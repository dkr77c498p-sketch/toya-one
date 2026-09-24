from pathlib import Path
import os,re,json
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];browser_name=os.getenv('QUOTE_TEST_BROWSER','chromium')
out=root/'test-output'/('waste-repeat-'+browser_name);out.mkdir(parents=True,exist_ok=True)
fixture=(root/'tests/quote-browser.html').read_text()
paths={'estimate-plan-engine.js':'estimate-plan-engine.quote5-r1.js','estimate-auto-builder.js':'estimate-auto-builder.quote5-r1.js','project-documents-engine.js':'project-documents-engine.quote5-r3.js','estimate-plan-admin.js':'estimate-plan-admin.quote5-r4.js'}
fixture=re.sub(r'<script src="\.\./docs/([^"]+)"[^>]*></script>',lambda m:'<script>'+(root/'docs'/paths.get(m[1],m[1])).read_text()+'</script>',fixture)
fixture=re.sub(r'<link rel="stylesheet" href="\.\./docs/([^"]+)">',lambda m:'<style>'+(root/'docs'/m[1]).read_text()+'</style>',fixture)
fixture_setup=r'''() => {
 const Q=ToyaEstimatePlan,row=(label,price,extra={})=>({...Q.blankQuoteLine(),label,quote_price:String(price),...extra});
 const p=Q.quoteDraft();p.site_name='検証用工事';p.title=p.site_name;p.customer_name='サンプル工事株式会社';
 p.groups=[{name:'外構撤去工事',item_no:'A',quote_layout_version:1,lines:[],quote_lines:[
  row('残置物撤去',5000,{quantity:'4',unit:'㎥',separate_waste_v1:'quote-waste-1'}),
  row('石綿含有スレート撤去',20000,{separate_waste_v1:'quote-waste-2'}),row('別の撤去',2000)
 ]},{name:'産業廃棄物処理工事',item_no:'C',quote_layout_version:1,lines:[],quote_lines:[
  row('変更済み品名A',5000,{quantity:'4',unit:'㎥',spec:'残置物撤去',waste_source_v1:'quote-waste-1'}),
  row('変更済み品名B',15000,{spec:'残置物撤去',waste_source_v1:'quote-waste-1'}),
  row('変更済み品名C',1000,{spec:'石綿含有スレート撤去',waste_source_v1:'quote-waste-2'}),
  row('変更済み品名D',10000,{spec:'石綿含有スレート撤去',waste_source_v1:'quote-waste-2'})
 ]}];
 window.__fixturePlan=p;ToyaEstimatePlanUI.useQuantity(p);
 // Public fixture call snapshots only. The actual persistence API remains mocked.
 window.__capture=()=>({rows:[...document.querySelectorAll('.ep-quote-row')].map(el=>Object.fromEntries([...el.querySelectorAll('[data-quote-key]')].map(e=>[e.dataset.quoteKey,e.value]))),total:document.querySelector('#epTotals').innerText});
}'''
results=[]
with sync_playwright() as pw:
 launch={'headless':True}
 if browser_name=='chromium' and os.path.exists('/usr/bin/chromium'):launch['executable_path']='/usr/bin/chromium'
 browser=getattr(pw,browser_name).launch(**launch)
 context=browser.new_context(viewport={'width':390,'height':844});context.route('**/*',lambda route:route.abort())
 page=context.new_page();page.set_default_timeout(5000);errors=[];dialogs=[];decisions={'confirm':True}
 page.on('pageerror',lambda e:errors.append(str(e)))
 def dialog_action(d):
  dialogs.append({'type':d.type,'message':d.message})
  if d.type=='confirm' and not decisions['confirm']:d.dismiss()
  else:d.accept()
 page.on('dialog',dialog_action)
 page.set_content(fixture);page.wait_for_selector('#epNew');page.evaluate(fixture_setup)
 page.locator('.ep-manual').evaluate('(e)=>e.open=true');page.locator('[data-ep-group="0"]').evaluate('(e)=>e.open=true')
 # Reproduce the original two-row failure against the unchanged lower-level guard.
 reproduced=page.evaluate('''() => [0,1].map(j=>{try{ToyaEstimateAuto.addSeparateWaste(__fixturePlan.groups,0,j);return 'unexpected success';}catch(e){return e.message;}})''')
 assert all('追加済み' in x for x in reproduced),reproduced
 results.append('original duplicate-guard rejection reproduced for exactly the first two source rows')
 before=page.evaluate('__capture()');start_calls=page.evaluate('__quoteCalls.length')
 # Both buttons now open a visible list of renamed existing rows, without a native confirmation/error.
 for j in [0,1]:
  button=page.locator(f'[data-separate-waste="0,{j}"]');assert '確認・追加' in button.inner_text();button.click()
  page.wait_for_selector('#epWasteRelatedDialog[open]');assert page.locator('[data-open-related-waste]').count()==2
  box=page.locator('#epWasteRelatedDialog').bounding_box();assert box['x']>=0 and box['width']<=390
  assert page.locator('#epWasteRelatedDialog').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
  if j==0:page.locator('#epWasteRelatedDialog').screenshot(path=str(out/'existing-lines.png'))
  page.locator('[data-close-related-waste]').click();assert page.locator('#epWasteRelatedDialog').count()==0
 assert not dialogs,dialogs
 assert page.evaluate('__capture()')==before
 assert page.evaluate('__quoteCalls.length')==start_calls
 results.append('both previously blocked buttons open existing renamed rows without duplication, mutation or RPC')
 # Cancel an additional pair without removing the visible chooser or changing anything.
 page.locator('[data-separate-waste="0,0"]').click();decisions['confirm']=False
 page.locator('[data-add-another-waste]').click();assert page.locator('#epWasteRelatedDialog[open]').count()==1
 page.locator('[data-close-related-waste]').click();assert page.evaluate('__capture()')==before
 # Navigation highlights the selected current row (second of the pair).
 page.locator('[data-separate-waste="0,0"]').click();page.locator('[data-open-related-waste="1"]').click()
 assert page.locator('[data-ep-group="1"]').get_attribute('open') is not None
 assert page.locator('#epLabel1_1').input_value()=='変更済み品名B'
 assert page.locator('#epQuotePrice1_1').input_value()=='15000'
 assert page.locator('#epWasteActionFeedback').count()==1
 results.append('chosen related row opens with current label, unchanged money and visible feedback')
 # Additional new pair is explicit; preserve all four earlier rows and source prices.
 decisions['confirm']=True;page.locator('[data-separate-waste="0,0"]').click();page.locator('[data-add-another-waste]').click()
 assert page.locator('[data-ep-group="1"] .ep-quote-row').count()==6
 assert page.locator('#epQuotePrice1_4').input_value()=='' and page.locator('#epQuotePrice1_5').input_value()==''
 assert page.locator('#epQty1_4').input_value()=='4';assert page.locator('#epQuotePrice0_0').input_value()=='5000'
 assert page.evaluate('__quoteCalls.length')==start_calls
 page.locator('[data-separate-waste="0,0"]').click();assert page.locator('[data-open-related-waste]').count()==4
 page.locator('[data-close-related-waste]').click()
 results.append('explicit additional pair retains previous associations and prices, creates exactly two blank-price lines')
 # Persistence roundtrip in the offline fixture, then repeat opening finds old and new rows.
 page.locator('#epQuotePrice1_4').fill('100');page.locator('#epQuotePrice1_5').fill('200');page.locator('#epSave').click();page.wait_for_function('__savedPlans.length===1')
 page.locator('.ep-manual').evaluate('(e)=>e.open=true');saved=page.evaluate('__savedPlans[0]');assert saved['groups'][0]['quote_lines'][0]['separate_waste_history_v1']==['quote-waste-1']
 assert len(saved['groups'][1]['quote_lines'])==6
 for index,price in enumerate(['5000','15000','1000','10000']):assert saved['groups'][1]['quote_lines'][index]['quote_price']==price
 page.locator('[data-separate-waste="0,0"]').click();assert page.locator('[data-open-related-waste]').count()==4
 page.locator('[data-close-related-waste]').click()
 results.append('mock save/reopen preserves original row data and old/new associations')
 # Normal unused button still confirms. Cancel does nothing; confirm adds exactly 2 rows.
 count=page.locator('.ep-quote-row').count();decisions['confirm']=False
 page.locator('[data-separate-waste="0,2"]').click();assert page.locator('.ep-quote-row').count()==count
 decisions['confirm']=True;page.locator('[data-separate-waste="0,2"]').click();assert page.locator('.ep-quote-row').count()==count+2
 page.locator('[data-separate-waste="0,2"]').click();assert page.locator('[data-open-related-waste]').count()==2
 page.locator('[data-close-related-waste]').click();assert page.locator('.ep-quote-row').count()==count+2
 results.append('unused source cancel/confirm and repeat-click are safe and do not double-add')
 # Excluded/moved/one remaining linked row: navigate without re-enabling excluded expenses.
 page.evaluate('''() => {const p=structuredClone(__fixturePlan);p.groups[1].quote_lines=p.groups[1].quote_lines.slice(0,1);p.groups[1].quote_lines[0].excluded=true;ToyaEstimatePlanUI.useQuantity(p);}''')
 page.locator('.ep-manual').evaluate('(e)=>e.open=true');page.locator('[data-separate-waste="0,0"]').click();assert page.locator('[data-open-related-waste]').count()==1
 assert '今回使わない' in page.locator('#epWasteRelatedDialog').inner_text();page.locator('[data-open-related-waste="0"]').click()
 assert page.locator('[data-ep-group="1"] .ep-excluded').get_attribute('open') is not None
 assert page.locator('#epLabel1_0').count()==0
 results.append('partial or excluded linked rows are located without silently restoring or charging them')
 # An actual guard error is visible immediately, not only at the far-away footer.
 page.evaluate("() => {ToyaEstimateAuto.addSeparateWaste=()=>{throw new Error('検証用の追加制限エラー');};}")
 page.locator('[data-separate-waste="0,2"]').click();assert dialogs[-1]['type']=='alert' and '追加制限' in dialogs[-1]['message']
 assert not errors,errors
 results.append('unexpected add errors surface immediately in a visible alert')
 (out/'results.json').write_text(json.dumps({'result':'passed','browser':browser_name,'tests':results,'page_errors':errors,'network':'all blocked; synthetic fixture only'},ensure_ascii=False,indent=2))
 browser.close()
print(json.dumps({'result':'passed','browser':browser_name,'checks':len(results)},ensure_ascii=False))
