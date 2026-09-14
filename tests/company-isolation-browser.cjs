const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),binary=require('@sparticuz/chromium');
const root=path.join(__dirname,'../docs'),legacy='40a7a065-1086-4e62-aa09-f44d6207602c';
const profile=(company,name='試験社長')=>({id:company+'-admin',company_id:company,name,role:'admin',active:true});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:await binary.executablePath(),args:binary.args});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{
   const u=new URL(r.request().url()),name=u.pathname==='/'?'index.html':u.pathname.slice(1),file=path.join(root,name);
   if(u.hostname==='toya.test'&&file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return r.fulfill({body:fs.readFileSync(file),contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':'application/octet-stream'});
   return r.fulfill({body:'',contentType:'application/javascript'});
  });
  await page.addInitScript(({initial})=>{
   const stored=sessionStorage.getItem('qa-profile'),p=stored===null?initial:JSON.parse(stored);
   if(!localStorage.getItem('qa-seeded')){
    localStorage.setItem('toya_vehicles_v5',JSON.stringify(['TOYA保存済み車両']));
    localStorage.setItem('toya_reports_v5',JSON.stringify([{id:77,date:'2020-01-01',site:'TOYA保存済み現場',writer:'宮下 直也',photoCount:1}]));
    localStorage.setItem('toya_draft_v5',JSON.stringify({id:78,date:'2020-01-01',site:'TOYA一時保存',writer:'宮下 直也'}));
    localStorage.setItem('qa-seeded','yes');
   }
   window.__qaDB={profiles:p?[p,{...p,id:p.id+'-employee',name:'試験社員',role:'employee'}]:[],sites:[],daily_reports:[]};
   const listeners=[];
   window.supabase={createClient(){return{
    auth:{getSession:async()=>({data:{session:p?{user:{id:p.id,email:'qa@example.invalid'}}:null}}),onAuthStateChange(fn){listeners.push(fn);return{data:{subscription:{unsubscribe(){}}}}},async signOut(){sessionStorage.setItem('qa-profile','null');listeners.forEach(fn=>fn('SIGNED_OUT',null));return{};}},
    from(table){const filters=[];let single=false;const query={select(){return this},eq(k,v){filters.push(r=>r[k]===v);return this},is(k,v){filters.push(r=>r[k]===v);return this},in(k,v){filters.push(r=>v.includes(r[k]));return this},neq(){return this},gte(){return this},lte(){return this},gt(){return this},lt(){return this},order(){return this},range(){return this},limit(){return this},single(){single=true;return this},maybeSingle(){single=true;return this},insert(){return this},update(){return this},upsert(){return this},delete(){return this},then(resolve,reject){const rows=(window.__qaDB[table]||[]).filter(r=>filters.every(f=>f(r)));return Promise.resolve({data:single?rows[0]||null:structuredClone(rows),error:null}).then(resolve,reject)}};return query;},
    rpc:async()=>({data:[],error:null})
   };}};
   window.alert=message=>{window.__qaAlert=message;};window.confirm=()=>true;
  },{initial:profile('company-a')});
  const ready=()=>page.waitForFunction(()=>typeof cloudProfile!=='undefined'&&cloudProfile?.active===true&&!companyTransition);
  await page.goto('https://toya.test/');await ready();await page.waitForFunction(()=>Object.keys(cloudProfilesCache).length===2);
  assert.deepEqual(await page.locator('#writer option').allTextContents(),['選択してください','試験社長','試験社員']);
  assert.equal(await page.locator('#vehicleChoices input').count(),0);
  assert.equal(await page.locator('#machineChoices input').count(),0);
  await page.waitForTimeout(1500);assert.equal(await page.locator('input[name="attachment"]').count(),0,'TOYA専用の自動追加を他社で実行しない');
  await page.evaluate(async()=>{window.__qaDB.company_registries=[{company_id:'company-a',kind:'vehicles',entries:[{id:'qa-shared',name:'A社の共有車両',active:true}],version:1}];await window.ToyaCompanyRegistry.refresh();});
  assert.deepEqual(await page.locator('#vehicleChoices input').evaluateAll(xs=>xs.map(x=>x.value)),['A社の共有車両']);
  await page.evaluate(async()=>{window.__qaDB.company_registries=[];await window.ToyaCompanyRegistry.refresh();set(LS.vehicles,[]);renderSelectors();});
  await page.locator('#restoreFile').setInputFiles({name:'wrong-company.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({company_id:'company-b',vehicles:['他社のバックアップ車両']}))});
  await page.waitForFunction(()=>window.__qaAlert?.includes('この会社のバックアップではありません'));
  assert.deepEqual(await page.evaluate(()=>get(LS.vehicles,[])),[],'他社のバックアップを混ぜない');
  await page.evaluate(async()=>{
   set(LS.vehicles,['A社車両']);set(LS.draft,{id:42,date:'2026-09-14',site:'A社の一時保存',writer:'試験社長'});renderSelectors();
   stagedPhotos=[{blob:new Blob(['QA A']),name:'a.jpg',category:'施工中'}];await savePhotosForReport(42);stagedPhotos=[];
   await new Promise((resolve,reject)=>{const r=indexedDB.open('TOYAOnePhotoDB',1);r.onupgradeneeded=()=>{const s=r.result.createObjectStore('photos',{keyPath:'id'});s.createIndex('reportId','reportId');};r.onsuccess=()=>{const db=r.result,t=db.transaction('photos','readwrite');t.objectStore('photos').put({id:'legacy-photo',reportId:77,name:'legacy.jpg'});t.oncomplete=()=>{db.close();resolve();};t.onerror=()=>reject(t.error);};});
  });
  assert.equal(await page.evaluate(async()=> (await getPhotosForReport(77)).length),0);
  await page.evaluate(()=>{cloudSetSessionState({status:'error',message:'QA temporary network failure'},{user:{id:cloudProfile.id}});});
  assert.equal(await page.evaluate(()=>companyTransition),false);
  assert.equal(await page.evaluate(()=>get(LS.draft).site),'A社の一時保存','通信エラーでは入力を破棄しない');
  const switchTo=async p=>{await Promise.all([page.waitForEvent('load'),page.evaluate(next=>{sessionStorage.setItem('qa-profile',JSON.stringify(next));cloudSetSessionState({status:'ready',profile:next});},p)]);await ready();};
  await switchTo(profile('company-b','B社社長'));
  assert.deepEqual(await page.evaluate(()=>get(LS.vehicles,[])),[]);
  assert.equal(await page.evaluate(()=>get(LS.draft,null)),null);
  assert.equal(await page.evaluate(async()=> (await getPhotosForReport(42)).length),0);
  assert.equal(await page.locator('#writer').textContent().then(t=>t.includes('試験社長')),false);
  await page.evaluate(()=>set(LS.vehicles,['B社車両']));
  await switchTo(profile('company-a'));
  assert.deepEqual(await page.evaluate(()=>get(LS.vehicles,[])),['A社車両']);
  assert.equal(await page.evaluate(()=>get(LS.draft).site),'A社の一時保存');
  assert.equal(await page.evaluate(async()=> (await getPhotosForReport(42)).length),1);
  await switchTo(profile(legacy,'宮下 直也'));
  assert.deepEqual(await page.evaluate(()=>get(LS.vehicles,[])),['TOYA保存済み車両']);
  assert.equal(await page.evaluate(()=>get(LS.reports)[0].site),'TOYA保存済み現場');
  assert.equal(await page.evaluate(()=>get(LS.draft).site),'TOYA一時保存');
  assert.equal(await page.evaluate(async()=> (await getPhotosForReport(77)).length),1);
  assert.deepEqual(await page.locator('#writer option').allTextContents(),['選択してください','宮下 直也','上村 凌太','宮下 哲也']);
  await Promise.all([page.waitForEvent('load'),page.evaluate(()=>{sessionStorage.setItem('qa-profile','null');cloudSetSessionState({status:'signed_out'});})]);
  await page.waitForFunction(()=>typeof cloudSessionState!=='undefined'&&cloudSessionState.status==='signed_out');
  assert.deepEqual(await page.evaluate(()=>get(LS.reports,[])),[]);
  assert.equal(await page.evaluate(()=>get(LS.draft,null)),null);
  assert.equal(await page.evaluate(async()=> (await getPhotosForReport(77)).length),0);
  assert.equal(await page.locator('#companyWorkerChoices input').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS mobile full app: A/B accounts and local masters/drafts/photos isolated, account switch reload, TOYA legacy records/draft/photos retained, logout hides company data');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
