begin;

create or replace function public.toya_rewrite_site_labels(
  p_value jsonb,
  p_old_name text,
  p_new_name text
)
returns jsonb
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  result jsonb;
begin
  if jsonb_typeof(p_value) = 'object' then
    select coalesce(jsonb_object_agg(
      item.key,
      case
        when item.key in ('site', 'travelSite')
          and jsonb_typeof(item.value) = 'string'
          and regexp_replace(normalize(item.value #>> '{}', NFKC), '[[:space:]　]', '', 'g')
            = regexp_replace(normalize(p_old_name, NFKC), '[[:space:]　]', '', 'g')
        then to_jsonb(p_new_name)
        else public.toya_rewrite_site_labels(item.value, p_old_name, p_new_name)
      end
    ), '{}'::jsonb)
    into result
    from jsonb_each(p_value) as item;
    return result;
  end if;

  if jsonb_typeof(p_value) = 'array' then
    select coalesce(jsonb_agg(
      public.toya_rewrite_site_labels(item.value, p_old_name, p_new_name)
      order by item.ordinality
    ), '[]'::jsonb)
    into result
    from jsonb_array_elements(p_value) with ordinality as item(value, ordinality);
    return result;
  end if;

  return p_value;
end;
$$;

revoke all on function public.toya_rewrite_site_labels(jsonb, text, text)
  from public, anon, authenticated;

create or replace function public.toya_rename_shared_site(
  p_site_id uuid,
  p_expected_version integer,
  p_name text
)
returns public.sites
language plpgsql
security definer
set search_path = ''
as $$
declare
  company uuid;
  target public.sites;
  renamed public.sites;
  clean_name text := btrim(p_name);
  normalized_name text;
begin
  select p.company_id into company
  from public.profiles p
  where p.id = auth.uid() and p.role = 'admin' and p.active = true;

  if company is null then
    raise exception '現場名の変更はログイン中の管理者だけが行えます。'
      using errcode = '42501';
  end if;

  if clean_name is null or char_length(clean_name) not between 1 and 120
    or clean_name ~ '[[:cntrl:]]' then
    raise exception '現場名を1〜120文字で入力してください。';
  end if;

  normalized_name := regexp_replace(normalize(clean_name, NFKC), '[[:space:]　]', '', 'g');
  if normalized_name = '' or normalized_name in ('新しい現場', '現場名をあとで変更', '未登録現場') then
    raise exception '仮の名前ではなく実際の現場名を入力してください。';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('toya-shared-sites:' || company::text)
  );

  select s.* into target
  from public.sites s
  where s.id = p_site_id and s.company_id = company
  for update;

  if not found then
    raise exception '変更する現場を確認してください。';
  end if;
  if p_expected_version is null or target.lifecycle_version <> p_expected_version then
    raise exception '現場が更新されています。一覧を更新してから変更してください。';
  end if;
  if regexp_replace(normalize(target.name, NFKC), '[[:space:]　]', '', 'g') = normalized_name then
    return target;
  end if;
  if exists (
    select 1 from public.sites s
    where s.company_id = company and s.id <> target.id
      and regexp_replace(normalize(s.name, NFKC), '[[:space:]　]', '', 'g') = normalized_name
  ) then
    raise exception '同じ現場名がすでに登録されています。';
  end if;

  update public.sites
  set name = clean_name, lifecycle_version = lifecycle_version + 1
  where id = target.id and company_id = company
  returning * into renamed;

  with rewritten as (
    select r.id,
      public.toya_rewrite_site_labels(r.report_data, target.name, clean_name) as report_data
    from public.daily_reports r
    where r.company_id = company
  )
  update public.daily_reports r
  set report_data = rewritten.report_data,
      updated_at = clock_timestamp()
  from rewritten
  where r.id = rewritten.id
    and r.company_id = company
    and r.report_data is distinct from rewritten.report_data;

  update public.estimate_plans
  set site_name = clean_name
  where company_id = company and site_id = target.id
    and site_name is distinct from clean_name;

  return renamed;
end;
$$;

revoke all on function public.toya_rename_shared_site(uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.toya_rename_shared_site(uuid, integer, text)
  to authenticated;

commit;
