from pathlib import Path
import json,os
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
engine=os.environ.get('QUOTE_BROWSER','chromium')
assert engine in ('chromium','webkit')
out=root/'test-output'/('issued-source-'+engine);out.mkdir(parents=True,exist_ok=True)
scripts=['estimate-plan-engine.quote5-r1.js','estimate-concrete-engine.js','estimate-auto-builder.quote5-r1.js','project-documents-engine.quote5-r3.js','japanese-input.js']
head=''.join('<script>'+(root/'docs'/n).read_text()+'</script>' for n in scripts)
setup=r'''
let serial=0;if(!crypto.randomUUID)crypto.randomUUID=()=> '00000000-0000-4000-8000-'+String(++serial).padStart(12,'0');
const cloudProfile={active:true,role:'admin',id:'test-user',company_id:'test-company'};
const sample=ToyaEstimatePlan.quoteDraft();Object.assign(sample,{id:'11111111-1111-4111-8111-111111111111',company_id:'test-company',title:'検証用工事A',site_name:'検証用工事A',site_address:'検証用住所',customer_name:'検証用のお客様',updated_at:'2026-09-24T09:00:00.123456+00:00',created_at:'2026-09-23T09:00:00+00:00'});
sample.groups[0].quote_lines=[{...ToyaEstimatePlan.blankQuoteLine(),label:'検証用の撤去',quote_price:'110000'}];sample.calculation=ToyaEstimatePlan.calculate(sample);
const other=structuredClone(sample);other.id='33333333-3333-4333-8333-333333333333';other.title=other.site_name='検証用工事B';other.groups[0].quote_lines[0].quote_price='263000';other.calculation=ToyaEstimatePlan.calculate(other);
const issued={id:'22222222-2222-4222-8222-222222222222',company_id:'test-company',kind:'estimate',status:'issued',document_number:'EST-2026-0001',estimate_plan_id:sample.id,estimate_snapshot:structuredClone(sample),site_id:null,site_name:sample.site_name,subject:sample.title,customer_name:sample.customer_name,document_date:'2026-09-24',subtotal:110000,total:121000,created_at:sample.created_at,updated_at:sample.updated_at};
window.baseline={sample,other,issued};window.tables={sites:[],estimate_plans:[sample,other],project_documents:[issued]};window.calls=[];window.opened=[];
window.ToyaCompanyAccess={allows:()=>true};window.ToyaProjectBusiness={isBusy:()=>false,closeEstimate:()=>true,openEstimate:async d=>{opened.push(d);}};
const cloudClient={from:table=>({select(){return this},eq(){return this},order(){return this},range(a,b){return Promise.resolve({data:structuredClone((tables[table]||[]).slice(a,b+1)),error:null});}}),rpc:async(name,args)=>{calls.push({name,args});throw Error('No network/write allowed in this fixture');}};
'''
css=(root/'docs/project-business.css').read_text()
pagehtml='''<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{font-family:system-ui,sans-serif;margin:0;background:#f2f3f3}main{padding:12px;max-width:900px;margin:auto}.card{background:white;border:1px solid #ddd;border-radius:14px;padding:14px}button,input,textarea,select{font:inherit}input,textarea,select{width:100%;padding:8px}button{min-height:44px}.btn{padding:9px 12px;border:0;border-radius:10px;font-weight:bold}.lime{background:#b8ff00}.light{background:#eee}.danger{background:#fff0f0;color:#bf2000}.note{color:#666;font-size:12px;line-height:1.5}details{padding:8px 0}summary{font-weight:bold;cursor:pointer}[hidden]{display:none!important}</style><style>'''+css+'''</style></head><body><main><section id="homePage"><div id="projectBusinessCard"></div></section><section id="masterPage"></section></main>'''+head+'<script>'+setup+'</script><script>'+(root/'docs/estimate-plan-admin.quote5-r5.js').read_text()+'</script></body></html>'
with sync_playwright() as pw:
 browser=getattr(pw,engine).launch(headless=True,**({'executable_path':os.environ['QUOTE_BROWSER_PATH']} if os.environ.get('QUOTE_BROWSER_PATH') else {}))
 ctx=browser.new_context(viewport={'width':390,'height':844});ctx.route('**/*',lambda r:r.abort())
 p=ctx.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)));p.on('dialog',lambda d:d.dismiss())
 p.set_content(pagehtml);p.wait_for_selector('#epSavedPlans [data-saved-plan-row]',state='attached');p.locator('#epPlannedEstimates').evaluate('(e)=>e.open=true')
 original=p.evaluate('JSON.stringify(tables)');cases=[]
 def check(value,label):
  assert value,label;cases.append(label)
 def reload(mutation=''):
  p.evaluate('''mutation=>{tables=structuredClone({sites:[],estimate_plans:[baseline.sample,baseline.other],project_documents:[baseline.issued]});if(mutation)(new Function(mutation))();}''',mutation)
  p.locator('#epReload').click();p.wait_for_function("document.querySelector('#epStatus').textContent.includes('保存済みの見積を開いて')")
 check(p.locator('#epSavedPlans [data-saved-plan-row]').count()==1,'only unrelated draft in normal source list')
 check('検証用工事B' in p.locator('#epSavedPlans').inner_text(),'unrelated job remains')
 check(p.locator('#epQuoteList [data-ep-quote]').count()==1 and '121,000円' in p.locator('#epQuoteList').inner_text(),'issued document and total remain')
 check(not p.locator('#epIssuedSources').evaluate('(e)=>e.open'),'source is collapsed by default')
 check(p.locator('#epIssuedSources [data-ep-delete-plan]').count()==0,'no unusable delete on protected source')
 p.locator('#epQuoteList [data-ep-quote]').click();check(p.evaluate('opened[0].document_number')=='EST-2026-0001','issued quote still opens')
 p.locator('#epSavedEstimates').screenshot(path=str(out/'saved-estimates.png'))
 p.locator('#epIssuedSources').evaluate('(e)=>e.open=true');p.locator('#epIssuedSources [data-ep-open]').click()
 check(p.locator('#epJobName').input_value()=='検証用工事A' and p.locator('#epQuotePrice0_0').input_value()=='110000','preserved source opens for editing')
 check(p.evaluate('JSON.stringify(tables)')==original and p.evaluate('calls.length')==0,'opening/grouping makes zero business writes')
 # Reload stored rows for each state without mutating the unchanged editor.
 for mutation,label in [
  ("tables.estimate_plans[0].updated_at='2026-09-24T10:00:00+00:00'",'later source version stays visible'),
  ("tables.estimate_plans[0].groups[0].quote_lines[0].label='修正した品名'",'same total but changed detail stays visible'),
  ("tables.estimate_plans[0].internal_notes='新しい社内メモ'",'changed source notes stay visible'),
  ("delete tables.project_documents[0].estimate_snapshot",'missing snapshot stays visible'),
  ("tables.project_documents[0].status='draft'",'draft document does not hide source'),
  ("tables.project_documents[0].status='void'",'void document does not hide source'),
  ("tables.project_documents[0].estimate_plan_id='other-source'",'same title with different linkage stays visible'),
  ("tables.project_documents[0].company_id='different-company'",'other company document cannot collapse source'),
  ("tables.project_documents[0].total=122000",'different document amount stays visible'),
  ("delete tables.project_documents[0].document_number",'missing issued number stays visible')
 ]:
  reload(mutation);check(p.locator('#epSavedPlans [data-saved-plan-row]').count()==2,label)
 reload();check(p.locator('#epSavedPlans [data-saved-plan-row]').count()==1,'reload regroups exact issued source')
 # Legacy timestamps can use Z rather than +00:00; content remains fully compared.
 reload("tables.project_documents[0].estimate_snapshot.updated_at='2026-09-24T09:00:00.123456Z'")
 check(p.locator('#epSavedPlans [data-saved-plan-row]').count()==1,'equivalent timestamp formatting matches')
 p.locator('#epIssuedSources').evaluate('(e)=>e.open=false')
 for width in (320,390,430):
  p.set_viewport_size({'width':width,'height':844});check(p.locator('#epQuoteList [data-ep-quote]').is_visible(),'issued row visible at '+str(width)+'px')
 p.locator('#epSavedPlans [data-ep-delete-plan]').click();check(p.evaluate('calls.length')==0,'cancel unrelated deletion makes zero write')
 check(not errors,'no page runtime errors')
 (out/'results.json').write_text(json.dumps({'browser':engine,'checks':cases,'count':len(cases),'errors':errors,'rpcCalls':p.evaluate('calls'),'result':'passed','scope':'offline synthetic quotation-list test, no live account or PDF change'},ensure_ascii=False,indent=2))
 browser.close()
print(engine,len(cases),'checks passed')
