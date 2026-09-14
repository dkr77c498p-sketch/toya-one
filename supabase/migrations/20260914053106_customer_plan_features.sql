-- Three seller-managed feature tiers. Internal installs retain the full tier.
alter table private.company_licenses add column plan text not null default 'daily'
 check(plan in ('daily','billing','complete'));
update private.company_licenses set plan='complete' where internal;
create function private.toya_has_feature(p_feature text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select case p_feature
 when 'daily' then true
 when 'invoice' then l.internal or l.plan in ('billing','complete')
 when 'estimate' then l.internal or l.plan='complete'
 else false end
 from private.company_licenses l where l.company_id=private.toya_allowed_company()),false);
$$;
revoke all on function private.toya_has_feature(text) from public,anon;
grant execute on function private.toya_has_feature(text) to authenticated;
create function public.toya_has_feature(p_feature text) returns boolean
language sql stable security invoker set search_path='' as $$select private.toya_has_feature(p_feature);$$;
revoke all on function public.toya_has_feature(text) from public,anon;
grant execute on function public.toya_has_feature(text) to authenticated;
create function private.toya_plan_status() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_build_object('plan',case when l.internal then 'complete' else l.plan end,
 'features',jsonb_build_object('daily',private.toya_has_feature('daily'),'invoice',private.toya_has_feature('invoice'),'estimate',private.toya_has_feature('estimate')))
 from public.profiles p join private.company_licenses l on l.company_id=p.company_id where p.id=auth.uid() and p.active),'{}'::jsonb);
$$;
revoke all on function private.toya_plan_status() from public,anon;
grant execute on function private.toya_plan_status() to authenticated;
create or replace function public.toya_access(p_action text default 'status',p_payload jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$declare result jsonb;begin
 result:=private.toya_access(p_action,p_payload);
 return result||private.toya_plan_status();
end $$;
-- Keep the existing tenant/admin/contract checks; these restrictions are ANDed with them.
create policy toya_document_plan on public.project_documents as restrictive for all to authenticated
 using ((kind in ('invoice','progress') and (select public.toya_has_feature('invoice'))) or (kind='estimate' and (select public.toya_has_feature('estimate'))))
 with check ((kind in ('invoice','progress') and (select public.toya_has_feature('invoice'))) or (kind='estimate' and (select public.toya_has_feature('estimate'))));
create policy toya_estimate_plan on public.estimate_plans as restrictive for all to authenticated
 using ((select public.toya_has_feature('estimate'))) with check ((select public.toya_has_feature('estimate')));
create policy toya_quantity_plan on public.estimate_quantity_sheets as restrictive for all to authenticated
 using ((select public.toya_has_feature('estimate'))) with check ((select public.toya_has_feature('estimate')));
