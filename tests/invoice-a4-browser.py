"""Actual editor -> A4 preview -> PDF, synthetic data only, network blocked."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import os,json,re,subprocess,base64
repo=Path(__file__).resolve().parents[1]
# Reuse the existing isolated whole-app fixture, never a live account.
prefix=(repo/'tests/billing-bundle-browser.py').read_text().split('with sync_playwright() as pw:')[0]
exec(compile(prefix,str(repo/'tests/billing-bundle-browser.py'),'exec'))
out=repo/'test-output'/'invoice-a4'/engine;out.mkdir(parents=True,exist_ok=True)
p=next(d.copy() for d in db['project_documents'] if d['id']=='b')
p.update(id='draft-progress',site_id='C',site_name='検証現場C（架空）',status='draft',document_number=None,issued_at=None,document_date='2026-10-02',cumulative_amount=500000,previous_billed=0,contract_amount=2760000,subtotal=500000,tax_amount=50000,total=550000,subject='追加転圧工事（架空・検証用）')
p['items']=[{'name':'追加転圧工事（架空・検証用） 出来高分','quantity':'1','unit':'式','unitPrice':'500000','costPrice':None}]
db['project_documents'].append(p)
next(r for r in db['revenues'] if r['site_id']=='C')['amount']=2760000
old_json=re.search(r'window.__db=(.*?);window.__writes',stub).group(1)
stub=stub.replace(old_json,json.dumps(db,ensure_ascii=False),1)
# Baseline uses the exact previous business + bundle UI modules.
original_fixture=fixture
def fixture(old=False):
 h=original_fixture(False)
 if old:
  for new,prior in [('project-business.a4-r1.js','project-business.bundle-r1.js'),('billing-bundle-ui.a4-r1.js','billing-bundle-ui.r1.js')]:h=h.replace((base/new).read_text(),(base/prior).read_text())
 return h
with sync_playwright() as pw:
 browser=getattr(pw,engine).launch(headless=True)
 ctx=browser.new_context(viewport={'width':390,'height':844},locale='ja-JP')
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
  blocked.append(u);return r.abort()
 ctx.route('**/*',route)
 baseline=ctx.new_page();old_errors=[];baseline.on('pageerror',lambda e:old_errors.append(str(e)));baseline.goto('http://localhost/before.html');baseline.wait_for_timeout(1800);baseline.evaluate(setup);baseline.wait_for_timeout(1600);baseline.close()
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.dismiss());page.set_default_timeout(20000)
 page.goto('http://localhost/current.html');page.wait_for_timeout(1800);page.evaluate(setup);page.wait_for_timeout(1800)
 checks=[]
 def check(ok,name):
  if not ok:
   state=page.evaluate('''()=>{const f=document.querySelector('#pbPreview iframe'),s=f?.parentElement,v=s?.parentElement,d=f?.contentDocument,p=d?.querySelector('.te2-page');const r=e=>e?{width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,style:e.getAttribute('style'),clientWidth:e.clientWidth,scrollHeight:e.scrollHeight}:null;return {viewport:r(v),stage:r(s),iframe:r(f),paper:r(p),body:r(d?.body),scrollY:f?.contentWindow?.scrollY,outer:innerWidth};}''')
   print('FAILED GEOMETRY',name,json.dumps(state),flush=True)
   (out/'failure.json').write_text(json.dumps(state,indent=2));page.screenshot(path=str(out/'failure.png'),full_page=False)
  assert ok,(name,errors);checks.append(name);print('ok',name,flush=True)
 def click(s):page.locator(s).evaluate('(e)=>{e.scrollIntoView({block:"center"});e.click()}')
 def read_pdf(name):
  page.wait_for_function('document.querySelector("#pbPreview [data-pdf-download]")?.getAttribute("href")',timeout=120000)
  b64=page.evaluate('''async()=>{const u=document.querySelector('#pbPreview [data-pdf-download]').href,a=new Uint8Array(await(await fetch(u)).arrayBuffer());let s='';for(let i=0;i<a.length;i+=16384)s+=String.fromCharCode(...a.subarray(i,i+16384));return btoa(s)}''')
  (out/(name+'.pdf')).write_bytes(base64.b64decode(b64))
  check(page.locator('#pbPreview [data-pdf-download]').get_attribute('download')=='TOYAONE.pdf',name+' requested filename')
 check(set(errors)<=set(old_errors),'no new runtime errors on load')
 before=page.evaluate('JSON.stringify(__db)')
 for ident,kind,title in [('draft-progress','progress','出来高請求書'),('b','progress','出来高請求書'),('a','invoice','請求書'),('void','invoice','請求書')]:
  source=next(d for d in db['project_documents'] if d['id']==ident)
  ok=page.evaluate('async x=>await ToyaProjectBusiness.openForBundle(x)',{'siteId':source['site_id'],'documentId':ident,'kind':kind})
  check(ok,ident+' original editor opens')
  click('#pbShowPreview');page.wait_for_function('document.querySelector("#pbPaperStatus")?.textContent.includes("用紙全体")')
  frame=page.frame_locator('#pbPreview iframe')
  check(frame.locator('.te2-page').count()==1,ident+' one complete A4 sheet')
  check(frame.locator('.bb-cover').count()==0,ident+' no unwanted bundle cover')
  check(frame.locator('.invoice-title-row h1').inner_text()==title,ident+' correct title')
  if ident=='draft-progress':
   check('下書き' in frame.locator('.invoice-state').inner_text(),'draft status remains')
   check('500,000' in frame.locator('.invoice-progress').inner_text() and '2,760,000' in frame.locator('.invoice-progress').inner_text(),'draft progress amounts unchanged')
   check('550,000' in frame.locator('.invoice-grand').inner_text(),'draft tax-inclusive total unchanged')
  elif ident=='b':check('230,000' in frame.locator('.invoice-progress').inner_text() and '80,000' in frame.locator('.invoice-progress').inner_text(),'issued cumulative and previous preserved')
  elif ident=='void':check(frame.locator('.invoice-state').inner_text()=='取消済み','void watermark preserved')
  for width in [320,390,430]:
   page.set_viewport_size({'width':width,'height':844});page.wait_for_timeout(100)
   rect=frame.locator('.te2-page').evaluate('(e)=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})')
   check(abs(rect['w']-210*96/25.4)<1 and abs(rect['h']-297*96/25.4)<1,ident+' A4 dimensions '+str(width))
   fit=page.locator('#pbPreview .pb-preview-stage').evaluate('(e)=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height,fw:e.querySelector("iframe").getBoundingClientRect().width,fh:e.querySelector("iframe").getBoundingClientRect().height,v:e.parentElement.clientWidth})')
   check(abs(fit['h']/fit['w']-297/210)<.01 and fit['fw']<=fit['v']+1,ident+' preview aspect and no gray tail '+str(width))
  page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(100)
  first=page.locator('#pbPreview iframe').get_attribute('style');page.wait_for_timeout(500);check(page.locator('#pbPreview iframe').get_attribute('style')==first,ident+' preview height stable')
  (out/(ident+'.html')).write_text(page.locator('#pbPreview iframe').evaluate('(e)=>e.srcdoc'))
  page.locator('#pbPreview').screenshot(path=str(out/(ident+'-mobile.png')))
  click('#pbPdf');read_pdf(ident)
  check(page.locator('[data-toya-pdf-capture]').count()==0,ident+' capture cleanup')
  click('#pbPreviewClose');check(page.locator('#pbPreview').count()==0,ident+' close works')
 # Many-line invoice: preserve every line, current totals once, no extra cover.
 page.evaluate('''()=>{const d=structuredClone(__db.project_documents.find(x=>x.id==='a'));d.id='long';d.items=Array.from({length:80},(_,j)=>({name:'検証明細 '+(j+1),quantity:'1',unit:'式',unitPrice:'1000',costPrice:null}));d.subtotal=80000;d.tax_amount=8000;d.total=88000;window.__long=d;}''')
 long_html=page.evaluate('async()=>await ToyaBillingBundleUI.renderSingleHTML(__long)')
 probe=ctx.new_page();probe.set_content(long_html);check(probe.locator('.invoice-item').count()==80,'long invoice retains 80 rows');check(probe.locator('.te2-page').count()>1 and probe.locator('.bb-cover').count()==0,'long invoice paginates without cover');check(probe.locator('.invoice-final').count()==1,'long invoice totals once')
 if engine=='chromium':
  for ident in ['draft-progress','b','a','void']:
   probe.set_content((out/(ident+'.html')).read_text());probe.pdf(path=str(out/(ident+'-print.pdf')),prefer_css_page_size=True,print_background=True,display_header_footer=False)
  probe.set_content(long_html);probe.pdf(path=str(out/'long-print.pdf'),prefer_css_page_size=True,print_background=True,display_header_footer=False)
 probe.close()
 # A closed preview must not reappear after async pagination finishes.
 page.evaluate("async()=>await ToyaProjectBusiness.openForBundle({siteId:'A',documentId:'a',kind:'invoice'})")
 page.evaluate("()=>{window.__a4Original=ToyaBillingBundleUI;ToyaBillingBundleUI={...__a4Original,renderSingleHTML:async(...args)=>{await new Promise(r=>setTimeout(r,300));return __a4Original.renderSingleHTML(...args)}}}")
 click('#pbShowPreview');click('#pbPreviewClose');page.wait_for_timeout(500);check(page.locator('#pbPreview').count()==0,'close during preparation stays closed')
 page.evaluate('ToyaBillingBundleUI=__a4Original')
 # Visible failures instead of malformed output; next opening can retry.
 page.evaluate("ToyaBillingBundleUI={...__a4Original,renderSingleHTML:async()=>{throw Error('検証用の描画失敗')}}")
 click('#pbShowPreview');page.wait_for_function('document.querySelector("#pbPaperStatus").textContent.includes("検証用の描画失敗")');check(page.locator('#pbPdf').is_disabled() and page.locator('#pbPrint').is_disabled(),'failed rendering disables export');click('#pbPreviewClose');page.evaluate('ToyaBillingBundleUI=__a4Original')
 # Existing estimates still use the original renderer/exporter.
 page.evaluate("async()=>{const d=structuredClone(__db.project_documents.find(x=>x.id==='a'));d.kind='estimate';d.site_id=null;d.document_number='EST-TEST';await ToyaProjectBusiness.openEstimate(d)}")
 click('#pbShowPreview');page.wait_for_function('document.querySelector("#pbPaperStatus").textContent.includes("用紙全体")');check(page.frame_locator('#pbPreview iframe').locator('.te2-cover').count()==1,'original estimate cover retained');check(not page.locator('#pbPdf').is_disabled(),'original quote exporter retained');click('#pbPreviewClose')
 check(page.evaluate('JSON.stringify(__db)')==before,'source records and financial amounts unchanged')
 check(page.evaluate('__writes.length')==0,'no financial save issue or other account writes')
 check(set(errors)<=set(old_errors),'no new runtime errors after all operations')
 (out/'results.json').write_text(json.dumps({'browser':engine,'checks':checks,'baseline_errors':old_errors,'new_errors':[e for e in errors if e not in old_errors],'writes':page.evaluate('__writes'),'real_account_calls':0},ensure_ascii=False,indent=2))
 browser.close()
