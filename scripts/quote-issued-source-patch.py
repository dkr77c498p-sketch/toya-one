from pathlib import Path
import hashlib
root=Path(__file__).resolve().parents[1]
def digest(b): return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def one(s,a,b):
 assert s.count(a)==1,(s.count(a),a[:120])
 return s.replace(a,b,1)
p=root/'docs/estimate-plan-admin.quote5-r4.js';raw=p.read_bytes();assert digest(raw)=='6d145e720475ae75b9df02c4b62f0dd45089270c'
s=raw.decode()
# Display grouping only. Never delete/unlink a protected source or alter a snapshot.
helpers=r'''
 // A completed PDF and its input source are not independent duplicate quotes.
 // Collapse only an exact, current source of an issued document. Revised plans,
 // missing snapshots and unrelated same-name plans stay in the normal list.
 const sourceStable=v=>Array.isArray(v)?'['+v.map(sourceStable).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+sourceStable(v[k])).join(',')+'}':JSON.stringify(v);
 const sourceContents=p=>Object.fromEntries(Object.entries(p).filter(([k])=>!['created_at','updated_at'].includes(k)));
 function linkedPlanDocuments(p){return quotes.filter(d=>p.id&&p.company_id&&d.kind==='estimate'&&d.company_id===p.company_id&&d.estimate_plan_id===p.id);}
 function sameIssuedSource(p,d){
  const s=d.estimate_snapshot;
  if(d.status!=='issued'||!d.document_number||!s||s.id!==p.id||s.company_id!==p.company_id||p.calculation?.complete!==true)return false;
  const a=Date.parse(p.updated_at),b=Date.parse(s.updated_at);
  if(!Number.isFinite(a)||a!==b||Number(p.calculation.price)!==Number(d.subtotal)||Number(p.calculation.total)!==Number(d.total))return false;
  return sourceStable(sourceContents(p))===sourceStable(sourceContents(s));
 }
 function savedPlanCard(p,folded=false){
  const linked=linkedPlanDocuments(p),protectedSource=linked.length>0;
  const amount=p.calculation?.complete?(protectedSource?'作成元（税別） ':'見積（税別） ')+yen(p.calculation.price):(p.entry_mode==='quote'?'入力済み見積 '+yen(p.calculation?.known_price||0):'積算途中 / 入力済原価 '+yen(p.calculation?.known_cost||0));
  return '<div class="pb-document-row" data-saved-plan-row="'+esc(p.id)+'"><div><b>'+esc(p.title)+'</b><p>'+esc(p.customer_name||'宛先未入力')+'</p><strong>'+amount+'</strong>'+(protectedSource?'<p class="note">'+(folded?'確定済み見積の作成元です。':'作成済みの見積書に使用しています。')+'元データは保管しています。</p>':'')+'</div><div class="pb-actions"><button class="btn light" type="button" data-ep-open="'+esc(p.id)+'">'+(protectedSource?'作成元を開く':'開く')+'</button>'+(protectedSource?'':'<button class="btn danger" type="button" data-ep-delete-plan="'+esc(p.id)+'">削除</button>')+'</div></div>';
 }
'''
s=one(s,' function renderLists(){',helpers+'\n function renderLists(){')
s=one(s,'<div id="epQuoteList"></div></details>','<div id="epQuoteList"></div><details id="epIssuedSources" hidden><summary>確定済み見積の作成元</summary><p class="note">確定済みの見積書と同じ内容の入力データです。削除せず保管しています。</p><div id="epIssuedSourceList"></div></details></details>')
start=s.index("  const rows=[...plans].sort((a,b)=>b.updated_at.localeCompare(a.updated_at));",s.index(' function renderLists(){'))
end=s.index("  q('#epSavedPlans').querySelectorAll('[data-ep-open]')",start)
s=s[:start]+'''  const all=[...plans].sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
  const folded=[],rows=[];
  for(const p of all){
   const issued=linkedPlanDocuments(p).some(d=>sameIssuedSource(p,d));
   (issued&&!(dirty&&plan?.id===p.id)?folded:rows).push(p);
  }
  q('#epSavedPlans').innerHTML=rows.length?rows.map(p=>savedPlanCard(p)).join(''):folded.length?'':'<p class="note">保存済みの見積はまだありません。</p>';
  q('#epIssuedSources').hidden=!folded.length;
  q('#epIssuedSources > summary').textContent='確定済み見積の作成元（'+folded.length+'件）';
  q('#epIssuedSourceList').innerHTML=folded.map(p=>savedPlanCard(p,true)).join('');
'''+s[end:]
s=one(s,"q('#epSavedPlans').querySelectorAll('[data-ep-open]')","q('#epSavedEstimates').querySelectorAll('[data-ep-open]')")
# The database continues to enforce the source guard. Do not replace it or touch
# existing deletion/persistence/calculation/PDF functions in this UI-only change.
new=root/'docs/estimate-plan-admin.quote5-r5.js';assert not new.exists();new.write_text(s)
p=root/'docs/index.html';b=p.read_bytes();assert digest(b)=='1da2293ae67c77cea2d94c7abf2de5c9eca664b8'
p.write_text(one(b.decode(),'estimate-plan-admin.quote5-r4.js?v=20260924-waste-reopen-r1','estimate-plan-admin.quote5-r5.js?v=20260924-issued-source-r1'))
print('Display-only source grouping applied. No business data, financial calculation, deletion or save function changed.')
