-- TOYA One v5.1.0
-- 会社内の日報・写真・社員利用状況を共有するための追加設定です。
-- Supabase SQL Editor で、このファイル全体を1回実行してください。

begin;

alter table public.daily_reports
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists report_data jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table public.daily_reports
  alter column created_by set default auth.uid();

create or replace function public.toya_current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.company_id
  from public.profiles p
  where p.id = auth.uid() and p.active = true
  limit 1
$$;

create or replace function public.toya_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.role = 'admin'
  )
$$;

grant execute on function public.toya_current_company_id() to authenticated;
grant execute on function public.toya_is_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.daily_reports enable row level security;
alter table public.report_photos enable row level security;
alter table public.sites enable row level security;
alter table public.user_activity enable row level security;

drop policy if exists toya_profiles_company_select on public.profiles;
create policy toya_profiles_company_select
on public.profiles for select to authenticated
using (company_id = public.toya_current_company_id());

drop policy if exists toya_daily_reports_company_select on public.daily_reports;
create policy toya_daily_reports_company_select
on public.daily_reports for select to authenticated
using (company_id = public.toya_current_company_id());

drop policy if exists toya_report_photos_company_select on public.report_photos;
create policy toya_report_photos_company_select
on public.report_photos for select to authenticated
using (company_id = public.toya_current_company_id());

drop policy if exists toya_sites_company_select on public.sites;
create policy toya_sites_company_select
on public.sites for select to authenticated
using (company_id = public.toya_current_company_id());

drop policy if exists toya_user_activity_admin_select on public.user_activity;
create policy toya_user_activity_admin_select
on public.user_activity for select to authenticated
using (
  public.toya_is_admin()
  and company_id = public.toya_current_company_id()
);

commit;

