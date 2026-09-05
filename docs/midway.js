(function(){
  function escHtml(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function allSites(){
    const sel=document.querySelector('#site');
    const current=sel?sel.value:'';
    const arr=sel?[...sel.options].map(o=>o.value):[];
    return [...new Set(arr.filter(x=>x&&x!==current&&x!=='新しい現場'&&x!=='現場名をあとで変更'&&x!=='未登録現場'))];
  }
  function vehicles(){
    try{return (window.defaults&&window.LS&&typeof window.get==='function')?get(LS.vehicles,defaults.vehicles):['軽トラ','ハイエース','3tダンプ','4tダンプ','4tアームロール','10tダンプ']}catch(e){return ['軽トラ','ハイエース','3tダンプ','4tダンプ','4tアームロール','10tダンプ']}
  }
  window.addSiteMoveEntry=function(d={}){
    const box=document.querySelector('#siteMoveEntries'); if(!box)return;
    const sites=allSites();
    if(!sites.length){alert('移動先として選べる登録現場がありません。');return}
    const r=document.createElement('div'); r.className='row site-move-entry';
    r.style.marginTop='12px';
    r.innerHTML=`<div class="rowhead"><b>現場移動</b><button type="button" class="btn danger" onclick="this.closest('.site-move-entry').remove()">削除</button></div>
      <label>移動した現場</label><select class="sm-site">${sites.map(x=>`<option>${escHtml(x)}</option>`).join('')}</select>
      <label>作業内容</label><div class="quick-row"><button type="button" class="quick-btn" onclick="setSiteMoveAction(this,'廃材積込')">廃材積込</button><button type="button" class="quick-btn" onclick="setSiteMoveAction(this,'処分場へ運搬')">処分場へ運搬</button><button type="button" class="quick-btn" onclick="setSiteMoveAction(this,'積込・運搬')">積込・運搬</button><button type="button" class="quick-btn" onclick="setSiteMoveAction(this,'現場作業')">現場作業</button></div>
      <input class="sm-action" style="margin-top:7px" placeholder="その他はここに入力" value="${escHtml(d.action||'')}">
      <label>使用車両</label><select class="sm-vehicle"><option value="">なし</option>${vehicles().map(x=>`<option>${escHtml(x)}</option>`).join('')}</select>
      <label class="choice" style="margin-top:9px"><input type="checkbox" class="sm-return" ${d.returned===false?'':'checked'}> 元の現場へ戻った</label>`;
    box.appendChild(r);
    if(d.site)r.querySelector('.sm-site').value=d.site;
    if(d.vehicle)r.querySelector('.sm-vehicle').value=d.vehicle;
  };
  window.setSiteMoveAction=function(btn,v){const r=btn.closest('.site-move-entry');if(r)r.querySelector('.sm-action').value=v};
  window.collectSiteMoves=function(){return [...document.querySelectorAll('.site-move-entry')].map(r=>({site:r.querySelector('.sm-site')?.value||'',action:r.querySelector('.sm-action')?.value.trim()||'',vehicle:r.querySelector('.sm-vehicle')?.value||'',returned:!!r.querySelector('.sm-return')?.checked})).filter(x=>x.site||x.action)};
  function install(){
    const card=document.querySelector('#siteMoveCard');
    if(card){card.innerHTML='<h2>現場移動</h2><div class="note">同じ日に途中で別の現場へ行った時だけ追加します。夕方にまとめて入力できます。</div><button type="button" class="btn dark" style="width:100%;margin-top:10px;font-size:16px" onclick="addSiteMoveEntry()">＋ 現場移動を追加</button><div id="siteMoveEntries"></div>'}
    if(typeof window.collect==='function'&&!window.__siteMoveCollectWrapped){const old=window.collect;window.collect=function(){const d=old();d.siteMoves=collectSiteMoves();return d};window.__siteMoveCollectWrapped=true}
    if(typeof window.lineText==='function'&&!window.__siteMoveLineWrapped){const old=window.lineText;window.lineText=function(d){let t=old(d);if((d.siteMoves||[]).length){const add='\n\n■現場移動\n'+d.siteMoves.map(x=>'・'+x.site+'：'+(x.action||'現場作業')+(x.vehicle?'（'+x.vehicle+'）':'')+(x.returned?' → 元の現場へ戻る':'')).join('\n');const pos=t.lastIndexOf('\n\n※現場写真分類：');if(pos>=0)t=t.slice(0,pos)+add+t.slice(pos);else t+=add}return t};window.__siteMoveLineWrapped=true}
    const oldFill=window.fillReportForm;if(typeof oldFill==='function'&&!window.__siteMoveFillWrapped){window.fillReportForm=function(d,mode){oldFill(d,mode);const box=document.querySelector('#siteMoveEntries');if(box)box.innerHTML='';(d.siteMoves||[]).forEach(addSiteMoveEntry)};window.__siteMoveFillWrapped=true}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0));else setTimeout(install,0);
})();