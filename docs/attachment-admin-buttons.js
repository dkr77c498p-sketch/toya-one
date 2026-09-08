(function(){
  const cleanName=v=>String(v||'').replace(/\s*×\s*\d+(?:台|本)$/,'').trim();

  function addMasterAttachment(kind){
    try{
      if(typeof LS==='undefined'||typeof get!=='function'||typeof set!=='function')return;
      let category='',name='';
      if(kind==='machine'){
        category=(prompt('種類を入力してください（例：大割機・カッター・フォーク）')||'').trim();
        if(!category)return;
        name=(prompt('名称・型式を入力してください')||'').trim();
      }else{
        name=(prompt('小型機械・工具の名称を入力してください')||'').trim();
        if(!name)return;
        category=(prompt('種類を入力してください（例：小型機械・発電機・エア工具）','小型機械')||'小型機械').trim();
      }
      if(!name)return;
      const a=get(LS.attachments,[])||[];
      if(a.some(x=>cleanName(typeof x==='string'?x:x?.name)===name))return alert('同じ名称がすでに登録されています。');
      a.push({name,category,location:'',mountedOn:'',memo:''});
      set(LS.attachments,a);
      if(typeof renderSelectors==='function')renderSelectors();
      if(typeof renderMasters==='function')renderMasters();
      if(typeof renderAttachments==='function')renderAttachments();
    }catch(e){console.warn('アタッチメント追加失敗',e)}
  }

  function fixButtons(){
    document.querySelector('#addMachineAttachmentQuick')?.remove();
    document.querySelector('#addSmallToolQuick')?.remove();

    const master=document.querySelector('#attachmentMaster');
    if(!master)return false;
    const card=master.closest('.card');
    if(!card)return false;

    [...card.querySelectorAll('button')].forEach(b=>{
      if((b.getAttribute('onclick')||'').trim()==='addAttachment()')b.style.display='none';
    });

    let wrap=document.querySelector('#adminAttachmentAddButtons');
    if(!wrap){
      wrap=document.createElement('div');
      wrap.id='adminAttachmentAddButtons';
      wrap.className='grid2';
      wrap.style.marginTop='10px';

      const machine=document.createElement('button');
      machine.type='button';machine.className='btn dark';machine.textContent='＋ 重機アタッチメントを追加';
      machine.onclick=()=>addMasterAttachment('machine');

      const small=document.createElement('button');
      small.type='button';small.className='btn light';small.textContent='＋ 小型機械・工具を追加';
      small.onclick=()=>addMasterAttachment('small');

      wrap.append(machine,small);
      master.insertAdjacentElement('afterend',wrap);
    }
    return true;
  }

  function install(){
    fixButtons();
    if(typeof window.renderSelectors==='function'&&!window.__toyaAdminAttachmentButtonsRenderWrap){
      const old=window.renderSelectors;
      window.renderSelectors=function(){const out=old.apply(this,arguments);setTimeout(fixButtons,0);return out;};
      window.__toyaAdminAttachmentButtonsRenderWrap=true;
    }
    if(typeof window.renderMasters==='function'&&!window.__toyaAdminAttachmentButtonsMasterWrap){
      const old=window.renderMasters;
      window.renderMasters=function(){const out=old.apply(this,arguments);setTimeout(fixButtons,0);return out;};
      window.__toyaAdminAttachmentButtonsMasterWrap=true;
    }
    document.addEventListener('click',e=>{if(e.target?.closest?.('[data-page="masterPage"]'))setTimeout(fixButtons,50)});
    return true;
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,200));else setTimeout(install,200);
  let n=0;const t=setInterval(()=>{n++;fixButtons();if(n>40)clearInterval(t)},200);
})();
