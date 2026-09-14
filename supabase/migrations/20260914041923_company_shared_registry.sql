-- Company-shared registration. No existing business rows are copied or rewritten.
create table public.company_registries (
 company_id uuid not null references public.companies(id),
 kind text not null check(kind in ('vehicles','machines','attachments','employees')),
 entries jsonb not null default '[]'::jsonb check(jsonb_typeof(entries)='array' and jsonb_array_length(entries)<=500),
 version integer not null default 1 check(version>0),
 primary key(company_id,kind)
);
alter table public.company_registries enable row level security;
revoke all on public.company_registries from anon, authenticated;
grant select, insert on public.company_registries to authenticated;
grant update(entries,version) on public.company_registries to authenticated;
create policy registry_read on public.company_registries for select to authenticated
 using(company_id=(select public.toya_current_company_id()));
create policy registry_insert on public.company_registries for insert to authenticated
 with check(company_id=(select public.toya_current_company_id()) and (select public.toya_is_admin()));
create policy registry_update on public.company_registries for update to authenticated
 using(company_id=(select public.toya_current_company_id()) and (select public.toya_is_admin()))
 with check(company_id=(select public.toya_current_company_id()) and (select public.toya_is_admin()));
create function public.toya_registry_validate() returns trigger language plpgsql security invoker set search_path='' as $$
declare e jsonb; k text; ids text[]:='{}'; names text[]:='{}';
begin
 if tg_op='UPDATE' and new.version<>old.version+1 then raise exception '登録内容が更新されています。読み込み直してください。';end if;
 for e in select value from jsonb_array_elements(new.entries) loop
  if jsonb_typeof(e)<>'object' or coalesce(e->>'id','') !~ '^[a-zA-Z0-9_-]{1,80}$' or jsonb_typeof(e->'name') is distinct from 'string' or length(btrim(e->>'name')) not between 1 and 120 or (e ? 'active' and jsonb_typeof(e->'active')<>'boolean') then raise exception '登録内容を確認してください。';end if;
  if e->>'id'=any(ids) or (coalesce((e->>'active')::boolean,true) and e->>'name'=any(names)) then raise exception '同じ登録が重複しています。';end if;
  ids:=array_append(ids,e->>'id');if coalesce((e->>'active')::boolean,true) then names:=array_append(names,e->>'name');end if;
  foreach k in array array['name','category','location','mountedOn','memo'] loop
   if e ? k and (jsonb_typeof(e->k)<>'string' or length(e->>k)>1000 or (e->>k) ~ '[<>"&''[:cntrl:]]') then raise exception '記号 < > & 引用符や改行は全角文字に置き換えてください。';end if;
  end loop;
 end loop;
 return new;
end $$;
revoke all on function public.toya_registry_validate() from public, anon, authenticated;
create trigger company_registries_validate before insert or update on public.company_registries for each row execute function public.toya_registry_validate();
