(function(){
  const smallCats=new Set(['小型機械','発電機','エア工具']);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean=s=>String(s||'').trim();

  function migrate(){
    try{
      if(typeof LS==='undefined'||typeof get!=='function'||typeof set!=='function'||!LS.attachments)return false;
      const a=get(LS.attachments,[])||[];
      let changed=false;
      a.forEach(x=>{
        if(!x||typeof x!=='object')return;
        const n=clean(x.name);
        if((n==='スケルトンバケット2号機用｜KGSP'||n==='スケルトンバケット2号機用 | KGSP')&&(!x.category||x.category==='アタッチメント')){
          x.name='KGSP';x.category='スケルトンバケット2号機用';changed=true;
        }
      });
      if(changed)set(LS.attachments,a);
      return changed;
    }catch(e){console.warn('attachment migrate',e);return false;}
  }

  function rowHtml(x,i){
    x=(x&&typeof x==='object')?x:{name:String(x||''),category:'',location:'',mountedOn:'',memo:''};
    return `<div class="row">
      <div class="rowhead"><b>${esc(x.category||'アタッチメント')}</b><button class="btn danger" onclick="deleteAttachment(${i})">削除</button></div>
      <div class="grid2"><div><label>名称・型式</label><input value="${esc(x.name||'')}" onchange="updateAttachment(${i},'name',this.value)"></div><div><label>種類</label><input value="${esc(x.category||'')}" onchange="updateAttachment(${i},'category',this.value)"></div></div>
      <div class="grid2"><div><label>保管場所</label><input value="${esc(x.location||'')}" placeholder="第1ヤード・現場など" onchange="updateAttachment(${i},'location',this.value)"></div><div><label>装着中の重機</label><input value="${esc(x.mountedOn||'')}" placeholder="SK135（1号機）など" onchange="updateAttachment(${i},'mountedOn',this.value)"></div></div>
      <label>メモ・整備内容</label><input value="${esc(x.memo||'')}" onchange="updateAttachment(${i},'memo',this.value)">
    </div>`;
  }

  function add(kind){
    try{
      if(typeof LS==='undefined'||typeof get!=='function'||typeof set!=='function')return;
      const a=get(LS.attachments,[])||[];
      let category='',name='';
      if(kind==='heavy'){
        category=(prompt('種類を入力してください（例：大割機・SRCカッター・フォーク）')||'').trim();
        if(!category)return;
        name=(prompt('名称・型式を入力してください')||'').trim();
      }else{
        name=(prompt('小型機械・工具の名称を入力してください')||'').trim();
        category='小型機械';
      }
      if(!name)return;
      a.push({name,category,location:'',mountedOn:'',memo:''});
      set(LS.attachments,a);
      try{if(typeof renderMasters==='function')renderMasters();if(typeof renderSelectors==='function')renderSelectors();}catch(e){}
    }catch(e){console.warn('attachment add',e)}
  }
  window.toyaAddHeavyAttachment=()=>add('heavy');
  window.toyaAddSmallTool=()=>add('small');

  function install(){
    if(typeof window.renderAttachmentMaster!=='function'||typeof LS==='undefined'||typeof get!=='function')return false;
    migrate();
    window.renderAttachmentMaster=function(){
      const box=document.querySelector('#attachmentMaster');if(!box)return;
      const a=get(LS.attachments,[])||[];
      const heavy=[],small=[];
      a.forEach((x,i)=>{const cat=(x&&typeof x==='object')?x.category:'';(smallCats.has(cat)?small:heavy).push([x,i]);});
      box.innerHTML=`
        <div class="row" style="background:#fff;border:2px solid #111;padding:12px;margin-bottom:14px">
          <div class="rowhead"><b style="font-size:17px">重機アタッチメント登録</b></div>
          ${heavy.length?heavy.map(([x,i])=>rowHtml(x,i)).join(''):'<div class="empty">登録がありません。</div>'}
          <button type="button" class="btn dark" style="width:100%;margin-top:10px" onclick="toyaAddHeavyAttachment()">＋ 重機アタッチメントを追加</button>
        </div>
        <div class="row" style="background:#fff;border:2px solid #bbb;padding:12px">
          <div class="rowhead"><b style="font-size:17px">小型機械・工具登録</b></div>
          ${small.length?small.map(([x,i])=>rowHtml(x,i)).join(''):'<div class="empty">登録がありません。</div>'}
          <button type="button" class="btn light" style="width:100%;margin-top:10px" onclick="toyaAddSmallTool()">＋ 小型機械・工具を追加</button>
        </div>`;
      document.querySelector('#adminAttachmentAddButtons')?.remove();
    };
    try{if(typeof renderSelectors==='function')renderSelectors();if(typeof renderMasters==='function'&&document.querySelector('#masterPage')?.classList.contains('active'))renderMasters();}catch(e){}
    return true;
  }

  if(!install()){let n=0;const t=setInterval(()=>{n++;if(install()||n>50)clearInterval(t)},100);}
})();
