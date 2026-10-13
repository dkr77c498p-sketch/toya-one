from pathlib import Path
import hashlib
root=Path(__file__).resolve().parents[1]
source=root/'docs/company-monthly-summary.autoselect-r1.js'
index=root/'docs/index.html'
def blob(p):
    b=p.read_bytes();return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
assert blob(source)=='d016319c6798304fbdaab65c87c9684d56dab513', 'Monthly source moved; review before applying'
assert blob(index)=='9a25ad7c60cbdfc4af848a4114674d9f66fdfbbd', 'Entry point moved; review before applying'
s=source.read_text()
def replace(a,b):
    global s
    assert s.count(a)==1, ('Patch anchor must be unique',a[:120],s.count(a))
    s=s.replace(a,b,1)
helper=r'''
 // Read-only cumulative progress: each site/month uses explicit monthly entries
 // OR issued current claim subtotals, never both. No contract sum is earned here.
 function claimWorkDate(d){
  const value=d.transaction_end==null||d.transaction_end===''?d.document_date:d.transaction_end;
  if(!validDay(value))throw Error('請求書の工事対象日を確認してください。');
  return value;
 }
 function registeredProgress(input,through,excludedIds=[]){
  if(!validMonth(through))throw Error('出来高累計の対象月を確認してください。');
  const excluded=new Set(excludedIds),sites=unique(input.sites),known=new Set(sites.map(s=>s.id));
  const included=new Map(sites.filter(s=>!excluded.has(s.id)).map(s=>[s.id,s]));
  const groups=new Map();
  function group(siteId,m){
   const key=JSON.stringify([siteId,m]);
   if(!groups.has(key))groups.set(key,{siteId,siteName:included.get(siteId).name,month:m,manual:0,claims:0,manualCount:0,claimCount:0});
   return groups.get(key);
  }
  function amount(v){const n=S.amount(v);if(n===null||n<0)throw Error('登録済み出来高の金額を確認してください。');return n;}
  for(const p of unique(input.profiles,'site_id')){
   if(!included.has(p.site_id))continue;
   const phases=p.contract_breakdown;
   if(phases==null)continue;
   if(!Array.isArray(phases))throw Error('月別出来高の内訳を確認してください。');
   for(const entry of phases){
    if(!entry||!validMonth(entry.target_month))throw Error('月別出来高の対象月を確認してください。');
    if(entry.target_month>through)continue;
    if(!['planned','complete'].includes(entry.status))throw Error('月別出来高の状態を確認してください。');
    const row=group(p.site_id,entry.target_month);row.manual=add(row.manual,amount(entry.amount));row.manualCount++;
   }
  }
  for(const d of unique(input.documents)){
   if(!['invoice','progress'].includes(d.kind)||d.status!=='issued'||excluded.has(d.site_id))continue;
   if(!known.has(d.site_id))throw Error('請求書の現場の紐付けを確認してください。');
   const m=claimWorkDate(d).slice(0,7);if(m>through)continue;
   const row=group(d.site_id,m);row.claims=add(row.claims,amount(d.subtotal));row.claimCount++;
  }
  const rows=[...groups.values()].map(r=>({...r,amount:r.manualCount?r.manual:r.claims,source:r.manualCount?'breakdown':'issued'}))
   .sort((a,b)=>a.month.localeCompare(b.month)||a.siteName.localeCompare(b.siteName,'ja'));
  const byMonth=new Map();for(const r of rows)byMonth.set(r.month,add(byMonth.get(r.month)||0,r.amount));
  const periods=[...byMonth].map(([month,amount])=>({month,amount}));
  return {through,total:rows.length?rows.reduce((n,r)=>add(n,r.amount),0):null,rows,periods};
 }
'''
replace(' const api=Object.freeze({calculate,japanMonth,sources,selection:selectionAPI});',helper+'\n const api=Object.freeze({calculate,japanMonth,sources,selection:selectionAPI,registeredProgress,claimWorkDate});')
replace("   const effectiveDate=/^20\\d\\d-\\d{2}-\\d{2}$/.test(String(doc.transaction_end||''))?doc.transaction_end:doc.document_date;","   const effectiveDate=claimWorkDate(doc);")
replace("  return {month,rows:shown,sales,invoiceCount,cost:knownCost,profit:knownCost===null?null:add(sales,-knownCost),","  let cumulative,cumulativeError='';\n  try{cumulative=registeredProgress(data,month,excludedIds);}catch(e){cumulative={through:month,total:null,rows:[],periods:[]};cumulativeError=e.message;}\n  return {month,cumulative,cumulativeError,rows:shown,sales,invoiceCount,cost:knownCost,profit:knownCost===null?null:add(sales,-knownCost),")
replace("for(const d of list(data.documents))if(within(d.document_date)&&['invoice','progress'].includes(d.kind)&&d.status==='issued')active.add(d.site_id);","for(const d of list(data.documents))if(['invoice','progress'].includes(d.kind)&&d.status==='issued'&&within(claimWorkDate(d)))active.add(d.site_id);")
replace("['cmActiveContract','cmContract','cmSales','cmCost','cmProfit']","['cmActiveContract','cmContract','cmSales','cmCost','cmProfit','cmCumulative']")
replace("['cmNotice','cmContractInfo']","['cmNotice','cmContractInfo','cmCumulativeInfo']")
replace('<span>対象月の出来高（登録済み・未請求含む）</span>','<span id="cmCurrentProgressLabel">対象月の出来高（登録済み）</span>')
replace('<span>請求済み（参考）</span>','<span id="cmCurrentClaimLabel">対象月分の確定請求（参考）</span>')
replace('<span>対象月の原価（入力済み）</span>','<span id="cmCurrentCostLabel">対象月の原価（入力済み）</span>')
replace('<span>利益（登録済み出来高－原価・暫定）</span><strong id="cmProfit">—</strong></div></div>', '<span id="cmCurrentProfitLabel">対象月の暫定利益</span><strong id="cmProfit">—</strong></div><div><span>これまでの出来高（登録済み）</span><strong id="cmCumulative">—</strong></div></div><p id="cmCumulativeInfo" class="note" role="status" aria-live="polite"></p>')
replace("  q('#cmContract').textContent=yen(result.monthlyContractTotal);","  const monthLabel=result.month.slice(0,4)+'年'+Number(result.month.slice(5))+'月';\n  q('#cmCurrentProgressLabel').textContent=monthLabel+'の出来高（登録済み）';\n  q('#cmCurrentClaimLabel').textContent=monthLabel+'分の確定請求（参考）';\n  q('#cmCurrentCostLabel').textContent=monthLabel+'の原価（入力済み）';\n  q('#cmCurrentProfitLabel').textContent=monthLabel+'の利益（暫定）';\n  q('#cmProgressOpen').textContent=Number(result.month.slice(5))+'月の出来高を入力';\n  q('#cmContract').textContent=result.monthlyContractTotal===null?(result.hasData?'未入力':'記録なし'):yen(result.monthlyContractTotal);\n  const cum=result.cumulative;\n  q('#cmCumulative').textContent=result.cumulativeError?'要確認':cum.total===null?'未登録':yen(cum.total);\n  q('#cmCumulativeInfo').textContent=result.cumulativeError?'出来高累計を確認できません：'+result.cumulativeError:monthLabel+'分までの登録済み額。未入力分は含みません。'+(cum.periods.length?' 内訳：'+(cum.periods.length>3?'直近3か月／':'')+cum.periods.slice(-3).map(p=>p.month.slice(0,4)+'年'+Number(p.month.slice(5))+'月 '+yen(p.amount)).join('・'):'');")
a="""  const contractText=q('#cmContract').textContent,costText=q('#cmCost').textContent;
  const displayedContract=parseFloat(contractText.replace(/,/g,'').replace('円','')),displayedCost=parseFloat(costText.replace(/,/g,'').replace('円',''));
  const displayProfit=contractText!=='—'&&costText!=='—'&&Number.isFinite(displayedContract)&&Number.isFinite(displayedCost)?Math.round((displayedContract-displayedCost)*100)/100:result.monthlyProfit;
  q('#cmProfit').textContent=yen(displayProfit);result.monthlyProfit=displayProfit;
  q('#cmContractInfo').textContent=result.hasData?'登録済み出来高 − 原価で暫定利益を表示します。月別出来高が未入力なら、その工事月の確定請求額を使います。':'';"""
b="""  // Do not reparse formatted DOM values or substitute cumulative sales for a month's sales.
  q('#cmProfit').textContent=result.monthlyProfit===null?(result.hasData?(result.monthlyContractTotal===null?'出来高未入力':'原価未確認'):'記録なし'):yen(result.monthlyProfit);
  q('#cmContractInfo').textContent=result.hasData?'その月の出来高 − その月の原価で暫定利益を計算します。「これまでの出来高」は別の累計で、今月へ重ねて足しません。':'';"""
replace(a,b)
replace("notices.push('対象月の出来高がまだ未入力：'+pendingNames.join('・')+'（'+result.missingMonthlyContracts+'件）。利益は登録済み出来高だけを使った暫定値です。未請求分があれば「現場別の月別・工事全体を見る」から入力してください。');","notices.push(monthLabel+'の出来高が未入力：'+pendingNames.join('・')+'。'+(result.monthlyContractTotal===null?'この月の利益はまだ計算できません。':'利益は未入力の売上を含まない暫定差額です。')+' 前月の出来高は累計に残しています。');")
replace("  q('#cmNotice').textContent='';","  q('#cmNotice').textContent=notices.join('\\n');")
replace("  q('#cmBreakdown').innerHTML=(siteCards?", "  const progressHistory=result.cumulative.rows.map(r=>'<p>'+escape(r.siteName)+' ／ '+escape(r.month)+'：'+yen(r.amount)+'（'+(r.source==='breakdown'?'月別入力':'確定請求の今回分')+'）</p>').join('');\n  q('#cmBreakdown').innerHTML=(progressHistory?'<details><summary>登録済み出来高の月別内訳</summary>'+progressHistory+'</details>':'')+(siteCards?")
target=root/'docs/company-monthly-summary.progress-r2.js'
assert not target.exists(), 'New version already exists'
target.write_text(s)
i=index.read_text();old='company-monthly-summary.autoselect-r1.js?v=20261013-profit-r1';new='company-monthly-summary.progress-r2.js?v=20261013-month-and-cumulative-r2'
assert i.count(old)==1
index.write_text(i.replace(old,new,1))
print('Prepared read-only monthly progress + registered cumulative display; original engines and records untouched.')
