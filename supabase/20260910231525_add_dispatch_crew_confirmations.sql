-- Separate-crew confirmations do not alter daily reports or saved cost sheets.
create table if not exists public.dispatch_crew_confirmations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  report_id uuid not null references public.daily_reports(id) on delete cascade,
  site_id uuid not null references public.sites(id),
  work_date date not null,
  dispatch_code text not null check (dispatch_code in ('meiken', 'asahi')),
  crew_key text not null check (length(crew_key) between 1 and 100),
  report_updated_at timestamptz not null,
  confirmed_at timestamptz not null default now(),
  unique (company_id, report_id, dispatch_code)
);
create index if not exists dispatch_crew_confirmations_company_date_idx
  on public.dispatch_crew_confirmations(company_id, work_date);
alter table public.dispatch_crew_confirmations enable row level security;
revoke all on public.dispatch_crew_confirmations from public, anon, authenticated;
grant select, insert, update, delete on public.dispatch_crew_confirmations to authenticated;
grant all on public.dispatch_crew_confirmations to service_role;
create policy dispatch_crew_confirmations_admin
  on public.dispatch_crew_confirmations for all to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.company_id = dispatch_crew_confirmations.company_id
      and p.role = 'admin' and p.active = true
  ))
  with check (exists (
    select 1 from public.profiles p
    join public.daily_reports d on d.company_id = p.company_id
    where p.id = (select auth.uid()) and p.company_id = dispatch_crew_confirmations.company_id
      and p.role = 'admin' and p.active = true
      and d.id = dispatch_crew_confirmations.report_id
      and d.site_id = dispatch_crew_confirmations.site_id
      and d.report_date = dispatch_crew_confirmations.work_date
      and d.updated_at = dispatch_crew_confirmations.report_updated_at
  ));
