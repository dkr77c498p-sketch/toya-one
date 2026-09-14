(() => {
 'use strict';const D=window.ToyaDispatchCatalog,q=s=>document.querySelector(s),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let state={},travel={},installed=false,owner='';
 const identity=()=>typeof cloudProfile!=='undefined'&&cloudProfile?.active===true&&!companyTransition?cloudProfile.id+':'+cloudProfile.company_id:'';
 function render(){
  if(!q('#customDispatch'))return;
  const id=identity();if(owner!==id){owner=id;state={};travel={};}
  const legacy=q('#meikenCount')?.closest('.row');if(legacy)legacy.hidden=!isToyaCompany();
  const registered=window.ToyaCompanyRegistry?.dispatch?.()||[];
  for(const e of registered)if(!state[e.id])state[e.id]={id:e.id,name:e.name,count:0};else if(!state[e.id].count)state[e.id].name=e.name;
  for(const [id,e] of Object.entries(state))if(!registered.some(r=>r.id===id)&&!e.count)delete state[id];
  const host=q('#customDispatch');
  host.innerHTML='<h3>応援・派遣会社</h3>'+(!Object.keys(state).length?'<p class="note">必要な場合は、管理者が「登録管理」の「派遣会社」から追加してください。</p>':'')+Object.values(state).map(e=>'<div class="row" data-dispatch-id="'+esc(e.id)+'"><label>'+esc(e.name)+'の人数<input class="custom-dispatch-count" id="dispatchCount-'+esc(e.id)+'" data-dispatch-field="count" type="number" min="0" max="1000" step="1" value="'+esc(e.count)+'"></label><details><summary>通勤台数・交通費</summary><label>通勤車両の台数<input data-dispatch-travel="vehicles" type="number" min="0" max="100" step="1" value="'+esc(travel[e.id]?.vehicles??'')+'" placeholder="未入力"></label><label>通勤区分<select data-dispatch-travel="area"><option value="city"'+(travel[e.id]?.area!=='outside'?' selected':'')+'>市内</option><option value="outside"'+(travel[e.id]?.area==='outside'?' selected':'')+'>市外</option></select></label><label>高速代の合計（円）<input data-dispatch-travel="highway" type="number" min="0" value="'+esc(travel[e.id]?.highway??'')+'" placeholder="利用なしは0"></label><label>交通費の合計を手入力（円・任意）<input data-dispatch-travel="manualTravel" type="number" min="0" value="'+esc(travel[e.id]?.manualTravel??'')+'" placeholder="市外は合計額を入力"></label><p class="note">高速代は交通費に含めず入力します。単価が未登録の場合、金額は要確認になります。</p></details></div>').join('');
  document.dispatchEvent(new CustomEvent('toya-dispatch-rendered'));
 }
 function install(){if(installed||!q('#meikenCount')||typeof collect!=='function')return;installed=true;const el=document.createElement('div');el.id='customDispatch';q('#meikenCount').closest('.row').after(el);
  el.addEventListener('input',e=>{const row=e.target.closest('[data-dispatch-id]');if(!row)return;const id=row.dataset.dispatchId;if(e.target.dataset.dispatchField)state[id].count=Number(e.target.value||0);if(e.target.dataset.dispatchTravel){if(!travel[id])travel[id]={area:'city',vehicles:null,highway:null,manualTravel:null,memo:''};travel[id][e.target.dataset.dispatchTravel]=e.target.dataset.dispatchTravel==='area'?e.target.value:e.target.value===''?null:Number(e.target.value);}document.dispatchEvent(new CustomEvent('toya-dispatch-input'));});
  const oldCollect=window.collect;window.collect=function(){const d=oldCollect.apply(this,arguments);d.dispatchWorkers=Object.values(state).filter(e=>e.count!==0).map(e=>({...e}));d.dispatchTravel={...(d.dispatchTravel||{}),...structuredClone(travel)};return d;};
  const fill=window.fillReportForm;window.fillReportForm=function(d,mode){const out=fill.apply(this,arguments);state=Object.fromEntries((d.dispatchWorkers||[]).map(e=>[e.id,{...e}]));travel=Object.fromEntries(Object.entries(structuredClone(d.dispatchTravel||{})).filter(([k])=>!['meiken','asahi'].includes(k)));owner=identity();render();return out;};
  const clear=window.clearReportFormDynamic;window.clearReportFormDynamic=function(){state={};travel={};const r=clear.apply(this,arguments);render();return r;};
  const validate=window.validate;window.validate=function(d){if(!validate.apply(this,arguments))return false;for(const e of d.dispatchWorkers||[]){if(!Number.isInteger(e.count)||e.count<0||e.count>1000){alert(e.name+'の人数は0〜1000人の整数で入力してください。');return false;}const err=window.ToyaDispatchTravelEngine.invalid(window.ToyaDispatchTravelEngine.decode(d.dispatchTravel?.[e.id]));if(err){alert(e.name+'：'+err);return false;}}return true;};
  render();
 }
 window.ToyaCompanyDispatch={entries:()=>Object.values(state).filter(e=>e.count!==0).map(e=>({...e}))};
 function start(){install();document.addEventListener('toya-company-registry-updated',render);setInterval(()=>{if(owner!==identity())render();},1000);}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
