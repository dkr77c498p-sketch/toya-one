from pathlib import Path
from playwright.sync_api import sync_playwright
import os,json,re,subprocess
repo=Path(__file__).resolve().parents[1];base=repo/'docs'
engine=os.environ.get('TOYA_TEST_BROWSER','chromium');out=repo/'test-output'/'site-period'/engine;out.mkdir(parents=True,exist_ok=True)
subprocess.run(['node',str(repo/'tests/site-period-ledger.cjs')],env={**os.environ,'WRITE_FIXTURE':str(out/'fixture.json')},check=True,capture_output=True)
sample=json.loads((out/'fixture.json').read_text());tables={x[0]:x[1] for x in [['sites','sites'],['reports','daily_reports'],['laborSheets','labor_cost_sheets'],['vehicleSheets','vehicle_cost_sheets'],['equipmentSheets','equipment_cost_sheets'],['laborRates','labor_rate_master'],['dispatchCrews','dispatch_crew_confirmations'],['vehicleRates','vehicle_rate_master'],['equipmentRates','equipment_rate_master'],['transportRates','equipment_transport_rate_master'],['toolRates','small_tool_rate_master'],['attachmentRates','attachment_rate_master'],['revenues','revenues'],['profiles','site_project_profiles'],['documents','project_documents']]}
# Use a completed three-month fixture before the real current month. No real accounts.
sample=json.loads(re.sub(r'2026-(08|09|10)',lambda m:{'08':'2026-06','09':'2026-07','10':'2026-08'}[m[1]],json.dumps(sample)))
db={table:sample[key] for key,table in tables.items()}
stub=r"""
window.__db=DBDATA;window.__writes=[];window.__fixtureProfile=null;window.__mode='ok';window.__delayNext=false;window.__pendingReads=[];
function chain(table){let filters=[],from=0,to=99999,single=false;const obj=new Proxy(function(){},{get(t,k){if(k==='then')return (a,b)=>{
 const run=()=>{if(__mode==='fail'&&table==='site_project_profiles')return {data:null,error:{message:'検証：読込失敗'}};let rows=table==='profiles'?(__fixtureProfile?[__fixtureProfile]:[]):(__db[table]||[]);rows=rows.filter(r=>filters.every(([fn,k,v])=>fn==='eq'||fn==='is'?r[k]===v:fn==='in'?v.includes(r[k]):fn==='gte'?r[k]>=v:fn==='lt'?r[k]<v:true)).slice(from,to+1);return {data:JSON.parse(JSON.stringify(single?rows[0]||null:rows)),error:null,count:rows.length};};
 if(__delayNext&&table==='site_project_profiles'){__delayNext=false;return new Promise(resolve=>__pendingReads.push(()=>resolve(run()))).then(a,b);}return Promise.resolve(run()).then(a,b);};
 return (...args)=>{if(['insert','upsert','update','delete'].includes(k)){__writes.push({table,op:k,body:args[0]});throw Error('Unexpected direct write in fixture');}if(['eq','is','in','gte','lt'].includes(k))filters.push([k,...args]);if(k==='range')[from,to]=args;if(k==='single'||k==='maybeSingle')single=true;return obj;};}});return obj;}
const noop=()=>{};
const client={from:chain,auth:{getSession:async()=>({data:{session:__fixtureProfile?{user:{id:__fixtureProfile.id,email:'fixture@example.invalid'}}:null},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe:noop}}}),signOut:async()=>({error:null})},rpc:async(name,args)=>{
 if(name==='toya_access')return {data:{state:'ready',internal:true,plan:'internal',features:{estimate:true}},error:null};
 if(name!=='toya_save_site_project_profile')return {data:null,error:null};
 __writes.push({name,args:JSON.parse(JSON.stringify(args))});
 if(__mode==='conflict')return {data:null,error:{message:'現場内容が更新されています。読み直してください。'}};
 const old=__db.site_project_profiles.find(p=>p.site_id===args.p_site_id),contract=__db.revenues.find(p=>p.site_id===args.p_site_id);
 if(args.p_expected_updated_at!==(old?.updated_at||null)||args.p_expected_contract_updated_at!==(contract?.updated_at||null))return {data:null,error:{message:'version mismatch'}};
 const profile={...args.p_profile,company_id:'fixture-company',site_id:args.p_site_id,updated_at:'2026-09-25T08:00:00.123Z'};
 const savedContract={...contract,company_id:'fixture-company',amount:args.p_contract_amount,site_id:args.p_site_id,updated_at:profile.updated_at};
 __db.site_project_profiles=__db.site_project_profiles.filter(p=>p.site_id!==args.p_site_id).concat(profile);__db.revenues=__db.revenues.filter(p=>p.site_id!==args.p_site_id).concat(savedContract);
 return {data:{profile,contract:savedContract},error:null};
 },storage:{from:()=>({list:async()=>({data:[],error:null}),createSignedUrls:async()=>({data:[],error:null})})},channel:()=>({on(){return this},subscribe(){return this},unsubscribe:noop}),removeChannel:noop};
window.supabase={createClient:()=>client};
""".replace('DBDATA',json.dumps(db,ensure_ascii=False))
storage="""(()=>{const s=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>s.get(k)??null,setItem:(k,v)=>s.set(k,String(v)),removeItem:k=>s.delete(k),clear:()=>s.clear(),key:i=>[...s.keys()][i],get length(){return s.size}}});let n=0;if(!crypto.randomUUID)crypto.randomUUID=()=> '00000000-0000-4000-8000-'+String(++n).padStart(12,'0');})();"""
html=(base/'index.html').read_text()
def fixture(old=False):
 def script(m):
  src=m[1]
  if old and src.startswith('site-period-'):return ''
  if old and src.startswith('company-monthly-summary.period-'):src='company-monthly-summary.js'
  body=stub if src.startswith('https://cdn.jsdelivr.net/') else (base/src.split('?')[0]).read_text()
  return '<script>'+body+'</script>'
 h=re.sub(r'<script src="([^"]+)"[^>]*></script>',script,html)
 h=re.sub(r'<link rel="stylesheet" href="([^"]+)"[^>]*>',lambda m:'<style>'+(base/m[1].split('?')[0]).read_text()+'</style>',h)
 h=h.replace('<head>','<head><base href="https://fixture.invalid/"><script>'+storage+'</script>',1)
 return re.sub(r'<link rel="manifest"[^>]*>','',h)
setup="""()=>{window.__fixtureProfile={id:'fixture-user',company_id:'fixture-company',active:true,role:'admin',name:'検証担当'};cloudProfile={...__fixtureProfile};cloudProfilesCache={'fixture-user':cloudProfile};ToyaCompanyAccess.accept({state:'ready',internal:true,plan:'internal',features:{estimate:true}},cloudProfile.id);initializeCompanyDefaults();set(LS.sites,['検証現場（架空）']);renderCompanyPeople();renderSelectors();applyCloudRoleUI();document.dispatchEvent(new Event('toya-role-changed'));}"""
with sync_playwright() as pw:
 kw={'headless':True}
 if os.environ.get('TOYA_TEST_EXECUTABLE'):kw['executable_path']=os.environ['TOYA_TEST_EXECUTABLE']
 browser=getattr(pw,engine).launch(**kw);ctx=browser.new_context(viewport={'width':390,'height':844},locale='ja-JP');blocked=[];ctx.route('**/*',lambda r:(blocked.append(r.request.url),r.abort()))
 baseline=ctx.new_page();old_errors=[];baseline.on('pageerror',lambda e:old_errors.append(str(e)));baseline.set_content(fixture(True));baseline.wait_for_timeout(1700);baseline.evaluate(setup);baseline.wait_for_timeout(1500);baseline.close()
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.set_default_timeout(15000);page.on('dialog',lambda d:d.dismiss())
 checks=[]
 def check(ok,name):
  assert ok,(name,errors);checks.append(name);print('ok:',name,flush=True)
 def click(selector):page.locator(selector).evaluate('(e)=>{e.scrollIntoView({block:"center"});e.click();}')
 page.set_content(fixture());page.wait_for_timeout(1700);check(page.locator('#sitePeriodLedger').count()==0,'no data panel without admin session');page.evaluate(setup);page.wait_for_timeout(1500)
 check(errors==old_errors,'full app introduces no new baseline runtime error')
 page.evaluate('ToyaSitePeriodUI.open({siteId:"fixture-site"})');page.wait_for_function('document.querySelectorAll(".sl-month").length===3')
 check(page.locator('.sl-month').count()==3,'one selected site shows all three months')
 check('3,300,000円' in page.locator('#slResult').inner_text(),'month view shows three-month cumulative revenue')
 check(page.evaluate('__writes.length')==0,'opening and switching calculations never save data')
 click('#slAll');check('2,400,000円' in page.locator('#slResult').inner_text() and '900,000円' in page.locator('#slResult').inner_text(),'lifetime view uses corresponding total costs and margin')
 for width in [320,390,430]:
  page.set_viewport_size({'width':width,'height':844});check(page.locator('#sitePeriodLedger .sl-body').evaluate('(e)=>e.scrollWidth<=e.clientWidth+2'),'panel fits '+str(width)+'px mobile width')
 page.set_viewport_size({'width':390,'height':844});click('#slEditOpen');check(page.locator('[data-sl-row]').count()==3,'editor preserves all existing monthly rows')
 click('#slAddExtra');last=page.locator('[data-sl-row]').last;last.locator('[data-sl-key="target_month"]').fill('2026-07');last.locator('[data-sl-key="amount"]').fill('100');last.locator('[data-sl-key="label"]').fill('追加工事／追加入力');check(last.locator('[data-sl-key="label"]').evaluate('(e)=>e===document.activeElement'),'typing preserves keyboard focus')
 click('#slSave');check('超え' in page.locator('#slEditStatus').inner_text() and page.evaluate('__writes.length')==0,'addition cannot silently replace or exceed original order total')
 page.locator('#slContract').fill('3300100');click('#slSave');check(page.locator('.sl-confirm').count()==1 and page.evaluate('__writes.length')==0,'explicit review dialog precedes the only write')
 click('[data-sl-cancel]');check(page.locator('[data-sl-row]').count()==4 and page.evaluate('__writes.length')==0,'cancelling review keeps unsaved inputs without writes')
 click('#slSave');click('[data-sl-approve]');page.wait_for_function('document.querySelector("#slStatus").textContent.startsWith("保存しました")')
 check(page.evaluate('__writes.length')==1,'one approved save uses one existing RPC')
 saved=page.evaluate('__writes[0].args');check(saved['p_profile']['floor_area_sqm']==111.5 and saved['p_profile']['scope_notes']=='既存の施工条件を保持','save preserves existing building and scope fields')
 check(len(saved['p_profile']['contract_breakdown'])==4 and saved['p_profile']['contract_breakdown'][1]['amount']==1500000,'same-month addition does not overwrite previous month row')
 check(saved['p_profile']['contract_breakdown'][0]['extraLegacy']=='preserve','existing phase metadata preserved')
 check(saved['p_expected_updated_at'] and saved['p_expected_contract_updated_at'],'both profile and contract concurrency versions included')
 click('#slMonths');check('1,500,100円' in page.locator('#slResult').inner_text(),'saved split month is displayed as the sum exactly once')
 # Existing home entry routes to the new split-safe editor; old bulk writer never executes.
 click('#cmProgressOpen');page.wait_for_timeout(250);check(page.locator('#cmProgressSave').count()==0 and page.locator('#slEditor [data-sl-row]').count()==4,'home monthly entry uses same split-safe editor')
 page.evaluate('__mode="conflict"');page.locator('#slContract').fill('3300200');click('#slSave');click('[data-sl-approve]');page.wait_for_function('document.querySelector("#slEditStatus").textContent.includes("更新されています")')
 check(page.locator('#slContract').input_value()=='3300200','conflict does not erase unsaved input')
 check(page.evaluate('__db.revenues[0].amount')==3300100,'conflict does not alter stored contract amount')
 click('#slEditClose');check(page.locator('.sl-confirm').count()==1,'closing unsaved editor requires confirmation');click('[data-sl-approve]');page.evaluate('__mode="fail"');click('#slRefresh');page.wait_for_function('document.querySelector("#slStatus").textContent.includes("読込失敗")')
 check(page.locator('#slResult').inner_text()=='','failed load clears stale totals rather than showing zero')
 page.evaluate('__mode="ok"');click('#slRefresh');page.wait_for_function('document.querySelectorAll(".sl-month").length===3')
 click('#slAll');page.locator('#slSite').evaluate('(e)=>{e.blur();e.scrollIntoView({block:"center"});}');page.wait_for_timeout(150)
 # Screenshot is a real test DOM; this is not a physical iPhone or real company account.
 page.locator('#slOpen').screenshot(path=str(out/'site-all.png'))
 click('#slMonths');page.locator('#slOpen').screenshot(path=str(out/'site-months.png'))
 before=page.evaluate('JSON.stringify(__db.daily_reports)');click('#slEditOpen');check(page.evaluate('JSON.stringify(__db.daily_reports)')==before,'sales editing never changes daily reports')
 for tab in ['homePage','reportPage','recordsPage','attachmentPage','masterPage']:
  click('nav [data-page="'+tab+'"]');check(page.locator('#'+tab).evaluate('(e)=>e.classList.contains("active")'),tab+' still switches')
 page.evaluate('cloudProfile={...cloudProfile,company_id:"another-company"}');page.wait_for_timeout(1200)
 check('検証現場（架空）' not in page.locator('#sitePeriodLedger').inner_text(),'changing company clears previous financial data and inputs')
 check(errors==old_errors,'no new full-app runtime errors after operations')
 check(not page.evaluate('!!window.ToyaGeneralWasteUI'),'unreleased waste prototype is not loaded')
 check(page.evaluate('__writes.filter(x=>x.table).length')==0,'no direct table writes')
 (out/'results.json').write_text(json.dumps({'browser':engine,'checks':checks,'known_baseline_errors':old_errors,'new_errors':errors[len(old_errors):],'real_account_calls':0},ensure_ascii=False,indent=2))
 browser.close()
