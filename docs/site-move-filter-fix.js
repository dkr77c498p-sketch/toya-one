(function(){
  function invalidSite(x){return !x||['新しい現場','現場名をあとで変更','未登録現場'].includes(x)}

  async function loadActiveSites(){
    try{
      if(typeof cloudClient==='undefined'||!cloudClient||typeof cloudProfile==='undefined'||!cloudProfile?.company_id)return [];
      const {data,error}=await cloudClient.from('sites').select('name,status').eq('company_id',cloudProfile.company_id).eq('status','active').order('name');
      if(error)throw error;
      return (data||[]).map(x=>x.name).filter(x=>!invalidSite(x));
    }catch(e){console.warn('現場マスター取得失敗',e);return []}
  }

  async function refreshNonRecordSiteSelectors(){
    if(window.ToyaSharedSiteUI?.ready()){window.ToyaSharedSiteUI.syncBrowse(document.querySelector('#ledgerSite'));window.ToyaSharedSiteUI.syncBrowse(document.querySelector('#siteSummarySelect'));return;}
    const names=await loadActiveSites();
    if(window.ToyaSharedSiteUI?.ready()){window.ToyaSharedSiteUI.syncBrowse(document.querySelector('#ledgerSite'));window.ToyaSharedSiteUI.syncBrowse(document.querySelector('#siteSummarySelect'));return;}
    if(!names.length)return;
    const fill=(sel,all)=>{if(!sel)return;const cur=sel.value;sel.innerHTML=(all?'<option value="">現場を選択</option>':'')+names.map(n=>`<option>${String(n).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</option>`).join('');if(cur&&names.includes(cur))sel.value=cur};
    fill(document.querySelector('#ledgerSite'),false);
    fill(document.querySelector('#siteSummarySelect'),true);
  }

  function installRecordFilters(){
    if(typeof recordFilters!=='function'||window.__moveRecordFiltersFixed5)return false;
    window.recordFilters=function(a,{ignoreDate=false}={}){
      const q=(document.querySelector('#recordSearch')?.value||'').trim().toLowerCase();
      const site=document.querySelector('#recordSiteFilter')?.value||'';
      const writer=document.querySelector('#recordWriterFilter')?.value||'';
      const from=ignoreDate?'':(document.querySelector('#recordDateFrom')?.value||'');
      const to=ignoreDate?'':(document.querySelector('#recordDateTo')?.value||'');
      const siteKey=v=>String(v||'').normalize('NFKC').replace(/[\s　]/g,'');
      return (a||[]).filter(d=>{
        const moves=d.siteMoves||[];
        const hay=[d.site,d.writer,d.details,d.memo,...(d.workTypes||[]),...moves.flatMap(m=>[m?.site,m?.action,m?.waste,m?.disposal,m?.vehicle])].filter(Boolean).join(' ').toLowerCase();
        return(!q||hay.includes(q))&&(!site||siteKey(d.site)===siteKey(site)||moves.some(m=>siteKey(m?.site)===siteKey(site)))&&(!writer||d.writer===writer)&&(!from||String(d.date||'')>=from)&&(!to||String(d.date||'')<=to);
      });
    };
    window.__moveRecordFiltersFixed5=true;
    return true;
  }

  function installAsahiFix(){
    if(typeof window.cloudNormalizeReport!=='function'||window.__toyaAsahiRuntimeFixV3)return false;
    const old=window.cloudNormalizeReport;
    window.cloudNormalizeReport=function(r){
      const d=old(r);
      try{
        const full=(r&&r.report_data&&typeof r.report_data==='object')?r.report_data:{};
        if(Object.prototype.hasOwnProperty.call(full,'asahiCount'))d.asahiCount=Number(full.asahiCount??0);
        else d.asahiCount=Math.max(0,Number(r?.dispatch_count||0)-Number(full.meikenCount||0));
      }catch(e){d.asahiCount=Number(d.asahiCount||0)}
      return d;
    };
    window.__toyaAsahiRuntimeFixV3=true;
    return true;
  }

  function installAll(){
    installRecordFilters();installAsahiFix();refreshNonRecordSiteSelectors();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(installAll,300));else setTimeout(installAll,300);
  let n=0;const timer=setInterval(()=>{n++;installAll();if(n>30)clearInterval(timer)},200);
  document.addEventListener('click',e=>{if(e.target?.closest?.('nav button'))setTimeout(refreshNonRecordSiteSelectors,400)});
})();

/* TOYA_SMALL_TOOLS_MASTER_V1 */
(function(){
  const extra=[
    {name:'散水機',category:'小型機械'},
    {name:'高圧洗浄機',category:'小型機械'},
    {name:'2kW発電機',category:'発電機'},
    {name:'インバーター発電機',category:'発電機'},
    {name:'コンプレッサー',category:'エア工具'},
    {name:'エアーホース20M',category:'エア工具'},
    {name:'20番ブレーカー',category:'エア工具'},
    {name:'10番ブレーカー',category:'エア工具'},
    {name:'チッパー',category:'エア工具'},
    {name:'エアーカッター',category:'エア工具'}
  ];
  function install(){
    try{
      if(typeof LS==='undefined'||typeof get!=='function'||typeof set!=='function'||!LS.attachments)return false;
      const a=get(LS.attachments,[])||[];
      let changed=false;
      a.forEach(x=>{if(x&&x.name==='ホース20M'){x.name='エアーホース20M';changed=true;}});
      const names=new Set(a.map(x=>typeof x==='string'?x:x?.name).filter(Boolean));
      extra.forEach(x=>{if(!names.has(x.name)){a.push({name:x.name,category:x.category,location:'',mountedOn:'',memo:''});names.add(x.name);changed=true;}});
      if(changed){set(LS.attachments,a);try{if(typeof renderSelectors==='function')renderSelectors();if(typeof renderMasters==='function'&&document.querySelector('#masterPage')?.classList.contains('active'))renderMasters();}catch(e){}}
      window.__toyaSmallToolsMasterV1=true;
      return true;
    }catch(e){console.warn('小型工具マスター追加失敗',e);return false;}
  }
  if(!install()){let n=0;const t=setInterval(()=>{n++;if(install()||n>30)clearInterval(t)},200);}
})();

/* TOYA_SMALL_TOOL_QUANTITY_RUNTIME_V1 */
(function(){
  const spec={
    '2kW発電機':{max:2,unit:'台'},
    'インバーター発電機':{max:2,unit:'台'},
    'エアーホース20M':{max:4,unit:'本'}
  };

  function decorate(){
    const box=document.querySelector('#smallToolChoices');
    if(!box)return false;
    box.querySelectorAll('input[name="attachment"]').forEach(input=>{
      const cfg=spec[input.value];
      if(!cfg)return;
      const parent=input.closest('.choice');
      if(!parent||parent.querySelector('.att-qty'))return;
      const sel=document.createElement('select');
      sel.className='att-qty';
      sel.dataset.attName=input.value;
      sel.dataset.unit=cfg.unit;
      sel.style.width='auto';
      sel.style.minHeight='38px';
      sel.style.marginLeft='auto';
      sel.style.padding='5px 8px';
      for(let i=1;i<=cfg.max;i++){
        const o=document.createElement('option');o.value=String(i);o.textContent=`${i}${cfg.unit}`;sel.appendChild(o);
      }
      parent.appendChild(sel);
    });
    return true;
  }

  function install(){
    if(window.__toyaSmallToolQuantityRuntimeV1)return true;
    if(typeof window.renderSelectors!=='function'||typeof window.collect!=='function')return false;

    const oldRender=window.renderSelectors;
    window.renderSelectors=function(){const out=oldRender.apply(this,arguments);setTimeout(decorate,0);return out;};

    const oldCollect=window.collect;
    window.collect=function(){
      const d=oldCollect.apply(this,arguments);
      d.attachments=(d.attachments||[]).map(v=>{
        if(!spec[v])return v;
        const q=document.querySelector(`.att-qty[data-att-name="${CSS.escape(v)}"]`);
        return q?`${v} × ${q.value}${q.dataset.unit||''}`:v;
      });
      return d;
    };

    if(typeof window.fillReportForm==='function'){
      const oldFill=window.fillReportForm;
      window.fillReportForm=function(d,mode){
        const clean={...d,attachments:(d.attachments||[]).map(v=>String(v).replace(/\s*×\s*\d+(台|本)$/,''))};
        const out=oldFill.call(this,clean,mode);
        setTimeout(()=>{
          decorate();
          (d.attachments||[]).forEach(v=>{
            const m=String(v).match(/^(.*?)\s*×\s*(\d+)(台|本)$/);
            if(!m)return;
            const q=[...document.querySelectorAll('.att-qty')].find(x=>x.dataset.attName===m[1].trim());
            if(q)q.value=m[2];
          });
        },0);
        return out;
      };
    }

    window.__toyaSmallToolQuantityRuntimeV1=true;
    setTimeout(()=>{try{oldRender();decorate();}catch(e){}},50);
    return true;
  }

  if(!install()){let n=0;const t=setInterval(()=>{n++;if(install()||n>40)clearInterval(t)},100);}
})();

/* TOYA_ATTACHMENT_ADD_V2: usage display lives in attachment-usage.js. */
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
        category='小型機械';
      }
      if(!name)return;
      const a=get(LS.attachments,[])||[];
      if(a.some(x=>cleanName(typeof x==='string'?x:x?.name)===name))return alert('同じ名称がすでに登録されています。');
      a.push({name,category,location:'',mountedOn:'',memo:''});
      set(LS.attachments,a);
      if(typeof renderSelectors==='function')renderSelectors();
      if(typeof renderMasters==='function'&&document.querySelector('#masterPage')?.classList.contains('active'))renderMasters();
      if(typeof renderAttachments==='function'&&document.querySelector('#attachmentPage')?.classList.contains('active'))renderAttachments();
    }catch(e){console.warn('アタッチメント追加失敗',e)}
  }

  function ensureButtons(){
    const m=document.querySelector('#machineAttachmentChoices');
    if(m&&!document.querySelector('#addMachineAttachmentQuick')){
      const b=document.createElement('button');
      b.id='addMachineAttachmentQuick';b.type='button';b.className='btn light no-print';b.style.cssText='width:100%;margin-top:9px';
      b.textContent='＋ 重機アタッチメントを追加';b.onclick=()=>addMasterAttachment('machine');
      m.insertAdjacentElement('afterend',b);
    }
    const t=document.querySelector('#smallToolChoices');
    if(t&&!document.querySelector('#addSmallToolQuick')){
      const b=document.createElement('button');
      b.id='addSmallToolQuick';b.type='button';b.className='btn light no-print';b.style.cssText='width:100%;margin-top:9px';
      b.textContent='＋ 小型機械・工具を追加';b.onclick=()=>addMasterAttachment('small');
      t.insertAdjacentElement('afterend',b);
    }
  }

  function install(){
    ensureButtons();
    if(typeof window.renderSelectors==='function'&&!window.__toyaAttachmentAddRenderWrap){
      const old=window.renderSelectors;window.renderSelectors=function(){const out=old.apply(this,arguments);setTimeout(ensureButtons,0);return out;};window.__toyaAttachmentAddRenderWrap=true;
    }
    return !!document.querySelector('#machineAttachmentChoices');
  }

  if(!install()){let n=0;const t=setInterval(()=>{n++;if(install()||n>40)clearInterval(t)},100);}else setTimeout(ensureButtons,100);
})();
