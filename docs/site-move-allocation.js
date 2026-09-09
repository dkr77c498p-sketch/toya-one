/* TOYA One: explicit site-move cost allocation. Read-only calculation; no auth or DB writes. */
(() => {
  'use strict';
  const list = v => Array.isArray(v) ? v : [];
  const name = v => typeof v === 'string' ? v : String(v?.name || '');
  const norm = v => String(v || '').normalize('NFKC').replace(/[\s　]/g, '').toLowerCase();
  const key = v => {const k=norm(name(v));return k==='sk55sr'?'sk55':k==='アームロール'?norm('4tアームロール'):k;};
  const round = v => Math.round((v + Number.EPSILON) * 100) / 100;
  const fields = {labor:'workers',vehicle:'vehicles',equipment:'machines'};
  const validShare = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
  function validate(split) {
    if (!split || split.version !== 1) return '費用配分が未設定です。';
    for (const [kind, field] of Object.entries(fields)) {
      if (!Array.isArray(split[field]) || split[field].some(v=>typeof v!=='string'||!v.trim()) || new Set(split[field].map(key)).size!==split[field].length) return '移動した人・車両・重機の選択を確認してください。';
      if (!split[field].length) continue;
      const s=split[kind];
      if (!s || !validShare(s.from) || !validShare(s.to) || Math.abs(s.from+s.to-1)>0.00001) return '各現場の計上日数は合計1日にしてください。';
    }
    if (!Object.values(fields).some(f=>split[f].length)) return '移動した人・車両・重機のいずれかを選んでください。';
    if (split.fuel !== 'same_share') return '燃料は車両・重機と同じ割合で配分してください。';
    return '';
  }
  function build(data, reports) {
    const groups=new Map(),sites=list(data.sites),issues=[];
    const gid=(kind,date,label)=>kind+'|'+date+'|'+key(label);
    const siteOf=r=>({id:r.site_id,name:r.report_data?.site||''});
    const matches=(a,b)=>a.id&&b.id?a.id===b.id:norm(a.name)===norm(b.name);
    function target(r,m) {
      const found=sites.filter(s=>m.siteId?s.id===m.siteId:norm(s.name)===norm(m.site));
      if (found.length===1) return found[0];
      if (sites.length) return null;
      return m.site ? {id:m.siteId||'',name:m.site} : null;
    }
    list(reports).forEach(r=>list(r.report_data?.siteMoves).forEach((m,index)=>{
      const s=m.costSplit;if(!s)return;
      const error=validate(s),to=target(r,m),from=siteOf(r);
      for(const [kind,field] of Object.entries(fields))for(const label of list(s[field])){
        const k=gid(kind,r.report_date,label);
        if(!groups.has(k))groups.set(k,{kind,date:r.report_date,label,key:key(label),claims:[],errors:[]});
        const g=groups.get(k);
        g.claims.push({reportId:r.id,index,from,to,share:s[kind],split:s});
        if(error)g.errors.push(error);
        if(!to||matches(from,to))g.errors.push('移動元と移動先を別々の登録現場にしてください。');
      }
    }));
    groups.forEach(g=>{
      if(g.claims.length!==1)g.errors.push('同じ人・車両・重機に同日複数の配分があります。重複・3現場以上の配分を確認してください。');
      const c=g.claims[0];
      if(c?.to){
        for(const r of reports.filter(r=>r.report_date===g.date)){
          const uses=list(r.report_data?.[fields[g.kind]]).some(v=>key(v)===g.key);
          if(uses&&!matches(siteOf(r),c.from)&&!matches(siteOf(r),c.to))g.errors.push('配分した2現場以外にも使用記録があります。');
          for(const m of list(r.report_data?.siteMoves))if(!m.costSplit && (g.kind==='vehicle'?key(m.vehicle)===g.key:uses))g.errors.push('旧形式の現場移動にも同じ対象があり、配分を確定できません。');
        }
        const sheets=list(data[g.kind==='labor'?'laborSheets':g.kind==='vehicle'?'vehicleSheets':'equipmentSheets']);
        if(sheets.some(s=>s.work_date===g.date&&[c.from.id,c.to.id].includes(s.site_id)))g.errors.push('この日の配分対象現場に保存済み金額があります。保存額を優先し、配分との整合を確認してください。');
      }
      g.valid=!g.errors.length;
      if(!g.valid)issues.push(...g.errors.map(message=>({date:g.date,label:g.label,message,sites:g.claims.flatMap(c=>[c.from,c.to]).filter(Boolean)})));
    });
    function get(kind,date,label){return groups.get(gid(kind,date,label));}
    function share(g,site){if(!g?.valid)return null;const c=g.claims[0];return matches(c.from,site)?c.share.from:matches(c.to,site)?c.share.to:0;}
    function forSite(kind,date,site){return [...groups.values()].filter(g=>g.kind===kind&&g.date===date&&g.claims.some(c=>matches(c.from,site)||(c.to&&matches(c.to,site))));}
    // The same recorded fuel is distributed once, using a remainder on the destination.
    function fuelValue(r,f,site,amount){
      const g=get('vehicle',r.report_date,f.asset)||get('equipment',r.report_date,f.asset);
      if(!g?.valid)return matches(siteOf(r),site)?amount:0;
      const c=g.claims[0];if(!matches(siteOf(r),c.from)&&!matches(siteOf(r),c.to))return matches(siteOf(r),site)?amount:0;
      const fraction=share(g,site);if(!fraction)return 0;
      if(amount===null)return null;
      const from=round(amount*c.share.from);
      return matches(c.from,site)?from:round(amount-from);
    }
    function fuelRows(site, date, getAmount){
      const out=[];
      reports.filter(r=>!date||r.report_date===date).forEach(r=>list(r.report_data?.fuels).forEach((f,index)=>{
        const g=get('vehicle',r.report_date,f.asset)||get('equipment',r.report_date,f.asset);
        const participating=g?.valid&&(matches(siteOf(r),g.claims[0].from)||matches(siteOf(r),g.claims[0].to));
        if(participating ? share(g,site)<=0 : !matches(siteOf(r),site))return;
        out.push({report:r,index,fuel:{...f,amount:fuelValue(r,f,site,getAmount(f))},original:f,allocated:!!participating});
      }));return out;
    }
    return {get,share,forSite,fuelValue,fuelRows,issues,matches,siteOf,groups};
  }
  const engine=Object.freeze({build,validate,key,normal:norm});
  if(typeof module==='object'&&module.exports){module.exports=engine;return;}
  if(window.ToyaMoveAllocationEngine)return;
  window.ToyaMoveAllocationEngine=engine;
  const q=(s,r=document)=>r.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const categories=[['labor','workers','移動した作業者','人工'],['vehicle','vehicles','移動した車両','車両代'],['equipment','machines','移動した重機（あるときだけ）','重機代']];
  const values=field=>[...new Set([...document.querySelectorAll('input[name="'+({workers:'worker',vehicles:'vehicle',machines:'machine'}[field])+'"]')].map(el=>el.value).filter(Boolean))];
  const blank=()=>({version:1,workers:[],vehicles:[],machines:[],labor:{from:0.5,to:0.5},vehicle:{from:0.5,to:0.5},equipment:{from:0.5,to:0.5},fuel:'same_share'});
  function setChoices(row,field,selected){
    const holder=q('[data-ma-field="'+field+'"]',row);
    const names=[...new Set([...values(field),...selected])];
    holder.innerHTML=names.map(n=>'<label class="ma-choice"><input type="checkbox" value="'+esc(n)+'" '+(selected.includes(n)?'checked':'')+'><span>'+esc(n)+'</span></label>').join('');
  }
  function paint(row){
    const box=q('.ma-allocation',row);if(!box)return;
    const enabled=q('.ma-enable',row).checked;
    q('.ma-fields',row).hidden=!enabled;
    q('.ma-from-name',row).textContent=q('#site')?.value||'移動元';
    q('.ma-to-name',row).textContent=q('.sm-site',row)?.value||'移動先';
    const s=read(row);
    categories.forEach(([kind,field])=>{
      q('[data-ma-shares="'+kind+'"]',row).hidden=!s[field].length;
      row.querySelectorAll('[data-ma-kind="'+kind+'"]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.maValue)===s[kind][b.dataset.maSide])));
    });
    q('.ma-status',row).textContent=enabled?(validate(s)||'選んだ対象だけ、各現場へ指定日数で計上します。時間から勝手に半日・1日を決めません。'):'旧記録をそのまま保持。費用を配分するときだけ有効にしてください。';
    const oldVehicle=q('.sm-vehicle',row);if(oldVehicle){oldVehicle.hidden=enabled;if(oldVehicle.previousElementSibling?.tagName==='LABEL')oldVehicle.previousElementSibling.hidden=enabled;}
    const fromV=oldVehicle?.value;
    q('.ma-vehicle-note',row).textContent=fromV?'下の従来の使用車両：'+fromV+'。計算する車両は上のチェックで指定してください。':'';
  }
  function read(row){
    const s=blank();
    categories.forEach(([kind,field])=>{
      s[field]=[...row.querySelectorAll('[data-ma-field="'+field+'"] input:checked')].map(i=>i.value);
      const holder=q('[data-ma-shares="'+kind+'"]',row);
      s[kind]={from:Number(holder.dataset.from),to:Number(holder.dataset.to)};
    });return s;
  }
  function decorate(row,d={}){
    if(!row||q('.ma-allocation',row))return;
    const split=d.costSplit||blank();
    const box=document.createElement('div');box.className='ma-allocation';
    box.innerHTML='<h3>現場ごとの費用配分</h3><label class="ma-choice"><input type="checkbox" class="ma-enable" '+(d.costSplit?'checked':'')+'><span>人・車両を選んで自動計上する</span></label>'+ 
      '<p class="note"><b class="ma-from-name"></b> → <b class="ma-to-name"></b></p><div class="ma-fields" hidden>'+categories.map(([kind,field,title,cost])=>
      '<div class="ma-category"><b>'+title+'</b><div data-ma-field="'+field+'"></div><div data-ma-shares="'+kind+'" data-from="'+esc(split[kind]?.from??0.5)+'" data-to="'+esc(split[kind]?.to??0.5)+'"><p>'+cost+'の計上日数</p>'+['from','to'].map(side=>'<div class="ma-share"><span>'+(side==='from'?'移動元':'移動先')+'</span>'+[[0,'なし'],[0.5,'半日'],[1,'1日']].map(([v,t])=>'<button type="button" data-ma-kind="'+kind+'" data-ma-side="'+side+'" data-ma-value="'+v+'">'+t+'</button>').join('')+'</div>').join('')+'</div></div>').join('')+
      '<p class="note">車両・重機の燃料も同じ割合で振り分けます。自社人工・車両代は合計1日分です。明建・朝日の人数や通勤費はここでは移しません。</p><p class="note ma-vehicle-note"></p></div><p class="note ma-status" role="status"></p>';
    const target=q('.sm-site',row);target?.after(box);
    categories.forEach(([,field])=>setChoices(row,field,list(split[field])));
    if(!d.costSplit&&d.vehicle)setChoices(row,'vehicles',[d.vehicle]);
    box.addEventListener('change',()=>paint(row));
    box.addEventListener('click',e=>{const b=e.target.closest('[data-ma-kind]');if(!b)return;const holder=q('[data-ma-shares="'+b.dataset.maKind+'"]',row);holder.dataset[b.dataset.maSide]=b.dataset.maValue;paint(row);});
    target?.addEventListener('change',()=>paint(row));q('.sm-vehicle',row)?.addEventListener('change',()=>paint(row));paint(row);
  }
  let installed=false;
  function install(){
    if(installed||typeof window.addSiteMoveEntry!=='function'||typeof window.collectSiteMoves!=='function')return;
    installed=true;
    if(!q('#maStyles')){const s=document.createElement('style');s.id='maStyles';s.textContent='.ma-allocation{margin:14px 0;padding:12px;border:2px solid #97bf00;border-radius:12px;background:#fff}.ma-allocation h3{margin:0 0 10px}.ma-allocation [hidden]{display:none!important}.ma-category{padding:12px 0;border-top:1px solid #ddd}.ma-choice{display:flex;align-items:center;gap:9px;margin:8px 0;padding:10px;border:1px solid #ccc;border-radius:9px;min-height:44px}.ma-choice input{width:22px;height:22px;flex:0 0 22px;margin:0}.ma-share{display:grid;grid-template-columns:60px repeat(3,minmax(0,1fr));gap:5px;align-items:center;margin:8px 0}.ma-share button{min-height:44px;border:1px solid #aaa;border-radius:8px;background:#fff;color:#111;font-size:16px;font-weight:800;padding:6px}.ma-share button[aria-pressed=true]{background:var(--lime,#b8ff00);border:2px solid #638600}.ma-fields b{display:block;margin-bottom:8px}.ma-status{line-height:1.6}';document.head.appendChild(s);}
    const add=window.addSiteMoveEntry;
    window.addSiteMoveEntry=function(d={}){const before=q('#siteMoveEntries')?.children.length||0;const out=add.apply(this,arguments);const rows=document.querySelectorAll('#siteMoveEntries .site-move-entry');if(rows.length>before)decorate(rows[rows.length-1],d);return out;};
    const collect=window.collectSiteMoves;
    window.collectSiteMoves=function(){const out=collect.apply(this,arguments);const rows=[...document.querySelectorAll('.site-move-entry')].filter(r=>q('.sm-site',r)?.value||q('.sm-action',r)?.value.trim());return out.map((m,i)=>{const row=rows[i];if(row&&q('.ma-enable',row)?.checked){m.costSplit=read(row);m.vehicle=m.costSplit.vehicles[0]||'';}const matches=typeof cloudSitesCache!=='undefined'?list(cloudSitesCache).filter(s=>s.name===m.site):[];if(matches.length===1)m.siteId=matches[0].id;return m;});};
    const oldValidate=window.validate;
    window.validate=function(d){if(!oldValidate.apply(this,arguments))return false;for(const m of list(d.siteMoves)){if(!m.costSplit)continue;const error=validate(m.costSplit);if(error||norm(m.site)===norm(d.site)){alert(error||'移動先は別の現場を選んでください。');return false;}}return true;};
    Object.assign(window.validate,oldValidate);
    const oldLine=window.lineText;
    window.lineText=function(d){let text=oldLine.apply(this,arguments);const lines=[];for(const m of list(d.siteMoves)){const s=m.costSplit;if(!s)continue;for(const [kind,field,,cost] of categories){if(!list(s[field]).length)continue;lines.push(s[field].join('・')+' '+cost+'：'+d.site+' '+s[kind].from+'日／'+m.site+' '+s[kind].to+'日');}}return text+(lines.length?'\n\n■現場移動の費用配分\n'+lines.join('\n'):'');};
    const oldClear=window.clearReportFormDynamic;
    if(typeof oldClear==='function')window.clearReportFormDynamic=function(){const out=oldClear.apply(this,arguments);if(q('#siteMoveEntries'))q('#siteMoveEntries').innerHTML='';return out;};
    const oldFill=window.fillReportForm;
    window.fillReportForm=function(d,mode){const copy=mode==='duplicate'?{...d,siteMoves:[]}:d;return oldFill.call(this,copy,mode);};
    document.querySelectorAll('.site-move-entry').forEach(row=>decorate(row));
    q('#site')?.addEventListener('change',()=>document.querySelectorAll('.site-move-entry').forEach(paint));
  }
  function start(){setTimeout(install,20);let n=0;const t=setInterval(()=>{install();if(installed||++n>=20)clearInterval(t);},250);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
