from pathlib import Path
import json,os,subprocess,threading,functools,http.server,hashlib
from playwright.sync_api import sync_playwright
import fitz
from PIL import Image
root=Path(__file__).resolve().parents[1]
engine=os.environ.get('PDF_TEST_BROWSER','chromium');assert engine in ('chromium','webkit')
out=root/'test-output'/('pdf-'+engine);out.mkdir(parents=True,exist_ok=True)
code=r'''const Q=require('./docs/estimate-plan-engine.quote5-r1.js'),A=require('./docs/estimate-auto-builder.quote5-r1.js');
const p=Q.quoteDraft();p.site_name='検証用 外構撤去工事';p.title=p.site_name;p.customer_name='サンプル建設株式会社';
p.groups=[{name:'外構撤去工事',item_no:'A',quote_layout_version:1,lines:[],quote_lines:[{...Q.blankQuoteLine(),item_no:'1',label:'ブロック塀上部2段撤去',quantity:'1',unit:'式',quote_price:'100000'}]},
{name:'産業廃棄物運搬費',item_no:'B',quote_layout_version:1,lines:[],quote_lines:[{...Q.blankQuoteLine(),item_no:'1',label:'産業廃棄物運搬費',quantity:'4',unit:'m³',quote_price:'5000'}]},
{name:'産業廃棄物処理工事',item_no:'C',quote_layout_version:1,lines:[],quote_lines:[{...Q.blankQuoteLine(),item_no:'1',label:'コンクリート処分費',quantity:'1',unit:'式',quote_price:'14700'}]}];
let n=A.ensureQuoteCharge(p.groups,'overhead');p.groups=n.groups;A.updateQuoteCharges(p.groups);
n=A.ensureQuoteCharge(p.groups,'discount');p.groups=n.groups;p.groups[n.groupIndex].quote_lines[n.rowIndex].quote_amount='-1435';
const c=Q.calculate(p);p.calculation=c;p.id='11111111-1111-4111-1111-111111111111';p.updated_at='2026-09-24T09:00:00Z';
console.log(JSON.stringify({id:'22222222-2222-4222-8222-222222222222',kind:'estimate',status:'draft',company_id:'fixture-company',site_id:null,site_name:p.site_name,site_address:'検証用住所',customer_name:p.customer_name,customer_address:'',subject:p.title,document_date:'2026-09-24',valid_until:'',tax_rate:10,items:c.quote_items,subtotal:c.price,total:c.total,notes:'検証専用。実際の見積書ではありません。',issuer:{issuer_name:'株式会社TOYA',address:'検証用住所',phone:'000-000-0000'},estimate_plan_id:p.id,estimate_snapshot:p,updated_at:p.updated_at,created_at:p.updated_at}));'''
sample=json.loads(subprocess.check_output(['node','-e',code],cwd=root,text=True))
assert sample['total']==154000,sample['total']
fixture='''<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TOYA One | TOYA社内用</title>
<link rel="stylesheet" href="/docs/project-business.css"><style>body{font:16px sans-serif}button,a{cursor:pointer}.btn{font:inherit;padding:10px;border:0;border-radius:8px}.dark{background:#111;color:white}.light{background:#eee}.lime{background:#b8ff00}input,select,textarea{font:inherit;max-width:100%}</style><body>
<section id="homePage"><div id="siteSummaryCard"></div><div id="estimateDocumentHost"></div></section><section id="masterPage"></section>
<script>let cloudProfile={active:true,role:'admin',id:'fixture-admin',company_id:'fixture-company'};
const calls=[];let shares=[];const cloudClient={from:(table)=>({select(){return this},eq(){return this},order(){return this},range(){return Promise.resolve({data:[],error:null})},update(){calls.push('update');throw Error('unexpected write')},insert(){calls.push('insert');throw Error('unexpected write')}}),rpc:()=>{calls.push('rpc');throw Error('unexpected RPC')}};
window.ToyaCompanyAccess={allows:()=>true};window.ToyaJapaneseInput={bind:()=>{}};function today(){return '2026-09-24'}
window.ToyaEstimatePlanUI={isBusy:()=>false,documentOpened:()=>{},returnToInput:()=>{}};
Object.defineProperty(navigator,'canShare',{value:d=>Array.isArray(d.files),configurable:true});
Object.defineProperty(navigator,'share',{value:async d=>{shares.push({file:d.files[0].name,size:d.files[0].size,type:d.files[0].type,title:d.title,url:d.url||null});},configurable:true});
</script>
<script src="/docs/project-documents-engine.quote5-r3.js"></script><script src="/docs/quote-pdf-export.r1.js"></script><script src="/docs/project-business.pdf-r1.js"></script>
</body></html>'''
(root/'test-output/pdf-harness.html').write_text(fixture)
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start();origin=f'http://127.0.0.1:{server.server_port}'
with sync_playwright() as pw:
 browser=getattr(pw,engine).launch(headless=True)
 context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True)
 remote=[];errors=[];console=[]
 def route(r):
  if r.request.url.startswith(origin+'/') or r.request.url.startswith(('data:','blob:','about:')):r.continue_()
  else:remote.append(r.request.url);r.abort()
 context.route('**/*',route)
 page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda e:console.append(e.text))
 page.goto(origin+'/test-output/pdf-harness.html');page.wait_for_selector('#projectBusinessCard')
 page.evaluate('(d)=>{window.sample=d;window.sampleBefore=JSON.stringify(d);return ToyaProjectBusiness.openEstimate(d);}',sample)
 page.locator('#pbShowPreview').click();page.wait_for_selector('#pbPdf')
 assert page.locator('#pbPrint').inner_text()=='印刷（従来）'
 page.locator('#pbPdf').click()
 try:
  page.wait_for_function("!!document.querySelector('[data-pdf-download][href]') || document.querySelector('.toya-pdf-actions p')?.textContent.includes('PDFを作成できませんでした')",timeout=90000)
  assert page.locator('[data-pdf-download][href]').count(),page.locator('.toya-pdf-actions p').inner_text()
 except Exception:
  diagnostic=page.evaluate("() => ({status:document.querySelector('.toya-pdf-actions p')?.textContent,button:document.querySelector('#pbPdf')?.outerHTML,frames:[...document.querySelectorAll('iframe')].map(f=>({src:f.src,sandbox:f.getAttribute('sandbox'),capture:f.dataset.toyaPdfCapture,pages:[...(f.contentDocument?.querySelectorAll('.te2-page')||[])].map(p=>({width:p.getBoundingClientRect().width,height:p.getBoundingClientRect().height})),images:[...(f.contentDocument?.images||[])].map(i=>({src:i.src,complete:i.complete,width:i.naturalWidth}))}))})")
  diagnostic.update({'browser':engine,'errors':errors,'console':console,'remote':remote})
  (out/'failure.json').write_text(json.dumps(diagnostic,ensure_ascii=False,indent=2));print(json.dumps(diagnostic,ensure_ascii=False),flush=True)
  page.screenshot(path=str(out/'failure.png'))
  raise
 assert page.evaluate('shares.length')==0
 assert page.evaluate('calls.length')==0
 assert page.evaluate('JSON.stringify(sample)===sampleBefore')
 assert page.title()=='TOYA One | TOYA社内用'
 assert page.locator('[data-toya-pdf-capture]').count()==0
 with page.expect_download() as info:page.locator('[data-pdf-download]').click()
 download=info.value;assert download.suggested_filename=='TOYAONE.pdf',download.suggested_filename
 pdfpath=out/'TOYAONE.pdf';download.save_as(str(pdfpath))
 page.locator('[data-pdf-share]').click();page.wait_for_function('shares.length===1')
 shared=page.evaluate('shares[0]');assert shared['file']=='TOYAONE.pdf' and shared['type']=='application/pdf' and shared['title']=='TOYAONE' and shared['url'] is None
 page.locator('.toya-pdf-actions').screenshot(path=str(out/'pdf-actions.png'))
 page.evaluate("Object.defineProperty(navigator,'share',{value:()=>Promise.reject(new DOMException('cancel','AbortError')),configurable:true})")
 page.locator('[data-pdf-share]').click();page.wait_for_function("document.querySelector('.toya-pdf-actions p').textContent.includes('キャンセル')")
 assert page.locator('[data-pdf-download][href]').count()==1
 page.locator('#pbPreviewClose').click();assert page.locator('.toya-pdf-actions').count()==0
 page.locator('#pbShowPreview').click();page.locator('#pbPdf').click();page.locator('#pbPreviewClose').click()
 page.wait_for_function('!document.querySelector("[data-toya-pdf-capture]")',timeout=30000)
 assert page.locator('[data-pdf-download]').count()==0 and page.evaluate('calls.length')==0
 for bad in ['<script>alert(1)</script>','<img src="https://invalid.example/secret.png">']:
  result=page.evaluate("async bad=>{try{await ToyaQuotePDF.build('<html><body><section class=\"te2-page\">'+bad+'</section></body></html>');return false}catch(e){return true}}",bad)
  assert result
 page.locator('#pbShowPreview').click();page.evaluate("cloudProfile.active=false")
 page.locator('#pbPdf').click();page.wait_for_timeout(30);assert page.locator('[data-pdf-download][href]').count()==0
 assert not errors,errors
 assert not remote,remote
 (out/'browser-results.json').write_text(json.dumps({'browser':engine,'result':'passed','pagesExpected':7,'filename':download.suggested_filename,'share':shared,'network':'same-origin static assets only; no real account','writes':page.evaluate('calls'),'errors':errors},ensure_ascii=False,indent=2))
 browser.close()
server.shutdown()
doc=fitz.open(pdfpath);assert len(doc)==7,len(doc)
assert doc.metadata['title']=='TOYAONE',doc.metadata
for i,p in enumerate(doc):
 assert abs(p.rect.width-595.2756)<.1 and abs(p.rect.height-841.8898)<.1
 assert not p.get_links()
 pix=p.get_pixmap(matrix=fitz.Matrix(1.5,1.5),alpha=False);pix.save(str(out/f'page-{i+1}.png'))
 image=Image.frombytes('RGB',[pix.width,pix.height],pix.samples)
 extrema=image.crop((0,image.height-35,image.width,image.height)).getextrema();assert all(lo>248 for lo,hi in extrema),(i,extrema)
 assert len(p.get_images())>=1
print(engine,'passed: 7 real A4 PDF pages, title/file name TOYAONE, no footer, no writes.')
