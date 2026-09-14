(() => {
 'use strict';
 const c=window.ToyaSalesConfig||{},production='hmxntxrxelswjmzghoxf.supabase.co';
 let ready=false;
 try{const db=new URL(c.supabaseUrl),app=new URL(c.appUrl);
  ready=c.authStorageKey==='toya-sales-auth-v1'&&/^[a-z0-9]{20}\.supabase\.co$/.test(db.hostname)&&db.protocol==='https:'&&db.hostname!==production&&c.publishableKey.startsWith('sb_publishable_')&&app.protocol==='https:'&&app.origin===location.origin&&app.pathname.endsWith('/')&&location.pathname.startsWith(app.pathname)&&!(app.hostname==='dkr77c498p-sketch.github.io'&&app.pathname==='/toya-one/');
 }catch{}
 window.ToyaSalesRuntime=Object.freeze({ready,createClient(){if(!ready)throw Error('販売用の利用開始を準備しています。');return window.supabase.createClient(c.supabaseUrl,c.publishableKey,{auth:{storageKey:c.authStorageKey}});}});
 if(!ready)document.addEventListener('DOMContentLoaded',()=>{
  document.body.replaceChildren();const main=document.createElement('main');main.style.cssText='max-width:600px;margin:60px auto;padding:24px;font-family:sans-serif;line-height:1.8';
  const title=document.createElement('h1');title.textContent='TOYA One 販売用';const note=document.createElement('p');note.textContent='販売用の利用開始を準備しています。準備が整うと、この専用の入口から利用できます。';main.append(title,note);document.body.append(main);
 },{once:true});
})();
