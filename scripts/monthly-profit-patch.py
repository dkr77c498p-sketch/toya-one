"""Versioned, display-only revenue integration. Refuse unexpected source files."""
from pathlib import Path
import hashlib
D=Path('docs')
def load(name, sha):
    b=(D/name).read_bytes()
    assert hashlib.sha256(b).hexdigest()==sha, f'Source changed: {name}'
    return b.decode()
def replace(s, old, new):
    assert s.count(old)==1, ('Expected one match',old[:100],s.count(old))
    return s.replace(old,new)
cm=load('company-monthly-summary.autoselect-r1.js','845e40de6f2080a1bc40d498ae585b081e1ae90882ae7380aabfef881fe6254d')
cm=replace(cm," const list=x=>Array.isArray(x)?x:[];"," const R=node?require('./monthly-revenue.r1.js'):window.ToyaMonthlyRevenue;\n const list=x=>Array.isArray(x)?x:[];")
cm=replace(cm,"['documents','project_documents','id,site_id,kind,status,document_date,subtotal,updated_at','document_date','id']","['documents','project_documents',R.fields,null,'id']")
cm=replace(cm,'  for(const doc of data.documents){','  for(const doc of data.documents.filter(d=>within(d.document_date))){')
cm=replace(cm,'  const shown=[...rows.values()]',"  for(const d of data.documents.filter(d=>R.issued(d)&&(R.workMonth(d)===month||(!R.workMonth(d)&&within(d.document_date)))))if(!excluded.has(d.site_id))rowFor(d.site_id).workInvoice=true;\n  const shown=[...rows.values()]")
cm=replace(cm,'r.invalidPhases||r.outgoing||r.contractRecorded','r.invalidPhases||r.workInvoice||r.outgoing||r.contractRecorded')
start=cm.index("    let monthlyContractAmount=null,monthlyContractSource='missing';")
end=cm.index('    const validPhases=',start)
cm=cm[:start]+'''    const resolved=R.resolve(data.documents,rawPhases,r.site.id,month);
    const monthlyContractAmount=siteIds.has(r.site.id)?resolved.amount:null,monthlyContractSource=resolved.source;
'''+cm[end:]
cm=replace(cm,'monthlyContractAmount,monthlyContractSource,monthlyProfit:', 'monthlyContractAmount,monthlyContractSource,revenueInfo:resolved,monthlyProfit:')
cm=replace(cm,'  const startedRows=shown.filter(r=>r.hasCosts);','  const startedRows=shown.filter(r=>r.hasCosts||r.monthlyContractAmount!==null||r.workInvoice);')
cm=replace(cm,'  const monthlyProfit=monthlyContractTotal!==null&&knownCost!==null?add(monthlyContractTotal,-knownCost):null;', '''  const monthlyProfit=monthlyContractTotal!==null&&knownCost!==null?add(monthlyContractTotal,-knownCost):null;
  const knownRevenueRows=startedRows.filter(r=>r.monthlyContractAmount!==null);
  const knownMonthlyRevenue=knownRevenueRows.length?knownRevenueRows.reduce((s,r)=>add(s,r.monthlyContractAmount),0):null;
  const knownMonthlyDifference=knownMonthlyRevenue!==null&&knownCost!==null?add(knownMonthlyRevenue,-knownCost):null;
  const autoRevenueCount=shown.filter(r=>r.monthlyContractSource==='invoice').length;
  const otherMonthDocuments=shown.flatMap(r=>r.revenueInfo.otherMonthInvoices.map(d=>({site:r.site.name,number:d.document_number,month:R.workMonth(d),amount:Number(d.subtotal)})));''')
cm=replace(cm,'   monthlyContractTotal,monthlyProfit,missingMonthlyContracts,missingMonthlyCosts,','   monthlyContractTotal,monthlyProfit,knownMonthlyRevenue,knownMonthlyDifference,autoRevenueCount,otherMonthDocuments,missingMonthlyContracts,missingMonthlyCosts,')
cm=replace(cm,"for(const d of list(data.documents))if(within(d.document_date)&&['invoice','progress'].includes(d.kind)&&d.status==='issued')active.add(d.site_id);","for(const d of list(data.documents))if(R.workMonth(d)===m)active.add(d.site_id);")
cm=replace(cm,"   if(dateField)query=query.gte(dateField,bounds.start).lt(dateField,bounds.end);","   if(key==='documents')query=query.in('kind',['invoice','progress']);\n   if(dateField)query=query.gte(dateField,bounds.start).lt(dateField,bounds.end);")
cm=cm.replace('対象月の出来高（未請求含む）','対象月の売上（出来高）').replace('請求済み（参考）','発行月の請求額（参考）')
cm=replace(cm,'<span>利益（請負分基準・暫定）</span>','<span id="cmProfitLabel">暫定利益（売上 − 原価）</span>')
cm=cm.replace('今月の出来高を入力','対象月の売上・出来高を入力')
start=cm.index("  q('#cmContract').textContent=yen(result.monthlyContractTotal);")
end=cm.index('  const notices=[];',start)
cm=cm[:start]+'''  const partial=result.missingMonthlyContracts>0;
  const revenue=partial?result.knownMonthlyRevenue:result.monthlyContractTotal;
  const profit=partial?result.knownMonthlyDifference:result.monthlyProfit;
  q('#cmContract').textContent=revenue===null?(result.hasData?'売上未入力':'記録なし'):yen(revenue);
  q('#cmSales').textContent=yen(result.sales);q('#cmCost').textContent=yen(result.cost);
  q('#cmProfitLabel').textContent=partial&&profit!==null?'確認済み売上との差額（未入力あり）':'暫定利益（売上 − 原価）';
  q('#cmProfit').textContent=profit===null?(result.hasData?'計算待ち':'記録なし'):yen(profit);
  q('#cmProfit').style.fontSize=profit===null?'23px':'';
  q('#cmProfit').classList.toggle('cm-negative',profit!==null&&profit<0);
  q('#cmContractInfo').textContent=result.hasData?
   (result.autoRevenueCount?'確定請求の今回分を工事の対象月へ自動反映（'+result.autoRevenueCount+'現場）。未請求の出来高は別途入力してください。':'手入力した月別売上を優先し、請求額は重ねて足しません。')+
   (partial?' 売上未入力の現場があります。表示できた差額も最終利益ではありません。':' 入力済み原価との暫定的な差額です。'):'';
'''+cm[end:]
start=cm.index('  if(result.missingMonthlyContracts){')
end=cm.index('  if(result.missingMonthlyCosts)',start)
cm=cm[:start]+'''  if(result.missingMonthlyContracts){const pendingNames=result.rows.filter(r=>(r.hasCosts||r.workInvoice)&&r.monthlyContractAmount===null).map(r=>r.site.name);notices.push(month+'の売上・出来高を入力してください：'+pendingNames.join('・')+'。下の「対象月の売上・出来高を入力」から登録できます。');}
  if(result.otherMonthDocuments.length)notices.push(result.otherMonthDocuments.map(d=>d.site+'：発行月の請求額のうち'+yen(d.amount)+'は'+d.month+'の工事分です。'+month+'の売上には加算しません。').join(' '));
'''+cm[end:]
cm=replace(cm,"  q('#cmNotice').textContent='';","  q('#cmNotice').textContent=notices.join(' ');")
cm=replace(cm,"  if(result.hasData)references.push('請求済み − 原価（参考）：'+yen(result.profit)+'。未請求分は含みません。');","  for(const row of result.rows)for(const message of row.revenueInfo.notes)references.push(row.site.name+'：'+message);")
cm=replace(cm,"<h3>'+escape(row.site.name)+'</h3><div>","<h3>'+escape(row.site.name)+'</h3><p>'+escape(row.monthlyContractSource==='invoice'?'確定請求の今回分を自動反映（未請求分未反映）':row.monthlyContractSource==='manual'?'手入力の月別売上を優先':'売上の入力・工事月の確認が必要')+'</p><div>")
cm=replace(cm,'対象月の請負分：登録された月別契約内訳（予定・出来高済み）を使います。','対象月の売上：手入力の月別内訳を優先します。未入力の場合は、工事期間が同じ月の確定請求の今回分を自動で使います。発行月だけでは判定せず、複数月の請求は自動配分しません。')
cm=replace(cm,'請求済み：対象月に発行した確定済みの請求書・出来高請求書の税別合計です。請負分との重複を避けるため、利益には加算しません。','発行月の請求額：対象月に発行した確定請求の参考合計です。工事月の売上とは別のため、この金額をそのまま利益に足しません。')
cm=replace(cm,'暫定利益：対象月の請負分 − 対象月の入力済み原価です。未請求分を含みます。','暫定利益：対象月の売上 − 対象月の入力済み原価です。手入力には未請求分も含められます。自動反映は確定請求分だけです。売上未入力がある場合は「確認済み売上との差額」として区別します。')
(D/'company-monthly-summary.revenue-r1.js').write_text(cm)

sl=load('site-period-ledger.r1.js','f424f6427acfadacc62a9e7b167ed25890606bc5a5169d4a73b2ea238b7650ec')
sl=replace(sl,' const copy=x=>JSON.parse(JSON.stringify(x));'," const R=node?require('./monthly-revenue.r1.js'):root.ToyaMonthlyRevenue;\n const copy=x=>JSON.parse(JSON.stringify(x));")
sl=replace(sl,"['documents','project_documents','id,site_id,kind,status,document_date,subtotal,updated_at','document_date','id']","['documents','project_documents',R.fields,'document_date','id']")
sl=replace(sl,"...docs.map(d=>d.document_date.slice(0,7))","...docs.map(d=>d.document_date.slice(0,7)),...docs.map(d=>R.workMonth(d)).filter(Boolean)")
sl=replace(sl,"   const part=entries.filter(r=>r.target_month===month),c=byMonth.get(month),revenue=part.length?sum(part.map(r=>r.amount)):null;","   const part=entries.filter(r=>r.target_month===month),c=byMonth.get(month),resolved=R.resolve(docs,entries,siteId,month,companyId),revenue=resolved.amount;")
sl=replace(sl,"   const activity=!!c||part.length>0||docs.some(d=>d.document_date.startsWith(month));","   const activity=!!c||part.length>0||revenue!==null||resolved.ambiguous.length>0;")
sl=replace(sl,"return {month,entries:part,revenue,cost,invoice,activity,future,provisional:part.some(r=>r.status==='planned'),warnings:notes,","return {month,entries:part,revenue,cost,invoice,activity,future,revenueSource:resolved.source,revenueInfo:resolved,provisional:resolved.provisional,warnings:[...notes,...resolved.notes],")
sl=replace(sl,"invoice:sum(past.map(r=>r.invoice)),provisional:","invoice:sum(rows.filter(r=>!r.future).map(r=>r.invoice)),automaticRevenue:sum(past.filter(r=>r.revenueSource==='invoice').map(r=>r.revenue||0)),provisional:")
sl=replace(sl,'const orderedProgress=sum(entries.map(r=>r.amount))','const orderedProgress=sum(rows.map(r=>r.revenue||0))')
(D/'site-period-ledger.revenue-r1.js').write_text(sl)

ui=load('site-period-ledger-ui.r1.js','1415f95c2b021fbbaf74fa87f686b7765ccc01aa106deab74ddd872f09609bb1')
ui=replace(ui,"'<p class=\"sl-note\">月別売上は未入力です。</p>'","(row.revenueSource==='invoice'?'<p class=\"sl-note\">確定請求の今回分を工事月へ自動反映しています。未請求分は含みません。</p>':!row.activity?'<p class=\"sl-note\">この月は工事の売上・原価の記録がありません。発行月の請求は別の工事月で計上します。</p>':'<p class=\"sl-note\">この月の売上・出来高を入力すると利益を計算できます。</p>')")
ui=replace(ui,"line('区分未設定の出来高',t.unclassified)","line('区分未設定の出来高',t.unclassified)+line('確定請求からの自動反映分',t.automaticRevenue)")
ui=replace(ui,'売上は月別出来高の合計です。請負総額・請求書をさらに足すと二重計上になるため足しません。','手入力の月別売上を優先し、未入力月だけ確定請求の今回分を工事月へ自動反映します。発行月には重ねて足しません。自動反映は未請求分を含みません。')
ui=replace(ui,'その月に計上する金額を入力します。累計額を毎月入れないでください。','手入力する月は、自動表示の請求分も含めたその月の売上合計を入力します。手入力と自動表示は重ねて足しません。累計額を毎月入れないでください。')
(D/'site-period-ledger-ui.revenue-r1.js').write_text(ui)
index=load('index.html','0d7a97b954e1168cf1681f3e250e7d35fb62f3dd65822f1f426f0e1b2628984d')
index=replace(index,'<script src="company-monthly-summary.autoselect-r1.js?v=20260925-autoselect-r1"></script>','<script src="monthly-revenue.r1.js?v=20261012-revenue-r1"></script><script src="company-monthly-summary.revenue-r1.js?v=20261012-revenue-r1"></script>')
index=replace(index,'site-period-ledger.r1.js?v=20260925-site-period-r1','site-period-ledger.revenue-r1.js?v=20261012-revenue-r1')
index=replace(index,'site-period-ledger-ui.r1.js?v=20260925-site-period-r1','site-period-ledger-ui.revenue-r1.js?v=20261012-revenue-r1')
(D/'index.html').write_text(index)
print('Created versioned home/period readers; no database or original financial modules changed.')
