(() => {
 'use strict';const q=s=>document.querySelector(s),client=supabase.createClient(ToyaSignupConfig.url,ToyaSignupConfig.key);let busy=false;
 const code=new URLSearchParams(location.search).get('company');
 if(/^[a-f0-9]{12}$/i.test(code||''))q('#employeeCompany').value=code.toUpperCase();
 q('#employeeForm').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;q('#employeeSubmit').disabled=true;q('#employeeStatus').textContent='ログインしています…';try{
  const company=q('#employeeCompany').value.trim().toLowerCase(),id=q('#employeeId').value.trim().toLowerCase(),password=q('#employeePassword').value;
  if(!/^[a-f0-9]{12}$/.test(company)||!/^[a-z0-9][a-z0-9_-]{2,23}$/.test(id)||!password)throw Error('会社コード・社員ID・パスワードを確認してください。');
  const r=await client.auth.signInWithPassword({email:company+'.'+id+'@employee.toya.invalid',password});
  if(r.error)throw Error(r.error.status===429?'試行回数が多くなっています。少し時間を置いて再試行してください。':'ログインできませんでした。会社コード・社員ID・パスワードを確認してください。');
  q('#employeePassword').value='';
  const access=await ToyaCompanyAccess.check(client,r.data.user.id);
  if(access.state!=='ready')throw Error(access.message||'会社の利用状態を確認してください。');
  location.assign('./');
 }catch(error){q('#employeeStatus').textContent=error.message||'接続できませんでした。再試行してください。';}finally{busy=false;q('#employeeSubmit').disabled=false;}};
})();
