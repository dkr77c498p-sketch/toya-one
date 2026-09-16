-- One home slogan per company. Existing company and business data stay untouched.
create table public.company_home_settings (
 company_id uuid primary key references public.companies(id),
 slogan text not null check(char_length(slogan)<=80 and length(btrim(slogan,E' \t\r\n'))>0),
 version integer not null default 1 check(version>0),
 updated_at timestamptz not null default now()
);
alter table public.company_home_settings enable row level security;
revoke all on public.company_home_settings from public,anon,authenticated;
grant select on public.company_home_settings to authenticated;
grant insert(company_id,slogan,version),update(slogan,version) on public.company_home_settings to authenticated;
create policy home_settings_read on public.company_home_settings for select to authenticated
 using(company_id=(select public.toya_current_company_id()));
create policy home_settings_insert on public.company_home_settings for insert to authenticated
 with check(company_id=(select public.toya_current_company_id()) and (select public.toya_is_admin()));
create policy home_settings_update on public.company_home_settings for update to authenticated
 using(company_id=(select public.toya_current_company_id()) and (select public.toya_is_admin()))
 with check(company_id=(select public.toya_current_company_id()) and (select public.toya_is_admin()));
create function public.toya_home_settings_validate() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 if (tg_op='INSERT' and new.version<>1) or (tg_op='UPDATE' and new.version<>old.version+1) then
  raise exception 'スローガンが更新されています。保存済みの内容を読み込んでください。';
 end if;
 new.updated_at:=clock_timestamp();
 return new;
end $$;
revoke all on function public.toya_home_settings_validate() from public,anon,authenticated;
create trigger company_home_settings_validate before insert or update on public.company_home_settings
 for each row execute function public.toya_home_settings_validate();
notify pgrst,'reload schema';
