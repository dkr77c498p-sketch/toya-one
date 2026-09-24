/* STAGING ONLY. Explicit mount; never auto-installs and never saves/submits records.
 * Depends on the reviewed daily bridge and monthly aggregation engine.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ToyaGeneralWasteUI=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const VERSION='general-waste-ui-stage1';
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const copy=x=>JSON.parse(JSON.stringify(x));
 const identity=p=>p?.active===true&&p.id&&p.companyId?p.id+':'+p.companyId+':'+p.role:'';
 const columns={north:'可燃物・北部',south:'可燃物・南部',yokoi:'不燃物・横井',bulky:'粗大ごみ・処理棟'};
 const css=`.gw-root{min-width:0}.gw-root [hidden]{display:none!important}.gw-root *{box-sizing:border-box}.gw-root h2{margin-bottom:10px}.gw-root h3{font-size:17px;margin:10px 0}.gw-stage{background:#fff5d8;color:#735119;border:1px solid #d6bd7b;padding:10px;border-radius:10px;line-height:1.5;font-size:13px}.gw-sub{font-size:13px;color:#556247;line-height:1.6}.gw-row{border:1px solid #cbd4c1;border-radius:12px;padding:12px;margin:12px 0;scroll-margin-top:180px}.gw-row>summary{font-weight:800;padding:4px 0;cursor:pointer;line-height:1.6}.gw-root label{display:block;font-size:14px;font-weight:750;margin:12px 0 5px}.gw-root input,.gw-root select,.gw-root textarea{width:100%;max-width:100%;min-width:0;font:inherit;font-size:16px;min-height:46px;border:1px solid #bbc3b4;border-radius:9px;padding:9px;color:#111;background:white}.gw-root button{font:inherit;font-weight:800;cursor:pointer;min-height:46px}.gw-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}.gw-chips{display:flex;flex-wrap:wrap;gap:7px;margin:5px 0 10px}.gw-chips button{border:1px solid #c6d1b9;background:#f4f7ef;color:#1e3510;border-radius:10px;padding:9px 12px;flex:1 1 auto}.gw-chips button[aria-pressed=true]{background:#b8ff00;border-color:#659400;box-shadow:inset 0 0 0 1px #659400}.gw-root .gw-check{display:flex;align-items:flex-start;gap:9px;font-size:13px;font-weight:500;line-height:1.55}.gw-root .gw-check input{width:21px;height:21px;min-height:21px;flex-shrink:0;margin-top:2px;padding:0;accent-color:#619100}.gw-message{font-size:13px;line-height:1.5;color:#546141;overflow-wrap:anywhere;min-height:1em}.gw-error{color:#a02315}.gw-row-state{display:block;font-size:12px;font-weight:500;color:#59694b}.gw-root .gw-remove{margin-top:14px;color:#a82419;background:#fff3f0;border:1px solid #e8b8b0;border-radius:8px;padding:6px 10px;min-height:38px}.gw-total{background:#111;color:#b8ff00;border-radius:12px;padding:15px;margin:12px 0}.gw-total small{display:block;color:#ddd;font-size:12px}.gw-total b{display:block;font-size:29px;margin:4px 0}.gw-categories{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;margin:10px 0}.gw-categories>div{background:#f1f7e6;border:1px solid #cfdec0;border-radius:10px;padding:10px}.gw-categories small{display:block;font-size:12px;color:#4c6538}.gw-categories b{display:block;font-size:20px;margin-top:4px;color:#173509}.gw-table-scroll{overflow:auto;max-width:100%;border:1px solid #d6ddcf;border-radius:8px;margin:8px 0}.gw-table{border-collapse:collapse;font-size:12px;width:100%;min-width:480px;background:white}.gw-table th,.gw-table td{padding:9px 7px;border:1px solid #d6ddcf;text-align:right;white-space:nowrap}.gw-table th:first-child,.gw-table td:first-child{text-align:left}.gw-table th{background:#eff5e4}.gw-list{padding-left:18px;font-size:13px;line-height:1.6}.gw-root [data-gw-status]{scroll-margin-top:170px}.gw-more{margin:12px 0}.gw-more>summary{font-weight:700;cursor:pointer}.gw-root .btn{width:100%;margin:8px 0}.gw-toolbar{display:flex;gap:8px;align-items:end;flex-wrap:wrap}.gw-toolbar>div{flex:1 1 160px}.gw-toolbar>button{flex:1 1 170px}.gw-root input:focus-visible,.gw-root button:focus-visible{outline:3px solid #3577b8;outline-offset:2px}@media(max-width:340px){.gw-chips button{font-size:13px;padding:8px}.gw-grid{gap:6px}}`;
 // Read *all* company reports because a delivery date may differ from its report date.
 // This is a paged client read, not an atomic database snapshot; original-slip review remains necessary.
 async function readAllReports(client,profile,options={}){
  if(!identity(profile)||profile.role!=='admin')throw Error('会社全体の集計は管理者専用です。');
  const size=500,max=200000,result=[],ids=new Set(),current=options.isCurrent||(()=>true);
  for(let start=0;start<max;start+=size){
   if(!current())throw Error('ログインが切り替わったため読込を中止しました。');
   const response=await client.from('daily_reports').select('id,company_id,report_date,updated_at,report_data').eq('company_id',profile.companyId).order('id',{ascending:true}).range(start,start+size-1);
   if(!current())throw Error('ログインが切り替わったため読込を中止しました。');
   if(response.error)throw Error('日報の読込に失敗しました。集計していません。');
   if(!Array.isArray(response.data)||response.data.length>size)throw Error('日報の取得結果を確認できません。');
   for(const r of response.data){
    if(!r||r.company_id!==profile.companyId||!r.id)throw Error('会社・日報IDが一致しません。集計していません。');
    if(ids.has(r.id))throw Error('読込中に日報一覧が変わりました。もう一度読み込んでください。');
    ids.add(r.id);result.push(r);
   }
   options.onPage?.(result.length);
   if(response.data.length<size)return {rows:result,complete:true,snapshot:'paged_read_requires_review'};
  }
  throw Error('全件の読込を完了できませんでした。部分集計は表示しません。');
 }
 function mount(options){
  const {host,bridge:B,monthly:M,getProfile,reportProfile}=options;
  if(!host?.document||!B?.bind||!M?.monthly||typeof getProfile!=='function')throw Error('一般廃棄物の画面設定を確認してください。');
  const doc=host.document;if(doc.querySelector('#gwDailyCard'))throw Error('一般廃棄物の画面は接続済みです。');
  const formAnchor=doc.querySelector(options.formAnchor||'#items')?.closest('.card');
  const summaryAnchor=doc.querySelector(options.summaryAnchor||'#wasteDashboardCard');
  if(!formAnchor||!summaryAnchor)throw Error('日報・集計画面の追加位置が見つかりません。');
  const style=doc.createElement('style');style.textContent=css;doc.head.append(style);
  const form=doc.createElement('div');form.id='gwDailyCard';form.className='card gw-root';
  const stageText='検証用：架空データで動作確認中。本番の日報・公式提出には未接続です。';
  form.innerHTML='<h2>一般廃棄物の搬入記録</h2><p class="gw-stage">'+stageText+'</p><p class="gw-sub">産廃とは別に、種類・搬入先・数量を記録します。重量が未確認でも入力途中の状態を残せます。</p><div id="gwRows"></div><button type="button" class="btn lime" id="gwAdd">＋ 搬入を追加</button><p class="gw-message" data-gw-status role="status" aria-live="polite"></p><p class="gw-sub">この欄の内容は、日報の保存・一時保存に含める設計です。処分費の原価や産廃の数量には自動加算しません。</p>';
  formAnchor.after(form);
  const ledger=doc.createElement('div');ledger.id='gwMonthlyCard';ledger.className='card admin-home-only gw-root';
  ledger.innerHTML='<h2>一般廃棄物台帳・月別集計</h2><p class="gw-stage">'+stageText+'</p><p class="gw-sub" id="gwReporter"></p><div class="gw-toolbar"><div><label for="gwMonth">対象月</label><input type="month" id="gwMonth"></div><button type="button" class="btn dark" id="gwLoad">月別集計を更新</button></div><p class="gw-message" id="gwLoadStatus" role="status" aria-live="polite">まだ読み込んでいません。</p><div id="gwResults"></div><button type="button" class="btn light" id="gwCSV" disabled>転記用CSVを出す（未提出）</button><details class="gw-more"><summary>年度一覧（4月〜翌3月）</summary><div id="gwAnnual">月別集計を更新すると表示します。</div></details>';
  summaryAnchor.after(ledger);
  const q=(s,r=doc)=>r.querySelector(s);let api,owner=null,ticket=0,summary=null,rows=null,review=null;
  const profile=()=>getProfile(),eligible=p=>!!identity(p)&&p.companyId===reportProfile.companyId;
  const requireProfile=()=>{const p=profile();if(!eligible(p))throw Error('TOYAのログイン状態を確認してください。');return p;};
  const isAdmin=()=>{const p=profile();return eligible(p)&&p.role==='admin';};
  const report=()=>{const p=requireProfile();return {...copy(reportProfile),id:p.id,active:true,role:p.role};};
  const number=x=>Number(x).toLocaleString('ja-JP',{maximumFractionDigits:3});
  const message=(text,error=false)=>{const el=q('[data-gw-status]',form);el.textContent=text;el.classList.toggle('gw-error',error);};
  const control=(r,k,label,type='text',extra='')=>'<div><label for="gw-'+esc(r.id)+'-'+k+'">'+label+'</label><input id="gw-'+esc(r.id)+'-'+k+'" data-gw-key="'+k+'" type="'+type+'" value="'+esc(r[k])+'" '+extra+'></div>';
  const check=(r,k,label)=>'<label class="gw-check"><input type="checkbox" data-gw-key="'+k+'" '+(r[k]?'checked':'')+'><span>'+label+'</span></label>';
  const chips=(r,key,values)=>'<div class="gw-chips">'+values.map(v=>'<button type="button" data-gw-choice="'+key+'" data-gw-value="'+esc(v)+'" aria-pressed="'+String(r[key]===v)+'">'+esc(v)+'</button>').join('')+'</div>';
  function rowHTML(r){
   return '<details class="gw-row" data-gw-id="'+esc(r.id)+'"><summary><span data-gw-title></span><span class="gw-row-state" data-gw-state></span></summary><label>種類を選ぶ</label>'+chips(r,'type',B.TYPES)+'<label>搬入先を選ぶ</label>'+chips(r,'facility',B.FACILITIES)+'<div class="gw-grid">'+control(r,'quantity','数量','text','inputmode="decimal" maxlength="30"')+'<div><label for="gw-'+esc(r.id)+'-unit">単位</label><select id="gw-'+esc(r.id)+'-unit" data-gw-key="unit">'+B.UNITS.map(u=>'<option '+(r.unit===u?'selected':'')+'>'+u+'</option>').join('')+'</select></div></div>'+control(r,'netKg','計量票の正味重量（kg）','text','inputmode="decimal" maxlength="30" placeholder="分からないときは空欄"')+'<p class="gw-sub">m³からkgへの換算はしません。正味重量があれば、その重量を集計します。</p>'+control(r,'vehicleNumber','車両の登録番号','text','maxlength="80" placeholder="例：鹿児島100 あ 1234"')+control(r,'ticketNumber','計量票番号（任意）','text','maxlength="100" placeholder="計量票に記載の番号"')+check(r,'scopeConfirmed','一般廃棄物に該当し、生ごみを含まないことを確認')+'<div data-gw-bulky '+(r.type==='粗大ごみ'?'':'hidden')+'>'+check(r,'facilitySectionConfirmed','粗大ごみ処理棟への搬入であることを確認')+'</div><details class="gw-more"><summary>搬入日・収集元・確認情報</summary>'+control(r,'date','搬入日','date')+control(r,'siteName','収集元の現場','text','maxlength="200"')+control(r,'municipality','収集区域の市町村','text','maxlength="80" placeholder="例：鹿児島市"')+chips(r,'municipality',['鹿児島市'])+check(r,'massConfirmed','正味kgが空欄の場合、上の数量（kg・t）は原票で確認済み')+control(r,'notes','メモ','text','maxlength="1000"')+'<p class="gw-sub">運搬業者：'+esc(reportProfile.companyName)+'。日報の日付・現場を変更しても、登録済みの搬入日・収集元は自動では変えません。</p></details><p class="gw-message" data-gw-row-message></p><button type="button" class="gw-remove" data-gw-remove>この搬入記録を削除</button></details>';
  }
  function paintRow(r){
   const el=[...form.querySelectorAll('[data-gw-id]')].find(e=>e.dataset.gwId===r.id);if(!el)return;
   q('[data-gw-title]',el).textContent=(r.type||'種類未選択')+' ／ '+(r.facility||'搬入先未選択');
   el.querySelectorAll('[data-gw-choice]').forEach(b=>b.setAttribute('aria-pressed',String(r[b.dataset.gwChoice]===b.dataset.gwValue)));
   q('[data-gw-bulky]',el).hidden=r.type!=='粗大ごみ';
   try{
    const date=/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(r.date)?r.date.slice(0,7):'2000-01';
    const result=B.monthlyFromReports(M,[{id:'current',company_id:r.companyId,report_data:{generalWasteV1:{version:1,companyId:r.companyId,entries:[r]}}}],date,report());
    const issue=result.issues[0]?.message;
    q('[data-gw-state]',el).textContent=result.accepted.length?'入力済み重量 '+number(result.totalKg)+' kg（原票照合前）':'要確認：'+(issue||result.excluded[0]?.reason||'搬入日・種類・重量を確認');
   }catch(error){q('[data-gw-state]',el).textContent='要確認：'+error.message;}
  }
  function renderEntries(entries){
   const open=new Set([...form.querySelectorAll('[data-gw-id][open]')].map(x=>x.dataset.gwId));
   q('#gwRows').innerHTML=entries.length?entries.map(rowHTML).join(''):'<p class="gw-sub">まだ記録はありません。搬入したときに追加してください。</p>';
   for(const r of entries){const el=[...form.querySelectorAll('[data-gw-id]')].find(e=>e.dataset.gwId===r.id);el.open=open.has(r.id);paintRow(r);}
  }
  const guarded=fn=>{try{requireProfile();return fn();}catch(error){message(error.message,true);return null;}};
  api=B.bind(host,{getProfile:()=>{const p=profile();return eligible(p)?p:null;},onChange:entries=>{if(eligible(profile()))renderEntries(entries);else q('#gwRows').textContent='ログイン後に表示します。';}});
  form.addEventListener('input',e=>{
   const input=e.target.closest('[data-gw-key]'),el=input?.closest('[data-gw-id]');if(!input||!el)return;
   guarded(()=>{const value=input.type==='checkbox'?input.checked:input.value;api.update(el.dataset.gwId,{[input.dataset.gwKey]:value});paintRow(api.entries().find(r=>r.id===el.dataset.gwId));message('日報にはまだ保存していません。');options.onDirty?.();});
  });
  form.addEventListener('change',e=>{if(e.target.matches('select[data-gw-key]'))e.target.dispatchEvent(new host.Event('input',{bubbles:true}));});
  form.addEventListener('click',e=>{
   const b=e.target.closest('button');if(!b)return;
   guarded(()=>{
    const row=b.closest('[data-gw-id]');
    if(b.id==='gwAdd'){
     const id=api.add({});const el=[...form.querySelectorAll('[data-gw-id]')].find(x=>x.dataset.gwId===id);el.open=true;el.scrollIntoView({block:'start'});message('搬入記録を追加しました。種類と搬入先を選んでください。');
    }else if(b.hasAttribute('data-gw-choice')&&row){api.update(row.dataset.gwId,{[b.dataset.gwChoice]:b.dataset.gwValue});paintRow(api.entries().find(r=>r.id===row.dataset.gwId));const field=row.querySelector('[data-gw-key="'+b.dataset.gwChoice+'"]');if(field)field.value=b.dataset.gwValue;message('日報にはまだ保存していません。');}
    else if(b.hasAttribute('data-gw-remove')&&row){if(!host.confirm('この一般廃棄物の搬入記録を削除しますか？日報の保存時に反映します。'))return;api.remove(row.dataset.gwId,true);message('入力中の搬入記録を削除しました。日報にはまだ保存していません。');}
    else return;
    options.onDirty?.();
   });
  });
  function invalidate(){ticket++;summary=null;rows=null;review=null;q('#gwResults').textContent='';q('#gwAnnual').textContent='月別集計を更新すると表示します。';q('#gwCSV').disabled=true;q('#gwLoad').disabled=false;}
  function table(head,body){return '<div class="gw-table-scroll"><table class="gw-table"><thead><tr>'+head.map(t=>'<th>'+esc(t)+'</th>').join('')+'</tr></thead><tbody>'+body.map(row=>'<tr>'+row.map(c=>'<td>'+esc(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
  function renderSummary(m){
   const hasUnconfirmed=m.issues.length>0||m.coverage.legacyReports>0;
   q('#gwResults').innerHTML='<div class="gw-total"><small>入力済みの重量合計（原票照合前）</small><b>'+(m.accepted.length?esc(number(m.totalKg))+' kg':'未確定')+'</b><small>'+m.accepted.length+'件を集計 ／ 要確認 '+m.issues.length+'件</small></div>'+(hasUnconfirmed?'<p class="gw-error gw-message">未確認の記録は重量合計に含めていません。旧日報 '+m.coverage.legacyReports+'件は原票との照合が必要です。</p>':'')+'<div class="gw-categories">'+Object.entries(columns).map(([k,title])=>'<div><small>'+esc(title)+'</small><b>'+(m.accepted.some(r=>r.column===k)?esc(number(m.totals[k]))+' kg':'記録なし')+'</b></div>').join('')+'</div><details class="gw-more"><summary>車両別の内訳を見る</summary>'+table(['登録車両番号',...Object.values(columns),'計 kg'],m.vehicles.map(v=>[v.vehicleNumber,...Object.keys(columns).map(k=>number(v.cells[k])),number(v.totalKg)]))+'</details>'+'<p class="gw-sub">この表は提出用の確定値ではありません。実績報告書と契約事業所報告書の作成・原票照合・提出は別途必要です。</p>'+(m.issues.length?'<details open><summary>入力を確認する記録</summary><ul class="gw-list">'+m.issues.map(i=>'<li>'+esc(i.site||i.id)+'：'+esc(i.message)+'</li>').join('')+'</ul></details>':'');
   const y=Number(m.month.slice(0,4))-(Number(m.month.slice(5))<4?1:0),data=[];
   for(let n=0;n<12;n++){const mm=(n+3)%12+1,yy=y+(n>=9?1:0),month=yy+'-'+String(mm).padStart(2,'0');const a=B.monthlyFromReports(M,rows,month,report(),{});data.push([month,a.accepted.length?number(a.totalKg):'未確定',a.issues.length,a.coverage.legacyReports]);}
   q('#gwAnnual').innerHTML='<p class="gw-sub">'+y+'年度・入力済み重量の一覧。記録がない月を実績ゼロとは断定しません。</p>'+table(['月','重量 kg（照合前）','要確認','旧日報'],data);
   q('#gwCSV').disabled=false;
  }
  q('#gwMonth').value=(options.today?.()||new Date().toISOString().slice(0,10)).slice(0,7);
  q('#gwMonth').addEventListener('change',()=>{invalidate();q('#gwLoadStatus').textContent='対象月が変わりました。もう一度更新してください。';});
  q('#gwLoad').addEventListener('click',async()=>{
   if(!isAdmin())return;invalidate();const mine=identity(profile()),stamp=ticket,month=q('#gwMonth').value;
   const current=()=>identity(profile())===mine&&stamp===ticket&&isAdmin();
   q('#gwLoad').disabled=true;q('#gwLoadStatus').classList.remove('gw-error');q('#gwLoadStatus').textContent='会社の日報を全件読み込み中…';
   try{
    if(typeof options.loadReports!=='function')throw Error('クラウド読込はまだ接続していません。');
    const response=await options.loadReports(copy(profile()),{isCurrent:current});
    if(!current())return;
    if(response.complete!==true||!Array.isArray(response.rows))throw Error('全件の読込が終わっていません。集計していません。');
    if(response.rows.some(r=>r?.company_id!==profile().companyId))throw Error('別会社のデータが含まれています。集計していません。');
    rows=copy(response.rows);summary=B.monthlyFromReports(M,rows,month,report(),{});renderSummary(summary);
    q('#gwLoadStatus').textContent='全'+rows.length+'件の日報を読み込みました。'+month+'の搬入を集計（原票照合前・未提出）。';
   }catch(error){if(current()){summary=null;rows=null;q('#gwResults').textContent='';q('#gwAnnual').textContent='集計は未確定です。';q('#gwCSV').disabled=true;q('#gwLoadStatus').textContent=error.message;q('#gwLoadStatus').classList.add('gw-error');}}
   finally{if(current())q('#gwLoad').disabled=false;}
  });
  q('#gwCSV').onclick=()=>{
   if(!isAdmin()||!summary||!rows)return;
   const data=M.monthlyCSV(summary),blob=new host.Blob([data],{type:'text/csv;charset=utf-8'}),url=host.URL.createObjectURL(blob),a=doc.createElement('a');a.href=url;a.download='TOYA_一般廃棄物_転記用_'+summary.month+'.csv';a.click();host.setTimeout(()=>host.URL.revokeObjectURL(url),1000);
  };
  function syncIdentity(){
   const p=profile(),next=identity(p);if(next===owner)return;owner=next;invalidate();form.hidden=!eligible(p);ledger.hidden=!isAdmin();
   api.changedIdentity();message('');q('#gwLoadStatus').textContent='まだ読み込んでいません。';q('#gwLoadStatus').classList.remove('gw-error');
   q('#gwReporter').textContent=isAdmin()?reportProfile.companyName+' ／ 許可番号 '+reportProfile.permitNumber+' ／ 電話 '+reportProfile.reportContactPhone:'';
  }
  // Host boot/login can notify explicitly; a small timer only clears stale local UI.
  doc.addEventListener('toya-role-changed',syncIdentity);
  const timer=host.setInterval(syncIdentity,500);syncIdentity();
  return {version:VERSION,entries:()=>api.entries(),syncIdentity,summary:()=>summary?copy(summary):null,
   dispose(){host.clearInterval(timer);doc.removeEventListener('toya-role-changed',syncIdentity);invalidate();api.dispose();form.remove();ledger.remove();style.remove();}};
 }
 return {VERSION,mount,readAllReports};
});
