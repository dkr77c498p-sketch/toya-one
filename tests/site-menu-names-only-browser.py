"""Full app, synthetic in-memory backend; all network blocked. No customer writes."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os, re
root = Path(__file__).resolve().parents[1]
docs = root / 'docs'
engine = os.environ.get('TOYA_TEST_BROWSER', 'chromium')
out = root / 'test-output' / 'site-menu' / engine
out.mkdir(parents=True, exist_ok=True)
stub = r'''
window.__user=null;window.__writes=[];window.__failSites=false;
window.__sites=[{id:'a',company_id:'fixture',name:'検証現場A',status:'active'},{id:'b',company_id:'fixture',name:'検証現場B',status:'active'},{id:'c',company_id:'fixture',name:'検証完工現場',status:'inactive',completed_on:'2026-09-01'}];
function chain(table){let filters=[],single=false,from=0,to=99999;const obj=new Proxy(function(){},{get(t,k){if(k==='then')return (a,b)=>{if(table==='sites'&&__failSites)return Promise.resolve({data:null,error:{message:'検証読込失敗'}}).then(a,b);let data=table==='sites'?__sites:table==='profiles'&&__user?[__user]:[];data=data.filter(r=>filters.every(([k,v])=>r[k]===v)).slice(from,to+1);return Promise.resolve({data:JSON.parse(JSON.stringify(single?(data[0]||null):data)),error:null,count:data.length}).then(a,b);};return (...args)=>{if(['insert','upsert','update','delete'].includes(k)){__writes.push({table,op:k});throw Error('Unexpected write');}if(k==='eq')filters.push(args);if(k==='range')[from,to]=args;if(k==='single'||k==='maybeSingle')single=true;return obj;};}});return obj;}
const noop=()=>{};
window.supabase={createClient:()=>({from:chain,auth:{getSession:async()=>({data:{session:__user?{user:{id:__user.id,email:'fixture@example.invalid'}}:null},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe:noop}}}),signOut:async()=>({error:null})},rpc:async(name,args)=>{if(name==='toya_access')return {data:{state:'ready',internal:true,plan:'internal',features:{estimate:true}},error:null};if(name.startsWith('toya_register')||name.startsWith('toya_save')){__writes.push({name,args});throw Error('Unexpected RPC write');}return {data:null,error:null};},storage:{from:()=>({list:async()=>({data:[],error:null}),createSignedUrls:async()=>({data:[],error:null})})},channel:()=>({on(){return this},subscribe(){return this},unsubscribe:noop}),removeChannel:noop})};
'''
storage = '''(()=>{const s=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>s.get(k)??null,setItem:(k,v)=>s.set(k,String(v)),removeItem:k=>s.delete(k),clear:()=>s.clear(),key:i=>[...s.keys()][i],get length(){return s.size}}});let n=0;if(!crypto.randomUUID)crypto.randomUUID=()=> '00000000-0000-4000-8000-'+String(++n).padStart(12,'0');})();'''
html = (docs / 'index.html').read_text()
def fixture(old=False):
    def script(m):
        src=m[1].split('?')[0]
        if old and src=='shared-site-master.names-only-r1.js': src='shared-site-master.js'
        body=stub if src.startswith('https://cdn.jsdelivr.net/') else (docs/src).read_text()
        return '<script>'+body+'</script>'
    h=re.sub(r'<script src="([^"]+)"[^>]*></script>',script,html)
    h=re.sub(r'<link rel="stylesheet" href="([^"]+)"[^>]*>',lambda m:'<style>'+(docs/m[1].split('?')[0]).read_text()+'</style>',h)
    h=h.replace('<head>','<head><base href="https://fixture.invalid/"><script>'+storage+'</script>',1)
    return re.sub(r'<link rel="manifest"[^>]*>','',h)
setup='''()=>{window.__user={id:'fixture-user',company_id:'fixture',active:true,role:'admin',name:'検証担当'};cloudProfile={...__user};cloudProfilesCache={'fixture-user':cloudProfile};ToyaCompanyAccess.accept({state:'ready',internal:true,plan:'internal',features:{estimate:true}},cloudProfile.id);initializeCompanyDefaults();set(LS.sites,['検証現場A','検証現場B']);renderCompanyPeople();renderSelectors();document.querySelector('#site').value='検証現場B';applyCloudRoleUI();document.dispatchEvent(new Event('toya-role-changed'));}'''
with sync_playwright() as pw:
    launch={'headless':True}
    if os.environ.get('TOYA_TEST_EXECUTABLE'):launch['executable_path']=os.environ['TOYA_TEST_EXECUTABLE']
    browser=getattr(pw,engine).launch(**launch)
    ctx=browser.new_context(viewport={'width':390,'height':844},locale='ja-JP')
    ctx.route('**/*',lambda r:r.abort())
    old_errors=[]
    baseline=ctx.new_page();baseline.on('pageerror',lambda e:old_errors.append(str(e)))
    baseline.set_content(fixture(True));baseline.wait_for_timeout(1700);baseline.evaluate(setup);baseline.wait_for_timeout(1500)
    assert baseline.locator('#site option[value=""]').count()==1
    baseline.close()
    page=ctx.new_page();errors=[];dialogs=[];checks=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('dialog',lambda d:(dialogs.append(d.message),d.accept()))
    page.set_default_timeout(10000)
    def check(ok,name):
        assert ok,(name,errors);checks.append(name);print('ok:',name,flush=True)
    def click(selector):page.locator(selector).evaluate('(e)=>{e.scrollIntoView({block:"center"});e.click();}')
    def wait():page.wait_for_timeout(250)
    def options():return page.locator('#site option').evaluate_all('(os)=>os.map(o=>({value:o.value,text:o.textContent}))')
    page.set_content(fixture());page.wait_for_timeout(1700);page.evaluate(setup)
    page.wait_for_function('window.ToyaSharedSiteUI?.ready()&&document.querySelectorAll("#site option").length===2');wait()
    check(errors==old_errors,'no new full-app runtime error')
    check([o['text'] for o in options()]==['検証現場A','検証現場B'],'main site menu contains only real names')
    check(page.locator('#site').input_value()=='検証現場B','existing chosen site is preserved')
    click('#ssRefresh');wait();check(page.locator('#site').input_value()=='検証現場B','catalog refresh preserves selected site')
    page.evaluate('renderSelectors()');wait();check(page.locator('#site option[value=""]').count()==0,'full selector rerender does not restore prompt')
    check(page.locator('#site').input_value()=='検証現場B','full selector rerender does not switch job')
    sample={'id':1,'date':'2026-09-26','site':'','writer':'検証担当','workers':[],'workTypes':[],'start':'08:00','end':'17:00','details':'入力内容を保持','items':[],'fuels':[],'siteMoves':[],'attachments':[]}
    page.evaluate('(d)=>fillReportForm(d,"edit")',sample);wait()
    check(page.locator('#site').input_value()=='' and page.locator('#site').evaluate('(s)=>s.selectedIndex')==-1,'blank form stays unselected without synthetic option')
    page.evaluate('renderSelectors()');wait();check(page.locator('#site').input_value()=='','rerender does not replace blank with first site')
    check(page.evaluate('validate(collect())') is False and any('現場名' in x for x in dialogs),'existing save validation rejects unselected site')
    check(page.evaluate('__writes.length')==0,'blank validation makes no database write')
    page.locator('#site').select_option('検証現場A');page.locator('#writer').focus();wait()
    check(page.evaluate('collect().site')=='検証現場A','first real site remains selectable')
    check(page.evaluate('collect().details')=='入力内容を保持','site menu does not touch report text')
    page.evaluate('saveDraft()');check(page.evaluate('get(LS.draft,null).site')=='検証現場A','existing local draft keeps chosen site')
    page.evaluate('fillReportForm(get(LS.draft,null),"edit")');wait();check(page.locator('#site').input_value()=='検証現場A','restored draft keeps site')
    sample['site']='検証完工現場';page.evaluate('(d)=>fillReportForm(d,"edit")',sample);wait()
    check(page.locator('#site').input_value()=='検証完工現場','past report retains its completed site')
    check(page.locator('#site option[value=""]').count()==0,'completed report has no prompt option either')
    sample['site']='検証現場B';page.evaluate('(d)=>fillReportForm(d,"duplicate")',sample);wait()
    check(page.locator('#site').input_value()=='検証現場B','duplicate workflow retains explicit site')
    page.evaluate('document.querySelector("#site").value="";__sites=[]');click('#ssRefresh');wait()
    check(options()==[] and page.locator('#site').input_value()=='','empty catalog stays empty rather than inventing a site')
    page.evaluate('__sites=[{id:"a",company_id:"fixture",name:"検証現場A",status:"active"},{id:"b",company_id:"fixture",name:"検証現場B",status:"active"}]');click('#ssRefresh');wait()
    check(page.locator('#site').input_value()=='','catalog becoming populated still requires deliberate choice')
    page.locator('#site').select_option('検証現場B');page.locator('#writer').focus();page.evaluate('__failSites=true');click('#ssRefresh');wait()
    check(page.locator('#site').input_value()=='検証現場B','failed fetch leaves current selection intact');page.evaluate('__failSites=false')
    page.evaluate('addSiteMoveRow({site:"検証現場A"})') if page.evaluate('typeof addSiteMoveRow==="function"') else None
    for key in ['recordSiteFilter','siteSummarySelect']:
        check(page.locator('#'+key+' option[value=""]').count()==1,key+' empty/all-sites behavior remains unchanged')
    page.evaluate('cloudProfile={...cloudProfile,role:"employee"};__user={...cloudProfile}');click('nav [data-page="reportPage"]');wait()
    check(page.locator('#site option[value=""]').count()==0 and page.locator('#site').input_value()=='検証現場B','employee role receives same menu without changing selection')
    for width in [320,390,430]:
        page.set_viewport_size({'width':width,'height':844});check(page.locator('#site').evaluate('(e)=>e.getBoundingClientRect().width>80'),'site control still usable at '+str(width)+'px')
    page.set_viewport_size({'width':390,'height':844});page.locator('#site').evaluate('(e)=>{e.blur();e.scrollIntoView({block:"center"});}');wait();page.screenshot(path=str(out/'site-menu.png'))
    check(errors==old_errors,'no new errors after all operations')
    check(page.evaluate('__writes.length')==0,'all tests made zero real or mocked business writes')
    (out/'results.json').write_text(json.dumps({'browser':engine,'checks':checks,'new_errors':errors[len(old_errors):],'known_baseline_errors':old_errors,'real_account_calls':0},ensure_ascii=False,indent=2))
    browser.close()
