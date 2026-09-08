/* TOYA attachment separation - UI only, no auth changes */
(function(){
  const smallCats=new Set(['小型機械','発電機','エア工具','小型機械・工具']);
  const smallNames=new Set(['散水機','高圧洗浄機','2kW発電機','インバーター発電機','コンプレッサー','エアーホース20M','20番ブレーカー','10番ブレーカー','チッパー','エアーカッター']);
  const nameOf=x=>typeof x==='string'?x:String(x?.name||'');
  const catOf=x=>typeof x==='string'?'':String(x?.category||'');
  const isSmall=(name,cat)=>smallCats.has(cat)||smallNames.has(name);

  function normalizeMaster(){
    try{
      if(typeof LS==='undefined'||typeof get!=='function'||typeof set!=='function'||!LS.attachments)return;
      const a=get(LS.attachments,[])||[];
      let changed=false;
      a.forEach(x=>{
        if(!x||typeof x==='string')return;
        const n=nameOf(x);
        if(n.includes('スケルトンバケット2号機用') && (!x.category||smallCats.has(x.category))){x.category='スケルトンバケット2号機用';changed=true;}
        if(n.includes('スケルトンバケット1号機用') && (!x.category||smallCats.has(x.category))){x.category='スケルトンバケット1号機用';changed=true;}
      });
      if(changed)set(LS.attachments,a);
    }catch(e){console.warn('attachment normalize',e)}
  }

  function splitReport(){
    const machine=document.querySelector('#machineAttachmentChoices');
    const small=document.querySelector('#smallToolChoices');
    if(!machine||!small)return;
    const original=machine.closest('.card');
    if(!original)return;

    let smallCard=document.querySelector('#smallToolReportCard');
    if(!smallCard){
      smallCard=document.createElement('div');
      smallCard.id='smallToolReportCard';
      smallCard.className='card';
      smallCard.innerHTML='<h2>使用小型機械・工具</h2>';
      original.insertAdjacentElement('afterend',smallCard);
    }
    const smallHeading=[...original.querySelectorAll('div')].find(x=>x.textContent.trim()==='小型機械・工具' && x.nextElementSibling===small);
    if(smallHeading)smallHeading.remove();
    if(small.parentElement!==smallCard)smallCard.appendChild(small);

    const h2=original.querySelector('h2');
    if(h2)h2.textContent='使用重機アタッチメント';
    const machineHeading=[...original.querySelectorAll('div')].find(x=>x.textContent.trim()==='重機アタッチメント' && x.nextElementSibling===machine);
    if(machineHeading)machineHeading.remove();
  }

  function rowInfo(row){
    const inputs=[...row.querySelectorAll('input[type="text"]')];
    const name=(inputs[0]?.value||'').trim();
    const cat=(inputs[1]?.value||'').trim();
    return {name,cat};
  }

  function splitAdmin(){
    const master=document.querySelector('#attachmentMaster');
    if(!master)return;
    const original=master.closest('.card');
    if(!original)return;
    const title=original.querySelector('h2');
    if(title)title.textContent='重機アタッチメント登録';

    let smallCard=document.querySelector('#smallToolMasterCard');
    let smallMaster=document.querySelector('#smallToolMaster');
    if(!smallCard){
      smallCard=document.createElement('div');
      smallCard.id='smallToolMasterCard';
      smallCard.className='card';
      smallCard.innerHTML='<h2>小型機械・工具登録</h2><div id="smallToolMaster"></div>';
      original.insertAdjacentElement('afterend',smallCard);
      smallMaster=smallCard.querySelector('#smallToolMaster');
    }
    if(!smallMaster)return;

    [...master.children].forEach(row=>{
      if(!row.matches('.row'))return;
      const {name,cat}=rowInfo(row);
      if(isSmall(name,cat))smallMaster.appendChild(row);
    });
    [...smallMaster.children].forEach(row=>{
      if(!row.matches('.row'))return;
      const {name,cat}=rowInfo(row);
      if(!isSmall(name,cat))master.appendChild(row);
    });

    const quick=document.querySelector('#adminAttachmentAddButtons');
    if(quick){
      const buttons=[...quick.querySelectorAll('button')];
      const machineBtn=buttons.find(b=>b.textContent.includes('重機アタッチメント'));
      const smallBtn=buttons.find(b=>b.textContent.includes('小型機械'));
      if(machineBtn && machineBtn.parentElement!==original){machineBtn.style.width='100%';machineBtn.style.marginTop='10px';original.appendChild(machineBtn);}
      if(smallBtn && smallBtn.parentElement!==smallCard){smallBtn.style.width='100%';smallBtn.style.marginTop='10px';smallCard.appendChild(smallBtn);}
      if(!quick.children.length)quick.remove();
    }

    const legacy=[...original.querySelectorAll('button')].find(b=>b.textContent.trim()==='＋ アタッチメントを追加');
    if(legacy)legacy.style.display='none';
  }

  function run(){normalizeMaster();splitReport();splitAdmin();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(run,300));else setTimeout(run,300);
  let n=0;const t=setInterval(()=>{run();if(++n>25)clearInterval(t)},250);
  document.addEventListener('click',e=>{if(e.target?.closest?.('nav button'))setTimeout(run,250)});
})();
