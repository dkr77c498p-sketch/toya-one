from pathlib import Path
from playwright.sync_api import sync_playwright
import json,re,os
stage=Path(__file__).resolve().parent;repo=stage.parents[1];base=Path(os.environ.get('GW_BASE_DOCS',str(repo/'docs')));out=repo/'stage-results'/('general-waste-'+os.environ.get('GW_BROWSER','chromium'));out.mkdir(parents=True,exist_ok=True)
html=(base/'index.html').read_text()
# The baseline itself is not edited. Additional scripts are installed in this in-memory fixture only.
monthly=(stage/'general-waste-monthly.cjs').read_text();monthly='(function(){const module={exports:{}};'+monthly+';window.__monthly=module.exports;})();'
bridge=(stage/'general-waste-daily-bridge.js').read_text();ui=(stage/'general-waste-ui.js').read_text()
profile=json.loads((stage/'report-profile.json').read_text());profile.update(companyId='test-company',companyName='株式会社TOYA（検証用）',permitNumber='636',reportContactPhone='099-801-3027')
setup='''
window.__fixtureProfile={id:'test-user',companyId:'test-company',active:true,role:'admin',name:'検証担当'};
window.__fixtureRows=[];window.__fixtureMode='ok';
window.__setMockProfile=()=>{cloudProfile=window.__fixtureProfile?{...__fixtureProfile,company_id:__fixtureProfile.companyId}:null;
 if(cloudProfile)ToyaCompanyAccess.accept({state:'ready',internal:true,plan:'internal',features:{estimate:true}},cloudProfile.id);
 applyCloudRoleUI();document.dispatchEvent(new Event('toya-role-changed'));};
window.__installGeneralWaste=()=>{__setMockProfile();window.__gwUI=ToyaGeneralWasteUI.mount({host:window,bridge:ToyaGeneralWasteDaily,monthly:__monthly,getProfile:()=>window.__fixtureProfile,reportProfile:PROFILE,today:()=> '2026-09-24',loadReports:async()=>{if(__fixtureMode==='fail')throw Error('テスト用の読込失敗');if(__fixtureMode==='partial')return {rows:__fixtureRows,complete:false};if(__fixtureMode==='delay')return await new Promise(r=>window.__resolveLoad=r);return {rows:__fixtureRows,complete:true};}});};
'''.replace('PROFILE',json.dumps(profile,ensure_ascii=False))
# Prevent any real account calls. A generic empty Supabase-shaped stub is used by the unmodified legacy code.
stub="""
window.__mockWrites=[];
const noop=()=>{};
function chain(table){let op='select';const obj=new Proxy(function(){},{get(t,k){if(k==='then')return (a,b)=>Promise.resolve({data:[],error:null,count:0}).then(a,b);return (...args)=>{if(['insert','upsert','update','delete'].includes(k)){window.__mockWrites.push({table,op:k});op=k;}if(k==='maybeSingle'||k==='single')return Promise.resolve({data:table==='profiles'&&window.__fixtureProfile?{...__fixtureProfile,company_id:__fixtureProfile.companyId}:null,error:null});return obj;};}});return obj;}
window.supabase={createClient:()=>({from:chain,auth:{getSession:async()=>({data:{session:window.__fixtureProfile?{user:{id:__fixtureProfile.id,email:'fixture@example.invalid'}}:null},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe:noop}}}),signOut:async()=>({error:null})},rpc:async(name)=>({data:name==='toya_access'?{state:'ready',internal:true,plan:'internal',features:{estimate:true}}:null,error:null}),storage:{from:()=>({list:async()=>({data:[],error:null}),createSignedUrls:async()=>({data:[],error:null})})},channel:()=>({on(){return this},subscribe(){return this},unsubscribe:noop}),removeChannel:noop})};
"""
with sync_playwright() as pw:
 engine=os.environ.get('GW_BROWSER','chromium');launch={'headless':True};
 if os.environ.get('GW_BROWSER_EXECUTABLE'):launch['executable_path']=os.environ['GW_BROWSER_EXECUTABLE']
 browser=getattr(pw,engine).launch(**launch)
 context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,locale='ja-JP');errors=[];requests=[]
 def route(rt):
  requests.append(rt.request.url);rt.abort()
 context.route('**/*',route);page=context.new_page();page.set_default_timeout(10000);page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
 # Offline fixture uses about:blank; no URL navigation or external resources.
 storage="""(()=>{const store=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),clear:()=>store.clear(),key:i=>[...store.keys()][i],get length(){return store.size}}});let serial=0;if(!crypto.randomUUID)crypto.randomUUID=()=> '00000000-0000-4000-8000-'+String(++serial).padStart(12,'0');})();"""
 def inline_script(m):
  src=m[1]
  body=stub if src.startswith('https://cdn.jsdelivr.net/') else (base/src.split('?')[0]).read_text()
  return '<script>'+body+'</script>'
 fixture=re.sub(r'<script src="([^"]+)"[^>]*></script>',inline_script,html)
 fixture=re.sub(r'<link rel="stylesheet" href="([^"]+)"[^>]*>',lambda m:'<style>'+(base/m[1].split('?')[0]).read_text()+'</style>',fixture)
 fixture=fixture.replace('<head>','<head><script>'+storage+'</script>',1)
 fixture=re.sub(r'<link rel="manifest"[^>]*>','',fixture)
 page.set_content(fixture);page.wait_for_timeout(3200)
 before=list(errors);checks=[]
 def check(value,name):
  assert value,name
  checks.append(name);print('ok:',name,flush=True)
 check(len(before)==1 and ('class' in before[0] or 'Unexpected' in before[0]), 'known baseline syntax error recorded, not fixed by this work')
 page.add_script_tag(content=monthly);page.add_script_tag(content=bridge);page.add_script_tag(content=ui);page.add_script_tag(content=setup)
 page.evaluate('__installGeneralWaste()');page.wait_for_timeout(700)
 for tab in ['homePage','reportPage','recordsPage','attachmentPage','masterPage']:
  page.locator('nav [data-page="'+tab+'"]').click();check(page.locator('#'+tab).evaluate('(e)=>e.classList.contains("active")'),tab+' still opens')
 ordinary={'id':1,'date':'2026-09-24','site':'検証用の現場','writer':'検証担当','details':'既存の作業本文','items':[],'siteMoves':[],'photos':[]}
 page.evaluate('(d)=>fillReportForm(d,"edit")',ordinary)
 page.locator('#gwAdd').click();row=page.locator('[data-gw-id]').last
 row.locator('[data-gw-choice="type"][data-gw-value="可燃物"]').click();row.locator('[data-gw-choice="facility"][data-gw-value="北部清掃処分"]').click()
 row.locator('[data-gw-key="quantity"]').fill('250');row.locator('[data-gw-key="netKg"]').fill('250');row.locator('[data-gw-key="vehicleNumber"]').fill('検証100 あ 1234');row.locator('[data-gw-key="ticketNumber"]').fill('TEST-001');row.locator('[data-gw-key="scopeConfirmed"]').check()
 row.locator('.gw-more>summary').click();row.locator('[data-gw-choice="municipality"]').click();row.locator('.gw-more>summary').click()
 data=page.evaluate('collect()');first=data['generalWasteV1']['entries'][0]
 check(first['type']=='可燃物' and first['netKg']=='250' and first['municipality']=='鹿児島市','type/facility/weight/area tap controls are included in actual collect')
 check(data['details']=='既存の作業本文' and data['items']==[],'ordinary text and industrial item array remain separate')
 row.locator('[data-gw-key="quantity"]').fill('1.');check(row.locator('[data-gw-key="quantity"]').evaluate('(e)=>e===document.activeElement'),'typing keeps focus');check(page.evaluate('collect().generalWasteV1.entries[0].quantity')=='1.','incomplete number is retained for drafting')
 row.locator('[data-gw-key="quantity"]').fill('250')
 page.evaluate('saveDraft();window.__draftCopy=get(LS.draft,null);clearReportEditState();fillReportForm(__draftCopy,"edit")')
 check(page.evaluate('collect().generalWasteV1.entries[0].ticketNumber')=='TEST-001','actual saveDraft/clear/fill retains ticket and ID')
 page.evaluate('window.__savedCopy=JSON.parse(JSON.stringify(collect()));fillReportForm(__savedCopy,"duplicate")')
 check(page.evaluate('collect().generalWasteV1===undefined'),'duplicate report does not copy a delivery')
 page.evaluate('fillReportForm(__savedCopy,"edit")')
 row=page.locator('[data-gw-id]').first;row.evaluate('(e)=>e.open=true');row.locator('[data-gw-key="netKg"]').fill('260')
 check(page.evaluate('collect().generalWasteV1.entries.length')==1,'editing does not create a second record')
 row.locator('[data-gw-key="netKg"]').fill('250')
 for category,facility,quantity,unit,kg,ticket in [('不燃物','横井処分','0.12','t','','TEST-002'),('粗大ごみ','粗大ごみ処理棟','60','kg','60','TEST-003')]:
  page.locator('#gwAdd').click();r=page.locator('[data-gw-id]').last
  r.locator('[data-gw-choice="type"][data-gw-value="'+category+'"]').click();r.locator('[data-gw-choice="facility"][data-gw-value="'+facility+'"]').click()
  r.locator('[data-gw-key="quantity"]').fill(quantity);r.locator('[data-gw-key="unit"]').select_option(unit);r.locator('[data-gw-key="netKg"]').fill(kg);r.locator('[data-gw-key="vehicleNumber"]').fill('検証100 あ 1234');r.locator('[data-gw-key="ticketNumber"]').fill(ticket);r.locator('[data-gw-key="scopeConfirmed"]').check()
  if category=='粗大ごみ':r.locator('[data-gw-key="facilitySectionConfirmed"]').check()
  r.locator('.gw-more>summary').click();r.locator('[data-gw-choice="municipality"]').click()
  if unit=='t':r.locator('[data-gw-key="massConfirmed"]').check()
  r.locator('.gw-more>summary').click()
 all_data=page.evaluate('collect()');check(len(all_data['generalWasteV1']['entries'])==3,'three separate delivery rows captured')
 page.evaluate("__fixtureRows=[{id:'saved1',company_id:'test-company',report_date:'2026-09-24',report_data:collect()}]")
 page.locator('nav [data-page="homePage"]').click();page.locator('#gwLoad').click();page.wait_for_function('!!__gwUI.summary()')
 check(page.evaluate('__gwUI.summary().totalKg')=='430','UI monthly total is 250kg + 0.12t + 60kg = 430kg')
 check(page.evaluate('__gwUI.summary().ready') is False,'monthly output remains unreviewed and not submitted')
 q=page.locator('#gwMonthlyCard');q.locator('.gw-more>summary').filter(has_text='年度一覧').click()
 check(q.locator('#gwAnnual tbody tr').count()==12,'annual table contains April through March')
 check('未確定' in q.locator('#gwAnnual').inner_text(),'missing months are not declared zero');q.locator('.gw-more>summary').filter(has_text='年度一覧').click()
 def capture_component(selector,name):
  payload=page.evaluate(r'''(selector)=>{const src=document.querySelector(selector),el=src.cloneNode(true);el.hidden=false;const inputs=[...src.querySelectorAll('input,select,textarea')];el.querySelectorAll('input,select,textarea').forEach((n,i)=>{const s=inputs[i];if(n.tagName==='SELECT') [...n.options].forEach(o=>o.toggleAttribute('selected',o.value===s.value));else if(n.tagName==='TEXTAREA')n.textContent=s.value;else{n.setAttribute('value',s.value);n.toggleAttribute('checked',s.checked);}});return {html:el.outerHTML,css:[...document.querySelectorAll('style')].map(s=>s.textContent).join('\n')};}''',selector)
  image_page=context.new_page();image_page.set_content('<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+payload['css']+'body{padding:10px;margin:0;background:#f3f4f1;}#actions,header{display:none!important}.card{margin:0!important}.gw-stage{display:block!important}</style></head><body>'+payload['html']+'</body></html>')
  image_page.locator(selector).screenshot(path=str(out/name));image_page.close()
 capture_component('#gwMonthlyCard','monthly-screen.png')
 page.locator('nav [data-page="reportPage"]').click();page.locator('[data-gw-id]').evaluate_all('(els)=>els.forEach((e,i)=>e.open=i===0)');capture_component('#gwDailyCard','daily-input-screen.png')
 page.locator('nav [data-page="homePage"]').click();page.evaluate("__fixtureMode='fail'");page.locator('#gwLoad').click();page.wait_for_function('document.querySelector("#gwLoadStatus").textContent.includes("失敗")')
 check(page.evaluate('__gwUI.summary()') is None and page.locator('#gwCSV').is_disabled(),'failed read removes stale results and disables export')
 page.evaluate("__fixtureMode='partial'");page.locator('#gwLoad').click();page.wait_for_function('document.querySelector("#gwLoadStatus").textContent.includes("全件")')
 check(page.evaluate('__gwUI.summary()') is None,'partial data does not show an aggregate')
 page.evaluate("__fixtureMode='delay'");page.locator('#gwLoad').click();page.wait_for_function('typeof __resolveLoad==="function"')
 page.evaluate("__fixtureProfile={...__fixtureProfile,role:'employee'};__setMockProfile();__gwUI.syncIdentity();__resolveLoad({complete:true,rows:__fixtureRows})")
 check(page.locator('#gwMonthlyCard').is_hidden(),'employee cannot see company monthly data')
 page.wait_for_timeout(150);check(page.evaluate('__gwUI.summary()') is None,'late admin response cannot render after role demotion')
 page.evaluate("__fixtureProfile=null;__setMockProfile();__gwUI.syncIdentity();clearReportEditState();collect()")
 check(page.locator('#gwDailyCard').is_hidden() and page.locator('#gwMonthlyCard').is_hidden(),'sign-out hides both panes without breaking ordinary clear/collect')
 page.evaluate("__fixtureProfile={id:'other',companyId:'other-company',active:true,role:'admin',name:'他社'};__setMockProfile();__gwUI.syncIdentity()")
 check(page.locator('#gwMonthlyCard').is_hidden() and page.evaluate('collect().generalWasteV1===undefined'),'other company cannot inherit TOYA records')
 page.evaluate("__fixtureProfile={id:'test-user',companyId:'test-company',active:true,role:'admin',name:'検証担当'};__setMockProfile();__gwUI.syncIdentity();fillReportForm(__savedCopy,'edit')")
 check(page.evaluate('collect().generalWasteV1.entries[0].id')==first['id'],'same company can explicitly reopen its original saved record')
 check(errors==before,'no new runtime page errors beyond the known baseline error')
 (out/'browser-results.json').write_text(json.dumps({'browser':engine,'base':'2c39cc48b2125eddcc9a7557f757a5797017e7ad','fixture':'existing full app with mock auth/DB and in-memory storage; all real network blocked','checks':checks,'baseline_errors':before,'new_errors':errors[len(before):],'status':'passed'},ensure_ascii=False,indent=2))
 print(engine+': '+str(len(checks))+' checks passed; no real login/save/submission occurred.');browser.close()
