/* Saved daily-report usage only. Catalog order, storage locations and other
 * machines on the same report do not establish usage or a mounted attachment. */
(() => {
 'use strict';
 const arr=v=>Array.isArray(v)?v:[];
 const label=v=>typeof v==='string'?v:String(v?.name||'');
 const clean=v=>label(v).normalize('NFKC').replace(/\s*×\s*\d+(?:\.\d+)?(?:台|本|個)\s*$/,'').trim();
 const key=v=>clean(v).replace(/[\s　]/g,'').toLowerCase();
 const text=v=>typeof v==='string'?v.trim():'';
 function sitesUsed(report,item,leased){
  const entry=!leased&&arr(report.usageHours?.entries).find(e=>['attachment','tool'].includes(e?.kind)&&key(e.label)===key(item));
  const allocations=arr(entry?.allocations);
  const known=a=>a?.minutes!==null&&a?.minutes!==undefined&&a?.minutes!==''&&Number.isFinite(Number(a.minutes));
  const positive=allocations.filter(a=>known(a)&&Number(a.minutes)>0).map(a=>text(a.site)).filter(Boolean);
  if(positive.length)return positive;
  if(allocations.length&&allocations.every(a=>known(a)&&Number(a.minutes)===0))return [];
  return [text(report.site)||text(report.sites?.name)||'現場未記録'];
 }
 function project(reports,master=[]){
  const catalog=new Map(arr(master).map(x=>[key(x),x]));
  const usage=new Map();
  for(const report of arr(reports)){
   if(!report)continue;
   const date=text(report.date)||text(report.report_date);
   const add=(item,leased)=>{
    const name=clean(item)||text(item?.model);
    if(!name)return;
    const sites=sitesUsed(report,item,leased);
    if(!sites.length)return;
    const company=leased?text(item?.company):'';
    const model=leased?text(item?.model):'';
    const id=JSON.stringify([leased,key(name),key(model),key(company)]);
    let row=usage.get(id);
    if(!row||date>row.date){
     row={id,name,leased,company,model,category:leased?'':text(catalog.get(key(name))?.category),date,sites:[],mounts:[]};
     usage.set(id,row);
    }
    if(date!==row.date)return;
    for(const site of sites)if(!row.sites.includes(site))row.sites.push(site);
    // Only an explicit per-item report field is evidence of mounting at that time.
    const mount=text(item?.mountedOn)||(leased?text(item?.machine):'');
    if(mount&&!['なし','未装着','—','-'].includes(mount)&&!row.mounts.includes(mount))row.mounts.push(mount);
   };
   arr(report.attachments).forEach(item=>add(item,false));
   arr(report.leaseAttachments).forEach(item=>add(item,true));
  }
  return [...usage.values()].sort((a,b)=>b.date.localeCompare(a.date)||a.name.localeCompare(b.name,'ja'));
 }
 const api={project};
 if(typeof module==='object'&&module.exports){module.exports=api;return;}
 window.ToyaAttachmentUsage=api;
 const q=s=>document.querySelector(s);
 let request=0,identity='';
 const profile=()=>typeof cloudProfile==='undefined'?null:cloudProfile;
 const profileKey=()=>{const p=profile();return p?JSON.stringify([p.id,p.company_id,p.role,p.active]):'';};
 function clear(){
  for(const id of ['#attachmentList','#leasedAttachmentList'])q(id)?.replaceChildren();
  for(const id of ['#attachmentCount','#leasedAttachmentCount'])if(q(id))q(id).textContent='0';
 }
 function status(message){if(q('#attachmentUsageStatus'))q('#attachmentUsageStatus').textContent=message;}
 function paint(rows){
  const node=(cls,value)=>{const el=document.createElement('div');el.className=cls;el.textContent=value;return el;};
  for(const leased of [false,true]){
   const list=q(leased?'#leasedAttachmentList':'#attachmentList');
   if(!list)continue;
   list.replaceChildren();
   const items=rows.filter(r=>r.leased===leased);
   const count=q(leased?'#leasedAttachmentCount':'#attachmentCount');if(count)count.textContent=String(items.length);
   for(const row of items){
    const card=node('record','');card.dataset.usageKey=row.id;
    const name=[row.name,row.model&&key(row.model)!==key(row.name)?row.model:''].filter(Boolean).join(' ');
    card.append(node('record-title',[row.category,name].filter(Boolean).join('　')));
    card.append(node('record-meta','最終使用日：'+(row.date||'日付未記録')));
    card.append(node('record-meta','使用現場：'+row.sites.join(' ／ ')));
    if(row.company)card.append(node('record-meta','リース会社：'+row.company));
    if(row.mounts.length)card.append(node('record-meta','使用時の装着先：'+row.mounts.join(' ／ ')));
    list.append(card);
   }
   if(!items.length)list.append(node('empty','日報の使用記録はまだありません。'));
  }
 }
 api.render=async()=>{
  const token=++request,who=profileKey(),p=profile();identity=who;
  const current=()=>token===request&&who===profileKey();
  clear();
  if(!p?.company_id||p.active===false){status('ログインすると日報の使用記録を表示します。');return;}
  status('日報の使用記録を読み込み中…');
  try{
   if(typeof cloudClient==='undefined'||!cloudClient)throw new Error('未接続');
   const reports=[];
   // Read just the usage fields, in a stable order, across the entire saved history.
   for(let start=0;;start+=500){
    const {data,error}=await cloudClient.from('daily_reports')
     .select('id,report_date,site:report_data->>site,attachments:report_data->attachments,leaseAttachments:report_data->leaseAttachments,usageHours:report_data->usageHours,sites(name)')
     .eq('company_id',p.company_id).order('id',{ascending:true}).range(start,start+499);
    if(!current())return;
    if(error)throw error;
    if(!Array.isArray(data))throw new Error('日報を取得できませんでした');
    reports.push(...data);
    if(data.length<500)break;
   }
   const master=typeof get==='function'&&typeof LS!=='undefined'?get(LS.attachments,[]):[];
   const rows=project(reports,master);
   if(!current())return;
   paint(rows);status('保存済み日報の最新の使用記録です。');
  }catch(error){
   if(!current())return;
   clear();status('使用記録を読み込めませんでした。「使用記録を更新」を押して再度お試しください。');
  }
 };
 api.sessionChanged=()=>{
  if(identity===profileKey())return;
  ++request;identity=profileKey();clear();status('');
  if(q('#attachmentPage')?.classList.contains('active'))api.render();
 };
})();
