/* Report snapshots keep historical dispatch names and stable IDs. */
(function(root){
 'use strict';const arr=v=>Array.isArray(v)?v:[],norm=v=>String(v||'').normalize('NFKC').replace(/[\s　]/g,'').toLowerCase();
 function entries(d={}){const map=new Map([['meiken',{id:'meiken',name:'旧派遣枠1',count:Number(d.meikenCount||0)}],['asahi',{id:'asahi',name:'旧派遣枠2',count:Number(d.asahiCount||0)}]]);for(const e of arr(d.dispatchWorkers))if(e?.id&&e.name&&!['meiken','asahi'].includes(e.id))map.set(e.id,{id:String(e.id),name:String(e.name),count:Number(e.count||0)});return [...map.values()];}
 const count=(d,id)=>entries(d).find(e=>e.id===id)?.count??0;
 const code=(d,name)=>(entries(d).find(e=>norm(e.name)===norm(name)&&e.count>0)||entries(d).find(e=>norm(e.name)===norm(name)))?.id||'';
 const api={entries,count,code,total:d=>entries(d).reduce((n,e)=>n+e.count,0),catalog:reports=>[...new Map(arr(reports).flatMap(r=>entries(r.report_data||r)).map(e=>[e.id,e])).values()]};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.ToyaDispatchCatalog=api;
})(typeof window==='undefined'?globalThis:window);
