// Kept dependency-free so authorization/error paths can be exercised with a mocked Auth service.
export function createHandler({createClient,env,random=crypto}) {
 const origin='https://dkr77c498p-sketch.github.io';
 return async req=>{
  const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
  const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
  if(req.headers.get('origin')&&req.headers.get('origin')!==origin)return reply(403,{error:'この画面からは操作できません。'});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return reply(405,{error:'操作を確認してください。'});
  const authorization=req.headers.get('authorization')||'';
  if(!/^Bearer \S+$/.test(authorization))return reply(401,{error:'管理者としてログインしてください。'});
  let reservation=null,createdId=null,service=null,finished=false;
  try{
   const raw=await req.text();if(raw.length>4096)return reply(413,{error:'入力が長すぎます。'});
   const body=JSON.parse(raw);if(!['create','reset_password'].includes(body.action))return reply(400,{error:'操作を確認してください。'});
   const options={auth:{persistSession:false,autoRefreshToken:false}};
   const user=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{...options,global:{headers:{Authorization:authorization}}});
   const checked=await user.auth.getUser(authorization.slice(7));
   if(checked.error||!checked.data?.user)return reply(401,{error:'ログインし直してください。'});
   async function rpc(action,payload){const r=await user.rpc('toya_employee_admin',{p_action:action,p_payload:payload});if(r.error)throw r.error;return r.data;}
   // RPC authorizes active company admin + contract + registered session. Payload cannot choose a tenant.
   let target;
   if(body.action==='create')reservation=await rpc('reserve',{login_id:body.login_id,name:body.name});
   else target=await rpc('reset_target',{id:body.id});
   service=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),options);
   const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
   const password=Array.from(random.getRandomValues(new Uint8Array(24)),x=>alphabet[x%alphabet.length]).join('');
   if(body.action==='create'){
    const made=await service.auth.admin.createUser({email:reservation.email,password,email_confirm:true});
    if(made.error||!made.data?.user)throw Error('社員IDを作成できませんでした。入力を確認して再試行してください。');
    createdId=made.data.user.id;
    const done=await service.rpc('toya_employee_finish',{p_reservation:reservation.reservation,p_actor:checked.data.user.id,p_user:createdId});
    if(done.error)throw done.error;finished=true;
   }else{
    const changed=await service.auth.admin.updateUserById(target.user_id,{password});
    if(changed.error)throw Error('パスワードを再設定できませんでした。再試行してください。');
    const cleared=await user.rpc('toya_access',{p_action:'reset_device',p_payload:{id:target.user_id}});
    // Never hide a successfully changed password if a subsequent device reset fails.
    return reply(200,{ok:true,password,warning:cleared.error?'パスワードは変更しました。端末登録の解除は完了していません。一覧から解除してください。':null});
   }
   return reply(200,{ok:true,password});
  }catch(error){
   if(reservation&&service&&!finished){
    // Delete only the exact Auth user created in this request, which has no finalized profile.
    let clean=true;
    if(createdId){try{const r=await service.auth.admin.deleteUser(createdId);clean=!r.error;}catch{clean=false;}}
    // Retain reservation if cleanup failed: prevents accidental reuse and supports operator recovery.
    if(clean){try{await service.rpc('toya_employee_finish',{p_reservation:reservation.reservation,p_actor:reservation.actor,p_user:null});}catch{}}
   }
   const message=typeof error?.message==='string'&&/[ぁ-んァ-ヶ一-龠]/.test(error.message)?error.message:'操作を完了できませんでした。接続を確認して再試行してください。';
   return reply(400,{error:message});
  }
 };
}
