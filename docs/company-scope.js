/* Company-specific browser storage. The original TOYA namespace stays intact. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ToyaCompanyScope=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const legacyCompany='40a7a065-1086-4e62-aa09-f44d6207602c';
 const company=p=>p?.active===true&&p.company_id?String(p.company_id):'';
 const isLegacy=p=>company(p)===legacyCompany;
 const key=(base,p)=>isLegacy(p)?base:'toya_company_'+encodeURIComponent(company(p)||'signed_out')+'_'+base;
 const photoDB=p=>isLegacy(p)?'TOYAOnePhotoDB':'TOYAOnePhotoDB_'+encodeURIComponent(company(p)||'signed_out');
 return {legacyCompany,company,isLegacy,key,photoDB};
});
