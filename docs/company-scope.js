/* Independent sales browser storage: no internal-company exception. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ToyaCompanyScope=api;})(typeof window==='object'?window:globalThis,function(){
 const company=p=>p?.active===true&&p.company_id?String(p.company_id):'';
 const isLegacy=()=>false;
 const key=(base,p)=>'toya_sales_company_'+encodeURIComponent(company(p)||'signed_out')+'_'+base;
 const photoDB=p=>'TOYAOneSalesPhotoDB_'+encodeURIComponent(company(p)||'signed_out');
 return {legacyCompany:null,company,isLegacy,key,photoDB};
});
