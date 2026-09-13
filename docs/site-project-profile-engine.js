/* Pure helpers for TOYA One site project profiles. */
(() => {
 'use strict';
 const number=value=>{
  if(value===null||value===undefined||String(value).trim()==='')return null;
  const n=Number(value);return Number.isFinite(n)?n:null;
 };
 const fixed=(value,places=3)=>{const n=number(value);return n===null?'':String(Number(n.toFixed(places)));};
 const sqmToTsubo=value=>{const n=number(value);return n===null?'':fixed(n/3.305785,3);};
 const tsuboToSqm=value=>{const n=number(value);return n===null?'':fixed(n*3.305785,3);};
 const breakdown=value=>Array.isArray(value)?value:[];
 const totals=(rows,contract)=>{
  const total=breakdown(rows).reduce((sum,row)=>sum+(number(row?.amount)||0),0),c=number(contract);
  return {total,difference:c===null?null:c-total,matches:c!==null&&c===total};
 };
 const api={number,fixed,sqmToTsubo,tsuboToSqm,breakdown,totals};
 if(typeof module==='object'&&module.exports){module.exports=api;return;}
 window.ToyaSiteProjectProfileEngine=Object.freeze(api);
})();
