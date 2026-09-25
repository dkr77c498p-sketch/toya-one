"""Generate an immutable monthly selection UI; financial calculate() is unchanged."""
from pathlib import Path
import hashlib
ROOT=Path(__file__).resolve().parents[1]
DOCS=ROOT/'docs'
SOURCE='company-monthly-summary.period-r1.js'
TARGET='company-monthly-summary.autoselect-r1.js'
def blob(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
old=(DOCS/SOURCE).read_bytes()
assert blob(old)=='9b458353d1903f2ee4690a25311bdfb50142846e','Monthly source changed; review first'
s=old.decode()
def replace(a,b):
 global s
 assert s.count(a)==1,('Unexpected patch count',a[:100],s.count(a))
 s=s.replace(a,b,1)
replace("['profiles','site_project_profiles','site_id,contract_breakdown,updated_at',null,'site_id']", "['profiles','site_project_profiles','site_id,contract_breakdown,work_start,work_end,updated_at',null,'site_id']")
helper=r'''
 // Auto defaults are derived from this month only. Only explicit user overrides
 // are persisted, so a newly started/completed site can enter the selection.
 const selectionVersion=1;
 const normalizedName=x=>String(x??'').normalize('NFKC').replace(/[\s　]/g,'');
 const validDay=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
 const validMonth=x=>typeof x==='string'&&/^(20\d\d|21\d\d)-(0[1-9]|1[0-2])$/.test(x);
 function selectionStorageKey(company,m){
  if(typeof company!=='string'||!company||!validMonth(m))throw Error('会社・対象月を確認してください。');
  return 'toya-monthly-selection:v1:'+encodeURIComponent(company)+':'+m;
 }
 function parseSelection(raw,m){
  try{const v=JSON.parse(raw);if(!v||v.version!==selectionVersion||v.month!==m||!Array.isArray(v.overrides)||v.overrides.length>10000)return new Map();
   if(v.overrides.some(p=>!Array.isArray(p)||p.length!==2||typeof p[0]!=='string'||!p[0]||typeof p[1]!=='boolean'))return new Map();
   return new Map(v.overrides);
  }catch(e){return new Map();}
 }
 function selectionValue(m,overrides){return JSON.stringify({version:selectionVersion,month:m,overrides:[...overrides]});}
 function automaticSelection(data,m,company){
  if(!validMonth(m))throw Error('対象月を確認してください。');
  const b=S.periodBounds('month',m),within=d=>validDay(d)&&d>=b.start&&d<b.end;
  const sites=list(data.sites),byName=new Map(),active=new Set();
  // Do not use a duplicate name to attribute moved work to an arbitrary site.
  for(const site of sites){const name=normalizedName(site.name);if(!byName.has(name))byName.set(name,[]);byName.get(name).push(site.id);}
  const markName=name=>{const ids=byName.get(normalizedName(name));if(ids?.length===1)active.add(ids[0]);};
  for(const [key,,,dateField] of sources()){
   if(!dateField||key==='documents')continue;
   for(const r of list(data[key]).filter(r=>within(r[dateField]))){
    if(r.site_id)active.add(r.site_id);
    if(key==='reports'){
     for(const move of list(r.report_data?.siteMoves))markName(move?.site);
     for(const entry of list(r.report_data?.usageHours?.entries))for(const a of list(entry?.allocations)){
      if(Number(a.minutes)>0||Number(a.highway)>0)markName(a.site);
     }
    }
   }
  }
  // Revenue rows and issued invoices are month-specific records, not new revenue.
  for(const d of list(data.documents))if(within(d.document_date)&&['invoice','progress'].includes(d.kind)&&d.status==='issued')active.add(d.site_id);
  const profiles=new Map(list(data.profiles).map(p=>[p.site_id,p]));
  const defaults=new Set(),reasons=new Map();
  for(const site of sites){
   const name=normalizedName(site.name),p=profiles.get(site.id);
   if(name==='現場名をあとで変更'){reasons.set(site.id,'現場名未設定');continue;}
   if(company==='40a7a065-1086-4e62-aa09-f44d6207602c'&&(site.id==='b02cdda0-80d2-4129-b681-f25eeff5b7ff'||name==='会社の清掃(犬迫町)')){reasons.set(site.id,'請負外・自動選択対象外');continue;}
   const phase=list(p?.contract_breakdown).some(r=>r?.target_month===m);
   const finished=within(site.completed_on);
   // Creation date is not a work-start date. Do not select an unused master
   // merely because its default status is active. Known work periods can span months.
   const end=validDay(site.completed_on)?site.completed_on:validDay(p?.work_end)?p.work_end:null;
   const ongoing=validDay(p?.work_start)&&p.work_start<b.end&&(end?end>=b.start:site.status==='active');
   if(finished||active.has(site.id)||phase||ongoing){defaults.add(site.id);reasons.set(site.id,finished?'対象月に完工':ongoing?'対象月の工期に該当':'対象月の記録あり');}
   else reasons.set(site.id,'対象月の記録なし');
  }
  return {defaults,reasons};
 }
 function resolveSelection(data,m,company,overrides=new Map()){
  const result=automaticSelection(data,m,company),off=new Set();
  for(const site of list(data.sites)){
   const selected=normalizedName(site.name)!=='現場名をあとで変更'&&(overrides.has(site.id)?overrides.get(site.id)===true:result.defaults.has(site.id));
   if(!selected)off.add(site.id);
  }
  return {...result,excluded:off};
 }
 const selectionAPI=Object.freeze({key:selectionStorageKey,parse:parseSelection,value:selectionValue,automatic:automaticSelection,resolve:resolveSelection});
'''
replace(' const api=Object.freeze({calculate,japanMonth,sources});',helper+'\n const api=Object.freeze({calculate,japanMonth,sources,selection:selectionAPI});')
replace("excluded=new Set(),selectionReady=false,snapshot=null;","excluded=new Set(),selectionStateKey='',selectionOverrides=new Map(),selectionReadError=false,snapshot=null;")
replace("function clear(){excluded=new Set();selectionReady=false;snapshot=null;", "function clear(){excluded=new Set();selectionStateKey='';selectionOverrides=new Map();selectionReadError=false;snapshot=null;")
replace('チェックした現場の請負金・売上・原価・利益を集計します。日報や保存金額は変更しません。選択はこの端末・会社ごとに保存します。', '対象月の施工・売上・原価の記録がある現場と、その月の完工現場を自動で選びます。チェックは自由に変更でき、手動変更はこの端末・会社・対象月ごとに保存します。日報や保存金額は変更しません。')
replace('<div id="cmSiteChoices"></div></details>', '<button id="cmAutoSelect" class="btn light" type="button" style="width:100%;margin:8px 0" disabled>自動選択に戻す</button><div id="cmSiteChoices"></div></details>')
replace("q('#cmRefresh').onclick=()=>refresh(true);", "q('#cmAutoSelect').onclick=resetSelection;q('#cmRefresh').onclick=()=>refresh(true);")
a=s.index(' function selectionKey()');z=s.index(' function selectionNote()',a)
s=s[:a]+r''' function loadSelection(){
  const key=selectionStorageKey(cloudProfile.company_id,month);
  if(selectionStateKey!==key){
   selectionStateKey=key;selectionOverrides=new Map();selectionReadError=false;
   // The old company-wide exclusion list had no month or explicit-override
   // provenance. Leave it untouched for rollback; start the new policy afresh.
   try{selectionOverrides=parseSelection(localStorage.getItem(key),month);}catch(e){selectionReadError=true;}
  }
 }
 function persistSelection(){
  try{localStorage.setItem(selectionStateKey,selectionValue(month,selectionOverrides));selectionReadError=false;return true;}
  catch(e){return false;}
 }
 function resetSelection(){
  if(!snapshot||pending||identity()!==owner)return;
  if(selectionOverrides.size&&!confirm('この月の手動チェックを解除して、自動選択に戻しますか？\n日報・売上・原価は変更しません。'))return;
  selectionOverrides=new Map();const saved=persistSelection();
  selectSites(snapshot);render(calculate(snapshot,month,[...excluded]));selectionNote();
  if(!saved)setStatus('自動選択に戻しましたが、端末には保存できませんでした。',true);
 }
 function selectSites(data){
  snapshot=data;loadSelection();
  excluded=resolveSelection(data,month,cloudProfile.company_id,selectionOverrides).excluded;
  const box=q('#cmSiteChoices');box.replaceChildren();
  for(const site of [...data.sites].filter(s=>normalizedName(s.name)!=='現場名をあとで変更').sort((a,b)=>a.name.localeCompare(b.name,'ja'))){
   const label=document.createElement('label'),check=document.createElement('input');
   check.type='checkbox';check.checked=!excluded.has(site.id);check.dataset.siteId=site.id;
   label.append(check,document.createTextNode(site.name));box.append(label);
   check.onchange=()=>{
    if(!snapshot||pending||identity()!==owner){check.checked=!excluded.has(site.id);return;}
    selectionOverrides.set(site.id,check.checked);
    if(check.checked)excluded.delete(site.id);else excluded.add(site.id);
    const saved=persistSelection();
    render(calculate(snapshot,month,[...excluded]));selectionNote();
    if(!saved)setStatus('集計は更新しました。手動チェックは端末に保存できませんでした。',true);
   };
  }
  selectionNote();
 }
''' +s[z:]
replace("q('#cmSelectionNote').textContent=sites.length===off.length?'集計する現場を選んでください。':off.length?'集計対象外：'+off.map(s=>s.name).join('・'):'すべての現場を集計しています。';", "q('#cmSelectionNote').textContent=(selectionOverrides.size?'対象月の自動選択＋手動変更。':'対象月の現場を自動選択。')+(sites.length===off.length?'集計する現場を選んでください。':off.length?'集計対象外：'+off.map(s=>s.name).join('・'):'すべての現場を集計しています。')+(selectionReadError?' 端末の保存済み選択を読み込めませんでした。':'');")
replace("pending=key;snapshot=null;card.querySelectorAll('#cmSiteChoices input').forEach(x=>x.disabled=true);", "pending=key;snapshot=null;q('#cmAutoSelect').disabled=true;card.querySelectorAll('#cmSiteChoices input').forEach(x=>x.disabled=true);")
replace("pending='';q('#cmRefresh').disabled=false;card.querySelectorAll('#cmSiteChoices input').forEach(x=>x.disabled=!snapshot);", "pending='';q('#cmRefresh').disabled=false;q('#cmAutoSelect').disabled=!snapshot;card.querySelectorAll('#cmSiteChoices input').forEach(x=>x.disabled=!snapshot);")
# Bytes inside all financial calculations remain unchanged; policy affects selection only.
extract=lambda x:x[x.index(' function calculate('):x.index('\n const api=') if '\n // Auto defaults' not in x else x.index('\n // Auto defaults')].strip()
assert extract(s)==extract(old.decode())
(DOCS/TARGET).write_text(s)
index=(DOCS/'index.html').read_bytes();assert blob(index)=='2ce461f4b656fa17fb9384f8387f7b1197fe542a','Index changed; review first'
needle='company-monthly-summary.period-r1.js?v=20260925-period-r1'
# Guard exact reference rather than guessing the current cache-buster.
import re
pattern=r'company-monthly-summary\.period-r1\.js\?v=[^"<>]+'
assert len(re.findall(pattern,index.decode()))==1
new=re.sub(pattern,'company-monthly-summary.autoselect-r1.js?v=20260925-autoselect-r1',index.decode())
(DOCS/'index.html').write_text(new)
print('module_sha256',hashlib.sha256(s.encode()).hexdigest())
print('index_sha256',hashlib.sha256(new.encode()).hexdigest())
