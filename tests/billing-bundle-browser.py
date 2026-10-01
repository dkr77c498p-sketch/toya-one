from pathlib import Path
from playwright.sync_api import sync_playwright
import os,json,re,subprocess,base64
repo=Path(__file__).resolve().parents[1];base=repo/'docs';engine=os.environ.get('TOYA_TEST_BROWSER','chromium');out=repo/'test-output'/'billing-bundle'/engine;out.mkdir(parents=True,exist_ok=True)
subprocess.run(['node',str(repo/'tests/billing-bundle.cjs')],env={**os.environ,'WRITE_FIXTURE':str(out/'fixture.json')},check=True,capture_output=True)
db=json.loads((out/'fixture.json').read_text())
stub=r'''
window.__db=DBDATA;window.__writes=[];window.__fixtureProfile=null;window.__mode='ok';
const copy=x=>JSON.parse(JSON.stringify(x));
function chain(table){let filters=[],from=0,to=99999,single=false;const obj=new Proxy(function(){},{get(t,k){if(k==='then')return (a,b)=>{if(__mode==='fail'&&table==='project_documents')return Promise.resolve({data:null,error:{message:'検証：通信失敗'}}).then(a,b);let rows=table==='profiles'?(__fixtureProfile?[__fixtureProfile]:[]):(__db[table]||[]);rows=rows.filter(r=>filters.every(([fn,k,v])=>fn==='eq'||fn==='is'?r[k]===v:fn==='in'?v.includes(r[k]):fn==='gte'?r[k]>=v:fn==='lt'?r[k]<v:true)).slice(from,to+1);return Promise.resolve({data:copy(single?rows[0]||null:rows),error:null,count:rows.length}).then(a,b);};return (...args)=>{if(['insert','upsert','update','delete'].includes(k)){__writes.push({table,op:k,args});throw Error('Unexpected write');}if(['eq','is','in','gte','lt'].includes(k))filters.push([k,...args]);if(k==='range')[from,to]=args;if(k==='single'||k==='maybeSingle')single=true;return obj;};}});return obj;}
const noop=()=>{};
window.supabase={createClient:()=>({from:chain,auth:{getSession:async()=>({data:{session:__fixtureProfile?{user:{id:__fixtureProfile.id,email:'fixture@example.invalid'}}:null},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe:noop}}}),signOut:async()=>({error:null})},rpc:async(name,args)=>{if(name==='toya_access')return {data:{state:'ready',internal:true,plan:'internal',features:{invoice:true,estimate:true}},error:null};if(name==='equipment_transport_catalog_v1'||['toya_onboarding','toya_employee_admin'].includes(name)&&args?.p_action==='list')return {data:[],error:null};__writes.push({name,args});return {data:null,error:null}},storage:{from:()=>({list:async()=>({data:[],error:null}),createSignedUrls:async()=>({data:[],error:null})})},channel:()=>({on(){return this},subscribe(){return this},unsubscribe:noop}),removeChannel:noop})};
'''.replace('DBDATA',json.dumps(db,ensure_ascii=False))
storage='''(()=>{const s=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>s.get(k)??null,setItem:(k,v)=>s.set(k,String(v)),removeItem:k=>s.delete(k),clear:()=>s.clear(),key:i=>[...s.keys()][i],get length(){return s.size}}});let n=0;if(!crypto.randomUUID)crypto.randomUUID=()=> '00000000-0000-4000-8000-'+String(++n).padStart(12,'0');})();'''
html=(base/'index.html').read_text()
def fixture(old=False):
 def script(m):
  src=m[1]
  if old and src.startswith('billing-bundle'):return ''
  if old and src.startswith('project-business.bundle'):src='project-business.pdf-r1.js'
  body=stub if src.startswith('https://cdn.jsdelivr.net/') else (base/src.split('?')[0]).read_text()
  return '<script>'+body+'</script>'
 h=re.sub(r'<script src="([^"]+)"[^>]*></script>',script,html)
 h=re.sub(r'<link rel="stylesheet" href="([^"]+)"[^>]*>',lambda m:'<style>'+(base/m[1].split('?')[0]).read_text()+'</style>',h)
 h=h.replace('<head>','<head><base href="http://localhost/"><script>'+storage+'</script>',1)
 return re.sub(r'<link rel="manifest"[^>]*>','',h)
setup='''()=>{window.__fixtureProfile={id:'fixture-user',company_id:'fixture-company',active:true,role:'admin',name:'検証担当'};cloudProfile={...__fixtureProfile};cloudProfilesCache={'fixture-user':cloudProfile};ToyaCompanyAccess.accept({state:'ready',internal:true,plan:'internal',features:{estimate:true,invoice:true}},cloudProfile.id);initializeCompanyDefaults();set(LS.sites,__db.sites.map(s=>s.name));renderCompanyPeople();renderSelectors();applyCloudRoleUI();document.dispatchEvent(new Event('toya-role-changed'));}'''
with sync_playwright() as pw:
 kw={'headless':True}
 if os.environ.get('TOYA_TEST_EXECUTABLE'):kw['executable_path']=os.environ['TOYA_TEST_EXECUTABLE']
 browser=getattr(pw,engine).launch(**kw);ctx=browser.new_context(viewport={'width':390,'height':844},locale='ja-JP')
 blocked=[]
 def route(r):
  url=r.request.url
  # WebKit routes blob URLs; these are browser-local bytes, not network requests.
  if url.startswith('blob:http://localhost/'):return r.continue_()
  if url=='http://localhost/current.html':return r.fulfill(body=fixture(),content_type='text/html')
  if url=='http://localhost/before.html':return r.fulfill(body=fixture(True),content_type='text/html')
  if url.startswith('http://localhost/vendor/'):
   f=base/'vendor'/url.split('/')[-1].split('?')[0]
   if f.is_file():return r.fulfill(path=str(f),content_type='application/javascript')
  if url=='http://localhost/toya-document-logo.svg':return r.fulfill(path=str(base/'toya-document-logo.svg'),content_type='image/svg+xml')
  blocked.append(url);r.abort()
 ctx.route('**/*',route)
 baseline=ctx.new_page();old_errors=[];baseline.on('pageerror',lambda err:old_errors.append(str(err)));(baseline.set_content(fixture(True)) if os.environ.get('TOYA_TEST_EXECUTABLE') else baseline.goto('http://localhost/before.html'));baseline.wait_for_timeout(1800);baseline.evaluate(setup);baseline.wait_for_timeout(1600);baseline.close()
 page=ctx.new_page();errors=[];page.on('pageerror',lambda err:errors.append(str(err)));page.on('dialog',lambda d:d.dismiss());page.set_default_timeout(20000)
 checks=[]
 def check(ok,name):
  assert ok,(name,errors);checks.append(name);print('ok',name,flush=True)
 def click(sel):page.locator(sel).evaluate('(e)=>{e.scrollIntoView({block:"center"});e.click()}')
 (page.set_content(fixture()) if os.environ.get('TOYA_TEST_EXECUTABLE') else page.goto('http://localhost/current.html'));page.wait_for_timeout(1800);check(page.locator('#billingBundleCard').count()==0,'not exposed before admin login');page.evaluate(setup);page.wait_for_timeout(1800)
 check(set(errors)<=set(old_errors),'no new initial runtime errors')
 page.evaluate('ToyaBillingBundleUI.open()');page.wait_for_function('document.querySelectorAll("#bbCustomer option").length>=3')
 key=json.dumps([db['project_documents'][0]['customer_name'],db['project_documents'][0]['customer_address']],ensure_ascii=False,separators=(',',':'))
 page.locator('#bbCustomer').select_option(key);page.locator('#bbMonth').fill('2026-09');page.locator('#bbMonth').dispatch_event('change');page.locator('#bbMonth').evaluate('(e)=>e.blur()');page.wait_for_timeout(150)
 check(page.locator('[data-bb-id]').count()==3,'one customer and invoice month list only matching normal/progress/draft')
 check(page.locator('[data-bb-id="draft"]').is_disabled(),'draft cannot be selected for formal delivery')
 click('#bbSelectAll');check(page.locator('[data-bb-id="a"]').is_checked() and page.locator('[data-bb-id="b"]').is_checked(),'normal and progress can be selected together')
 check(not page.locator('[data-bb-id="draft"]').is_checked(),'select all skips draft')
 check('385,000円' in page.locator('#bbTotal').inner_text(),'only current progress amount contributes to combined total')
 check(page.evaluate('__writes.length')==0,'selecting and calculating never writes accounting data')
 for width in [320,390,430]:
  page.set_viewport_size({'width':width,'height':844});check(page.locator('#billingBundleCard').evaluate('(e)=>e.scrollWidth<=e.clientWidth+2'),'bundle fits mobile '+str(width))
 page.set_viewport_size({'width':390,'height':844});page.locator('#bbOpen').screenshot(path=str(out/'bundle-input.png'))
 click('#bbPreview');page.wait_for_selector('#bbPreviewDialog[open]')
 frame=page.frame_locator('#bbPreviewDialog .pb-preview-viewport iframe');page.wait_for_timeout(400)
 check(frame.locator('.te2-page').count()==3,'one cover plus each original site invoice')
 check(frame.locator('.bb-cover').first.inner_text().count('385,000円')==2,'cover current grand total appears consistently')
 check(frame.locator('.bb-cover-table tbody tr').count()==2 and frame.locator('.bb-cover-table tbody td').count()==8,'cover retains table cells and every selected document')
 check('INV-TEST-a' in frame.locator('.bb-cover-table').inner_text() and '165,000円' in frame.locator('.bb-cover-table').inner_text(),'cover contains source invoice numbers and individual totals')
 check(frame.locator('.invoice-document .invoice-title-row h1').count()==2,'both original invoice headers retained')
 check('出来高請求書' in frame.locator('body').inner_text(),'progress invoice retained as such')
 check('230,000' in frame.locator('.invoice-progress').inner_text() and '80,000' in frame.locator('.invoice-progress').inner_text(),'original cumulative and previous values retained in attachment')
 check(page.evaluate('__writes.length')==0,'preview still performs no accounting write')
 click('#bbPDF');page.wait_for_function('document.querySelector("#bbPreviewDialog [data-pdf-download]")?.getAttribute("href")',timeout=120000)
 link=page.locator('#bbPreviewDialog [data-pdf-download]');check(link.get_attribute('download')=='TOYAONE.pdf','fixed requested PDF filename')
 b64=page.evaluate('''async()=>{const u=document.querySelector('#bbPreviewDialog [data-pdf-download]').href,b=new Uint8Array(await(await fetch(u)).arrayBuffer());let s='';for(let i=0;i<b.length;i+=16384)s+=String.fromCharCode(...b.subarray(i,i+16384));return btoa(s)}''');(out/'TOYAONE_bundle_sample.pdf').write_bytes(base64.b64decode(b64))
 check(page.locator('[data-toya-pdf-capture]').count()==0,'temporary capture frame cleaned up')
 click('#bbClosePreview');check(page.locator('#bbPreviewDialog').count()==0,'closing preview releases file controls')
 # Native month controls must commit/blur before the synthetic click helper.
 # Preserve the same selected source IDs after closing an exported PDF.
 print('before source refresh:',page.evaluate("""()=>({status:document.querySelector('#bbStatus').textContent,previewDisabled:document.querySelector('#bbPreview').disabled,selected:[...document.querySelectorAll('[data-bb-id]:checked')].map(x=>x.dataset.bbId),month:document.querySelector('#bbMonth').value,active:document.activeElement?.id})"""),flush=True)
 check(page.locator('[data-bb-id="a"]').is_checked() and page.locator('[data-bb-id="b"]').is_checked(),'closing a generated PDF preserves selected sources')
 # Source version changes cannot silently export stale data.
 page.evaluate('__db.project_documents.find(d=>d.id==="a").updated_at="2026-10-01T02:00:00Z"');click('#bbPreview');page.wait_for_timeout(200)
 print('source refresh state:',page.evaluate("""()=>({status:document.querySelector('#bbStatus').textContent,previewDisabled:document.querySelector('#bbPreview').disabled,selected:[...document.querySelectorAll('[data-bb-id]:checked')].map(x=>x.dataset.bbId),dialog:!!document.querySelector('#bbPreviewDialog')})"""),'errors:',errors,flush=True)
 page.wait_for_function('document.querySelector("#bbStatus").textContent.includes("更新されました")')
 check(page.locator('#bbPreviewDialog').count()==0 and page.locator('[data-bb-id="a"]').is_checked()==False,'changed source forces explicit reselection')
 click('#bbSelectAll');page.evaluate('__db.project_documents.find(d=>d.id==="b").status="void"');click('#bbRefresh');page.wait_for_timeout(250)
 check(page.locator('[data-bb-id="b"]').count()==0,'voided invoice disappears after refresh')
 check('220,000円' in page.locator('#bbTotal').inner_text(),'refresh removes voided source from selected total')
 click('#bbAllMonths');check(not page.locator('[data-bb-id="a"]').is_checked() and page.locator('[data-bb-id="old"]').count()==1,'month scope change clears selection and reveals older invoices explicitly')
 page.evaluate('__mode="fail"');click('#bbRefresh');page.wait_for_function('document.querySelector("#bbStatus").textContent.includes("通信失敗")');check(page.locator('[data-bb-id]').count()==0 and page.locator('#bbPreview').is_disabled(),'read failure does not reuse a stale total')
 page.evaluate('__mode="ok"');click('#bbRefresh');page.wait_for_timeout(200);page.locator('#bbCustomer').select_option(key);click('.bb-new>summary');page.locator('#bbNewSite').select_option('C');click('#bbNewProgress');page.wait_for_timeout(600)
 check(page.locator('#pbCustomer').input_value()=='架空元請株式会社','new progress editor carries chosen customer without saving')
 check(page.locator('#pbCumulative').count()==1,'new progress uses existing cumulative billing editor')
 check(page.evaluate('__writes.length')==0,'opening new invoice does not save or issue automatically')
 # Single very long table paginates rows without cropping.
 page.evaluate('''()=>{const d=structuredClone(__db.project_documents.find(d=>d.id==='a'));d.id='long';d.document_number='INV-TEST-LONG';d.items=Array.from({length:80},(_,i)=>({name:'検証明細 '+(i+1),quantity:'1',unit:'式',unitPrice:'1000',costPrice:null}));d.subtotal=80000;d.tax_amount=8000;d.total=88000;window.__longSource=d;}''')
 long_html=page.evaluate('''async()=>await ToyaBillingBundleUI.renderHTML(ToyaBillingBundle.bundle([__longSource],['long'],'fixture-company'))''')
 preview=ctx.new_page();preview.set_content(long_html);check(preview.locator('.invoice-item').count()==80,'multipage attachment preserves every original line');check(preview.locator('.te2-page').count()>=3,'long invoice uses additional A4 pages');check(preview.locator('.invoice-final').count()==1,'long invoice total printed once');preview.close()
 for tab in ['homePage','reportPage','recordsPage','attachmentPage','masterPage']:
  click('nav [data-page="'+tab+'"]');check(page.locator('#'+tab).evaluate('(e)=>e.classList.contains("active")'),tab+' remains usable')
 page.evaluate('cloudProfile={...cloudProfile,company_id:"different-company"}');page.wait_for_timeout(1300)
 check('架空元請株式会社' not in page.locator('#billingBundleCard').inner_text(),'company switch clears recipient and financial state')
 page.evaluate('cloudProfile={...cloudProfile,role:"employee"}');page.wait_for_timeout(1300);check(page.locator('#billingBundleCard').count()==0,'employee cannot use bundle admin screen')
 check(set(errors)<=set(old_errors),'no new runtime errors after all operations')
 check(page.evaluate('__writes.length')==0,'no write calls throughout bundle workflow')
 (out/'results.json').write_text(json.dumps({'browser':engine,'checks':checks,'known_baseline_errors':old_errors,'new_errors':[x for x in errors if x not in old_errors],'opaque_origin_local_test':bool(os.environ.get('TOYA_TEST_EXECUTABLE')),'real_account_calls':0,'real_account_writes':0,'unexpected_mock_writes':page.evaluate('__writes')},ensure_ascii=False,indent=2))
 browser.close()
