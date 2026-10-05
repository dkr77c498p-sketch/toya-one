"""Exercise the real invoice editor/PDF plus paper geometry with synthetic records only."""
from pathlib import Path
import json, os, base64, fitz
# Reuse the already reviewed full-app fixture and its blocked-write Supabase stub.
fixture_file=Path(__file__).with_name('billing-bundle-browser.py')
exec(compile(fixture_file.read_text().split('with sync_playwright() as pw:')[0],str(fixture_file),'exec'))
out=repo/'test-output'/'invoice-green'/engine;out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
 kw={'headless':True}
 if os.environ.get('TOYA_TEST_EXECUTABLE'):kw['executable_path']=os.environ['TOYA_TEST_EXECUTABLE']
 browser=getattr(pw,engine).launch(**kw)
 ctx=browser.new_context(viewport={'width':390,'height':844},locale='ja-JP')
 blocked=[]
 def route(r):
  url=r.request.url
  if url.startswith('blob:http://localhost/'):return r.continue_()
  if url=='http://localhost/current.html':return r.fulfill(body=fixture(),content_type='text/html')
  if url=='http://localhost/before.html':return r.fulfill(body=fixture(True),content_type='text/html')
  if url.startswith('http://localhost/vendor/'):
   f=base/'vendor'/url.split('/')[-1].split('?')[0]
   if f.is_file():return r.fulfill(path=str(f),content_type='application/javascript')
  for name,mime in [('toya-document-logo.svg','image/svg+xml'),('billing-bundle-logo.r1.png','image/png')]:
   if url=='http://localhost/'+name:return r.fulfill(path=str(base/name),content_type=mime)
  blocked.append(url);r.abort()
 ctx.route('**/*',route)
 before=ctx.new_page();old_errors=[];before.on('pageerror',lambda err:old_errors.append(str(err)))
 before.goto('http://localhost/before.html');before.wait_for_timeout(1600);before.evaluate(setup);before.wait_for_timeout(1600);before.close()
 page=ctx.new_page();errors=[];page.on('pageerror',lambda err:errors.append(str(err)));page.on('dialog',lambda d:d.dismiss());page.set_default_timeout(20000)
 checks=[]
 def check(ok,name):
  assert ok,(name,errors);checks.append(name);print('ok',name,flush=True)
 def click(sel):page.locator(sel).evaluate('(e)=>e.click()')
 page.goto('http://localhost/current.html');page.wait_for_timeout(1600);page.evaluate(setup);page.wait_for_timeout(1600)
 original=page.evaluate('JSON.stringify(__db)');check(set(errors)<=set(old_errors),'no new app errors')
 for ident in ['a','b']:
  source=next(d for d in db['project_documents'] if d['id']==ident)
  page.evaluate('(d)=>ToyaProjectBusiness.openForBundle({siteId:d.site_id,documentId:d.id,kind:d.kind})',source)
  page.wait_for_selector('#pbShowPreview');check(page.locator('#pbFields').evaluate('(e)=>e.disabled') and page.locator('#pbDocumentDate').is_disabled(),'issued '+ident+' stays locked')
  click('#pbShowPreview');page.wait_for_function('document.querySelector("#pbPaperStatus")?.textContent.includes("用紙全体")')
  frame=page.frame_locator('#pbPreview .pb-preview-viewport iframe')
  check(frame.locator('.te2-page').count()==1,ident+' one A4 sheet')
  check(frame.locator('.invoice-lines thead th').first.inner_text()=='商品コード／商品名',ident+' approved table headings')
  check(frame.locator('.invoice-lines tbody tr').count()>=15,ident+' ruled rows extend down paper')
  check(frame.locator('.invoice-totals tr>*').count()==6,ident+' bottom six-cell totals')
  check(source['issuer']['address'] in frame.locator('.invoice-company').inner_text(),ident+' issuer address from source')
  check(source['issuer']['issuer_name'] in frame.locator('.invoice-company').inner_text(),ident+' issuer name from source')
  check(source['issuer']['bank_details'].replace('\n','') in frame.locator('.invoice-bank').inner_text().replace('\n',''),ident+' bank from source not image')
  check(source['customer_name'] in frame.locator('.invoice-customer').inner_text(),ident+' recipient retained')
  vals=frame.locator('.invoice-totals td').all_inner_texts();check(vals==[format(source[k],',') for k in ['subtotal','tax_amount','total']],ident+' exact original totals')
  if ident=='b':check('230,000' in frame.locator('.invoice-progress').inner_text() and '80,000' in frame.locator('.invoice-progress').inner_text(),'previous and cumulative preserved')
  for width in [320,390,430]:
   page.set_viewport_size({'width':width,'height':844})
   page.wait_for_function('''()=>{const s=document.querySelector('#pbPreview .pb-preview-stage');const r=s.getBoundingClientRect();return r.width>0&&Math.abs(r.height/r.width-297/210)<.01&&s.querySelector('iframe').getBoundingClientRect().width<=s.parentElement.clientWidth+1}''')
   g=frame.locator('.te2-page').evaluate('(p)=>({w:p.getBoundingClientRect().width,h:p.getBoundingClientRect().height,b:p.querySelector(".invoice-totals").getBoundingClientRect().bottom-p.getBoundingClientRect().top})')
   check(abs(g['w']-210*96/25.4)<1 and abs(g['h']-297*96/25.4)<1,ident+' A4 geometry '+str(width))
   check(260*96/25.4<=g['b']<=286*96/25.4,ident+' totals near paper bottom '+str(width))
  page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(250);page.locator('#pbPreview').screenshot(path=str(out/(ident+'-mobile.png')))
  html_text=frame.locator('html').evaluate('(e)=>"<!doctype html>"+e.outerHTML');(out/(ident+'.html')).write_text(html_text)
  click('#pbPdf');page.wait_for_function('document.querySelector("#pbPreview [data-pdf-download]")?.getAttribute("href")',timeout=120000)
  link=page.locator('#pbPreview [data-pdf-download]');check(link.get_attribute('download')=='TOYAONE.pdf',ident+' file name unchanged')
  b64=page.evaluate('''async()=>{const u=document.querySelector('#pbPreview [data-pdf-download]').href,b=new Uint8Array(await(await fetch(u)).arrayBuffer());let s='';for(let i=0;i<b.length;i+=16384)s+=String.fromCharCode(...b.subarray(i,i+16384));return btoa(s)}''')
  pdfpath=out/(ident+'.pdf');pdfpath.write_bytes(base64.b64decode(b64));pdf=fitz.open(pdfpath)
  check(len(pdf)==1 and abs(pdf[0].rect.width-595.27559)<.1 and abs(pdf[0].rect.height-841.88976)<.1,ident+' actual image PDF is A4')
  check(pdf.metadata['title']=='TOYAONE',ident+' PDF title unchanged');pdf[0].get_pixmap(matrix=fitz.Matrix(1.3,1.3)).save(out/(ident+'-pdf.png'))
  click('#pbPreviewClose')
 # Boundary cases and multiple sites inside an ordinary invoice's real line table.
 tests=page.evaluate('''()=>{const base=structuredClone(__db.project_documents.find(d=>d.id==='a'));return [1,3,18,20,21,22,23,24,25,40,80,200].map(n=>({...base,id:'rows-'+n,document_number:'INV-TEST-'+n,items:Array.from({length:n},(_,j)=>({name:'見本現場 '+(j+1),code:'工事番号'+(j+1),quantity:'1',unit:'式',unitPrice:'1000'})),subtotal:1000*n,tax_amount:100*n,total:1100*n,notes:''}));}''')
 for source in tests:
  rendered=page.evaluate('(d)=>ToyaBillingBundleUI.renderSingleHTML(d)',source)
  view=ctx.new_page();view.set_content(rendered);view.evaluate('document.fonts.ready');n=len(source['items'])
  check(view.locator('.invoice-item').count()==n,'all real rows preserved '+str(n))
  check(view.locator('.invoice-final').count()==1,'one total only '+str(n))
  check(view.locator('.te2-page').evaluate_all('(ps)=>ps.every(p=>p.querySelector(".te2-frame").getBoundingClientRect().bottom<=p.getBoundingClientRect().bottom-12*96/25.4+1)'),'no content outside pages '+str(n))
  if n==3:
   (out/'three-sites.html').write_text(rendered);view.screenshot(path=str(out/'three-sites.png'),full_page=True)
  if engine=='chromium' and n in [1,3,20,80]:
   pp=out/('rows-'+str(n)+'-print.pdf');view.pdf(path=str(pp),prefer_css_page_size=True,print_background=True);doc=fitz.open(pp)
   check(len(doc)==view.locator('.te2-page').count(),'no extra blank print pages '+str(n))
  view.close()
 for state in ['draft','void']:
  source={**tests[1],'status':state,'void_reason':'検証用の取消理由'}
  if state=='draft':source['document_number']=None
  rendered=page.evaluate('(d)=>ToyaBillingBundleUI.renderSingleHTML(d)',source);view=ctx.new_page();view.set_content(rendered)
  check(view.locator('.invoice-state').inner_text()==('下書き' if state=='draft' else '取消済み'),state+' watermark retained')
  view.close()
 check(page.evaluate('JSON.stringify(__db)')==original,'no saved document changes')
 check(page.evaluate('__writes.length')==0,'zero save issue cancel or ledger writes')
 check(set(errors)<=set(old_errors),'no new errors after real editor and PDF')
 (out/'results.json').write_text(json.dumps({'browser':engine,'checks':checks,'known_baseline_errors':old_errors,'new_errors':[x for x in errors if x not in old_errors],'real_account_calls':0,'writes':page.evaluate('__writes'),'blocked':blocked},ensure_ascii=False,indent=2))
 browser.close()
