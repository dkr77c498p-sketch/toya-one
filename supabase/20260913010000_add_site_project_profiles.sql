begin;

create table public.site_project_profiles (
  site_id uuid primary key references public.sites(id) on delete cascade,
  company_id uuid not null references public.companies(id),
  project_category text not null default ''
    check (project_category in ('','full_demolition','interior_demolition','skeleton','renovation','exterior','pavement','clearing','other')),
  structure_type text not null default ''
    check (structure_type in ('','wood','steel','rc','src','mixed','none','other')),
  floors_above integer check (floors_above between 0 and 100),
  floors_below integer check (floors_below between 0 and 20),
  floor_area_sqm numeric(12,3) check (floor_area_sqm between 0 and 100000000),
  site_area_sqm numeric(12,3) check (site_area_sqm between 0 and 100000000),
  foundation_volume_m3 numeric(12,3) check (foundation_volume_m3 between 0 and 100000000),
  work_start date,
  work_end date,
  scope_notes text not null default '' check (length(scope_notes) <= 5000),
  exclusion_notes text not null default '' check (length(exclusion_notes) <= 5000),
  contract_breakdown jsonb not null default '[]'::jsonb
    check (jsonb_typeof(contract_breakdown) = 'array' and jsonb_array_length(contract_breakdown) <= 48 and octet_length(contract_breakdown::text) <= 30000),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (work_start is null or work_end is null or work_end >= work_start)
);

create index site_project_profiles_company_idx
  on public.site_project_profiles(company_id, updated_at desc, site_id);

alter table public.site_project_profiles enable row level security;
revoke all on table public.site_project_profiles from public, anon, authenticated;
grant select, insert, update on table public.site_project_profiles to authenticated;
grant all on table public.site_project_profiles to service_role;

create policy site_project_profiles_admin on public.site_project_profiles
for all to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.company_id = site_project_profiles.company_id
      and p.active and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    join public.sites s on s.company_id = p.company_id
    where p.id = (select auth.uid())
      and p.company_id = site_project_profiles.company_id
      and p.active and p.role = 'admin'
      and s.id = site_project_profiles.site_id
  )
);

create function public.toya_site_project_profile_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  item_amount numeric;
begin
  if not exists (
    select 1 from public.profiles p
    join public.sites s on s.company_id = p.company_id
    where p.id = auth.uid() and p.active and p.role = 'admin'
      and p.company_id = new.company_id and s.id = new.site_id
  ) then
    raise exception '管理者として現場を確認してください。' using errcode = '42501';
  end if;
  if jsonb_typeof(new.contract_breakdown) is distinct from 'array'
    or jsonb_array_length(new.contract_breakdown) > 48
    or octet_length(new.contract_breakdown::text) > 30000 then
    raise exception '契約内訳は48件までです。';
  end if;
  for item in select value from jsonb_array_elements(new.contract_breakdown) loop
    if jsonb_typeof(item) is distinct from 'object'
      or length(btrim(coalesce(item->>'label',''))) not between 1 and 160
      or coalesce(item->>'target_month','') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      or coalesce(item->>'status','') not in ('planned','complete')
      or jsonb_typeof(item->'amount') is distinct from 'number' then
      raise exception '月別の契約内訳を確認してください。';
    end if;
    item_amount := (item->>'amount')::numeric;
    if item_amount < 0 or item_amount > 999999999999 or trunc(item_amount) <> item_amount
      or length(coalesce(item->>'notes','')) > 1000 then
      raise exception '契約内訳の金額または備考を確認してください。';
    end if;
  end loop;
  if tg_op = 'INSERT' then new.created_at := clock_timestamp(); end if;
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end;
$$;

revoke all on function public.toya_site_project_profile_guard()
  from public, anon, authenticated;
create trigger site_project_profiles_guard
before insert or update on public.site_project_profiles
for each row execute function public.toya_site_project_profile_guard();

create function public.toya_save_site_project_profile(
  p_site_id uuid,
  p_expected_updated_at timestamptz,
  p_expected_contract_updated_at timestamptz,
  p_contract_amount numeric,
  p_profile jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  company uuid;
  existing public.site_project_profiles;
  value public.site_project_profiles;
  saved public.site_project_profiles;
  contract public.revenues;
begin
  select p.company_id into company
  from public.profiles p
  where p.id = auth.uid() and p.active and p.role = 'admin';
  if company is null then
    raise exception '管理者としてログインしてください。' using errcode = '42501';
  end if;
  if not exists (select 1 from public.sites s where s.id = p_site_id and s.company_id = company) then
    raise exception '現場を確認してください。';
  end if;
  if p_contract_amount is null or p_contract_amount < 0 or p_contract_amount > 999999999999
    or trunc(p_contract_amount) <> p_contract_amount then
    raise exception '請負金額を1円単位で入力してください。';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(company::text, 0));
  value := jsonb_populate_record(null::public.site_project_profiles, coalesce(p_profile, '{}'::jsonb));

  select * into existing from public.site_project_profiles
  where site_id = p_site_id and company_id = company for update;
  if found then
    if existing.updated_at is distinct from p_expected_updated_at then
      raise exception '現場内容が更新されています。読み直してください。';
    end if;
    update public.site_project_profiles set
      project_category = coalesce(value.project_category,''),
      structure_type = coalesce(value.structure_type,''),
      floors_above = value.floors_above,
      floors_below = value.floors_below,
      floor_area_sqm = value.floor_area_sqm,
      site_area_sqm = value.site_area_sqm,
      foundation_volume_m3 = value.foundation_volume_m3,
      work_start = value.work_start,
      work_end = value.work_end,
      scope_notes = coalesce(value.scope_notes,''),
      exclusion_notes = coalesce(value.exclusion_notes,''),
      contract_breakdown = coalesce(value.contract_breakdown,'[]'::jsonb)
    where site_id = p_site_id and company_id = company
    returning * into saved;
  else
    if p_expected_updated_at is not null then
      raise exception '元の現場内容を確認できません。';
    end if;
    insert into public.site_project_profiles(
      site_id, company_id, project_category, structure_type, floors_above, floors_below,
      floor_area_sqm, site_area_sqm, foundation_volume_m3, work_start, work_end,
      scope_notes, exclusion_notes, contract_breakdown, updated_by
    ) values (
      p_site_id, company, coalesce(value.project_category,''), coalesce(value.structure_type,''),
      value.floors_above, value.floors_below, value.floor_area_sqm, value.site_area_sqm,
      value.foundation_volume_m3, value.work_start, value.work_end, coalesce(value.scope_notes,''),
      coalesce(value.exclusion_notes,''), coalesce(value.contract_breakdown,'[]'::jsonb), auth.uid()
    ) returning * into saved;
  end if;

  select * into contract from public.revenues
  where company_id = company and site_id = p_site_id and revenue_type = 'contract' for update;
  if found then
    if contract.updated_at is distinct from p_expected_contract_updated_at then
      raise exception '請負金額が更新されています。読み直してください。';
    end if;
    update public.revenues set amount = p_contract_amount,
      description = '請負金額（税別）', updated_at = clock_timestamp()
    where id = contract.id returning * into contract;
  else
    if p_expected_contract_updated_at is not null then
      raise exception '元の請負金額を確認できません。';
    end if;
    insert into public.revenues(company_id, site_id, revenue_type, revenue_date, description, amount)
    values(company, p_site_id, 'contract', (current_timestamp at time zone 'Asia/Tokyo')::date,
      '請負金額（税別）', p_contract_amount)
    returning * into contract;
  end if;

  return jsonb_build_object('profile', to_jsonb(saved), 'contract', to_jsonb(contract));
end;
$$;

revoke all on function public.toya_save_site_project_profile(uuid,timestamptz,timestamptz,numeric,jsonb)
  from public, anon, authenticated;
grant execute on function public.toya_save_site_project_profile(uuid,timestamptz,timestamptz,numeric,jsonb)
  to authenticated;

commit;
