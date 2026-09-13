begin;
select set_config('toya.qa_admin','6bed25f2-77bd-4801-a153-93456625de27',true);
select set_config('toya.qa_employee','15f693c1-c1e1-4166-94e0-a3ba10a75449',true);
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('toya.qa_admin'),'role','authenticated')::text,true);

do $$
declare
  company uuid := public.toya_current_company_id();
  old_name text := 'QA 変更前現場 ' || substr(gen_random_uuid()::text,1,8);
  new_name text := 'QA 変更後現場 ' || substr(gen_random_uuid()::text,1,8);
  site public.sites;
  renamed public.sites;
  report_id uuid := gen_random_uuid();
  plan public.estimate_plans;
  blocked boolean := false;
begin
  insert into public.sites(company_id,name,status)
  values(company,old_name,'active') returning * into site;

  insert into public.daily_reports(id,company_id,site_id,report_date,recorder_name,source_report_id,report_data)
  values(report_id,company,site.id,'2099-01-01','QA',gen_random_uuid()::text,
    jsonb_build_object(
      'site',old_name,
      'details',old_name,
      'siteMoves',jsonb_build_array(jsonb_build_object('site',old_name),jsonb_build_object('site','別現場')),
      'usageHours',jsonb_build_object('entries',jsonb_build_array(jsonb_build_object(
        'travelSite',old_name,
        'allocations',jsonb_build_array(jsonb_build_object('site',old_name,'minutes',60),jsonb_build_object('site','別現場','minutes',0))
      )))
    ));

  plan := public.toya_save_estimate_plan(gen_random_uuid(),null,jsonb_build_object(
    'site_id',site.id,'title','QA 現場名変更','customer_name','QA','groups','[]'::jsonb,'tax_rate',10
  ));

  renamed := public.toya_rename_shared_site(site.id,site.lifecycle_version,new_name);
  if renamed.name<>new_name or renamed.lifecycle_version<>site.lifecycle_version+1 then
    raise exception 'FAIL site row';
  end if;
  if (select report_data->>'site' from public.daily_reports where id=report_id)<>new_name
    or (select report_data#>>'{siteMoves,0,site}' from public.daily_reports where id=report_id)<>new_name
    or (select report_data#>>'{usageHours,entries,0,travelSite}' from public.daily_reports where id=report_id)<>new_name
    or (select report_data#>>'{usageHours,entries,0,allocations,0,site}' from public.daily_reports where id=report_id)<>new_name then
    raise exception 'FAIL report site labels';
  end if;
  if (select report_data->>'details' from public.daily_reports where id=report_id)<>old_name
    or (select report_data#>>'{siteMoves,1,site}' from public.daily_reports where id=report_id)<>'別現場' then
    raise exception 'FAIL unrelated report text';
  end if;
  if (select site_name from public.estimate_plans where id=plan.id)<>new_name then
    raise exception 'FAIL estimate site name';
  end if;

  begin
    perform public.toya_rename_shared_site(site.id,site.lifecycle_version,'QA stale version');
  exception when others then blocked := sqlerrm like '%更新%'; end;
  if not blocked then raise exception 'FAIL stale version'; end if;

  blocked:=false;
  begin
    perform public.toya_rename_shared_site(site.id,null,'QA missing version');
  exception when others then blocked := sqlerrm like '%更新%'; end;
  if not blocked then raise exception 'FAIL missing version'; end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('toya.qa_employee'),'role','authenticated')::text,true);
  blocked:=false;
  begin
    perform public.toya_rename_shared_site(site.id,renamed.lifecycle_version,'QA employee rename');
  exception when others then blocked := sqlstate='42501'; end;
  if not blocked then raise exception 'FAIL employee authorization'; end if;
end $$;

rollback;
