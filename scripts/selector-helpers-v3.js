
 // One catalog for every selector. Names are normalized for display matching only;
 // original report values and distinct database IDs are never merged or rewritten.
 function historyNames(reports){
  return [...new Set(arr(reports).flatMap(d=>[d.site,...arr(d.siteMoves).map(m=>m?.site),...arr(d.usageHours?.entries).flatMap(e=>arr(e.allocations).map(a=>a.site))]).filter(n=>typeof n==='string'&&n.trim()))];
 }
 function browseOptions(catalog,history,current='',byId=false,showHistory=false,empty='現場を選択'){
  const out=[{value:'',label:empty}],seen=new Set();
  const list=arr(catalog).filter(r=>r?.id&&typeof r.name==='string'&&r.name.trim());
  const ordinary=r=>r.status==='active'&&!placeholder(r.name);
  const duplicates=new Map();list.forEach(r=>duplicates.set(norm(r.name),(duplicates.get(norm(r.name))||0)+1));
  function add(r,historical=false){
   const id=byId?String(r.id):norm(r.name);if(seen.has(id))return;
   seen.add(id);out.push({value:byId?String(r.id):r.name,label:r.name+(historical?'（過去・未整理）':'')+(byId&&duplicates.get(norm(r.name))>1?'［ID末尾 '+String(r.id).slice(-6)+'］':'')});
  }
  list.filter(ordinary).sort((a,b)=>a.name.localeCompare(b.name,'ja')).forEach(r=>add(r));
  if(showHistory){
   list.filter(r=>!ordinary(r)).sort((a,b)=>a.name.localeCompare(b.name,'ja')).forEach(r=>add(r,true));
   if(!byId)arr(history).filter(n=>typeof n==='string'&&n.trim()).forEach(n=>add({id:'history:'+n,name:n},true));
  }
  if(current){
   const known=list.find(r=>byId?String(r.id)===current:norm(r.name)===norm(current));
   if(known)add(known,!ordinary(known));
   else if(!byId)add({id:'retained',name:current},true);
   if(!byId){const found=out.find(o=>norm(o.value)===norm(current));if(found)found.value=current;}
  }
  return out;
 }
//===BROWSER===

 const selectSpecs={siteSummarySelect:[false,'現場を選択'],ledgerSite:[false,'現場を選択'],recordSiteFilter:[false,'全現場'],lcSite:[true,'現場を選択'],vcSite:[true,'現場を選択'],ecSite:[true,'現場を選択'],esSite:[true,'現場を選択']};
 const ready=()=>!!identity()&&owner===identity()&&loaded;
 const reportHistory=()=>historyNames(typeof cloudReportsCache!=='undefined'?cloudReportsCache:[]);
 function replaceOptions(sel,os,current){
  const before=[...sel.options].map(o=>({value:o.value,label:o.textContent}));
  if(JSON.stringify(before)!==JSON.stringify(os))sel.replaceChildren(...os.map(o=>new Option(o.label,o.value)));
  sel.value=os.some(o=>o.value===current)?current:'';
 }
 function historyToggle(sel){
  const id='ssHistory-'+sel.id;let box=document.getElementById(id);
  if(!box){
   box=document.createElement('div');box.id=id;box.className='ss-history';
   const label=document.createElement('label'),input=document.createElement('input');
   input.type='checkbox';input.checked=sel.dataset.ssHistory==='true';
   label.append(input,document.createTextNode('過去・未整理の現場も表示'));box.append(label);
   const anchor=sel.parentElement?.tagName==='LABEL'?sel.parentElement:sel;anchor.after(box);
   input.addEventListener('change',()=>{sel.dataset.ssHistory=String(input.checked);syncBrowse(sel,true);});
  }
 }
 function syncBrowse(sel,force=false,current=sel?.value||''){
  if(!sel||!selectSpecs[sel.id]||!ready())return false;
  historyToggle(sel);
  if(!force&&document.activeElement===sel)return true;
  const [byId,empty]=selectSpecs[sel.id],show=sel.dataset.ssHistory==='true';
  const os=browseOptions(rows,reportHistory(),current,byId,show,empty);
  // Retain a selected ID even if a refreshed catalog no longer contains it.
  // Cost editors will reject an unknown ID rather than save to a different site.
  if(current&&byId&&!os.some(o=>o.value===current))os.push({value:current,label:(sel.selectedOptions[0]?.textContent||'現場未確認')+'（選択を保持）'});
  replaceOptions(sel,os,current);return true;
 }
 window.ToyaSharedSiteUI=Object.freeze({ready,syncBrowse,norm,same:(a,b)=>norm(a)===norm(b)});
