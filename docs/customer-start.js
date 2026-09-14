(() => {
 'use strict';
 const client=window.supabase.createClient(window.ToyaSignupConfig.url,window.ToyaSignupConfig.key);
 const q=s=>document.querySelector(s);let busy=false,user=null,state=null;
 const fromLink=new URLSearchParams(location.hash.slice(1)).get('join');
 if(fromLink&&/^[a-f0-9]{64}$/.test(fromLink)){sessionStorage.setItem('toya_pending_join',fromLink);history.replaceState(null,'',location.pathname);}
 q('#joinToken').value=sessionStorage.getItem('toya_pending_join')||'';
 if(q('#joinToken').value)q('#joinChoice').checked=true;
 function message(t){q('#startStatus').textContent=t;}
 function paint(){
  q('#accountStep').hidden=!!user;q('#setupStep').hidden=!user||state?.state!=='unregistered';q('#existingStep').hidden=!user||!state||state.state==='unregistered';q('#signedAs').textContent=user?'ログイン中：'+(user.email||''):'';q('#startLogout').hidden=!user;
  q('#companyNameField').hidden=!q('#companyChoice').checked;q('#joinTokenField').hidden=!q('#joinChoice').checked;
  q('#finishStart').textContent=q('#joinChoice').checked?'指定された会社に参加する':'自分の会社を登録する';
  q('#existingMessage').textContent=state?.state==='inactive'?'このアカウントは利用停止中です。会社の管理者に確認してください。':'登録済みです。TOYA Oneを開いて利用できます。';
  document.querySelectorAll('button').forEach(b=>b.disabled=busy);q('#finishStart').disabled=busy||!state?.verified||(!q('#companyChoice').checked&&!q('#joinChoice').checked);
 }
 async function action(fn){if(busy)return;busy=true;paint();try{await fn();}catch(e){message(({email_address_not_authorized:'現在、確認メールを送信できません。管理者によるメール送信設定の確認が必要です。',over_email_send_rate_limit:'確認メールの送信が混み合っています。少し時間を置いて再試行してください。',invalid_credentials:'メールアドレスかパスワードが違います。確認して入力してください。',email_not_confirmed:'確認メールのリンクを開いてからログインしてください。'})[e.code]||e.message||'接続できませんでした。入力内容を確認して再試行してください。');}finally{busy=false;paint();}}
 async function inspect(){const r=await client.auth.getUser();if(r.error&&!r.data?.user){user=null;state=null;paint();return;}user=r.data?.user||null;if(user){const s=await client.rpc('toya_onboarding',{p_action:'status',p_payload:{}});if(s.error)throw s.error;state=s.data;if(!state.verified)message('確認メールのリンクを開いてから、この画面でログインしてください。');}paint();}
 q('#startSignup').onclick=()=>action(async()=>{const email=q('#startEmail').value.trim(),password=q('#startPassword').value;if(!q('#startEmail').checkValidity()||!email)throw Error('メールアドレスを確認してください。');if(password.length<12)throw Error('パスワードは12文字以上で設定してください。');const r=await client.auth.signUp({email,password,options:{emailRedirectTo:window.ToyaSignupConfig.app}});if(r.error)throw r.error;q('#startPassword').value='';message('登録手続きを受け付けました。確認メールを開いた後、この画面でログインしてください。登録済みの場合は「ログイン」を使ってください。');if(r.data?.session)await inspect();});
 q('#startLogin').onclick=()=>action(async()=>{const r=await client.auth.signInWithPassword({email:q('#startEmail').value.trim(),password:q('#startPassword').value});if(r.error)throw r.error;q('#startPassword').value='';await inspect();message(state?.verified?'ログインしました。下の手順を進めてください。':'確認メールのリンクを開いてから、この画面でログインしてください。');});
 q('#startLogout').onclick=()=>action(async()=>{const r=await client.auth.signOut();if(r.error)throw r.error;user=null;state=null;message('ログアウトしました。');});
 q('#finishStart').onclick=()=>action(async()=>{const join=q('#joinChoice').checked,name=q('#startName').value.trim(),company_name=q('#startCompany').value.trim(),token=q('#joinToken').value.trim();if(!name)throw Error('ご自身の氏名を入力してください。');if(join&&!/^[a-f0-9]{64}$/.test(token))throw Error('管理者から受け取った参加リンクをもう一度開いてください。');if(!join&&!company_name)throw Error('会社名を入力してください。');const r=await client.rpc('toya_onboarding',{p_action:join?'join':'create_company',p_payload:join?{name,token}:{name,company_name}});if(r.error)throw r.error;sessionStorage.removeItem('toya_pending_join');location.assign('./');});
 document.querySelectorAll('input[name=startMode]').forEach(e=>e.onchange=paint);
 client.auth.onAuthStateChange(()=>{setTimeout(()=>{if(!busy)inspect().catch(e=>message(e.message));},0);});
 inspect().catch(e=>message(e.message));paint();
})();
