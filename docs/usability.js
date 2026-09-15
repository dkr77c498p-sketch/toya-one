/* Navigation and readable guidance only. Existing forms and save handlers stay intact. */
(() => {
 'use strict';
 if(window.__toyaUsability)return;window.__toyaUsability=true;
 const q=s=>document.querySelector(s);
 const admin=()=>typeof cloudProfile!=='undefined'&&cloudProfile?.active===true&&cloudProfile.role==='admin';
 const signedIn=()=>typeof cloudProfile!=='undefined'&&cloudProfile?.active===true;
 const cardOf=selector=>q(selector)?.closest('.card');
 let serial=0,scheduled=false;
 function jump(target){
  if(!target)return;
  for(let p=target.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;
  target.scrollIntoView({block:'start',behavior:'smooth'});
  if(!target.hasAttribute('tabindex'))target.setAttribute('tabindex','-1');target.focus({preventScroll:true});
 }
 function openPage(id,target){
  if(id==='masterPage'&&!admin())return;
  q('nav [data-page="'+id+'"]')?.click();
  jump(target||q('#'+id));
 }
 function mount(){
  const home=q('#homePage');if(!home)return;
  const entry=document.createElement('div');entry.id='uxDailyHome';entry.className='card ux-entry';
  entry.innerHTML='<p class="ux-eyebrow">毎日の作業</p><h2>今日も、安全に。</h2><div class="ux-grid"><button type="button" class="btn lime" id="uxWrite">日報を書く<small>現場・作業・写真を入力</small></button><button type="button" class="btn dark" id="uxRecords">日報・写真を見る<small>確認・変更・写真台帳</small></button></div>';
  home.prepend(entry);q('#uxWrite').onclick=()=>openPage('reportPage');q('#uxRecords').onclick=()=>openPage('recordsPage');
  const report=q('#reportPage'),guide=q('#reportPage .tap-guide');
  guide.id='uxReportGuide';guide.classList.add('ux-guide');
  guide.innerHTML='<b>日報の入力</b><p>現場・作業者・作業内容を入力し、使った車両や写真を追加します。</p><div class="ux-jumps"><button type="button" data-ux-report="date">1 基本情報</button><button type="button" data-ux-report="companyWorkerChoices">2 人員・作業</button><button type="button" data-ux-report="vehicleChoices">3 車両・機材</button><button type="button" data-ux-report="items">4 廃材・経費</button><button type="button" data-ux-report="photoSection">5 写真・メモ</button></div><label for="uxReportSections">入力項目へ移動</label><select id="uxReportSections"><option value="">項目を選ぶ</option></select>';
  guide.querySelectorAll('[data-ux-report]').forEach(b=>b.onclick=()=>jump(cardOf('#'+b.dataset.uxReport)));
  q('#uxReportSections').onchange=e=>{if(!e.target.value)return;const node=q('#'+e.target.value);if(node)jump(node);e.target.value='';};
  const back=document.createElement('button');back.id='uxReportTop';back.className='btn light wide';back.type='button';back.textContent='↑ 入力項目を選ぶ';back.onclick=()=>jump(guide);q('#actions').prepend(back);
  const status=document.createElement('p');status.id='uxSaveStatus';status.className='wide';status.hidden=true;status.setAttribute('role','status');status.setAttribute('aria-live','polite');back.after(status);
  const mirror=()=>{const text=q('#status')?.textContent?.trim()||'';status.hidden=!text;status.textContent=text;};
  if(q('#status'))new MutationObserver(mirror).observe(q('#status'),{childList:true,subtree:true,characterData:true});mirror();
  const records=q('#recordsPage'),saved=cardOf('#records');if(saved)records.prepend(saved);
  const recordGuide=document.createElement('div');recordGuide.id='uxRecordGuide';recordGuide.className='card';recordGuide.innerHTML='<h2>日報・写真を探す</h2><div class="ux-grid"><button type="button" class="btn lime" id="uxFindReports">日報を探す・変更</button><button type="button" class="btn light" id="uxFindPhotos">現場の写真台帳</button></div>';
  records.prepend(recordGuide);q('#uxFindReports').onclick=()=>jump(saved);q('#uxFindPhotos').onclick=()=>jump(cardOf('#ledgerSite'));
  for(const [id,label] of [['recordSearch','現場名・記入者・作業内容で日報を検索'],['recordSiteFilter','現場で絞り込む'],['recordWriterFilter','記入者で絞り込む']])q('#'+id)?.setAttribute('aria-label',label);
  const master=document.createElement('div');master.id='uxMasterGuide';master.className='card';master.hidden=true;
  master.innerHTML='<h2>何を登録・変更しますか？</h2><p class="note">現場名、社員、機材の登録や単価設定はこちらから。</p><div class="ux-grid"><button type="button" class="btn light" data-ux-master="siteMaster">現場名の追加・変更</button><button type="button" class="btn light" data-ux-master="companyMembers">社員のログイン</button><button type="button" class="btn light" data-ux-master="companyRegistry">車両・重機・社員名簿</button><button type="button" class="btn light" data-ux-master="lcCard">人件費・単価設定</button></div><label for="uxMasterSections">すべての設定項目</label><select id="uxMasterSections"><option value="">設定したい項目を選ぶ</option></select><p id="uxMasterStatus" class="note" role="status"></p>';
  q('#masterPage').prepend(master);
  master.querySelectorAll('[data-ux-master]').forEach(b=>b.onclick=()=>{if(!admin())return;const target=cardOf('#'+b.dataset.uxMaster);if(target&&!target.hidden&&target.style.display!=='none'){q('#uxMasterStatus').textContent='';jump(target);}else q('#uxMasterStatus').textContent='設定を読み込み中です。少し待ってからもう一度押してください。';});
  q('#uxMasterSections').onfocus=()=>{if(admin())directory(q('#masterPage'),q('#uxMasterSections'),['uxMasterGuide']);};
  q('#uxMasterSections').onchange=e=>{if(!e.target.value)return;if(admin()){const target=q('#'+e.target.value);if(target&&!target.hidden&&target.style.display!=='none')jump(target);}e.target.value='';};
  const logged=q('#cloudLoggedIn'),controls=logged?.querySelectorAll('.cloud-row')[1];
  if(controls){const details=document.createElement('details');details.className='ux-account';const summary=document.createElement('summary');summary.textContent='同期・ログアウト';details.append(summary);controls.before(details);details.append(controls);}
  document.addEventListener('toya-role-changed',sync);
  document.addEventListener('click',e=>{if(e.target.closest('nav [data-page]')){window.scrollTo({top:0});sync();}});
  for(const node of [home,report,q('#masterPage')])new MutationObserver(()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;sync();});}).observe(node,{childList:true});
  if(window.ResizeObserver){new ResizeObserver(()=>{document.documentElement.style.setProperty('--ux-actions-height',q('#actions').getBoundingClientRect().height+'px');}).observe(q('#actions'));new ResizeObserver(()=>{document.documentElement.style.setProperty('--ux-header',(q('header').getBoundingClientRect().height+12)+'px');}).observe(q('header'));}
  sync();
 }
 function directory(page,select,exclude){
  if(!page||!select)return;
  const cards=[...page.children].filter(el=>el.classList.contains('card')&&!exclude.includes(el.id)&&!el.hidden&&el.style.display!=='none');
  const options=cards.map(card=>{if(!card.id)card.id='uxSection'+(++serial);const title=card.querySelector('h2')?.textContent?.trim();return title?{id:card.id,title}:null;}).filter(Boolean);
  const signature=JSON.stringify(options);if(select.dataset.signature===signature)return;select.dataset.signature=signature;
  const placeholder=select.options[0]?.textContent||'項目を選ぶ';select.replaceChildren(new Option(placeholder,''));for(const o of options)select.add(new Option(o.title,o.id));
 }
 function sync(){
  document.documentElement.classList.toggle('ux-signed-in',signedIn());
  const master=q('#uxMasterGuide');if(master)master.hidden=!admin();
  const home=q('#homePage'),entry=q('#uxDailyHome'),cloud=q('#cloudCard');
  if(home&&entry){const first=signedIn()?entry:cloud;if(first&&home.firstElementChild!==first)home.prepend(first);}
  const page=q('#masterPage');if(master&&page.firstElementChild!==master)page.prepend(master);
  directory(q('#reportPage'),q('#uxReportSections'),[]);
  if(admin())directory(page,q('#uxMasterSections'),['uxMasterGuide']);else if(q('#uxMasterSections'))q('#uxMasterSections').replaceChildren(new Option('設定したい項目を選ぶ',''));
  document.querySelectorAll('nav [data-page]').forEach(b=>b.setAttribute('aria-current',b.classList.contains('active')?'page':'false'));
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
