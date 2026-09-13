begin;
select set_config('toya.qa_admin','6bed25f2-77bd-4801-a153-93456625de27',true);
select set_config('toya.qa_employee','15f693c1-c1e1-4166-94e0-a3ba10a75449',true);
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('toya.qa_admin'),'role','authenticated')::text,true);

do $$
declare
 company uuid:=public.toya_current_company_id();
 site public.sites;
 result jsonb;
 profile public.site_project_profiles;
 contract public.revenues;
 blocked boolean:=false;
begin
 insert into public.sites(company_id,name,status) values(company,'QA 現場内容 '||substr(gen_random_uuid()::text,1,8),'active') returning * into site;
 insert into public.revenues(company_id,site_id,revenue_type,revenue_date,description,amount)
 values(company,site.id,'contract','2099-01-01','請負金額（税別）',3000000) returning * into contract;
 result:=public.toya_save_site_project_profile(site.id,null,contract.updated_at,4000000,jsonb_build_object(
  'project_category','full_demolition','structure_type','rc','floors_above',3,'floor_area_sqm',300,
  'work_end','2099-09-30','scope_notes','QA施工範囲','exclusion_notes','QA対象外',
  'contract_breakdown',jsonb_build_array(
   jsonb_build_object('label','8月 内部解体','target_month','2099-08','amount',800000,'status','complete','notes',''),
   jsonb_build_object('label','9月 残工事','target_month','2099-09','amount',3200000,'status','planned','notes','')
  )
 ));
 select * into profile from public.site_project_profiles where site_id=site.id;
 select * into contract from public.revenues where site_id=site.id and revenue_type='contract';
 if profile.structure_type<>'rc' or profile.floor_area_sqm<>300 or jsonb_array_length(profile.contract_breakdown)<>2 or contract.amount<>4000000 then raise exception 'FAIL saved profile'; end if;
 begin
  perform public.toya_save_site_project_profile(site.id,null,contract.updated_at,4000000,'{}'::jsonb);
 exception when others then blocked:=sqlerrm like '%更新%'; end;
 if not blocked then raise exception 'FAIL stale profile'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('toya.qa_employee'),'role','authenticated')::text,true);
 blocked:=false;
 begin
  perform public.toya_save_site_project_profile(site.id,profile.updated_at,contract.updated_at,4000000,'{}'::jsonb);
 exception when others then blocked:=sqlstate='42501'; end;
 if not blocked then raise exception 'FAIL employee authorization'; end if;
end $$;
rollback;
