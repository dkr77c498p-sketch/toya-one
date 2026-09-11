-- Original estimate quantities are private company references, not actual costs.
create function public.toya_validate_quantity_groups(p_groups jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare g jsonb; r jsonb; k text; n integer:=0; v text;
begin
 if jsonb_typeof(p_groups) is distinct from 'array' or jsonb_array_length(p_groups)>100 then return false; end if;
 for g in select value from jsonb_array_elements(p_groups) loop
  if jsonb_typeof(g) is distinct from 'object' or nullif(btrim(g->>'name'),'') is null or length(g->>'name')>200 or jsonb_typeof(g->'lines') is distinct from 'array' then return false; end if;
  n:=n+jsonb_array_length(g->'lines');if n>300 then return false; end if;
  for r in select value from jsonb_array_elements(g->'lines') loop
   if jsonb_typeof(r) is distinct from 'object' or nullif(btrim(r->>'label'),'') is null or length(r->>'label')>200 or length(coalesce(r->>'unit',''))>20 or length(coalesce(r->>'notes',''))>2000 or length(coalesce(r->>'section',''))>200 then return false; end if;
   v:=nullif(r->>'quantity','');if v is not null and (v !~ '^[0-9]+(\.[0-9]{1,3})?$') then return false; end if;
   if v is not null and v::numeric>1000000 then return false; end if;
   foreach k in array array['quoted_unit_price','quoted_amount'] loop
    v:=nullif(r->>k,'');if v is not null and v !~ '^-?[0-9]+(\.[0-9]{1,2})?$' then return false; end if;
    if v is not null and abs(v::numeric)>999999999999 then return false; end if;
   end loop;
   if coalesce(r->>'row_kind','work') not in ('work','allowance','adjustment') then return false; end if;
   if coalesce(r->>'source_page','') !~ '^[1-9][0-9]{0,3}$' then return false; end if;
  end loop;
 end loop;
 return n>0;
end $$;

create table public.estimate_quantity_sheets (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 title text not null check(length(btrim(title)) between 1 and 200),
 customer_name text not null default '' check(length(customer_name)<=200),
 site_address text not null default '' check(length(site_address)<=500),
 document_date date,
 source_filename text not null check(length(source_filename) between 1 and 500),
 source_sha256 text not null check(source_sha256 ~ '^[0-9a-f]{64}$'),
 source_page_count integer not null check(source_page_count between 1 and 1000),
 groups jsonb not null check(octet_length(groups::text)<=500000 and public.toya_validate_quantity_groups(groups)),
 source_summary jsonb not null default '{}' check(jsonb_typeof(source_summary)='object' and octet_length(source_summary::text)<=100000),
 warnings jsonb not null default '[]' check(jsonb_typeof(warnings)='array' and octet_length(warnings::text)<=30000),
 created_at timestamptz not null default clock_timestamp(),
 unique(company_id,source_sha256)
);
alter table public.estimate_quantity_sheets enable row level security;
revoke all on public.estimate_quantity_sheets from public,anon,authenticated;
grant select on public.estimate_quantity_sheets to authenticated;
grant all on public.estimate_quantity_sheets to service_role;
create policy estimate_quantity_sheets_admin_read on public.estimate_quantity_sheets for select to authenticated
using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.company_id=estimate_quantity_sheets.company_id and p.active and p.role='admin'));
revoke all on function public.toya_validate_quantity_groups(jsonb) from public,anon,authenticated;
grant execute on function public.toya_validate_quantity_groups(jsonb) to service_role;
