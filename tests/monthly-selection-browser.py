from pathlib import Path
from playwright.sync_api import sync_playwright
import os,json,re,subprocess
root=Path(__file__).resolve().parents[1];base=root/'docs'
engine=os.environ.get('TOYA_TEST_BROWSER','chromium');out=root/'test-output'/'monthly-selection'/engine;out.mkdir(parents=True,exist_ok=True)
subprocess.run(['node',str(root/'tests/monthly-selection.cjs')],env={**os.environ,'WRITE_FIXTURE':str(out/'fixture.json')},check=True,capture_output=True)
fixture_data=json.loads((out/'fixture.json').read_text());sample=fixture_data['data'];company=fixture_data['company']
tables={'sites':'sites','reports':'daily_reports','laborSheets':'labor_cost_sheets','vehicleSheets':'vehicle_cost_sheets','equipmentSheets':'equipment_cost_sheets','laborRates':'labor_rate_master','dispatchCrews':'dispatch_crew_confirmations','vehicleRates':'vehicle_rate_master','equipmentRates':'equipment_rate_master','transportRates':'equipment_transport_rate_master','toolRates':'small_tool_rate_master','attachmentRates':'attachment_rate_master','contracts':'revenues','profiles':'site_project_profiles','documents':'project_documents'}
db={table:sample[key] for key,table in tables.items()}
stub=r"""
window.__db=DBDATA;window.__writes=[];window.__fixtureProfile=null;window.__mode='ok';window.__delayNext=false;window.__pendingReads=[];
function chain(table){let filters=[],from=0,to=99999,single=false;const obj=new Proxy(function(){},{get(t,k){if(k==='then')return (a,b)=>{
 const run=()=>{if(__mode==='fail'&&table==='site_project_profiles')return {data:null,error:{message:'検証：読込失敗'}};let rows=table==='profiles'?(__fixtureProfile?[__fixtureProfile]:[]):(__db[table]||[]);rows=rows.filter(r=>filters.every(([fn,k,v])=>fn==='eq'||fn==='is'?r[k]===v:fn==='in'?v.includes(r[k]):fn==='gte'?r[k]>=v:fn==='lt'?r[k]<v:true)).slice(from,to+1);return {data:JSON.parse(JSON.stringify(single?rows[0]||null:rows)),error:null,count:rows.length};};
 if(__delayNext&&table==='site_project_profiles'){__delayNext=false;return new Promise(resolve=>__pendingReads.push(()=>resolve(run()))).then(a,b);}return Promise.resolve(run()).then(a,b);};
 return (...args)=>{if(['insert','upsert','update','delete'].includes(k)){__writes.push({table,op:k,body:args[0]});throw Error('Unexpected database write');}if(['eq','is','in','gte','lt'].includes(k))filters.push([k,...args]);if(k==='range')[from,to]=args;if(k==='single'||k==='maybeSingle')single=true;return obj;};}});return obj;}
const noop=()=>{};
window.supabase={createClient:()=>({from:chain,auth:{getSession:async()=>({data:{session:__fixtureProfile?{user:{id:__fixtureProfile.id,email:'fixture@example.invalid'}}:null},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe:noop}}}),signOut:async()=>({error:null})},rpc:async(name,args)=>{if(name==='equipment_transport_catalog_v1')return {data:[],error:null};if(name==='toya_access')return {data:{state:'ready',internal:true,plan:'internal',features:{estimate:true}},error:null};__writes.push({name,args});return {data:null,error:{message:'Unexpected RPC'}};},storage:{from:()=>({list:async()=>({data:[],error:null}),createSignedUrls:async()=>({data:[],error:null})})},channel:()=>({on(){return this},subscribe(){return this},unsubscribe:noop}),removeChannel:noop})};
""".replace('DBDATA',json.dumps(db,ensure_ascii=False))
storage="""(()=>{const s=new Map(SEED);window.__stored=s;window.__storageFail=false;Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>s.get(k)??null,setItem:(k,v)=>{if(__storageFail)throw Error('storage denied');s.set(k,String(v));},removeItem:k=>s.delete(k),clear:()=>s.clear(),key:i=>[...s.keys()][i],get length(){return s.size}}});let n=0;if(!crypto.randomUUID)crypto.randomUUID=()=> '00000000-0000-4000-8000-'+String(++n).padStart(12,'0');})();"""
html=(base/'index.html').read_text()
def fixture(old=False,seed=[]):
 def script(m):
  src=m[1]
  if old and src.startswith('company-monthly-summary.autoselect-'):src='company-monthly-summary.period-r1.js'
  body=stub if src.startswith('https://cdn.jsdelivr.net/') else (base/src.split('?')[0]).read_text()
  return '<script>'+body+'</script>'
 h=re.sub(r'<script src="([^"]+)"[^>]*></script>',script,html)
 h=re.sub(r'<link rel="stylesheet" href="([^"]+)"[^>]*>',lambda m:'<style>'+(base/m[1].split('?')[0]).read_text()+'</style>',h)
 h=h.replace('<head>','<head><base href="https://fixture.invalid/"><script>'+storage.replace('SEED',json.dumps(seed))+'</script>',1)
 return re.sub(r'<link rel="manifest"[^>]*>','',h)
setup="""()=>{window.__fixtureProfile={id:'fixture-user',company_id:COMPANY,active:true,role:'admin',name:'検証担当'};cloudProfile={...__fixtureProfile};cloudProfilesCache={'fixture-user':cloudProfile};ToyaCompanyAccess.accept({state:'ready',internal:true,plan:'internal',features:{estimate:true}},cloudProfile.id);initializeCompanyDefaults();set(LS.sites,__db.sites.map(s=>s.name));renderCompanyPeople();renderSelectors();applyCloudRoleUI();document.dispatchEvent(new Event('toya-role-changed'));}""".replace('COMPANY',json.dumps(company))
with sync_playwright() as pw:
 kw={'headless':True}
 if os.environ.get('TOYA_TEST_EXECUTABLE'):kw['executable_path']=os.environ['TOYA_TEST_EXECUTABLE']
 browser=getattr(pw,engine).launch(**kw);ctx=browser.new_context(viewport={'width':390,'height':844},locale='ja-JP');blocked=[];ctx.route('**/*',lambda r:(blocked.append(r.request.url),r.abort()))
 baseline=ctx.new_page();old_errors=[];baseline.on('pageerror',lambda e:old_errors.append(str(e)));baseline.set_content(fixture(True));baseline.wait_for_timeout(1700);baseline.evaluate(setup);baseline.wait_for_timeout(1500);baseline.close()
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.set_default_timeout(15000);approve=False;dialogs=[]
 def dialog(d):
  dialogs.append(d.message)
  if approve:d.accept()
  else:d.dismiss()
 page.on('dialog',dialog)
 checks=[]
 def check(ok,name):
  assert ok,(name,errors,page.evaluate('__writes'));checks.append(name);print('ok:',name,flush=True)
 def click(selector):page.locator(selector).evaluate('(e)=>{e.scrollIntoView({block:"center"});e.click();}')
 def ready():page.wait_for_function('document.querySelector("#companyMonthlySummary")?.getAttribute("aria-busy")==="false" && document.querySelectorAll("#cmSiteChoices input").length>0')
 def selected():return sorted(page.locator('#cmSiteChoices input:checked').evaluate_all('(es)=>es.map(e=>e.dataset.siteId)'))
 def change(site,value):page.locator('#cmSiteChoices input[data-site-id="'+site+'"]').evaluate('(e,v)=>{e.checked=v;e.dispatchEvent(new Event("change",{bubbles:true}));}',value)
 page.set_content(fixture(seed=[['toya-monthly-excluded:'+company,json.dumps(['a','b','c'])]]));page.wait_for_timeout(1700)
 check(page.locator('#companyMonthlySummary').count()==0,'no monthly data without admin session')
 page.evaluate(setup);ready();check(errors==old_errors,'full app matches baseline errors before operations')
 check(selected()==['a','b','c'],'automatic monthly defaults select working/completed and multi-month sites')
 check(page.locator('#cmProfit').inner_text()=='540,000円','financial engine totals unchanged for selected same facts')
 check(page.locator('#cmSiteChoices input[data-site-id="placeholder"]').count()==0,'placeholder not offered')
 check(not page.locator('#cmSiteChoices input[data-site-id="b02cdda0-80d2-4129-b681-f25eeff5b7ff"]').is_checked(),'company internal work automatically excluded')
 check(page.evaluate('__writes.length')==0,'automatic selection performs no writes')
 click('#cmSiteFilter>summary');change('a',False);check(selected()==['b','c'],'manual uncheck immediately changes selection')
 check(page.locator('#cmProfit').inner_text()=='450,000円','manual uncheck updates totals without altering data')
 key='toya-monthly-selection:v1:'+company+':2026-09'
 saved=json.loads(page.evaluate('(k)=>localStorage.getItem(k)',key));check(saved['overrides']==[['a',False]],'storage saves only touched override, not all default checkbox states')
 click('#cmRefresh');ready();check(selected()==['b','c'],'manual uncheck survives reread')
 change('old',True);check(selected()==['b','c','old'],'manual inclusion works for a different month job')
 check(page.evaluate('__writes.length')==0,'manual checkbox does not write revenue, cost or reports')
 page.locator('#cmMonth').fill('2026-10');page.locator('#cmMonth').dispatch_event('change');ready();check(selected()==['a','c','future'],'different month recalculates auto choices rather than using prior exclusions')
 change('c',False);page.locator('#cmMonth').fill('2026-09');page.locator('#cmMonth').dispatch_event('change');ready();check(selected()==['b','c','old'],'returning month restores its own manual changes')
 page.locator('#cmMonth').fill('2026-10');page.locator('#cmMonth').dispatch_event('change');ready();check(selected()==['a','future'],'second month has independent remembered choices')
 page.locator('#cmMonth').fill('2026-09');page.locator('#cmMonth').dispatch_event('change');ready()
 # Add synthetic new completed site: no financial data is written.
 page.evaluate('(company)=>__db.sites.push({id:"new",company_id:company,name:"新しい完工（検証）",status:"inactive",completed_on:"2026-09-25"})',company)
 click('#cmRefresh');ready();check(selected()==['b','c','new','old'],'new completed site is automatic while prior manual a-off stays')
 click('#cmAutoSelect');check(dialogs and selected()==['b','c','new','old'],'reset cancellation preserves manual choices')
 approve=True;click('#cmAutoSelect');check(selected()==['a','b','c','new'],'one confirmed reset restores month automatic choices');approve=False
 change('a',False);stored=page.evaluate('[...__stored]')
 # Remount whole app with the same browser-local storage, not a cloud write.
 page.close();page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.set_default_timeout(15000);page.on('dialog',dialog);page.set_content(fixture(seed=stored));page.wait_for_timeout(1700);page.evaluate(setup);ready();check(selected()==['b','c'],'manual month override survives full app reopen')
 # Failed reread must not silently display zero or erase choices.
 page.evaluate('__mode="fail"');click('#cmRefresh');page.wait_for_function('document.querySelector("#cmStatus").textContent.includes("集計できません")');check(page.locator('#cmProfit').inner_text()=='—','failed fetch withholds totals')
 check(page.locator('#cmAutoSelect').is_disabled(),'failed fetch disables auto reset rather than saving an empty selection')
 page.evaluate('__mode="ok"');click('#cmRefresh');ready();check(selected()==['b','c'],'recovery retains explicit override')
 page.evaluate('__storageFail=true');change('b',False);check(selected()==['c'] and '保存できません' in page.locator('#companyMonthlySummary #cmStatus').inner_text(),'storage failure keeps in-session choice and shows truthful notice')
 page.evaluate('__storageFail=false');approve=True;click('#cmAutoSelect');approve=False
 page.locator('#cmSiteFilter').evaluate('(e)=>e.open=true')
 for width in [320,390,430]:
  page.set_viewport_size({'width':width,'height':844});check(page.locator('#cmAutoSelect').evaluate('(e)=>e.getBoundingClientRect().width>100&&e.getBoundingClientRect().right<=document.documentElement.clientWidth'),'auto reset button fits '+str(width)+'px')
 page.set_viewport_size({'width':390,'height':844});page.locator('#cmSiteFilter').screenshot(path=str(out/'monthly-auto-selection.png'))
 check(page.evaluate('__writes.length')==0,'whole workflow has zero database/account mutation calls')
 for tab in ['homePage','reportPage','recordsPage','attachmentPage','masterPage']:
  click('nav [data-page="'+tab+'"]');check(page.locator('#'+tab).evaluate('(e)=>e.classList.contains("active")'),tab+' still switches')
 # One extra baseline script error is emitted again on remount, as expected.
 check(errors==old_errors*2,'no new full-app runtime errors after remount and operations')
 page.evaluate('cloudProfile={...cloudProfile,company_id:"another-company"}');page.wait_for_timeout(1400)
 check(page.locator('#cmSiteChoices input').count()==0,'company switch clears prior site checkboxes')
 check(not page.evaluate('!!window.ToyaGeneralWasteUI'),'unreleased waste prototype not loaded')
 (out/'results.json').write_text(json.dumps({'browser':engine,'checks':checks,'baseline_errors':old_errors,'real_account_calls':0,'real_data_writes':0},ensure_ascii=False,indent=2))
 browser.close()
