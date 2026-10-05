# Real application with intercepted synthetic data only; no live accounts.
from pathlib import Path
prefix=(Path(__file__).parent/'billing-bundle-browser.py').read_text().split('with sync_playwright() as pw:')[0]
exec(compile(prefix,str(Path(__file__).parent/'billing-bundle-browser.py'),'exec'))
out=repo/'test-output'/'invoice-combined'/engine;out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
 kw={'headless':True}
 if os.environ.get('TOYA_TEST_EXECUTABLE'):kw['executable_path']=os.environ['TOYA_TEST_EXECUTABLE']
 browser=getattr(pw,engine).launch(**kw);ctx=browser.new_context(viewport={'width':390,'height':844},locale='ja-JP')
 blocked=[]
 def route(r):
  u=r.request.url
  if u.startswith('blob:http://localhost/'):return r.continue_()
  if u=='http://localhost/current.html':return r.fulfill(body=fixture(),content_type='text/html')
  if u=='http://localhost/before.html':return r.fulfill(body=fixture(True),content_type='text/html')
  if u.startswith('http://localhost/vendor/'):
   f=base/'vendor'/u.split('/')[-1].split('?')[0]
   if f.is_file():return r.fulfill(path=str(f),content_type='application/javascript')
  for name,typ in [('toya-document-logo.svg','image/svg+xml'),('billing-bundle-logo.r1.png','image/png')]:
   if u=='http://localhost/'+name:return r.fulfill(path=str(base/name),content_type=typ)
  blocked.append(u);r.abort()
 ctx.route('**/*',route)
 baseline=ctx.new_page();old_errors=[];baseline.on('pageerror',lambda e:old_errors.append(str(e)));baseline.goto('http://localhost/before.html');baseline.wait_for_timeout(1600);baseline.evaluate(setup);baseline.wait_for_timeout(1200);baseline.close()
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.dismiss());page.set_default_timeout(20000);checks=[]
 def check(ok,name):
  assert ok,(name,errors);checks.append(name);print('ok',name,flush=True)
 def click(s):page.locator(s).evaluate('(e)=>e.click()')
 def loaded():page.wait_for_function('document.querySelector("#bbPreviewDialog iframe")?.contentDocument?.querySelector(".invoice-lines")')
 def frame():return page.frame_locator('#bbPreviewDialog .pb-preview-viewport iframe')
 def pdf(name):
  click('#bbPDF');page.wait_for_function('document.querySelector("#bbPreviewDialog [data-pdf-download]")?.getAttribute("href")',timeout=120000)
  check(page.locator('#bbPreviewDialog [data-pdf-download]').get_attribute('download')=='TOYAONE.pdf',name+' filename')
  data=page.evaluate('''async()=>{const b=new Uint8Array(await(await fetch(document.querySelector('#bbPreviewDialog [data-pdf-download]').href)).arrayBuffer());let s='';for(let j=0;j<b.length;j+=16384)s+=String.fromCharCode(...b.subarray(j,j+16384));return btoa(s)}''');(out/(name+'.pdf')).write_bytes(base64.b64decode(data))
 def fresh():
  click('#bbRefresh');page.wait_for_function('!document.querySelector("#bbRefresh").disabled');click('#bbSelectAll')
 page.goto('http://localhost/current.html');page.wait_for_timeout(1700);check(page.locator('#billingBundleCard').count()==0,'no admin controls before login')
 page.evaluate(setup);page.wait_for_timeout(1500);check(set(errors)<=set(old_errors),'no new initial runtime errors')
 original=page.evaluate('JSON.stringify(__db)')
 page.evaluate('ToyaBillingBundleUI.open()');page.wait_for_function('document.querySelectorAll("#bbCustomer option").length>=3')
 key=json.dumps([db['project_documents'][0]['customer_name'],db['project_documents'][0]['customer_address']],ensure_ascii=False,separators=(',',':'))
 page.locator('#bbCustomer').select_option(key);page.locator('#bbMonth').fill('2026-09');page.locator('#bbMonth').dispatch_event('change');page.locator('#bbMonth').evaluate('(e)=>e.blur()');click('#bbSelectAll')
 check(page.locator('#bbPrintFormat').input_value()=='combined','single green sheet is default')
 check(page.locator('[data-bb-id="draft"]').is_disabled(),'draft excluded from grouped claims')
 check('385,000円' in page.locator('#bbTotal').inner_text(),'sum current claim only')
 click('#bbPreview');page.wait_for_selector('#bbPreviewDialog[open]');loaded()
 f=frame();check(f.locator('.te2-page').count()==1,'two sites on one A4 sheet')
 check(f.locator('.bb-cover').count()==0,'no cover or extra original pages by default')
 check(f.locator('.invoice-item').count()==2,'one row per source invoice')
 check(f.locator('.invoice-title-row h1').inner_text()=='請求書','correct shared invoice title')
 check('出来高（今回分）' in f.locator('[data-ci-source="b"]').inner_text(),'progress row labelled current portion')
 check(f.locator('[data-ci-source="b"] td').nth(4).inner_text()=='150,000','progress amount is not 230000 cumulative')
 check(f.locator('.invoice-grand strong').inner_text()=='385,000','top total exact')
 check(f.locator('.invoice-totals td').all_inner_texts()==['350,000','35,000','385,000'],'bottom totals exactly once')
 check('INV-TEST-a' in f.locator('[data-ci-source="a"]').inner_text() and 'PRG-TEST-b' in f.locator('[data-ci-source="b"]').inner_text(),'original invoice references retained')
 check('2026-09-01' in f.locator('[data-ci-source="a"]').inner_text(),'transaction date retained per source')
 check('検証銀行' in f.locator('.invoice-bank').inner_text(),'original bank retained, not mockup bank')
 check('この書類は架空データの検証用です。' in f.locator('.ci-source-notes').inner_text(),'original notes retained')
 check('重複したご請求ではありません' in f.locator('.ci-notice').inner_text(),'re-presentation labelled, no new claim')
 check(f.locator('.invoice-blank').count()>0,'full-page ruled blank rows')
 for width in [320,390,430]:
  page.set_viewport_size({'width':width,'height':844});page.wait_for_function('''()=>{const s=document.querySelector('#bbPreviewDialog .bb-preview-stage'),v=s.parentElement,r=s.getBoundingClientRect(),f=s.querySelector('iframe').getBoundingClientRect();return Math.abs(r.height/r.width-297/210)<.012&&f.width<=v.clientWidth+1}''')
  check(page.locator('#bbPreviewDialog').evaluate('(e)=>e.scrollWidth<=e.clientWidth+2'),'mobile viewport '+str(width))
 page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(250);page.locator('#bbPreviewDialog').screenshot(path=str(out/'combined-mobile.png'))
 html=f.locator('html').evaluate('(e)=>"<!doctype html>"+e.outerHTML');(out/'combined.html').write_text(html)
 pdf('combined');click('#bbClosePreview');check(page.locator('#bbPreviewDialog').count()==0,'close cleans dialog')
 # Legacy output remains available explicitly; no extra invoice issuance.
 page.locator('#bbPrintFormat').select_option('attachments');click('#bbPreview');page.wait_for_selector('#bbPreviewDialog[open]');loaded()
 check(frame().locator('.te2-page').count()==3,'legacy cover and originals still available')
 check(frame().locator('.invoice-progress').count()==1,'legacy preserves full progress breakdown');click('#bbClosePreview')
 page.locator('#bbPrintFormat').select_option('combined')
 # Three-site version of the photographed 6,996,000 total, using only fake identities.
 example=page.evaluate('''()=>{const all=__db.project_documents,make=(id,site,amount,kind='invoice')=>{const d=structuredClone(all.find(x=>x.id=== (kind==='progress'?'b':'a')));Object.assign(d,{id,site_id:site,site_name:'見本現場'+site+'（架空）',document_number:(kind==='progress'?'PRG':'INV')+'-SAMPLE-'+id,kind,items:[{name:'工事代金',quantity:'1',unit:'式',unitPrice:String(amount),code:'工事番号 SAMPLE-'+site}],subtotal:amount,tax_amount:Math.floor(amount/10),total:amount+Math.floor(amount/10),contract_amount:9000000,previous_billed:kind==='progress'?80000:0,cumulative_amount:kind==='progress'?80000+amount:null,notes:''});return d;};return [make('x','X',1710000),make('y','Y',3850000,'progress'),make('z','Z',800000)];}''')
 def render_documents(ds):
  return page.evaluate('''async(ds)=>{const b=ToyaBillingBundle.bundle(ds,ds.map(x=>x.id),'fixture-company');return await ToyaBillingBundleUI.renderCombinedHTML(b)}''',ds)
 rendered=render_documents(example);review=ctx.new_page();review.set_content(rendered);check(review.locator('.te2-page').count()==1,'three-site example fits one page');check(review.locator('.invoice-grand strong').inner_text()=='6,996,000','photo example total exact');review.locator('.te2-page').screenshot(path=str(out/'three-sites.png'));(out/'three-sites.html').write_text(rendered)
 if engine=='chromium':review.pdf(path=str(out/'three-sites-print.pdf'),prefer_css_page_size=True,print_background=True)
 review.close()
 # Round once per ORIGINAL invoice; never replace 2 by 3 from the total 38.
 rounding=[dict(example[0],id='r1',document_number='INV-ROUND-1',items=[{'name':'端数例','quantity':'1','unit':'式','unitPrice':'19'}],subtotal=19,tax_amount=1,total=20),dict(example[2],id='r2',document_number='INV-ROUND-2',items=[{'name':'端数例','quantity':'1','unit':'式','unitPrice':'19'}],subtotal=19,tax_amount=1,total=20)]
 r=ctx.new_page();r.set_content(render_documents(rounding));check(r.locator('.invoice-totals td').all_inner_texts()==['38','2','40'],'tax roundings conserved in actual printed fields');r.close()
 # Mixed tax rates and different issue/due dates retain source distinctions.
 varied=[dict(x) for x in rounding];varied[1].update(tax_rate=8,document_date='2026-08-31',due_date='2026-11-30');r=ctx.new_page();r.set_content(render_documents(varied));check('8%対象（軽減）' in r.locator('.invoice-tax-detail').inner_text() and '10%対象' in r.locator('.invoice-tax-detail').inner_text(),'mixed tax buckets printed');check('期限 2026-11-30' in r.locator('[data-ci-source="r2"]').inner_text() and '2026/08/31' in r.locator('.invoice-date').inner_text(),'different dates printed without replacement');r.close()
 # 30 separate originals across multiple sheets: none silently dropped.
 many=[dict(example[0],id='long'+str(j),site_id='site'+str(j),site_name='長い一覧の検証現場 '+str(j),document_number='INV-LONG-'+str(j)) for j in range(30)]
 r=ctx.new_page();r.set_content(render_documents(many));check(r.locator('.invoice-item').count()==30,'all thirty invoices retained');check(r.locator('.te2-page').count()>1,'large selections continue onto A4 sheets');check(r.locator('.invoice-final').count()==1,'grand total printed once for multiple sheets');check(r.locator('.te2-page').evaluate_all('(pages)=>pages.every(p=>p.querySelector(".te2-frame").getBoundingClientRect().bottom<=p.getBoundingClientRect().bottom-12*96/25.4+1)'),'no page overflow')
 if engine=='chromium':r.pdf(path=str(out/'thirty-print.pdf'),prefer_css_page_size=True,print_background=True)
 r.close();check(page.evaluate('JSON.stringify(__db)')==original,'source database unchanged by display and PDFs')
 # Source change between selection and preview is rejected.
 page.evaluate("__db.project_documents.find(d=>d.id==='a').updated_at='2026-10-05T00:00:00Z'");click('#bbPreview');page.wait_for_function('document.querySelector("#bbStatus").textContent.includes("更新されました")');check(page.locator('#bbPreviewDialog').count()==0,'stale source blocks export')
 fresh();page.evaluate("__mode='fail'");click('#bbPreview');page.wait_for_function('document.querySelector("#bbStatus").textContent.includes("読み込めません")');check(page.locator('#bbPreviewDialog').count()==0,'failed reread blocks export');page.evaluate("__mode='ok'");fresh()
 click('#bbPreview');page.wait_for_selector('#bbPreviewDialog[open]');loaded();page.evaluate("cloudProfile={...cloudProfile,company_id:'other-company'};document.dispatchEvent(new Event('toya-role-changed'))");check(page.locator('#bbPreviewDialog').count()==0,'company switch clears visible invoice and PDF')
 check(page.evaluate('__writes.length')==0,'zero save issue cancel or financial writes');check(set(errors)<=set(old_errors),'no new runtime errors after all checks')
 (out/'results.json').write_text(json.dumps({'browser':engine,'checks':checks,'new_errors':[x for x in errors if x not in old_errors],'known_baseline_errors':old_errors,'unexpected_writes':page.evaluate('__writes'),'real_account_calls':0,'blocked_urls':blocked},ensure_ascii=False,indent=2));browser.close()
