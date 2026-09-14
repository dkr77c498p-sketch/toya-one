(() => {
 'use strict';
 async function check(client,userId){
  const status=await client.rpc('toya_access',{p_action:'status',p_payload:{}});
  if(status.error)throw status.error;
  const s=status.data;
  if(!s||!['ready','needs_device'].includes(s.state))return s||{state:'blocked',message:'会社の利用状態を確認できませんでした。'};
  if(s.internal)return s;
  let key;try{const name='toya_device_v1:'+userId;key=localStorage.getItem(name);if(!/^[a-f0-9]{64}$/.test(key||'')){key=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');localStorage.setItem(name,key);}if(localStorage.getItem(name)!==key)throw Error();}catch{throw Error('端末の保存を許可して、通常のブラウザで開いてください。');}
  const bound=await client.rpc('toya_access',{p_action:'bind',p_payload:{device_key:key}});
  if(bound.error)throw bound.error;
  return bound.data||{state:'blocked',message:'端末を確認できませんでした。'};
 }
 window.ToyaCompanyAccess={check};
})();
