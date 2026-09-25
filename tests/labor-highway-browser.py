from pathlib import Path
from playwright.sync_api import sync_playwright
import json,re,os
base=Path(os.environ.get('TOYA_TEST_DOCS',str(Path(__file__).resolve().parents[1]/'docs')))
out=Path(os.environ.get('TOYA_TEST_OUT',str(base.parent/'test-output')))/os.environ.get('TOYA_TEST_BROWSER','chromium');out.mkdir(parents=True,exist_ok=True)
html=(base/'index.html').read_text()
stub=r"""
window.__writes=[];window.__reports=[];window.__fixtureProfile=null;window.__mockFail=false;
window.__sites=[{id:'site-a',company_id:'fixture-company',name:'検証現場A',status:'active'},{id:'site-b',company_id:'fixture-company',name:'検証現場B',status:'active'}];
function chain(table){let op='select',body=null,filters=[];const obj=new Proxy(function(){},{get(t,k){if(k==='then')return (a,b)=>{let data=table==='daily_reports'?__reports:table==='sites'?__sites:table==='profiles'&&__fixtureProfile?[__fixtureProfile]:[];data=data.filter(r=>filters.every(([k,v])=>r[k]===v));if(op!=='select'){__writes.push({table,op,body});if(__mockFail)return Promise.resolve({data:null,error:{message:'検証：通信失敗'}}).then(a,b);if(table==='daily_reports'){if(op==='insert'){body={...body,id:'cloud-fixture-'+(__reports.length+1)};__reports.push(body);data=[body];}else if(op==='update'){data=data.map(r=>Object.assign(r,body));}}}return Promise.resolve({data:JSON.parse(JSON.stringify(data)),error:null,count:data.length}).then(a,b);};return (...args)=>{if(['insert','upsert','update','delete'].includes(k)){op=k;body=args[0];}if(k==='eq'||k==='is')filters.push(args);if(k==='single'||k==='maybeSingle')return obj.then(x=>({...x,data:x.data?.[0]||null}));return obj;};}});return obj;}
const noop=()=>{};
window.supabase={createClient:()=>({from:chain,auth:{getSession:async()=>({data:{session:__fixtureProfile?{user:{id:__fixtureProfile.id,email:'fixture@example.invalid'}}:null},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe:noop}}}),signOut:async()=>({error:null})},rpc:async name=>({data:name==='toya_access'?{state:'ready',internal:true,plan:'internal',features:{estimate:true}}:null,error:null}),storage:{from:()=>({list:async()=>({data:[],error:null}),createSignedUrls:async()=>({data:[],error:null})})},channel:()=>({on(){return this},subscribe(){return this},unsubscribe:noop}),removeChannel:noop})};
"""
storage="""(()=>{const s=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>s.get(k)??null,setItem:(k,v)=>s.set(k,String(v)),removeItem:k=>s.delete(k),clear:()=>s.clear(),key:i=>[...s.keys()][i],get length(){return s.size}}});let n=0;if(!crypto.randomUUID)crypto.randomUUID=()=> '00000000-0000-4000-8000-'+String(++n).padStart(12,'0');})();"""
def fixture(old=False):
 def script(m):
  src=m[1];body=stub if src.startswith('https://cdn.jsdelivr.net/') else (base/src.split('?')[0]).read_text()
  if old and src.startswith('usage-hours.highway-r1.js'):body=(base/'usage-hours.js').read_text()
  return '<script>'+body+'</script>'
 h=re.sub(r'<script src="([^"]+)"[^>]*></script>',script,html)
 h=re.sub(r'<link rel="stylesheet" href="([^"]+)"[^>]*>',lambda m:'<style>'+(base/m[1].split('?')[0]).read_text()+'</style>',h)
 h=h.replace('<head>','<head><base href="https://fixture.invalid/"><script>'+storage+'</script>',1)
 return re.sub(r'<link rel="manifest"[^>]*>','',h)
setup="""()=>{window.__fixtureProfile={id:'fixture-user',company_id:'fixture-company',active:true,role:'admin',name:'検証担当'};cloudProfile={...__fixtureProfile};cloudProfilesCache={'fixture-user':cloudProfile};ToyaCompanyAccess.accept({state:'ready',internal:true,plan:'internal',features:{estimate:true}},cloudProfile.id);initializeCompanyDefaults();set(LS.sites,['検証現場A','検証現場B']);renderCompanyPeople();renderSelectors();applyCloudRoleUI();document.dispatchEvent(new Event('toya-role-changed'));}"""
with sync_playwright() as pw:
 engine=os.environ.get('TOYA_TEST_BROWSER','chromium');kw={'headless':True}
 if os.environ.get('TOYA_TEST_EXECUTABLE'):kw['executable_path']=os.environ['TOYA_TEST_EXECUTABLE']
 browser=getattr(pw,engine).launch(**kw);ctx=browser.new_context(viewport={'width':390,'height':844},locale='ja-JP');ctx.route('**/*',lambda r:r.abort())
 baseline=ctx.new_page();old_errors=[];baseline.on('pageerror',lambda e:old_errors.append(str(e)));baseline.set_content(fixture(True));baseline.wait_for_timeout(1200);baseline.close()
 page=ctx.new_page();errors=[];dialogs=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:(dialogs.append(d.message),d.accept()));page.set_default_timeout(10000)
 page.set_content(fixture());page.wait_for_timeout(1200);assert errors==old_errors,(errors,old_errors)
 page.evaluate(setup);page.wait_for_timeout(700)
 sample={'id':1001,'date':'2026-09-25','site':'検証現場A','writer':'検証担当','workers':['検証担当'],'start':'08:00','end':'17:00','details':'作業内容保持','items':[],'siteMoves':[],'fuels':[],'vehicles':[],'machines':[],'usageHours':{'version':1,'baseHours':8,'breakMinutes':120,'entries':[{'kind':'labor','label':'検証担当','quantity':1,'fromReportTime':False,'travelSite':'検証現場A','allocations':[{'site':'検証現場A','minutes':420}]}]}}
 page.evaluate('(d)=>fillReportForm(d,"edit")',sample);page.wait_for_timeout(500)
 checks=[]
 def check(ok,name):
  assert ok,name;checks.append(name);print('ok:',name,flush=True)
 field=page.locator('#uhInline-labor [data-uh-highway]');check(field.count()==1,'one optional toll field beside employee time');check(field.input_value()=='','old absent toll is blank')
 field.fill('1230');page.wait_for_timeout(250);check(field.evaluate('(e)=>e===document.activeElement'),'money typing retains keyboard focus')
 d=page.evaluate('collect()');a=d['usageHours']['entries'][0]['allocations'][0];check(a['highway']=='1230' and a['minutes']==420,'actual collect includes toll without changing time');check(d['details']==sample['details'] and d['items']==[],'not copied into other expense or wage field')
 page.evaluate('saveDraft()');draft=page.evaluate('get(LS.draft,null)');check(draft['usageHours']['entries'][0]['allocations'][0]['highway']=='1230','one-tap draft saves toll')
 page.evaluate('(d)=>fillReportForm(d,"edit")',draft);page.wait_for_timeout(150);check(field.input_value()=='1230','draft/normal edit restores toll')
 check('高速代 1,230円' in page.evaluate('lineText(collect())'),'saved text/LINE/details includes toll')
 # Exercise the unchanged real save/normalization functions against an isolated memory backend.
 saved=page.evaluate('async()=>await cloudSaveReport(collect())');check(saved['verified'],'unchanged save function verifies toll payload with memory backend')
 check(page.evaluate('__reports[0].report_data.usageHours.entries[0].allocations[0].highway')=='1230','saved report JSON has toll exactly once')
 page.evaluate('fillReportForm(cloudNormalizeReport(__reports[0]),"edit")');page.wait_for_timeout(150);check(field.input_value()=='1230','unchanged cloud normalizer and reopen retain toll')
 field.fill('1800');saved2=page.evaluate('async()=>await cloudSaveReport(collect())');check(saved2['updated'] and page.evaluate('__reports.length')==1,'editing toll updates same report, not insert copy')
 page.evaluate('fillReportForm(cloudNormalizeReport(__reports[0]),"edit")');page.evaluate('__mockFail=true');field.fill('2100');result=page.evaluate('async()=>{try{await cloudSaveReport(collect());return "unexpected"}catch(e){return e.message}}');check('通信失敗' in result and field.input_value()=='2100','failed save keeps unsaved toll in form');page.evaluate('__mockFail=false')
 field.fill('1230');page.locator('#uhInline-labor [data-uh-quick="240"]').click();check(field.input_value()=='1230','hour shortcuts do not change toll')
 page.locator('#uhCard>details>summary').click();page.locator('#uhEnable').click(force=True);check(page.locator('#uhEnable').is_checked(),'disable cannot silently remove a paid toll');page.locator('#uhCard details').nth(1).locator('summary').first.click();page.locator('#uhDefault').click();check(field.input_value()=='1230','recalculate standard times retains toll')
 # Explicit time reset also preserves money.
 page.locator('#uhCard details').nth(2).locator('summary').first.click();page.locator('#uhReset').click();check(field.input_value()=='1230','time-only reset does not erase toll')
 page.evaluate('(d)=>fillReportForm({...d,id:1002,cloudId:null},"duplicate")',draft);page.wait_for_timeout(150);check(field.input_value()=='','duplicate daily report does not duplicate paid toll')
 page.evaluate('(d)=>fillReportForm(d,"edit")',sample);field.fill('-2');page.evaluate('validate(collect())');check(any('高速代' in x for x in dialogs),'negative toll is visibly rejected');field.fill('0');check(page.evaluate('collect().usageHours.entries[0].allocations[0].highway')=='0','explicit zero is preserved')
 # Multiple allocations: separate amounts on each site, no copying of tolls.
 multi=json.loads(json.dumps(sample));multi['siteMoves']=[{'site':'検証現場B','start':'13:00','end':'17:00','action':'検証作業'}];multi['usageHours']['entries'][0]['allocations']=[{'site':'検証現場A','minutes':240,'highway':'1000'},{'site':'検証現場B','minutes':180,'highway':'600'}]
 page.evaluate('(d)=>fillReportForm(d,"edit")',multi);page.wait_for_timeout(300);fields=page.locator('#uhInline-labor [data-uh-highway]');check(fields.count()==2 and fields.nth(1).input_value()=='600','site move has independent toll per site')
 check([a['highway'] for a in page.evaluate('collect().usageHours.entries[0].allocations')]==['1000','600'],'multi-site save structure retains two allocations')
 page.evaluate('(d)=>fillReportForm(d,"edit")',sample);field.fill('1230');page.wait_for_timeout(250)
 # Read-only cost calculation uses the same new hours module as the app.
 cost=page.evaluate("""()=>{const reports=[{id:'r',site_id:'site-a',report_date:'2026-09-25',updated_at:'2026-09-25T00:00:00Z',report_data:collect()}];const data={reports,sites:__sites,laborRates:[{code:'self',label:'検証担当',kind:'own',day_rate:8000,active:true}],laborSheets:[],vehicleSheets:[],equipmentSheets:[],vehicleRates:[],equipmentRates:[],dispatchCrews:[],revenues:[]};return ToyaSiteCostSummaryEngine.analyze(data,__sites[0]).categories.labor.value;}""")
 check(cost==8230,'real summary engine sees hourly labor plus toll')
 for width in [320,390,430]:
  page.set_viewport_size({'width':width,'height':844});page.wait_for_timeout(80);check(field.evaluate('(e)=>e.getBoundingClientRect().width>80&&e.getBoundingClientRect().right<=document.documentElement.clientWidth'),'toll input fits mobile width '+str(width))
 page.set_viewport_size({'width':390,'height':844});field.evaluate('(e)=>{e.blur();e.scrollIntoView({block:"center"});}');page.wait_for_timeout(200);page.screenshot(path=str(out/'labor-highway-input.png'))
 for tab in ['homePage','reportPage','recordsPage','attachmentPage','masterPage']:
  page.locator('nav [data-page="'+tab+'"]').click();check(page.locator('#'+tab).evaluate('(e)=>e.classList.contains("active")'),tab+' still switches')
 check(errors==old_errors,'no additional JS runtime errors beyond known baseline')
 check(not page.evaluate('!!window.ToyaGeneralWasteUI'),'unreleased general-waste UI not accidentally deployed')
 (out/'results.json').write_text(json.dumps({'browser':engine,'checks':checks,'known_baseline_errors':old_errors,'new_errors':errors[len(old_errors):],'real_account_writes':0},ensure_ascii=False,indent=2))
 browser.close()
