/* TOYA One: 重機アタッチメント / 小型機械・工具 完全分離 */
(function(){
  'use strict';
  const smallCats=new Set(['小型機械','発電機','エア工具']);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function normalizeMaster(){
    try{
      if(typeof LS==='undefined'||typeof get!=='function'||typeof set!=='function'||!LS.attachments)return;
      const a=get(LS.attachments,[])||[];
      let changed=false;
      a.forEach(x=>{
        if(!x||typeof x==='string')return;
        if(String(x.name||'').includes('スケルトンバケット') && (!x.category || x.category==='アタッチメント')){
          x.category='スケルトンバケット';changed=true;
        }
      });
      if(changed)set(LS.attachments,a);
    }catch(e){console.warn('アタッチメント分類補正失敗',e)}
  }

  function makeBox(id,title){
    const d=document.createElement('div');
    d.id=id;
    d.className='row attachment-section-box';
    d.style.cssText='margin-top:12px;padding:14px;border:2px solid #d9d9d9;background:#fff';
    const h=document.createElement('h3');
    h.textContent=title;
    h.style.cssText='margin:0 0 12px;font-size:17px';
    d.appendChild(h);
    return d;
  }

  function splitReport(){
    try{
      const machine=document.querySelector('#machineAttachmentChoices');
      const small=document.querySelector('#smallToolChoices');
      if(machine && !document.querySelector('#reportMachineAttachmentBox')){
        const box=makeBox('reportMachineAttachmentBox','重機アタッチメント');
        const prev=machine.previousElementSibling;
        machine.parentNode.insertBefore(box,prev&&/^H[1-6]$/.test(prev.tagName)?prev:machine);
        if(prev&&/^H[1-6]$/.test(prev.tagName))prev.remove();
        box.appendChild(machine);
      }
      if(small && !document.querySelector('#reportSmallToolBox')){
        const box=makeBox('reportSmallToolBox','小型機械・工具');
        const prev=small.previousElementSibling;
        small.parentNode.insertBefore(box,prev&&/^H[1-6]$/.test(prev.tagName)?prev:small);
        if(prev&&/^H[1-6]$/.test(prev.tagName))prev.remove();
        box.appendChild(small);
      }
      // 日報入力側に追加ボタンが残っていたら確実に消す
      document.querySelector('#addMachineAttachmentQuick')?.remove();
      document.querySelector('#addSmallToolQuick')?.remove();
    }catch(e){console.warn('日報アタッチメント分離失敗',e)}
  }

  function splitAdmin(){
    try{
      normalizeMaster();
      const root=document.querySelector('#attachmentMaster');
      if(!root||typeof LS==='undefined'||typeof get!=='function')return;
      const a=get(LS.attachments,[])||[];
      const rows=[...root.querySelectorAll(':scope > .row')];
      if(!rows.length && root.querySelector('#adminMachineAttachmentBox'))return;

      const machineBox=makeBox('adminMachineAttachmentBox','重機アタッチメント登録');
      const machineList=document.createElement('div');machineList.id='adminMachineAttachmentList';machineBox.appendChild(machineList);
      const smallBox=makeBox('adminSmallToolBox','小型機械・工具登録');
      const smallList=document.createElement('div');smallList.id='adminSmallToolList';smallBox.appendChild(smallList);

      rows.forEach((row,i)=>{
        const x=a[i]||{};
        (smallCats.has(x.category)?smallList:machineList).appendChild(row);
      });
      root.innerHTML='';
      root.append(machineBox,smallBox);

      // 既存の登録管理追加ボタンを、それぞれの枠内へ移す
      const controls=document.querySelector('#adminAttachmentAddButtons');
      if(controls){
        const btns=[...controls.querySelectorAll('button')];
        if(btns[0]){btns[0].style.width='100%';btns[0].style.marginTop='10px';machineBox.appendChild(btns[0]);}
        if(btns[1]){btns[1].style.width='100%';btns[1].style.marginTop='10px';smallBox.appendChild(btns[1]);}
        controls.innerHTML='';controls.style.display='none';
      }
      const generic=[...document.querySelectorAll('#masterPage button')].find(b=>b.getAttribute('onclick')==='addAttachment()');
      if(generic)generic.style.display='none';
    }catch(e){console.warn('登録管理アタッチメント分離失敗',e)}
  }

  function install(){
    normalizeMaster();
    splitReport();
    splitAdmin();

    if(typeof window.renderAttachmentMaster==='function'&&!window.__toyaAttachmentMasterSplitWrap){
      const old=window.renderAttachmentMaster;
      window.renderAttachmentMaster=function(){const out=old.apply(this,arguments);setTimeout(splitAdmin,0);return out;};
      window.__toyaAttachmentMasterSplitWrap=true;
    }
    if(typeof window.renderMasters==='function'&&!window.__toyaMastersSplitWrap){
      const old=window.renderMasters;
      window.renderMasters=function(){const out=old.apply(this,arguments);setTimeout(splitAdmin,0);return out;};
      window.__toyaMastersSplitWrap=true;
    }
    if(typeof window.renderSelectors==='function'&&!window.__toyaSelectorsSplitWrap){
      const old=window.renderSelectors;
      window.renderSelectors=function(){const out=old.apply(this,arguments);setTimeout(()=>{splitReport();splitAdmin();},0);return out;};
      window.__toyaSelectorsSplitWrap=true;
    }
    return true;
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,300));else setTimeout(install,300);
  document.addEventListener('click',e=>{if(e.target?.closest?.('nav button'))setTimeout(()=>{splitReport();splitAdmin();},250)});
  let n=0;const t=setInterval(()=>{n++;splitReport();splitAdmin();if(n>25)clearInterval(t)},200);
})();
