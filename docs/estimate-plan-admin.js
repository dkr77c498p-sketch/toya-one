/* Admin-only site estimating. Completion status never filters out a site's plans. */
(() => {
 'use strict';
 const C=window.ToyaEstimatePlan,E=window.ToyaProjectDocuments,A=window.ToyaEstimateAuto;if(!C||!E||!A||window.__toyaEstimatePlans)return;window.__toyaEstimatePlans=true;
 const q=(s,r=document)=>r.querySelector(s),esc=E.escape,yen=E.yen,copy=x=>JSON.parse(JSON.stringify(x));
 const identity=()=>typeof cloudProfile!=='undefined'&&cloudProfile?.active===true&&cloudProfile.role==='admin'&&cloudProfile.company_id&&typeof cloudClient!=='undefined'&&cloudClient?cloudProfile.id+':'+cloudProfile.company_id:'';
 let owner='',sites=[],plans=[],quotes=[],rates=[],selected='',plan=null,dirty=false,busy=false,ready=false,ticket=0,quoteRequest=null,simpleStep=1;
 const selectedSite=()=>sites.find(s=>s.id===selected);
 const note=(message,error=false)=>{for(const id of ['epStatus','epFormStatus']){const el=q('#'+id);if(el){el.textContent=message;el.classList.toggle('pb-error',error);}}};
 const field=(label,id,value='',type='text',extra='')=>'<div class="pb-field"><label for="'+id+'">'+esc(label)+'</label><input id="'+id+'" type="'+type+'" value="'+esc(value??'')+'" '+extra+'></div>';
 const optionSites=()=>sites.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+(s.completed_on?'（完工済み）':s.status==='active'?'':'（過去・未整理）')+'</option>').join('');
 const one=x=>Array.isArray(x)?x[0]:x;
 async function read(table,company,estimateOnly=false){const rows=[];for(let start=0;start<100000;start+=500){let r=cloudClient.from(table).select('*').eq('company_id',company);if(estimateOnly)r=r.eq('kind','estimate');r=await r.order('id').range(start,start+499);if(r.error)throw r.error;rows.push(...(r.data||[]));if((r.data||[]).length<500)return rows;}throw new Error('全件を読み込めませんでした。');}
 function clear(){owner='';sites=[];plans=[];quotes=[];rates=[];selected='';plan=null;dirty=false;ready=false;quoteRequest=null;ticket++;q('#estimatePlanCard')?.remove();q('#epMasterLink')?.remove();q('#epPreview')?.remove();}
 function mount(){
  const id=identity();if(!id){if(owner)clear();return;}if(owner&&owner!==id)clear();owner=id;if(q('#estimatePlanCard'))return;
  const card=document.createElement('div');card.id='estimatePlanCard';card.className='card admin-home-only';
  card.innerHTML='<h2>自動積算表・見積書</h2><p class="note">新しい工事名・住所から見積を作れます。保存済みの数量や日報の実績も参考にできます。</p><div class="pb-actions"><button id="epNew" class="btn lime" type="button">＋ 新しい見積書を作る</button><button id="epReload" class="btn light" type="button">見積一覧を更新</button></div><p id="epStatus" class="note" role="status" aria-live="polite"></p><details id="epPlannedEstimates"><summary>見積の作成・保存済み見積</summary><p class="note">工事名・工事住所・見積先を入力して、工事項目と数量を積み上げます。受注前でも保存できます。</p><details class="ep-advanced"><summary>人工・重機から原価を積み上げる場合</summary><button id="epNewCost" type="button" class="btn light pb-wide">原価から積算表を作る</button></details><div id="epEditor"></div><div id="estimateDocumentHost"></div><div id="epSavedPlans"></div><details id="epQuotes"><summary>保存済みの見積書</summary><div id="epQuoteList"></div></details><button id="epIssuer" class="btn light pb-wide" type="button">発行者情報の設定を開く</button></details><div id="epQuantitySheets"></div><h3>日報からの原価・利益</h3><div id="epActualLedger"></div><label for="epSite">原価の内訳を見る現場</label><select id="epSite"><option value="">現場を選択</option></select><div id="epActualDetail"></div><button id="epNewForSite" class="btn light pb-wide" type="button" disabled>この登録現場で見積を作る</button>';
  const anchor=q('#projectBusinessCard')||q('#siteSummaryCard');if(!anchor)return;anchor.before(card);
  q('#epSite').onchange=e=>{selected=e.target.value;updateNewButton();};
  q('#epNew').onclick=()=>beginNew();q('#epNewCost').onclick=()=>beginNew(selectedSite()||null,'cost');q('#epNewForSite').onclick=()=>{if(ready&&selectedSite())beginNew(selectedSite());};
  q('#epReload').onclick=()=>refresh();q('#epIssuer').onclick=()=>window.ToyaProjectBusiness?.openSettings();
  const link=document.createElement('div');link.className='card';link.id='epMasterLink';link.innerHTML='<h2>自動積算表・見積書</h2><p class="note">日報から現場ごとの請負金額・原価・利益を自動表示します。</p><button class="btn dark pb-wide" type="button">積算表・見積書を開く</button>';link.querySelector('button').onclick=()=>{q('nav [data-page="homePage"]')?.click();card.scrollIntoView({block:'start',behavior:'smooth'});};q('#masterPage')?.prepend(link);
  refresh();
 }
 function beginNew(site=null,mode='quote'){if(busy||!identity()||window.ToyaProjectBusiness?.isBusy()||!discard()||!closeQuote())return;plan=mode==='cost'?C.draft(site):C.quoteDraft(site);simpleStep=1;dirty=true;quoteRequest=null;renderLists();renderPlan();note(site?'この登録現場の見積を作成します。':'新しい工事名・住所・見積先を入力してください。');q(site&&mode==='cost'?'#epTitle':'#epJobName').focus({preventScroll:true});}
 function discard(){return !dirty||confirm('積算表の未保存の入力を閉じますか？');}
 function closeQuote(){return window.ToyaProjectBusiness?.closeEstimate()!==false;}
 async function refresh(){
  if(busy||!identity())return;const mine=owner,t=++ticket,company=cloudProfile.company_id;ready=false;updateNewButton();note('積算表を読み込み中…');
  try{const result=await Promise.all([read('sites',company),read('estimate_plans',company),read('project_documents',company,true)]);if(t!==ticket||identity()!==mine)return;
   sites=result[0].sort((a,b)=>(a.status==='active'?0:1)-(b.status==='active'?0:1)||a.name.localeCompare(b.name,'ja'));plans=result[1];quotes=result[2];ready=true;
   q('#epSite').innerHTML='<option value="">現場を選択</option>'+optionSites();if(!selectedSite())selected='';q('#epSite').value=selected;renderLists();note(dirty?'未保存の積算表を表示しています。':'新しい工事の見積を作るか、保存済みの見積を開いてください。');await loadRates(company,mine);
  }catch(e){if(identity()===mine&&t===ticket)note('読み込みできませんでした：'+e.message,true);}
 }
 async function loadRates(company,mine){
  const specs=[['labor_rate_master','labor','day_rate','人日'],['equipment_rate_master','equipment','daily_rate','台日'],['vehicle_rate_master','vehicle','daily_rate','台日'],['attachment_rate_master','attachment','hourly_rate','台時間'],['small_tool_rate_master','tool','hourly_rate','台時間'],['waste_price_master','waste','unit_price',''],['equipment_transport_rate_master','transport','unit_price','台・片道']];
  const results=await Promise.allSettled(specs.map(async([table,category,key,unit])=>(await read(table,company)).filter(r=>r.active!==false&&r[key]!==null&&r[key]!==undefined&&String(r[key]).trim()!==''&&Number.isFinite(Number(r[key]))&&Number(r[key])>=0).flatMap(r=>{
   let label=r.label||'',u=unit;
   if(category==='waste'){u={kg:'kg',m3:'m³',piece:'枚',vehicle:'台'}[r.rate_basis];if(!u)return [];label=[r.facility,r.waste_type,r.vehicle_class].filter(Boolean).join(' / ');}
   if(category==='transport'){if(r.price_basis!=='one_way_per_machine')return [];label=[r.carrier,r.machine_name,r.distance_label,'片道'].filter(Boolean).join(' / ');}
   if(category==='tool'&&/ホース/.test(label))u='本時間';
   return [{category,label,unit:u,unit_price:String(r[key]),source_table:table,source_id:r.id,source_updated_at:r.updated_at||''}];
  })));
  if(identity()!==mine)return;rates=results.flatMap(r=>r.status==='fulfilled'?r.value:[]);
  const failed=results.map((r,i)=>r.status==='rejected'?C.categories[specs[i][1]]:null).filter(Boolean);
  const host=q('#epRateStatus');if(host)host.textContent=failed.length?'単価を読み込めなかった費目：'+failed.join('・')+'。一覧を更新して再読込できます。':'登録単価を取り込みました。単価は積算表ごとに保存します。';
  q('#epEditor')?.querySelectorAll('[data-rate-picker]').forEach(p=>{const value=p.value;p.innerHTML=rateOptions();p.value=value;});
 }
 function rateOptions(){return '<option value="">登録単価を選択</option>'+rates.map((r,i)=>'<option value="'+i+'">'+esc(C.categories[r.category]+' / '+r.label)+' / '+yen(r.unit_price)+'・'+esc(r.unit)+'</option>').join('');}
 function updateNewButton(){
  q('#epNew').disabled=busy;q('#epNewForSite').disabled=busy||!ready||!selectedSite();
 }
 function renderLists(){
  if(!q('#epSavedPlans'))return;updateNewButton();
  const rows=[...plans].sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
  q('#epSavedPlans').innerHTML=rows.length?'<details><summary>保存した見積を開く（'+rows.length+'件）</summary>'+rows.map(p=>'<div class="pb-document-row"><div><b>'+esc(p.title)+'</b><p>'+esc(p.customer_name||'宛先未入力')+'</p><strong>'+(p.calculation?.complete?'見積 '+yen(p.calculation.price):(p.entry_mode==='quote'?'入力済み見積 '+yen(p.calculation?.known_price||0):'積算途中 / 入力済原価 '+yen(p.calculation?.known_cost||0)))+'</strong></div><button class="btn light" type="button" data-ep-open="'+esc(p.id)+'">開く</button></div>').join('')+'</details>':'<p class="note">保存済みの見積積算はまだありません。</p>';
  q('#epSavedPlans').querySelectorAll('[data-ep-open]').forEach(b=>b.onclick=()=>{if(!discard()||!closeQuote())return;plan=copy(plans.find(p=>p.id===b.dataset.epOpen));dirty=false;quoteRequest=null;simpleStep=2;renderPlan();});
  const quoteRows=[...quotes].sort((a,b)=>b.created_at.localeCompare(a.created_at));
  q('#epQuoteList').innerHTML=quoteRows.length?quoteRows.map(d=>'<div class="pb-document-row"><div><b>'+esc(d.document_number||'下書き')+'</b><span class="pb-badge">'+({draft:'下書き',issued:'確定',void:'取消済み'}[d.status])+'</span><p>'+esc(d.subject)+' / '+esc(d.document_date)+'</p><strong>'+yen(d.total)+'（税込）</strong></div><button type="button" class="btn light" data-ep-quote="'+esc(d.id)+'">開く</button></div>').join(''):'<p class="note">保存済みの見積書はありません。</p>';
  q('#epQuoteList').querySelectorAll('[data-ep-quote]').forEach(b=>b.onclick=()=>{if(!discard()||!closeQuote())return;window.ToyaProjectBusiness?.openEstimate(copy(quotes.find(d=>d.id===b.dataset.epQuote)));});
 }
 function renderPlan(){
  const host=q('#epEditor');if(!host)return;if(!plan){host.innerHTML='';return;}
  if(plan.entry_mode==='quote')return renderSimplePlan();
  q('#epPlannedEstimates').open=true;
  host.innerHTML='<section class="ep-plan"><h3>'+ (plan.site_id?'登録現場の見積':'新しい工事の見積')+'</h3>'+field('工事名','epJobName',plan.site_name||sites.find(s=>s.id===plan.site_id)?.name||'','text','maxlength="200"'+(plan.site_id?' readonly':''))+field('工事住所','epJobAddress',plan.site_address||'','text','maxlength="500"')+field('見積件名（空欄なら工事名）','epTitle',plan.title,'text','maxlength="200"')+'<details><summary>見積先・条件</summary>'+field('宛先（会社名・お名前）','epCustomer',plan.customer_name,'text','maxlength="160"')+field('宛先住所','epAddress',plan.customer_address,'text','maxlength="500"')+'<label for="epQuoteNotes">見積書に載せる備考・条件</label><textarea id="epQuoteNotes" maxlength="3000">'+esc(plan.quote_notes)+'</textarea></details><p class="note">数量 × 日数・時間・回数 × 単価で計算します。例：人工3人 × 5日。材料は数量 × 1回。燃料は別の行に積み上げます。</p><p id="epRateStatus" class="note">登録単価は取り込んだ時点の金額で保存します。</p><div id="epGroups"></div><button id="epAddGroup" type="button" class="btn light pb-wide">＋ 工事項目を追加</button><h3>諸経費と見積額</h3><p class="note">諸経費を加えた原価に利益を上乗せします。不要な率には0を入力してください。</p><div class="pb-grid">'+field('諸経費率（%）','epOverhead',plan.overhead_percent,'number','min="0" max="1000" step="0.01" inputmode="decimal"')+field('利益上乗せ率（%）','epMarkup',plan.markup_percent,'number','min="0" max="1000" step="0.01" inputmode="decimal"')+'</div><details><summary>見積額を調整する</summary>'+field('提出する見積額（円・税別／空欄なら自動計算）','epOverride',plan.quote_amount_override,'number','min="0" step="1" inputmode="numeric"')+'</details><label for="epTax">消費税</label><select id="epTax"><option value="10">10%</option><option value="8">8%</option><option value="0">非課税・対象外</option></select><div id="epTotals" aria-live="polite"></div><details><summary>社内メモ</summary><textarea id="epInternalNotes" maxlength="3000" placeholder="施工条件・積算の前提など">'+esc(plan.internal_notes)+'</textarea><p class="note">社内メモと費用の内訳は、提出用の見積書には載りません。</p></details><p id="epFormStatus" class="note" role="status"></p><div class="pb-actions"><button id="epSave" type="button" class="btn dark">積算表を保存</button><button id="epPrint" type="button" class="btn light">積算表を印刷</button></div><button id="epCreateQuote" type="button" class="btn lime pb-wide">この積算から見積書を作る</button><p class="note">工事項目ごとの見積額を見積書へ引き継ぎます。諸経費・利益・金額調整は原価の割合で配分します。</p><details><summary>この積算表を複製して使う</summary><label for="epCopySite">複製先の現場</label><select id="epCopySite"><option value="">新しい工事（工事名・住所を入力）</option>'+optionSites()+'</select><button id="epCopy" type="button" class="btn light pb-wide">この内容を複製する</button><p class="note">元の積算表を残して、新しい表を作ります。</p></details></section>';
  q('#epTax').value=String(plan.tax_rate);q('#epCopySite').value=plan.site_id||'';renderGroups();updateTotals();
  host.oninput=()=>{dirty=true;updateTotals();};host.onchange=()=>{dirty=true;updateTotals();};
  q('#epCopySite').oninput=e=>e.stopPropagation();q('#epCopySite').onchange=e=>e.stopPropagation();
  q('#epAddGroup').onclick=()=>{gather();if(plan.groups.length>=100)return note('工事項目は100件までです。',true);plan.groups.push({name:'',lines:[C.blankLine()]});dirty=true;renderGroups();updateTotals();q('#epWork'+(plan.groups.length-1)).focus();};
  q('#epSave').onclick=save;q('#epCreateQuote').onclick=createQuote;q('#epPrint').onclick=print;q('#epCopy').onclick=duplicate;
  host.scrollIntoView({block:'start',behavior:'smooth'});
 }
 function renderSimplePlan(){
  const host=q('#epEditor');q('#epPlannedEstimates').open=true;
  host.innerHTML='<section class="ep-plan ep-simple"><ol class="ep-steps" aria-label="見積作成の進み方"><li data-ep-step="1"><b>1</b>工事情報</li><li data-ep-step="2"><b>2</b>数量入力</li><li data-ep-step="3"><b>3</b>確認・印刷</li></ol><div id="epStep1"><h3>1. どの工事の見積ですか？</h3><p class="note">工事名と見積先を入力してください。工事場所は後からでも入力できます。</p>'+field('工事名','epJobName',plan.site_name||sites.find(s=>s.id===plan.site_id)?.name||'','text','maxlength="200" placeholder="例：○○様邸 解体工事"'+(plan.site_id?' readonly':''))+field('見積先（会社名・お名前）','epCustomer',plan.customer_name,'text','maxlength="160" placeholder="例：○○建設株式会社 御中"')+field('工事場所（任意）','epJobAddress',plan.site_address||'','text','maxlength="500" placeholder="例：鹿児島市○○町1-2"')+'<details><summary>見積先住所・件名・条件を入れる</summary>'+field('見積先住所','epAddress',plan.customer_address,'text','maxlength="500"')+field('見積件名（空欄なら工事名）','epTitle',plan.title,'text','maxlength="200"')+'<label for="epQuoteNotes">備考・見積条件</label><textarea id="epQuoteNotes" maxlength="3000">'+esc(plan.quote_notes)+'</textarea></details><button id="epNextItems" type="button" class="btn lime pb-wide">次へ：数量を入力する →</button></div><div id="epStep2" hidden><h3>2. 数量を入れて自動積算</h3><p class="note">㎡・坪・㎥・m・検体数を入れると、御社書式の明細をまとめて作ります。</p>'+autoBuilderHTML()+'<details class="ep-manual"><summary>作成した明細を確認・修正</summary><p class="note">現場条件に合わせて数量・単価を直接変更できます。単価未登録の項目だけ入力してください。</p><div id="epGroups"></div><button id="epAddGroup" type="button" class="btn light pb-wide">＋ 工事項目を追加</button></details><button id="epTemplate" type="button" class="btn light pb-wide">過去の見積をコピーして始める</button><details><summary>税率・社内メモ・その他の操作</summary><label for="epTax">消費税</label><select id="epTax"><option value="10">10%</option><option value="8">8%</option><option value="0">非課税・対象外</option></select><label for="epInternalNotes">社内メモ</label><textarea id="epInternalNotes" maxlength="3000">'+esc(plan.internal_notes)+'</textarea><button id="epPrint" type="button" class="btn light pb-wide">社内用の積算表を印刷</button><label for="epCopySite">この見積の複製先</label><select id="epCopySite"><option value="">新しい工事</option>'+optionSites()+'</select><button id="epCopy" type="button" class="btn light pb-wide">複製して作る</button></details><div id="epTotals" aria-live="polite"></div><button id="epCreateQuote" type="button" class="btn lime pb-wide">保存して御社書式の見積書を確認 →</button><button id="epBackInfo" type="button" class="btn light pb-wide">← 工事情報に戻る</button></div><div id="epInputFooter"><p id="epFormStatus" class="note" role="status" aria-live="polite"></p><button id="epSave" type="button" class="btn light pb-wide">途中で保存する</button></div></section>';
  q('#epTax').value=String(plan.tax_rate);q('#epCopySite').value=plan.site_id||'';renderSimpleGroups();updateTotals();setSimpleStep(simpleStep,false);
  q('#epNextItems').onclick=()=>{if(checkJobInfo())setSimpleStep(2);};q('#epBackInfo').onclick=()=>setSimpleStep(1);
  bindAutoBuilder();
  q('#epTemplate').onclick=()=>{const el=q('#eqArchive');if(el){el.open=true;el.scrollIntoView({block:'start',behavior:'smooth'});}};
  host.oninput=host.onchange=e=>{e.target.removeAttribute('aria-invalid');dirty=true;updateTotals();};q('#epCopySite').oninput=e=>e.stopPropagation();q('#epCopySite').onchange=e=>e.stopPropagation();
  q('#epAddGroup').onclick=()=>{gather();if(plan.groups.length>=100)return note('工事項目は100件までです。',true);plan.groups.push({name:'',quote_lines:[C.blankQuoteLine()],lines:[]});dirty=true;renderSimpleGroups(plan.groups.length-1);updateTotals();focusInput('#epWork'+(plan.groups.length-1));};
  q('#epSave').onclick=save;q('#epCreateQuote').onclick=saveAndReview;q('#epPrint').onclick=print;q('#epCopy').onclick=duplicate;host.scrollIntoView({block:'start',behavior:'smooth'});
 }
 function autoInput(){return copy(plan.groups.find(g=>g.auto_input)?.auto_input||A.defaults());}
 function autoBuilderHTML(){
  const a=A.normalize(autoInput()),f=(label,id,key,unit)=>field(label+(unit?'（'+unit+'）':''),id,a[key],'number','data-auto-key="'+key+'" min="0" step="0.01" inputmode="decimal"');
  return '<details class="ep-auto" open><summary>かんたん自動積算</summary><label for="epAutoKind">工事の種類</label><select id="epAutoKind" data-auto-key="kind"><option value="wood">木造解体</option><option value="lightSteel">軽量鉄骨造解体</option><option value="steel">鉄骨造（S造）解体</option><option value="rc">RC造解体</option><option value="interior">内部改修・内部解体・スケルトン解体</option></select><div class="ep-auto-grid">'+f('建物延床面積','epAutoM2','area_m2','㎡')+f('建物延床面積','epAutoTsubo','area_tsubo','坪')+f('階数','epAutoFloors','floors','階')+'</div><details open><summary>A 仮設・アスベスト</summary><div class="ep-auto-grid">'+f('養生足場','epAutoScaffold','scaffold_m2','㎡')+f('防音シート','epAutoSound','sound_m2','㎡')+f('メッシュシート','epAutoMesh','mesh_m2','㎡')+f('アスベスト調査','epAutoSamples','asbestos_samples','検体')+f('アスベスト含有スレート','epAutoSlate','slate_m2','㎡')+'</div></details><details open><summary>B 解体・外構</summary><div class="ep-auto-grid">'+f('基礎コンクリート','epAutoFoundation','foundation_m3','㎥')+f('土間コンクリート','epAutoSlab','slab_m3','㎥')+f('外構撤去','epAutoExterior','exterior_m2','㎡')+f('庭石撤去','epAutoGarden','garden_m3','㎥')+f('植栽撤去','epAutoPlants','plants_m3','㎥')+f('CB撤去','epAutoCB','cb_m2','㎡')+f('内部残置物撤去','epAutoResidual','residual_m3','㎥')+'</div></details><details><summary>内部改修・内部解体・スケルトン</summary><div class="ep-auto-grid">'+f('床・天井面積','epAutoInternal','internal_m2','㎡')+f('壁面積','epAutoWall','internal_wall_m2','㎡')+'</div></details><details open><summary>D 整地・土嚢</summary><div class="ep-auto-grid">'+f('解体跡整地','epAutoGrading','grading_m2','㎡')+f('土嚢積み','epAutoSandbag','sandbag_m','m')+'</div></details><details><summary>諸経費・法定福利費の自動計算率</summary><p class="note">直接工事費に対する率です。率は今回の見積で変更できます。</p><div class="ep-auto-grid">'+f('諸経費率','epAutoOverhead','overhead_rate','%')+f('法定福利費率','epAutoWelfare','welfare_rate','%')+'</div></details><button id="epAutoApply" type="button" class="btn lime pb-wide">この数量で明細を自動作成</button><p class="note">産廃数量は、御社の300㎡標準積算表を入力面積に比例させて計算します。現場条件に合わせて明細で直せます。</p></details>';
 }
 function bindAutoBuilder(){
  q('#epAutoKind').value=A.normalize(autoInput()).kind;
  q('#epAutoM2').oninput=()=>{const n=Number(q('#epAutoM2').value);q('#epAutoTsubo').value=n>0?A.round(n/A.TSUBO,2):'';};
  q('#epAutoTsubo').oninput=()=>{const n=Number(q('#epAutoTsubo').value);q('#epAutoM2').value=n>0?A.round(n*A.TSUBO,2):'';};
  q('#epAutoApply').onclick=()=>{gather();const input=Object.fromEntries([...q('.ep-auto').querySelectorAll('[data-auto-key]')].map(el=>[el.dataset.autoKey,el.value]));const existing=plan.groups.some(g=>(g.quote_lines||[]).some(r=>!r.auto_percent));if(existing&&!plan.groups.some(g=>g.auto_input)&&!confirm('現在の明細を、自動積算の明細へ入れ替えますか？'))return;const result=A.build(input);plan.groups=A.percentRows(result.groups,result.input);dirty=true;renderSimpleGroups(0);q('.ep-manual').open=true;updateTotals();note('数量から明細を作成しました。単価未登録の項目と産廃数量を確認してください。');q('#epGroups').scrollIntoView({block:'start',behavior:'smooth'});};
 }
 function setSimpleStep(step,scroll=true){
  if(plan?.entry_mode!=='quote'||!q('#epStep1'))return;simpleStep=step;
  for(const n of [1,2])q('#epStep'+n).hidden=n!==step;q('#epInputFooter').hidden=step===3;
  q('#epEditor').querySelectorAll('[data-ep-step]').forEach(el=>{const active=Number(el.dataset.epStep)===step;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
  if(scroll){const target=q(step===3?'#estimateDocumentHost':'#epStep'+step),heading=target?.querySelector('h3');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}target?.scrollIntoView({block:'start',behavior:'smooth'});}
 }
 function focusInput(selector){const el=q(selector);if(!el)return;for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;el.focus({preventScroll:true});el.scrollIntoView({block:'center',behavior:'smooth'});}
 function inputProblem(message,selector,step=2){setSimpleStep(step,false);note(message,true);q(selector)?.setAttribute('aria-invalid','true');focusInput(selector);return false;}
 function checkJobInfo(){gather();if(!plan.site_name)return inputProblem('工事名を入力してください。','#epJobName',1);if(!plan.customer_name)return inputProblem('見積先の会社名・お名前を入力してください。','#epCustomer',1);return true;}
 const quoteChoices=name=>/仮設/.test(name)?[['養生足場','㎡'],['防音シート張り','㎡'],['散水費','式'],['養生メッシュシート張り','㎡'],['アスベスト含有調査','検体'],['アスベスト含有スレート撤去・処分','㎡']]:/産業廃棄物|処分/.test(name)?[['木くず処分','m³'],['コンクリート処分','m³'],['混合廃棄物処分','m³'],['産業廃棄物運搬費','m³']]:/解体/.test(name)?[['内部解体','㎡'],['上屋解体','㎡'],['基礎コンクリート解体','m³'],['土間コンクリート解体','m³'],['外構撤去','㎡'],['庭石撤去','m³'],['植栽撤去','m³'],['CB撤去','㎡'],['内部残置物撤去','m³']]:/回送|諸経費|福利|値引/.test(name)?[['重機回送費','式'],['諸経費','式'],['値引き','式'],['法定福利費','式']]:/その他/.test(name)?[['解体跡整地','㎡'],['土嚢積み','m']]:[];
 function choicePicker(g,i){const items=quoteChoices(g.name);return items.length?'<label for="epChoice'+i+'">よく使う品名から選ぶ</label><select id="epChoice'+i+'" data-quote-choice="'+i+'"><option value="">品名を選ぶと明細に追加します</option>'+items.map(([label],j)=>'<option value="'+j+'">'+esc(label)+'</option>').join('')+'</select>':'';}
 function checkQuoteItems(){
  let count=0;
  for(const [i,g] of plan.groups.entries()){
   for(const [j,r] of g.quote_lines.entries()){
    if(r.excluded)continue;count++;const where='「'+(r.label||g.name||'明細')+'」';
    if(!g.name.trim())return inputProblem('工事項目名を入力してください。','#epWork'+i);
    if(!String(r.label||'').trim())return inputProblem('品名を入力してください。','#epLabel'+i+'_'+j);
    if(!String(r.quantity||'').trim())return inputProblem(where+'の数量を入力してください。','#epQty'+i+'_'+j);
    if(!String(r.unit||'').trim())return inputProblem(where+'の単位を入力してください。','#epUnit'+i+'_'+j);
    let row;try{row=C.quoteLine(r);}catch(e){const selector=q('#epQty'+i+'_'+j).checkValidity()?'#epQuotePrice'+i+'_'+j:'#epQty'+i+'_'+j;return inputProblem(where+'：'+e.message,selector);}
    if(!row.complete)return inputProblem(where+'の'+(r.amount_mode?'金額':'単価')+'を入力してください。','#epQuotePrice'+i+'_'+j);
   }
  }
  if(!count)return inputProblem('見積に入れる品名を1つ追加してください。',plan.groups.length?'[data-add-quote="0"]':'#epAddGroup');
  try{C.calculate(plan);}catch(e){note(e.message,true);return false;}return true;
 }
 async function saveAndReview(){
  if(busy||!identity()||window.ToyaProjectBusiness?.isBusy()||!checkJobInfo()||!checkQuoteItems())return;
  const mine=owner;note('保存して見積書を準備しています…');
  await action(async()=>{
   if(dirty||!plan.id||!plan.updated_at){if(!await persistPlan(copy(gather()),mine))return;}
   const previous=quotes.filter(d=>d.status!=='void'&&d.estimate_plan_id===plan.id&&d.estimate_snapshot?.updated_at===plan.updated_at).sort((a,b)=>b.updated_at.localeCompare(a.updated_at))[0];
   if(previous){await window.ToyaProjectBusiness?.openEstimate(copy(previous));note('保存済みの見積書を開きました。内容を確認してください。');return;}
   if(!quoteRequest||quoteRequest.plan!==plan.id||quoteRequest.version!==plan.updated_at)quoteRequest={plan:plan.id,version:plan.updated_at,id:crypto.randomUUID()};
   const r=await cloudClient.rpc('toya_create_estimate_document',{p_plan_id:plan.id,p_expected_updated_at:plan.updated_at,p_document_id:quoteRequest.id});if(r.error)throw r.error;if(identity()!==mine)return;
   const row=one(r.data);if(!row?.id)throw new Error('見積書の保存結果を確認できません。');quotes=[...quotes.filter(d=>d.id!==row.id),row];renderLists();
   await window.ToyaProjectBusiness?.openEstimate(row);note('見積書を保存しました。内容を確認して、印刷・PDFへ進んでください。');
  });
 }
 async function persistPlan(data,mine){
  plan.id=plan.id||crypto.randomUUID();const r=await cloudClient.rpc('toya_save_estimate_plan',{p_id:plan.id,p_expected_updated_at:plan.updated_at||null,p_plan:data});if(r.error)throw r.error;if(identity()!==mine)return false;
  const row=one(r.data);if(!row?.id)throw new Error('保存結果を確認できません。');plan=copy(row);plans=[...plans.filter(p=>p.id!==row.id),row];dirty=false;quoteRequest=null;renderLists();return true;
 }
 function simpleRow(r,i,j){
  const fixed=r.amount_mode===true||(r.quote_amount!==null&&r.quote_amount!==undefined&&r.quote_amount!==''),discount=r.discount_input===true,price=fixed?r.quote_amount:r.quote_price,shown=discount&&price!==null&&price!==undefined?String(price).replace(/^-/,''):price;
  return '<div class="ep-quote-row" data-quote-row="'+j+'"><div class="ep-quote-head">'+field('品名','epLabel'+i+'_'+j,r.label,'text','data-quote-key="label" maxlength="200"')+'<button type="button" class="btn light ep-small" data-exclude-quote="'+i+','+j+'">今回使わない</button></div><div class="ep-quote-grid">'+field('見積数量','epQty'+i+'_'+j,r.quantity,'number','data-quote-key="quantity" min="0.001" step="0.001" inputmode="decimal"')+field('単位','epUnit'+i+'_'+j,r.unit,'text','data-quote-key="unit" maxlength="20" list="epQuoteUnits"')+field(discount?'値引き額（円・税別）':fixed?'見積金額（直接入力）':'見積単価（円・税別）','epQuotePrice'+i+'_'+j,shown,'number','data-quote-key="'+(fixed?'quote_amount':'quote_price')+'" step="'+(fixed?'1':'0.01')+'" inputmode="decimal"')+'<div class="ep-quote-amount"><small>見積金額</small><strong data-quote-amount="'+i+','+j+'"></strong></div></div><details class="ep-row-options"><summary>備考・金額の入力方法</summary>'+field('備考','epSpec'+i+'_'+j,r.spec,'text','data-quote-key="spec" maxlength="500"')+'<label class="ep-inline"><input type="checkbox" data-quote-fixed="'+i+','+j+'" '+(fixed?'checked':'')+'>金額を直接入力する</label><p class="note">値引き・買取はマイナスで入力できます。</p><button type="button" class="btn danger ep-small" data-delete-quote="'+i+','+j+'">この行を削除</button></details></div>';
 }
 function simpleCostRow(r,i,j){return '<div class="pb-line" data-cost-row="'+j+'"><label>費目</label><select data-key="category">'+Object.entries(C.categories).map(([v,t])=>'<option value="'+v+'" '+(v===r.category?'selected':'')+'>'+esc(t)+'</option>').join('')+'</select>'+field('原価の品名','epCostLabel'+i+'_'+j,r.label,'text','data-key="label" maxlength="200"')+'<div class="pb-grid">'+field('人数・台数','epCostQty'+i+'_'+j,r.quantity,'number','data-key="quantity" min="0.001" step="0.001"')+field('日数・時間・回数','epCostTimes'+i+'_'+j,r.multiplier,'number','data-key="multiplier" min="0.001" step="0.001"')+field('単位','epCostUnit'+i+'_'+j,r.unit,'text','data-key="unit" maxlength="20"')+field('原価単価','epCostPrice'+i+'_'+j,r.unit_price,'number','data-key="unit_price" min="0" step="0.01"')+'</div><button type="button" class="btn danger ep-small" data-delete-cost="'+i+','+j+'">原価内訳を削除</button></div>';}
 function renderSimpleGroups(openIndex){
  const host=q('#epGroups'),opened=new Set([...host.querySelectorAll('[data-ep-group][open]')].map(el=>Number(el.dataset.epGroup))),first=!host.children.length;
  host.innerHTML='<datalist id="epQuoteUnits">'+['式','㎡','m²','m³','m','t','kg','台','本','検体'].map(u=>'<option value="'+u+'">').join('')+'</datalist>'+plan.groups.map((g,i)=>'<details class="ep-group" data-ep-group="'+i+'" '+(i===openIndex||opened.has(i)||(first&&i===0)?'open':'')+'><summary><span data-group-title="'+i+'">'+esc(g.name||'工事項目')+'</span><strong data-group-cost="'+i+'"></strong></summary><details class="ep-group-name"><summary>工事項目名を変更</summary>'+field('工事項目名','epWork'+i,g.name,'text','data-group-name="'+i+'" maxlength="200"')+'</details>'+choicePicker(g,i)+g.quote_lines.map((r,j)=>r.excluded?'':simpleRow(r,i,j)).join('')+'<button type="button" class="btn light pb-wide" data-add-quote="'+i+'">＋ 品名を自由に入力</button>'+(g.quote_lines.some(r=>r.excluded)?'<details class="ep-excluded"><summary>今回使わない項目（'+g.quote_lines.filter(r=>r.excluded).length+'件）</summary>'+g.quote_lines.map((r,j)=>!r.excluded?'':'<div class="ep-excluded-row"><span>'+esc(r.label)+'<small>'+esc(r.quantity||'数量空欄')+' '+esc(r.unit)+'</small></span><button type="button" class="btn light ep-small" data-include-quote="'+i+','+j+'">追加</button></div>').join('')+'</details>':'')+'<details class="ep-costs"><summary>原価・人工・重機を計算（任意）</summary><p class="note">原価を入力すると見込利益を確認できます。見積単価には影響しません。</p><label for="epCostCategory'+i+'">原価の種類</label><select id="epCostCategory'+i+'" data-cost-category="'+i+'"><option value="">種類を選択</option>'+Object.entries(C.categories).map(([v,t])=>'<option value="'+v+'">'+esc(t)+'</option>').join('')+'</select><label for="epRate'+i+'">登録済みの原価単価</label><select id="epRate'+i+'" data-simple-rate="'+i+'"><option value="">先に種類を選択</option></select><button type="button" class="btn light pb-wide" data-add-simple-rate="'+i+'">この原価を追加</button><div>'+g.lines.map((r,j)=>simpleCostRow(r,i,j)).join('')+'</div><button type="button" class="btn light pb-wide" data-add-cost="'+i+'">＋ 原価を手入力</button><p data-cost-total="'+i+'" class="note"></p></details><button type="button" class="btn danger ep-small" data-delete-group="'+i+'">工事項目を削除</button></details>').join('');
  const change=(fn,index)=>{gather();fn();dirty=true;renderSimpleGroups(index);updateTotals();};
  host.querySelectorAll('[data-add-quote]').forEach(b=>b.onclick=()=>{if(plan.groups.reduce((n,g)=>n+g.quote_lines.length,0)>=300)return note('明細は300行までです。',true);const i=Number(b.dataset.addQuote);change(()=>plan.groups[i].quote_lines.push(C.blankQuoteLine()),i);q('#epLabel'+i+'_'+(plan.groups[i].quote_lines.length-1)).focus();});
  host.querySelectorAll('[data-quote-choice]').forEach(sel=>{sel.oninput=e=>e.stopPropagation();sel.onchange=e=>{e.stopPropagation();if(sel.value==='')return;const i=Number(sel.dataset.quoteChoice),item=quoteChoices(plan.groups[i].name)[Number(sel.value)];if(!item)return;if(plan.groups.reduce((n,g)=>n+g.quote_lines.length,0)>=300){sel.value='';return note('明細は300行までです。',true);}change(()=>plan.groups[i].quote_lines.push({...C.blankQuoteLine(),label:item[0],unit:item[1],quantity:item[1]==='式'?'1':'',...(item[0]==='値引き'?{discount_input:true}:{})}),i);const j=plan.groups[i].quote_lines.length-1;focusInput('#'+(item[1]==='式'?'epQuotePrice':'epQty')+i+'_'+j);};});
  for(const [key,excluded] of [['includeQuote',false],['excludeQuote',true]])host.querySelectorAll('[data-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+']').forEach(b=>b.onclick=()=>{const [i,j]=b.dataset[key].split(',').map(Number);change(()=>{plan.groups[i].quote_lines[j].excluded=excluded;},i);});
  host.querySelectorAll('[data-delete-quote]').forEach(b=>b.onclick=()=>{const [i,j]=b.dataset.deleteQuote.split(',').map(Number);change(()=>plan.groups[i].quote_lines.splice(j,1),i);});
  host.querySelectorAll('[data-quote-fixed]').forEach(b=>b.onchange=e=>{e.stopPropagation();const [i,j]=b.dataset.quoteFixed.split(',').map(Number),fixed=b.checked;change(()=>{const r=plan.groups[i].quote_lines[j];const amount=C.quoteLine(r).amount;r.amount_mode=fixed;r.quote_amount=fixed?(amount??''):null;},i);});
  host.querySelectorAll('[data-cost-category]').forEach(s=>{s.oninput=e=>e.stopPropagation();s.onchange=e=>{e.stopPropagation();const i=s.dataset.costCategory;q('#epRate'+i).innerHTML='<option value="">原価単価を選択</option>'+rates.map((r,n)=>r.category===s.value?'<option value="'+n+'">'+esc(r.label)+' / '+yen(r.unit_price)+'・'+esc(r.unit)+'</option>':'').join('');};});
  host.querySelectorAll('[data-simple-rate]').forEach(s=>{s.oninput=e=>e.stopPropagation();s.onchange=e=>e.stopPropagation();});
  host.querySelectorAll('[data-add-simple-rate]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.addSimpleRate),v=q('#epRate'+i).value,r=rates[Number(v)];if(v===''||!r)return;change(()=>plan.groups[i].lines.push({...copy(r),quantity:'1',multiplier:'1'}),i);q('[data-ep-group="'+i+'"] .ep-costs').open=true;});
  host.querySelectorAll('[data-add-cost]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.addCost);change(()=>plan.groups[i].lines.push(C.blankLine()),i);q('[data-ep-group="'+i+'"] .ep-costs').open=true;});
  host.querySelectorAll('[data-delete-cost]').forEach(b=>b.onclick=()=>{const [i,j]=b.dataset.deleteCost.split(',').map(Number);change(()=>plan.groups[i].lines.splice(j,1),i);q('[data-ep-group="'+i+'"] .ep-costs').open=true;});
  host.querySelectorAll('[data-delete-group]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.deleteGroup);if(confirm((plan.groups[i].name||'この工事項目')+'を削除しますか？'))change(()=>plan.groups.splice(i,1));});
 }
 function gatherSimpleGroups(){
  return plan.groups.map((g,i)=>{const el=q('[data-ep-group="'+i+'"]');return {...g,name:q('[data-group-name]',el).value,quote_lines:g.quote_lines.map((r,j)=>{
   const row=q('[data-quote-row="'+j+'"]',el);if(!row)return r;
   const next={...r,...Object.fromEntries([...row.querySelectorAll('[data-quote-key]')].map(input=>[input.dataset.quoteKey,input.value]))};
   if(r.discount_input===true){const input=row.querySelector('[data-quote-key="quote_price"],[data-quote-key="quote_amount"]');if(input&&input.value!=='')next[input.dataset.quoteKey]='-'+input.value.replace(/^-/,'');}
   return next;
  }),lines:g.lines.map((r,j)=>{const row=q('[data-cost-row="'+j+'"]',el);return {...r,...Object.fromEntries([...row.querySelectorAll('[data-key]')].map(input=>[input.dataset.key,input.value]))};})};});
 }
 function updateSimpleTotals(t){
  q('#epTotals').innerHTML='<div class="ep-selling"><p>小計（税別） <strong>'+yen(t.known_price)+'</strong></p><p>消費税 '+(t.tax===null?'未計算':yen(t.tax))+'</p><p>見積合計（税込） <strong>'+(t.total===null?'未入力あり':yen(t.total))+'</strong></p></div>'+(t.pending?'<p class="ep-pending">使用する項目の未入力 '+t.pending+'か所。途中でも保存できます。</p>':'')+'<details><summary>予定原価・見込利益</summary><p>予定原価 '+(t.total_cost===null?'未入力あり（入力済み '+yen(t.known_cost)+'）':yen(t.total_cost))+'</p><p>見込利益 '+(t.profit===null?'原価を入力すると表示します':yen(t.profit))+'</p></details>';
  t.groups.forEach((g,i)=>{q('[data-group-title="'+i+'"]').textContent=g.name||'工事項目';q('[data-group-cost="'+i+'"]').textContent=g.active?yen(g.price)+(g.missing?'（未入力あり）':''):'未使用';g.rows.forEach((r,j)=>{const el=q('[data-quote-amount="'+i+','+j+'"]');if(el)el.textContent=r.amount===null?'未入力':yen(r.amount);});q('[data-cost-total="'+i+'"]').textContent='入力済み原価 '+yen(g.cost)+(g.cost_complete?'':' ／ 原価未入力あり');});
 }
 function renderGroups(){
  const host=q('#epGroups');if(!host)return;
  host.innerHTML=plan.groups.map((g,i)=>'<details class="ep-group" data-ep-group="'+i+'" open><summary><span data-group-title="'+i+'">'+esc(g.name||'工事項目 '+(i+1))+'</span><strong data-group-cost="'+i+'"></strong></summary>'+field('工事項目（例：内装解体・運搬処分）','epWork'+i,g.name,'text','data-group-name="'+i+'" maxlength="200"')+'<div class="ep-rate"><label for="epRate'+i+'">登録単価から追加</label><select id="epRate'+i+'" data-rate-picker="'+i+'">'+rateOptions()+'</select><button type="button" class="btn light pb-wide" data-add-rate="'+i+'">選んだ費用を追加</button></div>'+g.lines.map((r,j)=>'<div class="pb-line" data-ep-row="'+j+'"><div class="pb-line-heading"><b>内訳 '+(j+1)+'</b><button type="button" class="btn danger" data-delete-line="'+i+','+j+'">削除</button></div><label for="epCategory'+i+'_'+j+'">費目</label><select id="epCategory'+i+'_'+j+'" data-key="category">'+Object.entries(C.categories).map(([v,t])=>'<option value="'+v+'" '+(v===r.category?'selected':'')+'>'+t+'</option>').join('')+'</select>'+field('品名・内容','epLabel'+i+'_'+j,r.label,'text','data-key="label" maxlength="200"')+'<div class="pb-grid">'+field('数量（人数・台数など）','epQty'+i+'_'+j,r.quantity,'number','data-key="quantity" min="0.001" max="1000000" step="0.001" inputmode="decimal"')+field('日数・時間・回数','epMultiplier'+i+'_'+j,r.multiplier,'number','data-key="multiplier" min="0.001" max="1000000" step="0.001" inputmode="decimal"')+'</div><div class="pb-grid">'+field('単位（人日・台時間・m²など）','epUnit'+i+'_'+j,r.unit,'text','data-key="unit" maxlength="20"')+field('原価単価（円・税別）','epPrice'+i+'_'+j,r.unit_price,'number','data-key="unit_price" min="0" step="0.01" inputmode="decimal"')+'</div><div class="pb-line-amount" data-ep-amount="'+i+','+j+'"></div></div>').join('')+'<div class="pb-actions"><button type="button" class="btn light" data-add-line="'+i+'">＋ 内訳を追加</button><button type="button" class="btn danger" data-delete-group="'+i+'">工事項目を削除</button></div></details>').join('');
  host.querySelectorAll('[data-rate-picker]').forEach(p=>{p.oninput=e=>e.stopPropagation();p.onchange=e=>e.stopPropagation();});
  const canAdd=()=>plan.groups.reduce((n,g)=>n+g.lines.length,0)<300;
  host.querySelectorAll('[data-add-line]').forEach(b=>b.onclick=()=>{gather();if(!canAdd())return note('内訳は合計300行までです。',true);plan.groups[Number(b.dataset.addLine)].lines.push(C.blankLine());dirty=true;renderGroups();updateTotals();});
  host.querySelectorAll('[data-add-rate]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.addRate),selectedRate=q('#epRate'+i).value,r=rates[Number(selectedRate)];if(selectedRate===''||!r)return;gather();const g=plan.groups[i],empty=g.lines.findIndex(x=>!x.label.trim()&&String(x.unit_price??'').trim()==='');if(empty<0&&!canAdd())return note('内訳は合計300行までです。',true);const line={...copy(r),quantity:'1',multiplier:'1'};if(empty>=0)g.lines[empty]=line;else g.lines.push(line);dirty=true;renderGroups();updateTotals();});
  host.querySelectorAll('[data-delete-line]').forEach(b=>b.onclick=()=>{gather();const [i,j]=b.dataset.deleteLine.split(',').map(Number);plan.groups[i].lines.splice(j,1);dirty=true;renderGroups();updateTotals();});
  host.querySelectorAll('[data-delete-group]').forEach(b=>b.onclick=()=>{gather();const i=Number(b.dataset.deleteGroup);if(!confirm((plan.groups[i].name||'この工事項目')+'と、その内訳を積算表から削除しますか？'))return;plan.groups.splice(i,1);dirty=true;renderGroups();updateTotals();});
 }
 function gather(){
  if(!plan||!q('#epTitle'))return plan;
  plan.site_name=q('#epJobName').value.trim();plan.site_address=q('#epJobAddress').value.trim();plan.title=q('#epTitle').value.trim()||(plan.site_name?(plan.site_name+' 見積').slice(0,200):'');plan.customer_name=q('#epCustomer').value.trim();plan.customer_address=q('#epAddress').value.trim();plan.quote_notes=q('#epQuoteNotes').value;plan.internal_notes=q('#epInternalNotes').value;
  if(plan.entry_mode==='quote'){plan.tax_rate=Number(q('#epTax').value);plan.groups=gatherSimpleGroups();return plan;}
  plan.overhead_percent=q('#epOverhead').value===''?null:q('#epOverhead').value;plan.markup_percent=q('#epMarkup').value===''?null:q('#epMarkup').value;plan.quote_amount_override=q('#epOverride').value===''?null:q('#epOverride').value;plan.tax_rate=Number(q('#epTax').value);
  plan.groups=[...q('#epGroups').querySelectorAll('[data-ep-group]')].map((el,i)=>({name:q('[data-group-name]',el).value,lines:[...el.querySelectorAll('[data-ep-row]')].map((row,j)=>({...plan.groups[i].lines[j],...Object.fromEntries([...row.querySelectorAll('[data-key]')].map(input=>[input.dataset.key,input.value]))}))}));
  return plan;
 }
 function updateTotals(setStatus=true){
  if(!plan)return;let complete=false;
  try{gather();if(plan.entry_mode==='quote'){const a=plan.groups.find(g=>g.auto_input)?.auto_input;if(a){A.percentRows(plan.groups,a);plan.groups.forEach((g,i)=>g.quote_lines.forEach((r,j)=>{if(!r.auto_percent)return;const input=q('[data-ep-group="'+i+'"] [data-quote-row="'+j+'"] [data-quote-key="quote_amount"]');if(input)input.value=r.quote_amount;}));}}const t=C.calculate(plan);complete=t.complete;
   if(plan.entry_mode==='quote')updateSimpleTotals(t);else {
   q('#epTotals').innerHTML='<div class="pb-metrics"><div><small>直接工事費（入力済み）</small><b>'+yen(t.known_cost)+'</b></div><div><small>諸経費</small><b>'+(t.overhead===null?'未確定':yen(t.overhead))+'</b></div><div><small>原価合計（税別）</small><b>'+(t.total_cost===null?'未確定':yen(t.total_cost))+'</b></div></div>'+(complete?'<div class="ep-selling"><p>見積額（税別） <strong>'+yen(t.price)+'</strong></p><p>見込利益 <strong class="'+(t.profit<0?'pb-error':'')+'">'+yen(t.profit)+'</strong> ／ 利益率 '+(t.price>0?(t.profit/t.price*100).toFixed(2)+'%':'—')+'</p><p>消費税 '+yen(t.tax)+' ／ 税込 '+yen(t.total)+'</p></div>':'<p class="ep-pending">積算途中：未入力 '+t.pending+'か所。空欄を埋めると見積額を計算できます。途中のまま保存もできます。</p>');
   t.groups.forEach((g,i)=>{q('[data-group-title="'+i+'"]').textContent=g.name||'工事項目 '+(i+1);q('[data-group-cost="'+i+'"]').textContent=yen(g.cost)+(g.missing?'（未入力あり）':'');plan.groups[i].lines.forEach((r,j)=>{const a=C.line(r);q('[data-ep-amount="'+i+','+j+'"]').textContent=a.complete?'原価 '+yen(a.amount):'未入力';});});
   }
  }catch(e){q('#epTotals').innerHTML='<p class="pb-error">'+esc(e.message)+'</p>';}
  q('#epCreateQuote').disabled=plan.entry_mode==='quote'?busy:busy||dirty||!plan.id||!plan.updated_at||!complete;q('#epCopy').disabled=busy||dirty||!plan.id||!plan.updated_at;
  if(setStatus)q('#epFormStatus').textContent=dirty?'未保存の変更があります。':plan.id?'積算表を保存済みです。':'';
 }
 async function action(fn){
  if(busy||!identity()||window.ToyaProjectBusiness?.isBusy())return;busy=true;const mine=owner;
  q('#estimatePlanCard')?.querySelectorAll('button,input,select,textarea').forEach(el=>{el.dataset.epWasDisabled=String(el.disabled);el.disabled=true;});
  try{await fn();}catch(e){if(identity()===mine)note('処理できませんでした：'+String(e.message||e),true);}finally{busy=false;if(identity()===mine){q('#estimatePlanCard')?.querySelectorAll('[data-ep-was-disabled]').forEach(el=>{el.disabled=el.dataset.epWasDisabled==='true';delete el.dataset.epWasDisabled;});if(plan)updateTotals(false);}}
 }
 async function save(){
  let data;try{data=copy(gather());C.calculate(data);if(!data.site_id&&!data.site_name)throw new Error('新しい工事名を入力してください。');if(!data.title)throw new Error('積算表の名称を入力してください。');}catch(e){return note(e.message,true);}
  const mine=owner;await action(async()=>{if(!await persistPlan(data,mine))return;renderPlan();note(plan.entry_mode==='quote'?'途中で保存しました。「保存した見積を開く」から続けられます。':'積算表を保存しました。');});
 }
 async function createQuote(){
  if(!plan?.id||dirty)return note('先に積算表を保存してください。',true);
  if(!C.calculate(plan).complete)return note('未入力の項目を確認してください。',true);
  const mine=owner,p=copy(plan);if(!quoteRequest||quoteRequest.plan!==p.id||quoteRequest.version!==p.updated_at)quoteRequest={plan:p.id,version:p.updated_at,id:crypto.randomUUID()};const requestId=quoteRequest.id;
  await action(async()=>{const r=await cloudClient.rpc('toya_create_estimate_document',{p_plan_id:p.id,p_expected_updated_at:p.updated_at,p_document_id:requestId});if(r.error)throw r.error;if(identity()!==mine)return;const row=one(r.data);if(!row?.id)throw new Error('保存結果を確認できません。');quotes=[...quotes.filter(d=>d.id!==row.id),row];renderLists();q('#epQuotes').open=true;await window.ToyaProjectBusiness?.openEstimate(row);note('見積書の下書きを作りました。宛先・発行者・期限を確認し、プレビューから確定できます。');});
 }
 function duplicate(){
  if(!plan?.id||dirty)return note('先に積算表を保存してください。',true);
  const value=q('#epCopySite').value,target=value?sites.find(s=>s.id===value):null;if((value&&!target)||!closeQuote())return;
  plan=C.duplicate(plan,target);simpleStep=1;selected=target?.id||'';q('#epSite').value=selected;dirty=true;quoteRequest=null;renderLists();renderPlan();note((target?.name||'新しい工事')+'用の積算表を複製しました。工事名・住所と内容を確認して保存してください。');
 }
 function print(){
  let html;try{html=C.printHTML(gather(),plan.site_name||sites.find(s=>s.id===plan.site_id)?.name||'');}catch(e){return note(e.message,true);}
  q('#epPreview')?.remove();const dialog=document.createElement('dialog');dialog.id='epPreview';dialog.innerHTML='<div class="pb-preview-toolbar"><b>積算表（社内用）</b><div><button class="btn dark" id="epPrintNow" type="button">印刷・PDF保存</button><button class="btn light" id="epClosePrint" type="button">閉じる</button></div></div><p class="note">この積算表には原価・社内メモを含みます。提出用の見積書は「この積算から見積書を作る」で作成できます。</p><iframe title="積算表の印刷プレビュー" sandbox="allow-same-origin allow-modals"></iframe>';document.body.append(dialog);const frame=dialog.querySelector('iframe');frame.srcdoc=html;q('#epPrintNow').onclick=()=>{frame.contentWindow.focus();frame.contentWindow.print();};q('#epClosePrint').onclick=()=>{dialog.close();dialog.remove();};dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
 }
 document.addEventListener('toya-estimate-document-changed',e=>{if(!identity()||e.detail?.company_id!==cloudProfile.company_id)return;quotes=[...quotes.filter(d=>d.id!==e.detail.id),copy(e.detail)];renderLists();});
 window.ToyaEstimatePlanUI={isBusy:()=>busy,getSites:()=>copy(sites),
  useQuantity(draft){
   if(!identity()||busy||window.ToyaProjectBusiness?.isBusy()||(draft.site_id&&(!ready||!sites.some(s=>s.id===draft.site_id))))return false;
   const current=plan?.entry_mode==='quote'?copy(gather()):null,empty=current&&!current.groups.some(g=>g.quote_lines.length||g.lines.length);
   if((!empty&&!discard())||!closeQuote())return false;
   const next=copy(draft);if(current&&!current.id&&!draft.site_id){for(const k of ['site_name','site_address','customer_name','customer_address','title'])if(current[k])next[k]=current[k];}
   plan=next;selected=plan.site_id||'';q('#epSite').value=selected;dirty=true;quoteRequest=null;simpleStep=2;renderLists();renderPlan();note('品名・数量・単価をコピーしました。今回の内容に合わせて変更してください。');return true;
  },
  documentOpened(row){
   if(row.estimate_snapshot?.entry_mode!=='quote')return;
   if(!plan||plan.id!==row.estimate_plan_id||dirty){plan=copy(plans.find(p=>p.id===row.estimate_plan_id)||row.estimate_snapshot);dirty=false;simpleStep=3;renderPlan();}else setSimpleStep(3,false);
  },
  returnToInput(row){if(plan?.id===row.estimate_plan_id&&plan.entry_mode==='quote')setSimpleStep(2);},
  updateSites(next){if(!identity()||busy||!q('#epSite'))return;sites=copy(next).sort((a,b)=>(a.status==='active'?0:1)-(b.status==='active'?0:1)||a.name.localeCompare(b.name,'ja'));q('#epSite').innerHTML='<option value="">現場を選択</option>'+optionSites();q('#epSite').value=selected;updateNewButton();},
  useActual(draft){if(!identity()||busy||(draft.site_id&&(!ready||!sites.some(s=>s.id===draft.site_id)))||!discard()||!closeQuote())return false;plan=copy(draft);simpleStep=2;selected=plan.site_id||'';q('#epSite').value=selected;dirty=true;quoteRequest=null;renderLists();renderPlan();note('実績の費用を取り込みました。見積先・工事条件・諸経費・利益を確認して保存してください。');return true;}
 };
 const start=()=>{mount();const roleUI=window.applyCloudRoleUI;if(typeof roleUI==='function')window.applyCloudRoleUI=function(){const out=roleUI.apply(this,arguments);mount();return out;};document.addEventListener('click',e=>{if(e.target.closest('nav [data-page]'))mount();});setInterval(()=>{if(identity()!==owner)mount();},1000);};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,1100),{once:true});else setTimeout(start,1100);
})();
