-- One tax-exclusive contract amount per company/site.
-- Existing `revenues` remains available for future invoice/payment rows.
begin;

alter table public.revenues
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists revenues_one_contract_per_site
  on public.revenues (company_id, site_id)
  where revenue_type = 'contract';

create index if not exists revenues_site_id_idx
  on public.revenues (site_id);

alter table public.revenues
  drop constraint if exists revenues_contract_amount_range;

alter table public.revenues
  add constraint revenues_contract_amount_range
  check (
    revenue_type <> 'contract'
    or amount between 0 and 999999999999.99
  );

alter table public.revenues enable row level security;

revoke all on table public.revenues from anon;
revoke all on table public.revenues from authenticated;
grant select, insert, update, delete on table public.revenues to authenticated;

commit;
