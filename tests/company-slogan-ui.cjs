const {JSDOM}=require('jsdom'),fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync('docs/company-slogan.js','utf8'),ime=fs.readFileSync('docs/japanese-input.js','utf8');
const db=new Map(),tick=()=>new Promise(r=>setTimeout(r,15));let fail=false,gate=null,writes=0;
function app(company,role='admin'){
 const dom=new JSDOM('<nav><button data-page="homePage">ホーム</button></nav><div id="uxDailyHome"><h2 id="uxSlogan">今日も、安全に。</h2><button id="uxWrite">日報を入力</button></div><input id="reportDraft" value="入力中の日報">',{url:'https://qa.invalid',runScripts:'outside-only'}),w=dom.window;
 w.cloudProfile={id:company+role,company_id:company,role,active:true};w.companyTransition=false;w.confirm=()=>true;w.setInterval=()=>0;
 w.cloudClient={from(table){assert.equal(table,'company_home_settings');const current=w.cloudProfile,filters=[];let op='select',data;
  return {select(){return this},eq(k,v){filters.push(r=>r[k]===v);return this},insert(d){op='insert';data=d;return this},update(d){op='update';data=d;return this},then(resolve,reject){
   let result;if(fail)result={error:{message:'通信エラー'}};else{
    let rows=[...db.values()].filter(r=>r.company_id===current.company_id&&filters.every(f=>f(r)));
    if(op!=='select'&&current.role!=='admin')result={error:{code:'42501'}};
    else if(op==='insert'&&db.has(data.company_id))result={error:{code:'23505'}};
    else{if(op==='insert'){rows=[data];db.set(data.company_id,structuredClone(data));writes++;}if(op==='update'){rows=rows.map(r=>({...r,...data}));rows.forEach(r=>db.set(r.company_id,structuredClone(r)));writes+=rows.length;}result={data:structuredClone(rows),error:null};}
   }
   if(gate){const hold=gate;gate=null;return hold.then(()=>result).then(resolve,reject);}return Promise.resolve(result).then(resolve,reject);
  }};
 }};
 w.eval(ime);w.eval(source);return dom;
}
function enter(w,value){const input=w.document.querySelector('#uxSloganInput');input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}));}
(async()=>{
 const apps=[],make=(...args)=>{const d=app(...args);apps.push(d);return d.window;};
 try{
  const a=make('A'),q=s=>a.document.querySelector(s);await tick();assert.equal(q('#uxSloganInput').disabled,false);
  enter(a,'安全第一\n今日も全員、笑顔で帰ろう。');q('#uxSloganSave').click();await tick();assert.equal(db.get('A').slogan,q('#uxSlogan').textContent);assert.match(q('#uxSloganStatus').textContent,/保存しました/);
  const a2=make('A'),e=make('A','employee'),b=make('B');await tick();assert.equal(e.document.querySelector('#uxSlogan').textContent,db.get('A').slogan);assert.equal(e.document.querySelector('#uxSloganEditor'),null);assert.equal(b.document.querySelector('#uxSlogan').textContent,'今日も、安全に。');
  const input=q('#uxSloganInput'),before=writes;input.dispatchEvent(new a.CompositionEvent('compositionstart',{bubbles:true}));input.value='安全こう';input.dispatchEvent(new a.InputEvent('input',{bubbles:true,isComposing:true}));q('#uxSloganSave').click();await tick();assert.equal(writes,before);assert.match(q('#uxSloganStatus').textContent,/変換を確定/);
  input.value='安全工事';input.dispatchEvent(new a.CompositionEvent('compositionend',{bubbles:true}));q('#uxSloganSave').click();await tick();assert.equal(db.get('A').slogan,'安全工事');
  enter(a2,'古い端末の変更');a2.document.querySelector('#uxSloganSave').click();await tick();assert.match(a2.document.querySelector('#uxSloganStatus').textContent,/他の端末/);assert.equal(a2.document.querySelector('#uxSloganInput').value,'古い端末の変更');assert.equal(db.get('A').slogan,'安全工事');
  a2.confirm=()=>false;a2.document.querySelector('#uxSloganReload').click();await tick();assert.equal(a2.document.querySelector('#uxSloganInput').value,'古い端末の変更');a2.confirm=()=>true;a2.document.querySelector('#uxSloganReload').click();await tick();assert.equal(a2.document.querySelector('#uxSloganInput').value,'安全工事');
  enter(a,'通信中も保持');fail=true;q('#uxSloganSave').click();await tick();assert.match(q('#uxSloganStatus').textContent,/入力内容は残っています/);assert.equal(input.value,'通信中も保持');assert.equal(input.disabled,false);fail=false;
  enter(a,'<img src=x onerror=alert(1)>');q('#uxSloganSave').click();await tick();assert.equal(q('#uxSlogan img'),null);assert.equal(q('#uxSlogan').textContent,'<img src=x onerror=alert(1)>');
  const stored=db.get('A').slogan;enter(a,'  ');q('#uxSloganSave').click();await tick();assert.equal(db.get('A').slogan,stored);assert.match(q('#uxSloganStatus').textContent,/1〜80文字/);
  q('#uxSloganEditor').open=true;enter(a,'編集は保持');await a.ToyaCompanySlogan.refresh();assert.equal(input.value,'編集は保持');assert.equal(q('#reportDraft').value,'入力中の日報');assert.equal(q('#uxSloganInput'),input);
  a.cloudProfile=null;a.document.dispatchEvent(new a.CustomEvent('toya-role-changed'));assert.equal(q('#uxSloganEditor'),null);assert.equal(q('#uxSlogan').textContent,'今日も、安全に。');
  fail=true;const f=make('failed');await tick();assert.equal(f.document.querySelector('#uxSloganInput').disabled,true);assert.equal(f.document.querySelector('#uxSloganReload').hidden,false);fail=false;f.document.querySelector('#uxSloganReload').click();await tick();assert.equal(f.document.querySelector('#uxSloganInput').disabled,false);
  let release;gate=new Promise(r=>release=r);const late=make('A');await tick();late.cloudProfile={id:'Badmin',company_id:'B',role:'admin',active:true};late.document.dispatchEvent(new late.CustomEvent('toya-role-changed'));await tick();release();await tick();assert.equal(late.document.querySelector('#uxSlogan').textContent,'今日も、安全に。');assert.equal(late.document.querySelector('#uxSloganInput').value,'今日も、安全に。');
  console.log('PASS slogan: shared employee display, company isolation, IME, stale saves, offline retention, safe text, read retries, logout and late responses; report input retained');
 }finally{apps.forEach(d=>d.window.close());}
})().catch(e=>{console.error(e);process.exitCode=1;});
