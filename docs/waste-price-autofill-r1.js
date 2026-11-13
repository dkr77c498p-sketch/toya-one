/* Remember the last waste facility/item and make master-created report rows unmistakably automatic. */
(() => {
 'use strict';
 if(window.__toyaWastePriceAutofillR1)return;
 window.__toyaWastePriceAutofillR1=true;
 const q=(selector,root=document)=>root.querySelector(selector);
 const company=()=>typeof cloudProfile!=='undefined'&&cloudProfile?.company_id?cloudProfile.company_id:'';
 const key=()=>company()?'toya-waste-last:v1:'+company():'';
 let restoring=false,installed=false,timer=null;
 function readSaved(){
  try{const raw=key()&&localStorage.getItem(key());const value=raw?JSON.parse(raw):null;return value&&typeof value==='object'?value:{};}catch{return {};}
 }
 function save(){
  const storage=key(),facility=q('#wpmFacility'),rate=q('#wpmRate'),unit=q('#wpmQtyUnit');
  if(!storage||!facility||!rate)return;
  try{localStorage.setItem(storage,JSON.stringify({facility:facility.value,rateId:rate.value,unit:unit?.value||''}));}catch{}
 }
 function actualOptions(select){return [...(select?.options||[])].filter(option=>option.value);}
 function lastWasteFromForm(){
  const rows=[...document.querySelectorAll('#items .item[data-is-waste="1"],#items .waste-item')];
  const row=rows.at(-1);if(!row)return {};
  return {facility:q('.i-company',row)?.value||'',item:(q('.i-name',row)?.value||'').replace(/^産廃：/,'').replace(/（.*）$/,'')};
 }
 function chooseRateByItem(rate,item){
  const normalized=String(item||'').normalize('NFKC').replace(/[\s　]/g,'');
  if(!normalized)return '';
  const found=actualOptions(rate).find(option=>String(option.textContent||'').normalize('NFKC').replace(/[\s　]/g,'').startsWith(normalized));
  return found?.value||'';
 }
 function restore(){
  if(restoring)return;
  const facility=q('#wpmFacility'),rate=q('#wpmRate');
  if(!facility||!rate||!actualOptions(facility).length)return;
  restoring=true;
  const saved=readSaved(),fromRow=lastWasteFromForm();
  const facilityValue=actualOptions(facility).some(option=>option.value===saved.facility)?saved.facility:
    actualOptions(facility).some(option=>option.value===fromRow.facility)?fromRow.facility:
    actualOptions(facility).length===1?actualOptions(facility)[0].value:'';
  if(facilityValue&&facility.value!==facilityValue){facility.value=facilityValue;facility.dispatchEvent(new Event('change',{bubbles:true}));}
  setTimeout(()=>{
   const currentRate=q('#wpmRate'),unit=q('#wpmQtyUnit');
   if(currentRate){
    let rateValue=actualOptions(currentRate).some(option=>option.value===saved.rateId)?saved.rateId:chooseRateByItem(currentRate,fromRow.item);
    if(!rateValue&&actualOptions(currentRate).length===1)rateValue=actualOptions(currentRate)[0].value;
    if(rateValue&&currentRate.value!==rateValue){currentRate.value=rateValue;currentRate.dispatchEvent(new Event('change',{bubbles:true}));}
   }
   if(unit&&saved.unit&&[...unit.options].some(option=>option.value===saved.unit)){unit.value=saved.unit;unit.dispatchEvent(new Event('change',{bubbles:true}));}
   restoring=false;if(facilityValue||currentRate?.value)save();
  },0);
 }
 function decorateLastRow(){
  const rows=[...document.querySelectorAll('#items .item[data-is-waste="1"],#items .waste-item')],row=rows.at(-1);
  if(!row)return;
  const name=q('.i-name',row),companyInput=q('.i-company',row),unit=q('.i-unit',row),price=q('.i-price',row);
  for(const input of [name,companyInput])if(input?.value){input.readOnly=true;input.style.background='#f3f3f3';input.setAttribute('aria-label',(input===name?'品目':'処分場')+'（単価マスターから自動反映）');}
  if(price){price.readOnly=true;price.style.background='#f3f3f3';}
  const facility=q('#wpmFacility')?.selectedOptions?.[0]?.textContent?.trim()||companyInput?.value||'';
  const rateText=q('#wpmRate')?.selectedOptions?.[0]?.textContent?.trim()||name?.value||'';
  let note=q('.wpm-auto-note',row);
  if(!note){note=document.createElement('div');note.className='note wpm-auto-note';note.style.marginTop='7px';row.append(note);}
  note.textContent='自動反映｜処分場：'+facility+'｜品目・単価：'+rateText+'｜数量を変えると金額も自動変更';
  row.dataset.wpmAutofill='1';
  save();
  const qty=q('#wpmQty');if(qty){qty.value='1';qty.dispatchEvent(new Event('input',{bubbles:true}));}
 }
 function addHint(){
  const card=q('#wastePriceCard');if(!card||q('#wpmRememberHint',card))return;
  const hint=document.createElement('div');hint.id='wpmRememberHint';hint.className='note';hint.style.marginTop='8px';hint.textContent='前回使った処分場・品目は次回から自動表示します。追加後の品目・処分場・単価・金額も日報へ自動反映します。';
  q('#wpmAdd',card)?.after(hint);
 }
 function install(){
  const facility=q('#wpmFacility'),rate=q('#wpmRate'),add=q('#wpmAdd');
  if(!facility||!rate||!add){clearTimeout(timer);timer=setTimeout(install,500);return;}
  addHint();
  if(!installed){
   installed=true;
   facility.addEventListener('change',()=>{if(!restoring){save();setTimeout(restore,0);}});
   rate.addEventListener('change',()=>{if(!restoring)save();});
   q('#wpmQtyUnit')?.addEventListener('change',()=>{if(!restoring)save();});
   add.addEventListener('click',()=>setTimeout(decorateLastRow,60));
   const observer=new MutationObserver(()=>{addHint();restore();});observer.observe(facility,{childList:true});observer.observe(rate,{childList:true});
   document.addEventListener('toya-role-changed',()=>setTimeout(restore,300));
  }
  restore();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
