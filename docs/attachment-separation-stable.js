/* TOYA_UI_CLEANUP_20260908_V1: display only; authentication and stored records unchanged. */
(function(){
  'use strict';
  if(window.__toyaLayoutCleanupV1)return;
  window.__toyaLayoutCleanupV1=true;
  const smallCats=new Set(['小型機械','発電機','エア工具','エアー工具','小型機械・工具']);
  const smallNames=new Set(['散水機','高圧洗浄機','2kW発電機','インバーター発電機','コンプレッサー','ホース20M','エアーホース20M','20番ブレーカー','10番ブレーカー','チッパー','エアーカッター']);
  const q=s=>document.querySelector(s);
  const nameOf=x=>typeof x==='string'?x:String(x?.name||'');
  const isSmall=(name,cat)=>!name.includes('スケルトンバケット')&&(smallCats.has(cat)||smallNames.has(name));
  let running=false,pending=false,observer=null;
  function text(el,value){if(el&&el.textContent!==value)el.textContent=value;}
  function masterData(){
    try{return typeof LS!=='undefined'&&typeof get==='function'?(get(LS.attachments,[])||[]):[];}catch(e){return [];}
  }
  function cardAfter(original,id,title,innerId){
    let card=q('#'+id);
    if(!card){
      card=document.createElement('div');card.id=id;card.className='card';
      const heading=document.createElement('h2');heading.textContent=title;card.appendChild(heading);
      if(innerId){const box=document.createElement('div');box.id=innerId;card.appendChild(box);}
      original.insertAdjacentElement('afterend',card);
    }
    return card;
  }
  function choiceLabel(label,value){
    // Move/relabel existing controls, never clone inputs or lose quantity/checked state.
    let span=label.querySelector('.toya-asset-label');
    if(!span){
      [...label.childNodes].filter(n=>n.nodeType===3).forEach(n=>n.remove());
      span=document.createElement('span');span.className='toya-asset-label';
      const input=label.querySelector('input[name="attachment"]');
      if(input)input.insertAdjacentElement('afterend',span);else label.appendChild(span);
    }
    text(span,value);
  }
  function splitReport(){
    const machine=q('#machineAttachmentChoices'),small=q('#smallToolChoices');
    if(!machine||!small)return;
    const original=machine.closest('.card');if(!original)return;
    const smallCard=cardAfter(original,'smallToolReportCard','使用小型機械・工具');
    [...original.children].forEach(el=>{
      if(el.tagName==='DIV'&&((el.nextElementSibling===machine&&el.textContent.trim()==='重機アタッチメント')||(el.nextElementSibling===small&&el.textContent.trim()==='小型機械・工具')))el.remove();
    });
    if(small.parentElement!==smallCard)smallCard.appendChild(small);
    text(original.querySelector('h2'),'使用重機アタッチメント');
    const byName=new Map(masterData().map(x=>[nameOf(x),x]));
    [...machine.children,...small.children].forEach(label=>{
      const input=label.querySelector('input[name="attachment"]');if(!input)return;
      const asset=byName.get(input.value);const name=input.value,cat=asset?.category||'';
      const smallKind=asset?isSmall(name,cat):label.parentElement===small;
      const dest=smallKind?small:machine;if(label.parentElement!==dest)dest.appendChild(label);
      const friendly=smallKind?name:((cat&&cat!=='アタッチメント'&&!name.startsWith(cat))?cat+'｜'+name:name);
      choiceLabel(label,friendly);
    });
    q('#addMachineAttachmentQuick')?.remove();q('#addSmallToolQuick')?.remove();
  }
  function rowInfo(row){
    // Inputs rendered by the main app omit type="text". Use their property/field handler.
    const inputs=[...row.querySelectorAll('input')].filter(x=>x.type==='text');
    const nameInput=inputs.find(x=>(x.getAttribute('onchange')||'').includes("'name'"))||inputs[0];
    const catInput=inputs.find(x=>(x.getAttribute('onchange')||'').includes("'category'"))||inputs[1];
    const match=(nameInput?.getAttribute('onchange')||'').match(/updateAttachment\((\d+),/);
    return {name:(nameInput?.value||'').trim(),cat:(catInput?.value||'').trim(),index:match?match[1]:null};
  }
  function splitAdmin(){
    const master=q('#attachmentMaster');if(!master)return;
    const original=master.closest('.card');if(!original)return;
    text(original.querySelector('h2'),'重機アタッチメント登録');
    const smallCard=cardAfter(original,'smallToolMasterCard','小型機械・工具登録','smallToolMaster');
    const smallMaster=q('#smallToolMaster');if(!smallMaster)return;
    const seen=new Set();
    [...master.children,...smallMaster.children].forEach(row=>{
      if(!row.matches('.row'))return;
      const info=rowInfo(row);
      // Deduplicate rendered rows only; never remove an item from the saved master.
      if(info.index!==null){if(seen.has(info.index)){row.remove();return;}seen.add(info.index);}
      const dest=isSmall(info.name,info.cat)?smallMaster:master;
      if(row.parentElement!==dest)dest.appendChild(row);
    });
    const page=q('#masterPage');if(!page)return;
    const normalize=s=>s.replace(/[\s　]/g,'').replace(/^\+/,'＋');
    const groups=[
      {id:'adminAddMachineAtt',label:'＋重機アタッチメントを追加',parent:original},
      {id:'adminAddSmallTool',label:'＋小型機械・工具を追加',parent:smallCard}
    ];
    groups.forEach(g=>{
      const buttons=[...page.querySelectorAll('button')].filter(b=>b.id===g.id||normalize(b.textContent)===g.label);
      const keep=buttons[0];if(!keep)return;
      buttons.slice(1).forEach(b=>b.remove());
      keep.id=g.id;keep.type='button';keep.style.width='100%';keep.style.marginTop='10px';
      if(keep.parentElement!==g.parent)g.parent.appendChild(keep);
    });
    // Legacy producer checks the wrapper ID, not the moved buttons. KEEP this sentinel.
    // Removing it would make waste-price-admin.js create another pair on each timer tick.
    const wraps=[...page.querySelectorAll('[id="adminAttachmentAddButtons"]')];
    wraps.slice(1).forEach(w=>w.remove());
    if(wraps[0]){wraps[0].hidden=true;wraps[0].style.display='none';}
    [...original.querySelectorAll('button')].filter(b=>(b.getAttribute('onclick')||'').trim()==='addAttachment()').forEach(b=>{b.hidden=true;b.style.display='none';});
  }
  function compactHome(){
    if(!q('#toyaCompactHomeStyle')){
      const style=document.createElement('style');style.id='toyaCompactHomeStyle';
      style.textContent='#cloudCard #cloudReportList>.cloud-item{display:none!important}#cloudCard #cloudReportList{margin-top:0}#reportPage #addMachineAttachmentQuick,#reportPage #addSmallToolQuick{display:none!important}.toya-asset-label{min-width:0;overflow-wrap:anywhere}';
      document.head.appendChild(style);
    }
    const logged=q('#cloudLoggedIn');if(!logged)return;
    const button=logged.querySelector('button[onclick="cloudLoadReports()"]');
    if(button){
      button.removeAttribute('onclick');button.id='toyaOpenReportList';button.type='button';
      text(button,'日報一覧を開く');
      button.onclick=()=>{q('nav button[data-page="recordsPage"]')?.click();window.scrollTo({top:0,behavior:'auto'});};
    }
    // Keep the original cloud load and error display logic intact; hide only repeated cards.
    if(!q('#toyaReportListHint')){
      const note=document.createElement('div');note.id='toyaReportListHint';note.className='note';
      note.style.marginTop='8px';note.textContent='日報・写真の確認、編集は「日報一覧」から。';
      logged.insertBefore(note,q('#cloudReportList'));
    }
  }
  function observe(){
    if(!observer)return;
    const master=q('#masterPage');if(master)observer.observe(master,{childList:true,subtree:true});
    for(const id of ['machineAttachmentChoices','smallToolChoices']){const el=q('#'+id);if(el)observer.observe(el,{childList:true});}
  }
  function refresh(){
    if(running)return;running=true;observer?.disconnect();
    try{splitReport();splitAdmin();compactHome();}
    catch(e){console.warn('TOYA 表示整理',e);}
    finally{running=false;observe();}
  }
  function schedule(){
    if(pending)return;pending=true;
    setTimeout(()=>{pending=false;refresh();},0);
  }
  function install(){
    if(window.__toyaLayoutCleanupInstalledV1)return;
    window.__toyaLayoutCleanupInstalledV1=true;
    // Clear the separated display rows BEFORE the original renderer rebuilds all rows.
    // Input indices and all original update/delete handlers remain unchanged.
    if(typeof window.renderAttachmentMaster==='function'){
      const original=window.renderAttachmentMaster;
      window.renderAttachmentMaster=function(){
        observer?.disconnect();q('#smallToolMaster')?.replaceChildren();
        try{return original.apply(this,arguments);}finally{refresh();}
      };
    }
    observer=new MutationObserver(schedule);refresh();
    document.addEventListener('click',e=>{if(e.target?.closest?.('nav button'))schedule();});
    document.addEventListener('change',e=>{if(e.target?.closest?.('#attachmentMaster,#smallToolMaster'))schedule();});
    // Finite boot reconciliation only; no repeated event-handler installation.
    [350,1000,7000].forEach(ms=>setTimeout(refresh,ms));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();

/* TOYA employee login helper - UI only, auth logic unchanged */
(function(){
  const correct={
    '上村 凌太':'kabushikigaisyatoya+ryota@gmail.com',
    '宮下 哲也':'kabushikigaisyatoya+tetsuya@gmail.com'
  };
  const typo={
    'kabushikigaisiyatoya+uemura@gmail.com':'kabushikigaisyatoya+ryota@gmail.com',
    'kabushikigaisiyatoya+tetsuya@gmail.com':'kabushikigaisyatoya+tetsuya@gmail.com'
  };

  function installLoginHelper(){
    const loggedOut=document.querySelector('#cloudLoggedOut');
    const email=document.querySelector('#cloudEmail');
    if(!loggedOut||!email)return false;
    if(!document.querySelector('#employeeQuickLogin')){
      const box=document.createElement('div');
      box.id='employeeQuickLogin';
      box.style.cssText='margin:10px 0 0;padding:10px;border:1px solid #ddd;border-radius:10px;background:#fafafa';
      box.innerHTML='<div style="font-weight:900;margin-bottom:7px">社員は名前をタップ</div>';
      const row=document.createElement('div');
      row.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:8px';
      Object.entries(correct).forEach(([name,addr])=>{
        const b=document.createElement('button');
        b.type='button';b.className='btn light';b.textContent=name;
        b.onclick=()=>{email.value=addr;email.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#cloudPassword')?.focus();};
        row.appendChild(b);
      });
      box.appendChild(row);
      loggedOut.insertBefore(box,loggedOut.querySelector('button[onclick="cloudLogin()"]'));
    }
    if(!email.dataset.toyaEmployeeFix){
      email.dataset.toyaEmployeeFix='1';
      const fix=()=>{const v=email.value.trim().toLowerCase();if(typo[v])email.value=typo[v];};
      email.addEventListener('change',fix);email.addEventListener('blur',fix);
    }
    return true;
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(installLoginHelper,200));else setTimeout(installLoginHelper,200);
  let i=0;const timer=setInterval(()=>{if(installLoginHelper()||++i>20)clearInterval(timer)},250);
})();
