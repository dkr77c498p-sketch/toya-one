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

  function moveRowsForSite(site){
    const out=[];
    (window.cloudReportsCache||[]).forEach(d=>{
      (d.siteMoves||[]).forEach(m=>{if(m&&m.site===site)out.push({date:d.date||'',writer:d.writer||'',from:d.site||'',action:m.action||'現場作業',vehicle:m.vehicle||'',returned:!!m.returned})})
    });
    return out;
  }
  function installMoveSummary(){
    if(typeof window.populateSiteSummarySelect==='function'&&!window.__siteMoveSummarySelectWrapped){
      const old=window.populateSiteSummarySelect;
      window.populateSiteSummarySelect=function(){
        old();
        const sel=document.querySelector('#siteSummarySelect');if(!sel)return;
        const current=sel.value;
        const names=[...new Set((window.cloudReportsCache||[]).flatMap(d=>[d.site,...((d.siteMoves||[]).map(m=>m&&m.site))]).filter(Boolean))].sort();
        sel.innerHTML=names.length?names.map(n=>`<option>${escHtml(n)}</option>`).join(''):'<option value="">現場なし</option>';
        if(current&&names.includes(current))sel.value=current;
      };
      window.__siteMoveSummarySelectWrapped=true;
    }
    if(typeof window.renderSiteSummary==='function'&&!window.__siteMoveSummaryWrapped){
      const old=window.renderSiteSummary;
      window.renderSiteSummary=function(){
        old();
        const site=document.querySelector('#siteSummarySelect')?.value;
        const box=document.querySelector('#siteSummaryBody');
        if(!site||!box)return;
        const moves=moveRowsForSite(site);
        const oldExtra=document.querySelector('#siteMoveSummaryExtra');if(oldExtra)oldExtra.remove();
        if(!moves.length)return;
        const vehicleCounts={},actionCounts={};
        moves.forEach(m=>{if(m.vehicle)vehicleCounts[m.vehicle]=(vehicleCounts[m.vehicle]||0)+1;actionCounts[m.action]=(actionCounts[m.action]||0)+1});
        const list=obj=>Object.entries(obj).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="record" style="padding:8px;margin-bottom:5px"><b>${escHtml(k)}</b><div class="meta" style="margin:2px 0 0">${v}回</div></div>`).join('');
        const recent=moves.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,10).map(m=>`<div class="record" style="padding:8px;margin-bottom:5px"><b>${escHtml(m.date)} ${escHtml(m.writer||'')}</b><div class="meta" style="margin:2px 0 0">${escHtml(m.from)} → ${escHtml(site)}｜${escHtml(m.action)}${m.vehicle?'｜'+escHtml(m.vehicle):''}${m.returned?'｜元の現場へ戻る':''}</div></div>`).join('');
        const extra=document.createElement('div');extra.id='siteMoveSummaryExtra';extra.innerHTML=`<div class="record" style="margin-top:12px"><b>現場移動から自動集計</b><div class="meta">この現場への移動実績 ${moves.length}回</div></div><div style="margin-top:10px"><b>作業内容</b>${list(actionCounts)}</div><div style="margin-top:10px"><b>現場移動で使用した車両</b>${Object.keys(vehicleCounts).length?list(vehicleCounts):'<div class="meta">車両記録なし</div>'}</div><div style="margin-top:10px"><b>最近の現場移動</b>${recent}</div>`;
        box.appendChild(extra);
      };
      window.__siteMoveSummaryWrapped=true;
    }
  }

  function install(){
    const card=document.querySelector('#siteMoveCard');
    if(card){card.innerHTML='<h2>現場移動</h2><div class="note">同じ日に途中で別の現場へ行った時だけ追加します。夕方にまとめて入力できます。</div><button type="button" class="btn dark" style="width:100%;margin-top:10px;font-size:16px" onclick="addSiteMoveEntry()">＋ 現場移動を追加</button><div id="siteMoveEntries"></div>'}
    if(typeof window.collect==='function'&&!window.__siteMoveCollectWrapped){const old=window.collect;window.collect=function(){const d=old();d.siteMoves=collectSiteMoves();return d};window.__siteMoveCollectWrapped=true}
    if(typeof window.lineText==='function'&&!window.__siteMoveLineWrapped){const old=window.lineText;window.lineText=function(d){let t=old(d);if((d.siteMoves||[]).length){const add='\n\n■現場移動\n'+d.siteMoves.map(x=>'・'+x.site+'：'+(x.action||'現場作業')+(x.vehicle?'（'+x.vehicle+'）':'')+(x.returned?' → 元の現場へ戻る':'')).join('\n');const pos=t.lastIndexOf('\n\n※現場写真分類：');if(pos>=0)t=t.slice(0,pos)+add+t.slice(pos);else t+=add}return t};window.__siteMoveLineWrapped=true}
    const oldFill=window.fillReportForm;if(typeof oldFill==='function'&&!window.__siteMoveFillWrapped){window.fillReportForm=function(d,mode){oldFill(d,mode);const box=document.querySelector('#siteMoveEntries');if(box)box.innerHTML='';(d.siteMoves||[]).forEach(addSiteMoveEntry)};window.__siteMoveFillWrapped=true}
    installMoveSummary();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0));else setTimeout(install,0);
})();