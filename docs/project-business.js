/* Site completion and billing, with a shared editor for independent estimates. */
(() => {
 'use strict';
 const E=window.ToyaProjectDocuments;if(!E||window.__toyaProjectBusiness)return;window.__toyaProjectBusiness=true;
 const q=(s,r=document)=>r.querySelector(s),esc=E.escape,yen=E.yen;
 const identity=()=>typeof cloudProfile!=='undefined'&&cloudProfile?.active===true&&cloudProfile.role==='admin'&&cloudProfile.company_id&&typeof cloudClient!=='undefined'&&cloudClient?cloudProfile.id+':'+cloudProfile.company_id:'';
 const date=()=>typeof today==='function'?today():new Date().toLocaleDateString('sv-SE');
 const copy=x=>JSON.parse(JSON.stringify(x));
 const fitEstimatePreview=frame=>{const apply=()=>{try{const body=frame.contentDocument?.body;if(!body?.querySelector('.te2-page'))return;const width=frame.clientWidth||document.documentElement.clientWidth;body.style.zoom=String(Math.min(1,Math.max(.25,(width-16)/794)));}catch(_){}};frame.addEventListener('load',apply);window.addEventListener('resize',apply);setTimeout(apply,0);return()=>window.removeEventListener('resize',apply);};
 let siteLoaded=false,profileDirty=false;
 let owner='',sites=[],docs=[],profile={},contract=null,rates=[],siteId='',editor=null,dirty=false,busy=false,ticket=0,kind='invoice';
 const site=()=>sites.find(s=>s.id===siteId);
 const summarySite=()=>q('#siteSummarySelect')?.value||'';
 const siteByName=name=>sites.find(s=>s.name===name);
 const documentReady=()=>!!editor&&(editor.kind==='estimate'&&!editor.site_id||siteLoaded);
 const note=(s,error=false)=>{const n=q('#pbStatus');if(n){n.textContent=s;n.classList.toggle('pb-error',error);}const local=q('#pbActionStatus');if(local){local.textContent=s;local.classList.toggle('pb-error',error);}};
 const one=data=>Array.isArray(data)?data[0]:data;
 async function read(table,fields,company,sid){
  const out=[];
  for(let offset=0;offset<100000;offset+=500){let r=cloudClient.from(table).select(fields).eq('company_id',company);if(sid)r=r.eq('site_id',sid);r=await r.order(table==='billing_profiles'?'company_id':'id').range(offset,offset+499);if(r.error)throw new Error(r.error.message);out.push(...(r.data||[]));if((r.data||[]).length<500)return out;}
  throw new Error('件数が多く全件を確認できませんでした。');
 }
 function clear(){siteLoaded=false;profileDirty=false;kind='invoice';owner='';sites=[];docs=[];profile={};rates=[];siteId='';editor=null;dirty=false;ticket++;q('#projectBusinessCard')?.remove();q('#pbMasterLink')?.remove();q('#pbPreview')?.remove();if(q('#estimateDocumentHost'))q('#estimateDocumentHost').innerHTML='';}
 function mount(){
  const id=identity();if(!id){if(owner)clear();return false;}if(owner&&owner!==id)clear();owner=id;
  if(q('#projectBusinessCard'))return true;
  const card=document.createElement('div');card.id='projectBusinessCard';card.className='card admin-home-only';
  card.innerHTML='<h2>現場・請求・完工</h2><label for="pbSite">現場</label><select id="pbSite"><option value="">現場を選択</option></select><div class="pb-actions"><button id="pbReload" class="btn light" type="button">一覧を更新</button><button id="pbProfit" class="btn light" type="button">この現場の利益を見る</button></div><p id="pbStatus" class="note" role="status" aria-live="polite">読み込み中…</p><div id="pbOverview"></div><details id="pbCompletion"><summary>完工設定</summary><div id="pbCompletionBody"></div></details><div class="pb-tabs" role="group" aria-label="書類の種類"><button class="btn lime" type="button" data-pb-kind="invoice">請求書</button><button class="btn light" type="button" data-pb-kind="progress">出来高請求書</button></div><button id="pbNew" class="btn dark pb-wide" type="button">＋ 請求書を作成</button><div id="pbEditor"></div><div id="pbDocuments"></div><details id="pbCompany"><summary>発行者・振込先の設定</summary><p class="note">自社の情報を登録すると、新しく作る書類に入ります。</p><div id="pbCompanyFields"></div><button id="pbCompanySave" class="btn dark pb-wide" type="button">発行者情報を保存</button><p id="pbCompanyStatus" class="note" role="status"></p></details>';
  q('#siteSummaryCard')?.before(card);
  q('#pbSite').onchange=async e=>{const next=e.target.value;if(dirty&&!confirm('書類の未保存の入力を閉じて現場を切り替えますか？')){e.target.value=siteId;return;}siteId=next;editor=null;dirty=false;await loadSite();syncToSummary();};
  const summary=q('#siteSummarySelect');summary?.removeEventListener('change',syncFromSummary);summary?.addEventListener('change',syncFromSummary);
  q('#pbReload').onclick=()=>refresh();q('#pbProfit').onclick=showProfit;
  card.querySelectorAll('[data-pb-kind]').forEach(b=>b.onclick=()=>{kind=b.dataset.pbKind;renderTabs();renderList();if(!site())requestSite();});
  q('#pbNew').onclick=()=>newDocument(kind);
  q('#pbCompanySave').onclick=saveProfile;q('#pbCompanyFields').addEventListener('input',()=>{profileDirty=true;});
  const shortcut=document.createElement('div');shortcut.id='pbMasterLink';shortcut.className='card';shortcut.innerHTML='<h2>現場・請求・完工</h2><button class="btn dark pb-wide" type="button">請求・完工設定を開く</button>';shortcut.querySelector('button').onclick=()=>{q('nav [data-page="homePage"]')?.click();card.scrollIntoView({block:'start',behavior:'smooth'});};q('#masterPage')?.prepend(shortcut);
  renderProfile();refresh();return true;
 }
 function field(label,id,value='',type='text',extra=''){return '<div class="pb-field"><label for="'+id+'">'+esc(label)+'</label><input id="'+id+'" type="'+type+'" value="'+esc(value??'')+'" '+extra+'></div>';}
 function renderProfile(){
  if(!q('#pbCompanyFields'))return;
  q('#pbCompanyFields').innerHTML=field('自社の正式名称','pbIssuerName',profile.issuer_name,'text','maxlength="160"')+field('郵便番号','pbIssuerPostal',profile.postal_code,'text','placeholder="000-0000" maxlength="8" inputmode="numeric"')+field('住所','pbIssuerAddress',profile.address,'text','maxlength="500"')+field('代表者名・役職（任意）','pbIssuerRepresentative',profile.representative,'text','placeholder="代表取締役　氏名" maxlength="160"')+'<div class="pb-grid">'+field('電話番号','pbIssuerPhone',profile.phone,'text','maxlength="80"')+field('FAX（任意）','pbIssuerFax',profile.fax,'text','maxlength="80"')+'</div>'+field('登録番号（登録している場合）','pbIssuerRegistration',profile.registration_number,'text','placeholder="T＋13桁の数字" maxlength="14"')+'<label for="pbIssuerBank">振込先</label><textarea id="pbIssuerBank" maxlength="1000" placeholder="銀行・支店・口座種別・口座番号・口座名義">'+esc(profile.bank_details||'')+'</textarea><label for="pbIssuerLogo">請求書のロゴ</label><select id="pbIssuerLogo"><option value="">ロゴなし</option><option value="toya">TOYA</option></select>';
  q('#pbIssuerLogo').value=profile.logo_key||'';
 }
 async function saveProfile(){
  if(!identity()||busy)return;const mine=owner;const data={company_id:cloudProfile.company_id,issuer_name:q('#pbIssuerName').value.trim(),address:q('#pbIssuerAddress').value.trim(),phone:q('#pbIssuerPhone').value.trim(),registration_number:q('#pbIssuerRegistration').value.trim().toUpperCase(),bank_details:q('#pbIssuerBank').value.trim(),updated_at:new Date().toISOString()};
  Object.assign(data,{postal_code:q('#pbIssuerPostal').value.trim().replace(/^〒\s*/,''),representative:q('#pbIssuerRepresentative').value.trim(),fax:q('#pbIssuerFax').value.trim(),logo_key:q('#pbIssuerLogo').value});
  if(/^\d{7}$/.test(data.postal_code))data.postal_code=data.postal_code.slice(0,3)+'-'+data.postal_code.slice(3);
  if(data.postal_code&&!/^\d{3}-\d{4}$/.test(data.postal_code))return note('郵便番号は7桁で入力してください。',true);
  if(!data.issuer_name)return note('自社の正式名称を入力してください。',true);
  if(data.registration_number&&!/^T\d{13}$/.test(data.registration_number))return note('登録番号はTと13桁の数字で入力してください。',true);
  await action(async()=>{let request=profile.updated_at?cloudClient.from('billing_profiles').update(data).eq('company_id',data.company_id).eq('updated_at',profile.updated_at):cloudClient.from('billing_profiles').insert(data);const r=await request.select('*');if(r.error)throw r.error;if(r.data?.length!==1)throw new Error('発行者情報が更新されています。一覧を更新してください。');if(identity()!==mine)return;profile=r.data[0];profileDirty=false;q('#pbCompanyStatus').textContent='保存しました。作成中の下書きには「発行者情報を反映」で取り込めます。';});
 }
 async function refresh(){
  if(!identity()||busy)return;const mine=owner,t=++ticket,company=cloudProfile.company_id;note('現場と書類を読み込み中…');
  try{
   const results=await Promise.all([read('sites','id,name,status,completed_on,lifecycle_version',company),read('billing_profiles','*',company)]);
   if(t!==ticket||identity()!==mine)return;
   sites=results[0];profile=results[1][0]||{};
   const current=siteId||'',linked=siteByName(summarySite());q('#pbSite').innerHTML='<option value="">現場を選択</option>'+[...sites].sort((a,b)=>(a.status==='active'?0:1)-(b.status==='active'?0:1)||a.name.localeCompare(b.name,'ja')).map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+(s.completed_on?'（完工）':s.status==='active'?'':'（過去・未整理）')+'</option>').join('');siteId=sites.some(s=>s.id===current)?current:linked?.id||'';q('#pbSite').value=siteId;
   if(!profileDirty&&!q('#pbCompany')?.contains(document.activeElement))renderProfile();await loadSite();loadRates(company,mine);
  }catch(e){if(identity()===mine)note('読み込みできませんでした：'+e.message,true);}
 }
 async function syncFromSummary(){
  if(!identity()||dirty)return;
  const linked=siteByName(summarySite());
  if(!linked||linked.id===siteId)return;
  siteId=linked.id;editor=null;dirty=false;
  if(q('#pbSite'))q('#pbSite').value=siteId;
  await loadSite();
 }
 function syncToSummary(){
  const summary=q('#siteSummarySelect'),selected=site();
  if(!summary||!selected||summary.value===selected.name||![...summary.options].some(o=>o.value===selected.name))return;
  summary.value=selected.name;summary.dispatchEvent(new Event('change',{bubbles:true}));
 }
 async function loadRates(company,mine){
  const specs=[['labor_rate_master','label,day_rate,active','day_rate','人日'],['vehicle_rate_master','label,daily_rate,active','daily_rate','日'],['equipment_rate_master','label,daily_rate,active','daily_rate','日'],['small_tool_rate_master','label,hourly_rate,active','hourly_rate','時間'],['attachment_rate_master','label,hourly_rate,active','hourly_rate','時間']];
  const results=await Promise.allSettled(specs.map(async([table,cols,key,unit])=>(await read(table,cols,company)).filter(x=>x.active!==false&&Number.isFinite(Number(x[key]))&&x[key]!==null).map(x=>({name:x.label,costPrice:String(x[key]),unit}))));
  if(identity()!==mine)return;rates=results.flatMap(r=>r.status==='fulfilled'?r.value:[]);
  if(q('#pbRate'))q('#pbRate').innerHTML=rateOptions();
 }
 async function loadSite(){
  const mine=owner,sid=siteId,t=++ticket;siteLoaded=false;docs=[];contract=null;renderOverview();renderCompletion();renderList();if(!editor)renderEditor();
  if(!sid){note('現場を選んで、完工設定や書類作成を進めてください。');return;}
  note('この現場の書類を読み込み中…');
  try{
   const result=await Promise.all([read('project_documents','*',cloudProfile.company_id,sid),read('revenues','id,site_id,revenue_type,amount,updated_at',cloudProfile.company_id,sid)]);
   if(t!==ticket||identity()!==mine||siteId!==sid)return;docs=result[0];const contracts=result[1].filter(r=>r.revenue_type==='contract');if(contracts.length>1)throw new Error('請負金額が重複しています。確認してください。');contract=contracts[0]||null;siteLoaded=true;
   renderOverview();renderCompletion();renderList();note('下書きは請求済額に含めず、確定した請求書だけ集計します。');
  }catch(e){if(t===ticket&&identity()===mine)note('書類を確認できませんでした：'+e.message,true);}
 }
 function renderOverview(){
  if(!q('#pbOverview'))return;const s=site();q('#pbNew').disabled=!!s&&!siteLoaded;
  if(!s){q('#pbOverview').innerHTML='';return;}
  if(!siteLoaded){q('#pbOverview').innerHTML='<p class="note">書類・請求額の読み込みが完了すると表示します。</p>';return;}
  const billed=E.billed(docs),amount=contract?Number(contract.amount):null;
  q('#pbOverview').innerHTML='<div class="pb-state">'+(s.completed_on?'完工済み '+esc(s.completed_on):s.status==='active'?'工事中':'過去・未整理')+'</div><div class="pb-metrics"><div><small>請負金額（税別）</small><b>'+ (amount===null?'未登録':yen(amount))+'</b></div><div><small>請求済額（税別）</small><b>'+yen(billed)+'</b></div><div><small>未請求額（税別）</small><b>'+(amount===null?'—':yen(amount-billed))+'</b></div></div><p class="note">請求は請負金額の内訳として管理します。売上・利益はホームの現場別集計で確認できます。</p>';
 }
 function renderCompletion(){
  const s=site(),host=q('#pbCompletionBody');if(!host)return;
  if(!s){host.textContent='現場を選んでください。';return;}
  host.innerHTML='<p class="note">完工した現場は通常の日報の選択肢から外れ、履歴に残ります。費用の要確認や未請求額は完工後も確認できます。</p>'+field('完工日','pbCompletedOn',s.completed_on||date(),'date','max="'+date()+'"')+'<button id="pbCompleteSave" class="btn dark pb-wide" type="button">'+(s.completed_on?'完工日を更新':'この現場を完工にする')+'</button>'+(s.status!=='active'?'<button id="pbReopen" class="btn light pb-wide" type="button">工事中に戻す</button>':'');
  q('#pbCompleteSave').onclick=()=>setCompletion(false);if(q('#pbReopen'))q('#pbReopen').onclick=()=>setCompletion(true);
 }
 async function setCompletion(reopen){
  const s=site(),mine=owner;if(!s||busy)return;const completed=q('#pbCompletedOn').value;
  if(!reopen&&(!completed||completed>date()))return note('完工日を今日以前の日付で入力してください。',true);
  if(!confirm(s.name+'を'+(reopen?'工事中に戻します。':completed+'の完工として保存します。')+'よろしいですか？'))return;
  await action(async()=>{const r=await cloudClient.rpc('toya_set_site_completion',{p_site_id:s.id,p_expected_version:s.lifecycle_version,p_completed_on:reopen?null:completed,p_reopen:reopen});if(r.error)throw r.error;if(identity()!==mine)return;const row=one(r.data);if(!row?.id)throw new Error('保存結果を確認できません。');sites=sites.map(x=>x.id===row.id?row:x);renderOverview();renderCompletion();const opt=[...q('#pbSite').options].find(o=>o.value===row.id);if(opt)opt.textContent=row.name+(row.completed_on?'（完工）':'');document.dispatchEvent(new CustomEvent('toya-site-lifecycle-changed'));note(row.name+'：'+(reopen?'工事中に戻しました。':'完工日を保存しました。'));});
 }
 function showProfit(){
  const s=site();if(!s)return note('現場を選んでください。',true);
  const select=q('#siteSummarySelect');if(!select)return;
  if(![...select.options].some(o=>o.value===s.name))select.add(new Option(s.name,s.name));select.value=s.name;select.dispatchEvent(new Event('change',{bubbles:true}));
  const mode=q('#sfMode');if(mode){mode.value='all';mode.dispatchEvent(new Event('change',{bubbles:true}));}q('#siteSummaryCard')?.scrollIntoView({block:'start',behavior:'smooth'});
 }
 function renderTabs(){q('#projectBusinessCard').querySelectorAll('[data-pb-kind]').forEach(b=>{b.className='btn '+(b.dataset.pbKind===kind?'lime':'light');b.setAttribute('aria-pressed',String(b.dataset.pbKind===kind));});q('#pbNew').textContent='＋ '+E.kinds[kind]+'を作成';}
 function renderList(){
  const host=q('#pbDocuments');if(!host)return;const rows=docs.filter(d=>d.kind===kind).sort((a,b)=>b.document_date.localeCompare(a.document_date)||b.created_at.localeCompare(a.created_at));
  host.innerHTML='<h3>保存済みの'+E.kinds[kind]+'</h3>'+(rows.length?rows.map(d=>'<div class="pb-document-row"><div><b>'+esc(d.document_number||'下書き')+'</b><span class="pb-badge">'+({draft:'下書き',issued:'確定',void:'取消済み'}[d.status])+'</span><p>'+esc(d.document_date)+' / '+esc(d.customer_name||'宛先未入力')+'</p><p>'+esc(d.subject)+'</p><strong>'+yen(d.total)+'（税込）</strong></div><button class="btn light" type="button" data-pb-open="'+esc(d.id)+'">開く</button></div>').join(''):'<p class="note">この現場にはまだ保存されていません。</p>');
  host.querySelectorAll('[data-pb-open]').forEach(b=>b.onclick=()=>openDocument(b.dataset.pbOpen));
 }
 function discard(){return !dirty||confirm('書類の未保存の入力を閉じますか？');}
 function requestSite(){
  note('先に上の「現場」を選んでください。',true);
  const select=q('#pbSite');select?.scrollIntoView?.({block:'center',behavior:'smooth'});select?.focus();
 }
 function newDocument(k,from){
  if(!site())return requestSite();
  if(!siteLoaded)return note('現場の読み込みが終わってから、もう一度押してください。',true);
  if(!discard())return;
  editor=E.draft(k,site(),profile,date());
  if(k==='invoice'&&!from&&contract&&Number(contract.amount)>E.billed(docs))editor.items=[{name:site().name+' 工事代金',spec:'',quantity:'1',unit:'式',unitPrice:String(Number(contract.amount)-E.billed(docs)),costPrice:null}];
  if(from){editor.customer_name=from.customer_name;editor.customer_address=from.customer_address;editor.subject=from.subject;editor.notes=from.notes;editor.tax_rate=from.tax_rate;editor.items=copy(from.items).map(x=>({...x,costPrice:k==='estimate'?x.costPrice:null}));}
  kind=k;dirty=true;renderTabs();renderList();renderEditor();
 }
 function openDocument(id){if(!discard())return;const doc=docs.find(d=>d.id===id);if(!doc)return;editor=copy(doc);dirty=false;renderEditor();}
 function rateOptions(){return '<option value="">登録単価を選択</option>'+rates.map((r,i)=>'<option value="'+i+'">'+esc(r.name)+' / '+yen(r.costPrice)+'・'+esc(r.unit)+'</option>').join('');}
 function simpleEstimateHTML(d,locked){
  return '<section class="pb-editor pb-simple-review"><div class="pb-editor-heading"><h3>3. 見積書を確認します</h3><button id="pbCloseEditor" class="btn light" type="button">明細に戻る</button></div><div class="pb-review-job"><b>'+esc(d.site_name)+'</b><p id="pbReviewCustomer">見積先：'+esc(d.customer_name||'未入力')+'</p>'+(d.site_address?'<p>工事場所：'+esc(d.site_address)+'</p>':'')+'</div><div id="pbTotals" aria-live="polite"></div><div class="pb-review-groups">'+d.items.map(r=>'<p><span>'+esc(r.name)+'</span><b>'+yen(E.lineAmount(r.quantity,r.unitPrice))+'</b></p>').join('')+'</div><button id="pbShowPreview" class="btn light pb-wide" type="button">見積書の仕上がりを見る</button><p id="pbEditorStatus" class="note" role="status"></p><p id="pbActionStatus" class="note" role="status" aria-live="polite"></p>'+(!locked?'<button id="pbIssueDoc" class="btn lime pb-wide" type="button">完成して印刷・PDFへ →</button><p class="note">内容を確認して完成すると、見積番号が付きます。</p>':'<p class="pb-review-done">'+esc(d.document_number||'')+' ／ '+(d.status==='issued'?'完成・保存済み':'取消済み')+'</p>')+'<details id="pbReviewFields"><summary>日付・宛先・条件を直す</summary><fieldset id="pbFields" '+(locked?'disabled':'')+'><div class="pb-grid">'+field('発行日','pbDocumentDate',d.document_date,'date')+field('見積有効期限（任意）','pbValidUntil',d.valid_until,'date')+'</div>'+field('宛先','pbCustomer',d.customer_name,'text','maxlength="160"')+field('宛先住所（任意）','pbCustomerAddress',d.customer_address,'text','maxlength="500"')+field('件名','pbSubject',d.subject,'text','maxlength="200"')+'<div class="pb-grid">'+field('工事開始日（任意）','pbTransactionStart',d.transaction_start,'date')+field('工事終了日（任意）','pbTransactionEnd',d.transaction_end,'date')+'</div><label for="pbTaxRate">消費税</label><select id="pbTaxRate"><option value="10">10%</option><option value="8">8%</option><option value="0">非課税・対象外</option></select><label for="pbNotes">備考・条件</label><textarea id="pbNotes" maxlength="3000">'+esc(d.notes)+'</textarea></fieldset>'+(!locked?'<button id="pbSaveDoc" class="btn light pb-wide" type="button">変更を保存しておく</button>':'')+'</details><details><summary>発行者情報を確認する</summary><div id="pbIssuerView"></div>'+(!locked?'<button id="pbApplyIssuer" class="btn light pb-wide" type="button">保存済みの発行者情報を反映</button>':'')+'</details>'+(!d.issuer?.issuer_name?'<p class="pb-error">発行者の会社名を登録してください。</p><button id="pbSetupIssuer" class="btn light pb-wide" type="button">発行者情報を登録する</button>':'')+(locked&&d.status==='issued'&&d.site_id?'<details><summary>受注したときの操作</summary><button id="pbAcceptEstimate" class="btn dark pb-wide" type="button">この見積額を請負金額に設定</button><div class="pb-actions"><button id="pbInvoiceFromEstimate" class="btn light" type="button">請求書に引き継ぐ</button><button id="pbProgressFromEstimate" class="btn light" type="button">出来高請求に引き継ぐ</button></div></details>':'')+(d.id&&d.status!=='void'?'<details><summary>この見積書を取り消す</summary>'+field('取消理由','pbVoidReason','','text','maxlength="500"')+'<button id="pbVoidDoc" class="btn danger pb-wide" type="button">取消として保存</button></details>':'')+'</section>';
 }
 async function completeSimpleEstimate(){
  if(busy||!identity()||window.ToyaEstimatePlanUI?.isBusy())return;
  let d;try{d=calculatedDocument().d;if(!d.customer_name)throw new Error('見積先を入力してください。');if(!d.document_date)throw new Error('発行日を入力してください。');if(d.transaction_start&&d.transaction_end&&d.transaction_start>d.transaction_end)throw new Error('工事期間の前後を確認してください。');if(!d.issuer?.issuer_name)throw new Error('発行者の会社名を登録してください。');}catch(e){q('#pbReviewFields').open=true;return note(e.message,true);}
  if(!confirm('この内容で見積書を完成します。\n宛先：'+d.customer_name+'\n税込金額：'+yen(E.total(d.items,d.tax_rate).total)+'\n完成後は見積番号が付き、内容が固定されます。'))return;
  const mine=owner;
  await action(async()=>{
   if(dirty){const saved=await cloudClient.rpc('toya_save_project_document',{p_id:editor.id,p_expected_updated_at:editor.updated_at,p_document:d});if(saved.error)throw saved.error;if(identity()!==mine)return;adoptDocument(one(saved.data));}
   const r=await cloudClient.rpc('toya_issue_project_document',{p_id:editor.id,p_expected_updated_at:editor.updated_at});if(r.error)throw r.error;if(identity()!==mine)return;adoptDocument(one(r.data));note('見積書が完成しました。「印刷・PDF保存」から保存できます。');preview();
  });
 }
 function renderEditor(){
  const home=q('#pbEditor'),estimateHost=q('#estimateDocumentHost');if(home)home.innerHTML='';if(estimateHost)estimateHost.innerHTML='';if(!editor)return;const host=editor.kind==='estimate'&&estimateHost?estimateHost:home;if(!host)return;const d=editor,locked=d.status!=='draft',estimate=d.kind==='estimate',progress=d.kind==='progress',linked=!!d.estimate_plan_id,simple=estimate&&linked&&d.estimate_snapshot?.entry_mode==='quote';
  host.innerHTML=simple?simpleEstimateHTML(d,locked):'<section class="pb-editor"><div class="pb-editor-heading"><h3>'+E.kinds[d.kind]+' '+esc(d.document_number||'下書き')+'</h3><button id="pbCloseEditor" class="btn light" type="button">閉じる</button></div>'+(linked?'<p class="note">積算表から作った見積書です。金額を変えるときは積算表を修正し、新しい見積書を作成してください。</p>':'')+'<fieldset id="pbFields" '+(locked?'disabled':'')+'><div class="pb-grid">'+field('発行日','pbDocumentDate',d.document_date,'date')+field(estimate?'見積有効期限':'支払期限',estimate?'pbValidUntil':'pbDueDate',estimate?d.valid_until:d.due_date,'date')+'</div>'+field('宛先（会社名・お名前）','pbCustomer',d.customer_name,'text','maxlength="160"')+field('宛先住所','pbCustomerAddress',d.customer_address,'text','maxlength="500"')+field('件名','pbSubject',d.subject,'text','maxlength="200"')+'<div class="pb-grid">'+field('工事期間・取引開始日','pbTransactionStart',d.transaction_start,'date')+field('工事期間・取引終了日','pbTransactionEnd',d.transaction_end,'date')+'</div><label for="pbTaxRate">消費税</label><select id="pbTaxRate"><option value="10">10%</option><option value="8">8%（軽減税率）</option><option value="0">非課税・対象外</option></select>'+(progress?'<div class="pb-progress"><p>請負金額：<b>'+ (contract?yen(contract.amount):'未登録')+'</b>（税別）<br>前回までの請求額：<b id="pbPrevious">'+yen(locked?d.previous_billed:E.billed(docs))+'</b>（税別）</p><div class="pb-grid">'+field('累計出来高率（%）','pbProgressPercent','','number','min="0" max="100" step="0.01" inputmode="decimal"')+'<div class="pb-align-bottom"><button id="pbUsePercent" class="btn light" type="button">率から金額を計算</button></div></div>'+field('累計出来高（円・税別）','pbCumulative',d.cumulative_amount,'number','min="0" step="1" inputmode="numeric"')+'<p class="note">今回分を含め、これまでに出来上がった工事の累計金額を入力します。</p></div>':'<h4>明細</h4><p class="note">数量 × 単価で計算（明細の1円未満は切捨て）。消費税は書類全体で1回計算します。</p><div id="pbLines"></div>'+(!linked?'<button id="pbAddLine" class="btn light pb-wide" type="button">＋ 明細を追加</button>':'')+(estimate&&!linked?'<details><summary>登録単価を原価に使う</summary><select id="pbRate">'+rateOptions()+'</select><button id="pbAddRate" type="button" class="btn light pb-wide">原価付きの明細を追加</button><p class="note">見積先へ出す単価は、明細の「見積単価」に入力してください。</p></details>':''))+'<label for="pbNotes">備考・条件</label><textarea id="pbNotes" maxlength="3000">'+esc(d.notes)+'</textarea></fieldset><div id="pbTotals" aria-live="polite"></div><p id="pbEditorStatus" class="note" role="status"></p><p id="pbActionStatus" class="note" role="status"></p><details><summary>この書類の発行者</summary><div id="pbIssuerView"></div>'+(!locked?'<button id="pbApplyIssuer" class="btn light pb-wide" type="button">保存済みの発行者情報を反映</button>':'')+'</details><div class="pb-actions">'+(!locked?'<button id="pbSaveDoc" class="btn dark" type="button">下書きを保存</button>':'')+'<button id="pbShowPreview" class="btn light" type="button">プレビュー・印刷</button></div>'+(!locked?'<button id="pbIssueDoc" class="btn lime pb-wide" type="button">内容を確定・採番</button><p class="note">下書きを保存し、内容を確認してから確定します。</p>':(!estimate?'<button id="pbCopyDoc" class="btn light pb-wide" type="button">複製して新規作成</button>':''))+(locked&&d.kind==='estimate'&&d.status==='issued'&&d.site_id?'<button id="pbAcceptEstimate" class="btn dark pb-wide" type="button">この見積額を請負金額に設定</button><div class="pb-actions"><button id="pbInvoiceFromEstimate" class="btn light" type="button">請求書に引き継ぐ</button><button id="pbProgressFromEstimate" class="btn light" type="button">出来高請求に引き継ぐ</button></div>':'')+(d.id&&d.status!=='void'?'<details><summary>この書類を取り消す</summary>'+field('取消理由','pbVoidReason','','text','maxlength="500"')+'<button id="pbVoidDoc" class="btn danger pb-wide" type="button">取消として保存</button></details>':'')+'</section>';
  q('#pbTaxRate').value=String(d.tax_rate);if(linked)q('#pbTaxRate').disabled=true;renderLines();renderIssuer();updateTotals();
  q('#pbCloseEditor').onclick=()=>{if(discard()){editor=null;dirty=false;host.innerHTML='';if(simple)window.ToyaEstimatePlanUI?.returnToInput(d);}};
  q('#pbFields').addEventListener('input',()=>{dirty=true;updateTotals();});q('#pbFields').addEventListener('change',()=>{dirty=true;updateTotals();});
  if(q('#pbAddLine'))q('#pbAddLine').onclick=()=>{gather();if(editor.items.length>=200)return note('明細は200行までです。',true);editor.items.push({name:'',spec:'',quantity:'1',unit:'式',unitPrice:'',costPrice:null});dirty=true;renderLines();updateTotals();};
  if(q('#pbAddRate'))q('#pbAddRate').onclick=()=>{const r=rates[Number(q('#pbRate').value)];if(q('#pbRate').value===''||!r)return;gather();if(editor.items.length>=200)return;const added={...r,quantity:'1',spec:'',unitPrice:''},blank=editor.items.findIndex(x=>!String(x.name||'').trim()&&!String(x.unitPrice??'').trim());if(blank>=0)editor.items[blank]=added;else editor.items.push(added);dirty=true;renderLines();updateTotals();};
  if(q('#pbUsePercent'))q('#pbUsePercent').onclick=()=>{try{q('#pbCumulative').value=E.percentAmount(contract?.amount,q('#pbProgressPercent').value);dirty=true;updateTotals();}catch(e){note(e.message,true);}};
  if(q('#pbApplyIssuer'))q('#pbApplyIssuer').onclick=()=>{editor.issuer=copy(profile);dirty=true;renderIssuer();updateTotals();};
  if(q('#pbSaveDoc'))q('#pbSaveDoc').onclick=saveDocument;if(q('#pbIssueDoc'))q('#pbIssueDoc').onclick=simple?completeSimpleEstimate:issueDocument;
  q('#pbShowPreview').onclick=preview;if(q('#pbSetupIssuer'))q('#pbSetupIssuer').onclick=()=>window.ToyaProjectBusiness.openSettings();
  if(q('#pbCopyDoc'))q('#pbCopyDoc').onclick=()=>newDocument(d.kind,d);
  if(q('#pbAcceptEstimate'))q('#pbAcceptEstimate').onclick=acceptEstimate;
  if(q('#pbInvoiceFromEstimate'))q('#pbInvoiceFromEstimate').onclick=()=>newDocument('invoice',d);
  if(q('#pbProgressFromEstimate'))q('#pbProgressFromEstimate').onclick=()=>newDocument('progress',d);
  if(q('#pbVoidDoc'))q('#pbVoidDoc').onclick=voidDocument;
  if(simple)window.ToyaEstimatePlanUI?.documentOpened(d);host.scrollIntoView({block:'start',behavior:'smooth'});
 }
 function renderIssuer(){const i=editor?.issuer||{};q('#pbIssuerView').textContent=[i.issuer_name||'発行者未設定',i.postal_code?'〒'+i.postal_code:'',i.address,i.representative,i.phone?'TEL '+i.phone:'',i.fax?'FAX '+i.fax:'',i.registration_number,i.bank_details,i.logo_key==='toya'?'ロゴ：TOYA':''].filter(Boolean).join('\n');}
 function renderLines(){
  const host=q('#pbLines');if(!host)return;const est=editor.kind==='estimate',locked=editor.status!=='draft'||!!editor.estimate_plan_id;
  host.innerHTML=editor.items.map((r,i)=>'<div class="pb-line" data-line="'+i+'"><div class="pb-line-heading"><b>明細 '+(i+1)+'</b>'+(!locked?'<button type="button" class="btn danger" data-remove="'+i+'">削除</button>':'')+'</div>'+field('品名','pbName'+i,r.name,'text','data-key="name" maxlength="200"')+field('規格・内容','pbSpec'+i,r.spec,'text','data-key="spec" maxlength="500"')+'<div class="pb-grid">'+field('数量','pbQty'+i,r.quantity,'number','data-key="quantity" min="0.001" max="1000000" step="0.001" inputmode="decimal"')+field('単位','pbUnit'+i,r.unit,'text','data-key="unit" maxlength="20"')+'</div>'+field(est?'見積単価（円・税別）':'単価（円・税別）','pbPrice'+i,r.unitPrice,'number','data-key="unitPrice" step="0.01" inputmode="decimal"')+'<div class="pb-line-amount" data-amount="'+i+'"></div>'+(est?'<details><summary>社内用の原価単価</summary>'+field('原価単価（任意・税別）','pbCost'+i,r.costPrice,'number','data-key="costPrice" min="0" step="0.01" inputmode="decimal"')+'<p class="note">原価と見込利益は書類には印刷しません。</p></details>':'')+'</div>').join('');
  if(!est)host.querySelectorAll('[data-line]').forEach(row=>{const j=Number(row.dataset.line),r=editor.items[j];row.insertAdjacentHTML('beforeend','<details><summary>工事番号・明細の備考（任意）</summary>'+field('納品コード・工事番号','pbCode'+j,r.code,'text','data-key="code" maxlength="80"')+field('備考欄に印刷する内容','pbRemark'+j,r.remark,'text','data-key="remark" maxlength="500"')+'</details>');});
  if(editor.estimate_plan_id)host.querySelectorAll('input,select,textarea').forEach(el=>{el.disabled=true;});
  host.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{gather();editor.items.splice(Number(b.dataset.remove),1);dirty=true;renderLines();updateTotals();});
 }
 function gather(){
  if(!editor||editor.status!=='draft')return editor;
  const d=editor;d.document_date=q('#pbDocumentDate').value;d.transaction_start=q('#pbTransactionStart').value||null;d.transaction_end=q('#pbTransactionEnd').value||null;d.due_date=q('#pbDueDate')?.value||null;d.valid_until=q('#pbValidUntil')?.value||null;d.customer_name=q('#pbCustomer').value.trim();d.customer_address=q('#pbCustomerAddress').value.trim();d.subject=q('#pbSubject').value.trim();d.notes=q('#pbNotes').value;d.tax_rate=Number(q('#pbTaxRate').value);
  if(d.kind==='progress')d.cumulative_amount=q('#pbCumulative').value===''?null:Number(q('#pbCumulative').value);
  else if(!d.estimate_plan_id)d.items=[...q('#pbLines').querySelectorAll('[data-line]')].map(row=>Object.fromEntries([...row.querySelectorAll('[data-key]')].map(input=>[input.dataset.key,input.value])));
  return d;
 }
 function calculatedDocument(){
  if(!documentReady())throw new Error('先に一覧を更新して請求額を確認してください。');
  const d=copy(gather());if(!d)throw new Error('書類を選んでください。');
  if(d.kind==='progress'&&d.status==='draft'){const p=E.progress(contract?.amount,d.cumulative_amount,E.billed(docs));d.previous_billed=p.previous;d.contract_amount=Number(contract.amount);d.items=[{name:(d.subject||site().name)+' 出来高分',spec:'',quantity:'1',unit:'式',unitPrice:String(p.current),costPrice:null}];}
  return {d,totals:E.total(d.items,d.tax_rate)};
 }
 function updateTotals(){
  if(!editor)return;const host=q('#pbTotals');try{const {d,totals:t}=calculatedDocument();host.innerHTML='<div class="pb-metrics"><div><small>'+(d.kind==='progress'?'今回請求額（税別）':'小計（税別）')+'</small><b>'+yen(t.subtotal)+'</b></div><div><small>消費税 '+d.tax_rate+'%</small><b>'+yen(t.tax)+'</b></div><div><small>合計（税込）</small><b>'+yen(t.total)+'</b></div></div>'+(d.kind==='estimate'&&d.estimate_snapshot?.entry_mode!=='quote'?'<p class="pb-estimate-profit">'+(t.cost===null?'原価未入力 '+t.missingCost+'項目／入力済み原価 '+yen(t.enteredCost):'見込原価 '+yen(t.cost)+' ／ 見込利益 '+yen(t.profit))+'</p>':'');if(q('#pbReviewCustomer'))q('#pbReviewCustomer').textContent='見積先：'+d.customer_name;t.lines.forEach((r,i)=>{const x=q('[data-amount="'+i+'"]');if(x)x.textContent='金額 '+yen(r.amount);});}
  catch(e){host.textContent=e.message;}
  if(q('#pbIssueDoc'))q('#pbIssueDoc').disabled=editor.estimate_snapshot?.entry_mode==='quote'?busy||!documentReady():!editor.id||dirty||busy||!documentReady();
  if(q('#pbEditorStatus'))q('#pbEditorStatus').textContent=editor.estimate_snapshot?.entry_mode==='quote'&&editor.status==='draft'?(dirty?'変更した内容も「完成して印刷・PDFへ」で保存します。':'見積は保存済みです。仕上がりを確認して完成してください。'):editor.status==='void'?'取消済み：'+editor.void_reason:editor.status==='issued'?'確定済みの内容を表示しています。':dirty?'未保存の変更があります。':'下書きを保存済みです。内容を確認して確定できます。';
 }
 async function action(fn){
  if(busy||!identity()||window.ToyaEstimatePlanUI?.isBusy())return;busy=true;const mine=owner;
  document.querySelectorAll('#projectBusinessCard button,#projectBusinessCard input,#projectBusinessCard select,#projectBusinessCard textarea,#estimatePlanCard button,#estimatePlanCard input,#estimatePlanCard select,#estimatePlanCard textarea').forEach(b=>{b.dataset.pbWasDisabled=String(b.disabled);b.disabled=true;});
  try{await fn();}catch(e){if(identity()===mine)note('保存できませんでした：'+String(e.message||e),true);}
  finally{busy=false;if(identity()===mine){document.querySelectorAll('[data-pb-was-disabled]').forEach(b=>{b.disabled=b.dataset.pbWasDisabled==='true';delete b.dataset.pbWasDisabled;});if(editor)updateTotals();}}
 }
 function adoptDocument(row){if(!row?.id)throw new Error('保存結果を確認できません。');docs=[...docs.filter(d=>d.id!==row.id),row].filter(d=>d.site_id===siteId);editor=copy(row);dirty=false;renderOverview();renderList();renderEditor();if(row.kind==='estimate')document.dispatchEvent(new CustomEvent('toya-estimate-document-changed',{detail:copy(row)}));}
 async function saveDocument(){
  let data;try{data=calculatedDocument().d;if(!data.document_date)throw new Error('発行日を入力してください。');if(data.transaction_start&&data.transaction_end&&data.transaction_start>data.transaction_end)throw new Error('工事期間の前後を確認してください。');}catch(e){return note(e.message,true);}
  editor.id=editor.id||crypto.randomUUID();const mine=owner,id=editor.id,expected=editor.updated_at||null;
  await action(async()=>{const r=await cloudClient.rpc('toya_save_project_document',{p_id:id,p_expected_updated_at:expected,p_document:data});if(r.error)throw r.error;if(identity()!==mine)return;adoptDocument(one(r.data));note('下書きを保存しました。プレビューで確認してから確定できます。');});
 }
 async function issueDocument(){
  if(!editor?.id||dirty||!documentReady())return note('先に下書きを保存してください。',true);
  const d=copy(editor),mine=owner;if(!confirm(E.kinds[d.kind]+'を確定します。\n宛先：'+d.customer_name+'\n税込金額：'+yen(d.total)+'\n確定後は内容が固定され、書類番号が付きます。'))return;
  await action(async()=>{const r=await cloudClient.rpc('toya_issue_project_document',{p_id:d.id,p_expected_updated_at:d.updated_at});if(r.error)throw r.error;if(identity()!==mine)return;adoptDocument(one(r.data));note('確定しました。プレビューから印刷・PDF保存できます。');});
 }
 async function voidDocument(){
  const d=copy(editor),mine=owner,reason=q('#pbVoidReason').value.trim();if(!reason)return note('取消理由を入力してください。',true);
  if(!confirm((d.document_number||'下書き')+'を取消として保存しますか？\n理由：'+reason))return;
  await action(async()=>{const r=await cloudClient.rpc('toya_void_project_document',{p_id:d.id,p_expected_updated_at:d.updated_at,p_reason:reason});if(r.error)throw r.error;if(identity()!==mine)return;adoptDocument(one(r.data));note('取消として保存しました。履歴は残ります。');});
 }
 async function acceptEstimate(){
  const d=copy(editor),mine=owner;
  if(!confirm(site().name+'の請負金額を、この見積の'+yen(d.subtotal)+'（税別）に設定します。\n現在：'+(contract?yen(contract.amount):'未登録')+'\nよろしいですか？'))return;
  await action(async()=>{const r=await cloudClient.rpc('toya_estimate_to_contract',{p_id:d.id,p_expected_revenue_updated_at:contract?.updated_at||null});if(r.error)throw r.error;if(identity()!==mine)return;contract=one(r.data);renderOverview();note('見積額を請負金額に設定しました。現場の利益にも反映します。');q('#sfRefresh')?.click();});
 }
 function preview(){
  let d;try{d=calculatedDocument().d;if(d.status==='draft')d.document_number=null;}catch(e){return note(e.message,true);}
  q('#pbPreview')?.remove();const dialog=document.createElement('dialog');dialog.id='pbPreview';dialog.innerHTML='<div class="pb-preview-toolbar"><b>'+E.kinds[d.kind]+'プレビュー</b><div><button id="pbPrint" class="btn dark" type="button">印刷・PDF保存</button><button id="pbPreviewClose" class="btn light" type="button">閉じる</button></div></div><p class="note">'+(d.status==='draft'&&d.kind!=='estimate'?'今は下書きです。正式な請求書にするには、この画面を閉じて「下書きを保存」→「内容を確定・採番」を押してください。請求番号が付き、下書き表示が消えます。':'印刷画面でPDFに保存できます。下書きには「下書き」と表示します。')+'</p><iframe title="書類の印刷プレビュー" sandbox="allow-same-origin allow-modals"></iframe>';document.body.append(dialog);const frame=dialog.querySelector('iframe'),stopFit=fitEstimatePreview(frame);frame.srcdoc=E.printHTML(d);q('#pbPrint').onclick=()=>{frame.contentWindow.focus();frame.contentWindow.print();};q('#pbPreviewClose').onclick=()=>{stopFit();dialog.close();dialog.remove();};dialog.addEventListener('close',()=>{stopFit();dialog.remove();},{once:true});dialog.showModal();
 }
 window.ToyaProjectBusiness={
  isBusy:()=>busy,
  closeEstimate(){if(busy)return false;if(editor?.kind==='estimate'){if(!discard())return false;editor=null;dirty=false;renderEditor();}return true;},
  async openEstimate(row){
   if(busy||!identity()||!discard()||row.kind!=='estimate')return false;
   if(!mount())return false;const mine=owner;
   if(!row.site_id){editor=copy(row);dirty=false;renderEditor();return true;}
   if(!sites.some(s=>s.id===row.site_id))await refresh();
   if(identity()!==mine||!sites.some(s=>s.id===row.site_id))return false;
   siteId=row.site_id;q('#pbSite').value=siteId;editor=null;dirty=false;await loadSite();
   if(identity()!==mine||!siteLoaded)return false;
   editor=copy(row);dirty=false;renderEditor();return true;
  },
  openSettings(){if(!mount())return;q('nav [data-page="homePage"]')?.click();q('#pbCompany').open=true;q('#pbCompany').scrollIntoView({block:'start',behavior:'smooth'});}
 };
 const start=()=>{mount();const roleUI=window.applyCloudRoleUI;if(typeof roleUI==='function')window.applyCloudRoleUI=function(){const out=roleUI.apply(this,arguments);mount();return out;};document.addEventListener('click',e=>{if(e.target.closest('nav [data-page]'))mount();});setInterval(()=>{if(identity()!==owner)mount();},1000);};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,1000),{once:true});else setTimeout(start,1000);
})();
