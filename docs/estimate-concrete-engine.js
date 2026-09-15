(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ToyaConcreteEstimate=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const source={id:'hashimoto-terashima-1999-table4-v1',title:'建築物解体廃棄物の原単位設定',year:1999,table:'Table 4',url:'https://doi.org/10.3985/jswme.10.35'};
 // Table 4: W-out (demolition waste) where available; otherwise W-in
 // (material input), as discussed in section 5.2. Units are kg / gross m².
 // These are historical sample means, not floor-specific prediction limits.
 const factors={
  wood:{all:{kg:205,n:21,basis:'out'}},
  steel:{residential:{kg:521,n:1,basis:'out'},office:{kg:843,n:4,basis:'in'},other:{kg:539,n:3,basis:'in'}},
  rc:{residential:{kg:1133,n:5,basis:'out'},office:{kg:1663,n:4,basis:'in'},other:{kg:1638,n:5,basis:'in'}},
  src:{residential:{kg:1369,n:3,basis:'in'},office:{kg:1856,n:3,basis:'in'},other:{kg:1717,n:2,basis:'in'}}
 };
 const kinds={wood:'木造',lightSteel:'軽量鉄骨造（S造係数を参照）',steel:'S造',rc:'RC造',src:'SRC造'};
 const uses={residential:'住宅',office:'事務所',shop:'店舗',factory:'工場',warehouse:'倉庫',other:'その他'};
 const round=n=>Math.round((n+Number.EPSILON)*1000)/1000;
 const blank=v=>v===null||v===undefined||String(v).trim()==='';
 function nonnegative(value,label){if(blank(value))return null;const n=Number(value);if(!Number.isFinite(n)||n<0)throw new Error(label+'は0以上の数値で入力してください。');return n;}
 function grossArea(a){
  const area=nonnegative(a.area_m2,'建物面積')||0;
  if(a.area_basis!=='typical')return area;
  const floors=Number(a.floors);if(!Number.isInteger(floors)||floors<1)throw new Error('各階面積から概算する場合は、階数を1以上の整数で入力してください。');
  return round(area*floors);
 }
 function estimate(a){
  const area=grossArea(a),base={area_m2:area,quantity:null,unit:'t',source:null};
  if(a.concrete_mode==='manual'){
   const quantity=nonnegative(a.concrete_quantity,'コンクリート数量'),basis=['solid_m3','loose_m3'].includes(a.concrete_unit)?a.concrete_unit:'t';
   return {...base,quantity,unit:basis==='t'?'t':'m³',volume_basis:basis,method:'manual',label:'現場の拾い数量',description:basis==='solid_m3'?'実体積':basis==='loose_m3'?'搬出時のかさ体積':'重量',reason:quantity===null?'コンクリート数量を入力してください。':''};
  }
  if(a.kind==='interior')return {...base,skip:true,reason:'内部解体は建物全体の係数を適用しません。必要な数量を手入力できます。'};
  if(a.concrete_scope==='partial')return {...base,reason:'部分解体は対象範囲のコンクリート数量を手入力してください。'};
  if(!area)return {...base,skip:true,reason:'建物面積を入力すると参考数量を計算します。'};
  const kind=a.kind==='lightSteel'?'steel':a.kind,use=a.use??'residential';
  // Keep the selected use, while these new choices share the existing
  // "other" reference bucket. Do not invent a use-specific coefficient.
  const referenceUse=kind==='wood'?'all':['shop','factory','warehouse'].includes(use)?'other':use;
  const factor=factors[kind]?.[referenceUse];
  if(!factor)return {...base,reason:'この構造・用途の係数は未登録です。用途を確認するか数量を手入力してください。'};
  const label=kinds[a.kind]+'／'+(kind==='wood'?'用途区分なし':uses[use]+(referenceUse!==use?'（「その他」の共通参考値）':'')),description=factor.basis==='out'?'分別されたコンクリート排出量の平均':'資材投入量の平均で代用';
  return {...base,quantity:round(area*factor.kg/1000),factor_kg_m2:factor.kg,sample_count:factor.n,reference_use:referenceUse,method:factor.basis,label,description,source:{...source}};
 }
 return {source,factors,kinds,uses,grossArea,estimate,nonnegative};
});
