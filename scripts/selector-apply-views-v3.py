def index(s):
 s=replace(s,"function populateSiteSummarySelect(){", "function populateSiteSummarySelect(){\n  if(window.ToyaSharedSiteUI?.ready()){window.ToyaSharedSiteUI.syncBrowse($('#siteSummarySelect'));return;}")
 s=replace(s,"function populateLedgerSites(){", "function populateLedgerSites(){\n  if(window.ToyaSharedSiteUI?.ready()){window.ToyaSharedSiteUI.syncBrowse($('#ledgerSite'));return;}")
 s=replace(s,"  const sv=site.value,wv=writer.value;\n  const sites=", "  const sv=site.value,wv=writer.value;\n  if(window.ToyaSharedSiteUI?.ready()){\n    const writers=[...new Set((a||[]).map(x=>x.writer).filter(Boolean))].sort();\n    writer.innerHTML='<option value=\"\">全員</option>'+writers.map(x=>`<option>${cloudHtml(x)}</option>`).join('');if(writers.includes(wv))writer.value=wv;\n    window.ToyaSharedSiteUI.syncBrowse(site,false,sv);return;\n  }\n  const sites=")
 s=replace(s,"const reports=cloudReportsCache.filter(r=>(r.site||'現場名をあとで変更')===site);", "const siteKey=v=>String(v||'').normalize('NFKC').replace(/[\\s　]/g,'');\n    const reports=cloudReportsCache.filter(r=>siteKey(r.site||'現場名をあとで変更')===siteKey(site));")
 s=replace(s,"const arr=(cloudReportsCache||[]).filter(d=>d.site===site);", "const siteKey=v=>String(v||'').normalize('NFKC').replace(/[\\s　]/g,'');\n  const arr=(cloudReportsCache||[]).filter(d=>siteKey(d.site)===siteKey(site));")
 for n in ['midway','site-move-filter-fix','site-waste-cost-summary','labor-cost-admin','vehicle-cost-admin','equipment-cost-admin','site-financial-summary','employee-activity-summary','shared-site-master']:
  s,count=re.subn(rf'(<script src="{n}\.js\?v=)[^"\n]+',r'\g<1>20260910-sites-v3',s)
  assert count==1,n
 return s
edit('index.html',index)
def midway(s):
 s=replace(s,"function refillSiteSelect(sel,allLabel,data=recordsSnapshot){", "function refillSiteSelect(sel,allLabel,data=recordsSnapshot){if(window.ToyaSharedSiteUI?.ready()){window.ToyaSharedSiteUI.syncBrowse(sel);return}")
 s=replace(s,"recordsSnapshot=Array.isArray(a)?a:[];old(a);const site=", "recordsSnapshot=Array.isArray(a)?a:[];old(a);if(window.ToyaSharedSiteUI?.ready()){refreshFilters();return}const site=")
 s=replace(s,"m&&m.site===site", "m&&String(m.site||'').normalize('NFKC').replace(/[\\s　]/g,'')===String(site||'').normalize('NFKC').replace(/[\\s　]/g,'')")
 return s
edit('midway.js',midway)
def filterfix(s):
 s=replace(s,"  async function refreshNonRecordSiteSelectors(){\n", "  async function refreshNonRecordSiteSelectors(){\n    if(window.ToyaSharedSiteUI?.ready()){window.ToyaSharedSiteUI.syncBrowse(document.querySelector('#ledgerSite'));window.ToyaSharedSiteUI.syncBrowse(document.querySelector('#siteSummarySelect'));return;}\n")
 s=replace(s,"    const names=await loadActiveSites();\n", "    const names=await loadActiveSites();\n    if(window.ToyaSharedSiteUI?.ready()){window.ToyaSharedSiteUI.syncBrowse(document.querySelector('#ledgerSite'));window.ToyaSharedSiteUI.syncBrowse(document.querySelector('#siteSummarySelect'));return;}\n")
 s=replace(s,"      const to=document.querySelector('#recordDateTo')?.value||'';", "      const to=document.querySelector('#recordDateTo')?.value||'';\n      const siteKey=v=>String(v||'').normalize('NFKC').replace(/[\\s　]/g,'');")
 s=replace(s,"!site||d.site===site||moves.some(m=>m?.site===site)","!site||siteKey(d.site)===siteKey(site)||moves.some(m=>siteKey(m?.site)===siteKey(site))")
 return s
edit('site-move-filter-fix.js',filterfix)
def waste(s):
 s=replace(s,"    if(!sel) return false;", "    if(!sel) return false;\n    if(window.ToyaSharedSiteUI?.ready()){window.ToyaSharedSiteUI.syncBrowse(sel);return true;}")
 s=replace(s,"    const names = [...new Set(sites.map", "    if(window.ToyaSharedSiteUI?.ready()){window.ToyaSharedSiteUI.syncBrowse(sel);return true;}\n    const names = [...new Set(sites.map")
 s=replace(s,"const mine = reports.filter(d => String(d.site || '') === String(site || ''));", "const siteKey=v=>String(v||'').normalize('NFKC').replace(/[\\s　]/g,'');\n    const mine = reports.filter(d => siteKey(d.site) === siteKey(site));")
 return s
edit('site-waste-cost-summary.js',waste)
for name,prefix in [('labor-cost-admin.js','lc'),('vehicle-cost-admin.js','vc'),('equipment-cost-admin.js','ec')]:
 def cost(s):
  s=replace(s,"sites.map(s=>`<option value=\"${esc(s.id)}\">${esc(s.name)}</option>`).join('')","sites.filter(s=>s.status==='active'&&!['新しい現場','現場名をあとで変更','未登録現場'].includes(s.name)).map(s=>`<option value=\"${esc(s.id)}\">${esc(s.name)}</option>`).join('')")
  needle=f"if(match)q('#{prefix}Site').value=match.id;"
  s=replace(s,needle,needle+f"\n      window.ToyaSharedSiteUI?.syncBrowse(q('#{prefix}Site'));")
  s=replace(s,"sites.find(s=>s.name===current)","sites.find(s=>String(s.name).normalize('NFKC').replace(/[\\s　]/g,'')===String(current||'').normalize('NFKC').replace(/[\\s　]/g,''))")
  event=f'''  document.addEventListener('toya-shared-sites-updated',event=>{{
    if(typeof cloudProfile==='undefined'||!cloudProfile?.active||cloudProfile.role!=='admin'||event.detail?.companyId!==cloudProfile.company_id)return;
    sites=(Array.isArray(event.detail.sites)?event.detail.sites:[]).map(s=>({{...s}}));
    window.ToyaSharedSiteUI?.syncBrowse(q('#{prefix}Site'));
  }});
'''
  pos=s.rfind('})();');assert pos>=0;s=s[:pos]+event+s[pos:];return s
 edit(name,cost)
def employee(s):
 s=replace(s,"read('sites','id,name',company,null,t)","read('sites','id,name,status',company,null,t)")
 s=replace(s,"sites=rawSites.map(s=>({id:s.id,name:safe(s.name)})).filter(s=>s.name&&!['新しい現場','現場名をあとで変更','未登録現場'].includes(s.name))", "sites=rawSites.map(s=>({id:s.id,name:safe(s.name),status:s.status})).filter(s=>s.name)")
 s=replace(s,"q('#esSite').innerHTML=sites.map(s=>", "q('#esSite').innerHTML='<option value=\"\">現場を選択</option>'+sites.filter(s=>s.status==='active'&&!['新しい現場','現場名をあとで変更','未登録現場'].includes(s.name)||s.id===chosen).map(s=>")
 s=replace(s,"sites.find(s=>s.name===mainSite)?.id || sites[0]?.id || '';", "sites.find(s=>norm(s.name)===norm(mainSite)&&s.status==='active')?.id || '';\n      window.ToyaSharedSiteUI?.syncBrowse(q('#esSite'));")
 s=replace(s,"q('#esStatus').textContent='登録現場がありません。';", "q('#esStatus').textContent='現場を選んでください。';")
 return s
edit('employee-activity-summary.js',employee)
edit('site-financial-summary.js',lambda s:replace(s,'const matches = sites.filter(s => s.name === siteName);','const matches = sites.filter(s => normal(s.name) === normal(siteName));'))
