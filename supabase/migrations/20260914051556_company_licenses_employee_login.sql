-- Only the seller can activate a contract. Existing installed companies retain access.
create table private.company_licenses (
 company_id uuid primary key references public.companies(id) on delete cascade,
 company_code text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
 status text not null default 'pending' check(status in ('pending','active','suspended')),
 internal boolean not null default false,
 max_users integer not null default 1 check(max_users between 1 and 10000),
 expires_at timestamptz, created_at timestamptz not null default now()
);
alter table private.company_licenses enable row level security;
revoke all on private.company_licenses from public,anon,authenticated;
insert into private.company_licenses(company_id,status,internal,max_users)
 select id,'active',true,10000 from public.companies;
create function private.toya_new_license() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into private.company_licenses(company_id) values(new.id);return new;end $$;
revoke all on function private.toya_new_license() from public,anon,authenticated;
create trigger toya_new_license after insert on public.companies for each row execute function private.toya_new_license();

create table private.login_devices (
 user_id uuid not null references public.profiles(id) on delete cascade,
 device_hash text not null, session_id uuid not null, created_at timestamptz not null default now(),
 primary key(user_id,device_hash), unique(user_id,session_id)
);
alter table private.login_devices enable row level security;
revoke all on private.login_devices from public,anon,authenticated;
create function private.toya_allowed_company() returns uuid language sql stable security definer set search_path='' as $$
 select p.company_id from public.profiles p join private.company_licenses l on l.company_id=p.company_id
 where p.id=auth.uid() and p.active and l.status='active' and (l.expires_at is null or l.expires_at>now())
 and (l.internal or exists(select 1 from private.login_devices d where d.user_id=p.id and d.session_id::text=auth.jwt()->>'session_id'));
$$;
revoke all on function private.toya_allowed_company() from public,anon;
grant execute on function private.toya_allowed_company() to authenticated;
create or replace function public.current_company_id() returns uuid language sql stable security definer set search_path='' as $$select private.toya_allowed_company();$$;
create or replace function public.toya_current_company_id() returns uuid language sql stable security definer set search_path='' as $$select private.toya_allowed_company();$$;
create or replace function public.current_is_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and active and company_id=private.toya_allowed_company());$$;
create or replace function public.toya_is_admin() returns boolean language sql stable security definer set search_path='' as $$select public.current_is_admin();$$;
-- Restrictive policies also cover old policies which query profiles directly.
-- Leave own-profile SELECT available for login diagnostics; it has no write policy.
do $$declare r record;begin
 for r in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 join pg_attribute a on a.attrelid=c.oid and a.attname='company_id' and not a.attisdropped
 where n.nspname='public' and c.relkind in ('r','p') and c.relname<>'profiles' loop
 execute format('create policy toya_contract_access on public.%I as restrictive for all to authenticated using (company_id=(select public.toya_current_company_id())) with check (company_id=(select public.toya_current_company_id()))',r.relname);
 end loop;
end $$;
create policy toya_contract_profile_read on public.profiles as restrictive for select to authenticated
 using(id=auth.uid() or company_id=(select public.toya_current_company_id()));
create policy toya_contract_photos on storage.objects as restrictive for all to authenticated
 using(bucket_id<>'toya-photos' or (storage.foldername(name))[1]=(select public.toya_current_company_id())::text)
 with check(bucket_id<>'toya-photos' or (storage.foldername(name))[1]=(select public.toya_current_company_id())::text);

create function private.toya_license_seat() returns trigger language plpgsql security definer set search_path='' as $$
declare l private.company_licenses; n integer;
begin
 if new.active is not true or new.company_id is null then return new;end if;
 if tg_op='UPDATE' and old.active and old.company_id is not distinct from new.company_id then return new;end if;
 select * into l from private.company_licenses where company_id=new.company_id for update;
 if not found then raise exception '会社の利用登録を確認してください。';end if;
 if l.internal then return new;end if;
 select count(*) into n from public.profiles where company_id=new.company_id and active and id<>new.id;
 -- The first owner can register before seller approval, but has no business-data access.
 if l.status='pending' and n=0 and new.role='admin' then return new;end if;
 if l.status<>'active' or (l.expires_at is not null and l.expires_at<=now()) then raise exception '会社の利用開始を確認してください。';end if;
 if n>=l.max_users then raise exception '契約人数の上限です。不要な社員の利用を停止するか、契約人数を変更してください。';end if;
 return new;
end $$;
revoke all on function private.toya_license_seat() from public,anon,authenticated;
create trigger toya_license_seat before insert or update of active,company_id on public.profiles for each row execute function private.toya_license_seat();

create table private.device_resets(user_id uuid primary key references public.profiles(id) on delete cascade, reset_at timestamptz not null);
alter table private.device_resets enable row level security;
revoke all on private.device_resets from public,anon,authenticated;
create function private.toya_access(p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles; l private.company_licenses; sid uuid; dh text; n integer; target uuid;
begin
 select * into p from public.profiles where id=auth.uid();
 if p.id is null or p.active is not true then return jsonb_build_object('state','inactive','message','会社の利用登録を確認してください。');end if;
 select * into l from private.company_licenses where company_id=p.company_id for update;
 if l.company_id is null or l.status<>'active' or (l.expires_at is not null and l.expires_at<=now()) then
 return jsonb_build_object('state',case when l.status='pending' then 'pending' else 'suspended' end,'company_code',l.company_code,'message',case when l.status='pending' then '会社登録を受け付けました。販売元で利用開始を確認しています。' else '会社の契約が停止中、または期限を過ぎています。会社の管理者に確認してください。' end);end if;
 if p_action='bind' and not l.internal then
  sid:=nullif(auth.jwt()->>'session_id','')::uuid;
  if sid is null or not exists(select 1 from auth.sessions where id=sid and user_id=p.id and created_at>coalesce((select reset_at from private.device_resets where user_id=p.id),'-infinity'::timestamptz)) then raise exception 'ログインし直してください。';end if;
  if coalesce(p_payload->>'device_key','') !~ '^[a-f0-9]{64}$' then raise exception '端末の保存を許可して、もう一度ログインしてください。';end if;
  dh:=encode(sha256(convert_to(p_payload->>'device_key','UTF8')),'hex');
  if not exists(select 1 from private.login_devices where user_id=p.id and device_hash=dh) then
   select count(*) into n from private.login_devices where user_id=p.id;
   if n>=(case when p.role='admin' then 2 else 1 end) then return jsonb_build_object('state','device_limit','message',case when p.role='admin' then '登録できる端末は2台までです。端末を交換した場合は販売元に登録解除を依頼してください。' else '別の端末が登録されています。機種変更した場合は会社の管理者に端末の登録解除を依頼してください。' end);end if;
  end if;
  -- One active session per registered browser. Refresh preserves the session ID.
  delete from private.login_devices where user_id=p.id and session_id=sid and device_hash<>dh;
  insert into private.login_devices(user_id,device_hash,session_id) values(p.id,dh,sid)
   on conflict(user_id,device_hash) do update set session_id=excluded.session_id;
 elsif p_action='reset_device' then
  if p.role<>'admin' or private.toya_allowed_company() is distinct from p.company_id then raise exception '管理者としてログインし直してください。';end if;
  target:=(p_payload->>'id')::uuid;
  if not exists(select 1 from public.profiles where id=target and company_id=p.company_id and role='employee') then raise exception '同じ会社の社員を選択してください。';end if;
  delete from private.login_devices where user_id=target;
  insert into private.device_resets(user_id,reset_at) values(target,clock_timestamp()) on conflict(user_id) do update set reset_at=excluded.reset_at;
 elsif p_action not in ('status','bind') then raise exception '操作を確認してください。';
 end if;
 return jsonb_build_object('state',case when private.toya_allowed_company()=p.company_id then 'ready' else 'needs_device' end,'company_code',l.company_code,'internal',l.internal,'max_users',l.max_users,'expires_at',l.expires_at);
end $$;
revoke all on function private.toya_access(text,jsonb) from public,anon;
grant execute on function private.toya_access(text,jsonb) to authenticated;
create function public.toya_access(p_action text default 'status',p_payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.toya_access(p_action,p_payload);$$;
revoke all on function public.toya_access(text,jsonb) from public,anon;
grant execute on function public.toya_access(text,jsonb) to authenticated;

-- Login aliases are internal routing addresses: no email is sent to employees.
create table private.employee_logins (
 company_id uuid not null references public.companies(id), login_id text not null,
 user_id uuid unique references public.profiles(id) on delete cascade,
 name text not null, email text not null unique, reserved_by uuid not null references public.profiles(id),
 reservation uuid not null unique default gen_random_uuid(), created_at timestamptz not null default now(),
 primary key(company_id,login_id)
);
alter table private.employee_logins enable row level security;
revoke all on private.employee_logins from public,anon,authenticated;
create function private.toya_employee_admin(p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles; l private.company_licenses; e private.employee_logins; lid text:=lower(btrim(p_payload->>'login_id')); nm text:=btrim(p_payload->>'name');
begin
 select * into p from public.profiles where id=auth.uid() and active and role='admin' and company_id=private.toya_allowed_company();
 if p.id is null then raise exception '会社の管理者としてログインしてください。';end if;
 select * into l from private.company_licenses where company_id=p.company_id for update;
 if p_action='list' then
  return jsonb_build_object('company_code',l.company_code,'internal',l.internal,'max_users',l.max_users,'employees',(select coalesce(jsonb_agg(jsonb_build_object('id',e.user_id,'login_id',e.login_id)),'[]'::jsonb) from private.employee_logins e where e.company_id=p.company_id and e.user_id is not null));
 elsif p_action='reserve' then
  if lid is null or lid !~ '^[a-z0-9][a-z0-9_-]{2,23}$' then raise exception '社員IDは半角英数字・ハイフン・下線で3〜24文字にしてください。';end if;
  if nm is null or length(nm) not between 1 and 120 or nm ~ '[<>"&''[:cntrl:]]' then raise exception '氏名を1〜120文字で入力してください。';end if;
  if exists(select 1 from private.employee_logins where company_id=p.company_id and login_id=lid) then raise exception 'この社員IDは登録済み、または登録処理中です。別のIDを指定してください。';end if;
  if (select count(*) from public.profiles where company_id=p.company_id and active)+(select count(*) from private.employee_logins where company_id=p.company_id and user_id is null)>=l.max_users then raise exception '契約人数の上限です。不要な社員の利用を停止するか、契約人数を変更してください。';end if;
  insert into private.employee_logins(company_id,login_id,name,email,reserved_by)
   values(p.company_id,lid,nm,lower(l.company_code)||'.'||lid||'@employee.toya.invalid',p.id) returning * into e;
  return jsonb_build_object('reservation',e.reservation,'email',e.email,'actor',p.id);
 elsif p_action='reset_target' then
  select el.* into e from private.employee_logins el join public.profiles pr on pr.id=el.user_id
   where el.user_id=(p_payload->>'id')::uuid and el.company_id=p.company_id and pr.role='employee' and pr.active;
  if e.user_id is null then raise exception '利用中の社員IDアカウントを選択してください。';end if;
  return jsonb_build_object('user_id',e.user_id);
 end if;
 raise exception '操作を確認してください。';
end $$;
revoke all on function private.toya_employee_admin(text,jsonb) from public,anon;
grant execute on function private.toya_employee_admin(text,jsonb) to authenticated;
create function public.toya_employee_admin(p_action text,p_payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.toya_employee_admin(p_action,p_payload);$$;
revoke all on function public.toya_employee_admin(text,jsonb) from public,anon;
grant execute on function public.toya_employee_admin(text,jsonb) to authenticated;
-- Only the Edge Function service identity may finish a reserved Auth-admin operation.
create function private.toya_employee_finish(p_reservation uuid,p_actor uuid,p_user uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare e private.employee_logins; l private.company_licenses;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'アクセスできません。';end if;
 select * into e from private.employee_logins where reservation=p_reservation and reserved_by=p_actor for update;
 if e.reservation is null or e.user_id is not null then raise exception '登録処理を確認してください。';end if;
 if p_user is null then delete from private.employee_logins where reservation=p_reservation;return jsonb_build_object('ok',true);end if;
 select * into l from private.company_licenses where company_id=e.company_id for update;
 if l.status<>'active' or (l.expires_at is not null and l.expires_at<=now()) or not exists(select 1 from public.profiles where id=p_actor and company_id=e.company_id and role='admin' and active) then raise exception '会社の利用状態が変わりました。';end if;
 if not exists(select 1 from auth.users where id=p_user and email=e.email and email_confirmed_at is not null) then raise exception '社員アカウントの作成を確認してください。';end if;
 insert into public.profiles(id,company_id,name,role,active) values(p_user,e.company_id,e.name,'employee',true);
 update private.employee_logins set user_id=p_user where reservation=p_reservation;
 return jsonb_build_object('ok',true,'id',p_user);
end $$;
revoke all on function private.toya_employee_finish(uuid,uuid,uuid) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.toya_employee_finish(uuid,uuid,uuid) to service_role;
create function public.toya_employee_finish(p_reservation uuid,p_actor uuid,p_user uuid default null) returns jsonb language sql security invoker set search_path='' as $$select private.toya_employee_finish(p_reservation,p_actor,p_user);$$;
revoke all on function public.toya_employee_finish(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.toya_employee_finish(uuid,uuid,uuid) to service_role;
create or replace function private.toya_onboarding(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u auth.users; p public.profiles; member public.profiles; c uuid; inv private.company_invitations;
 nm text:=btrim(p_payload->>'name'); company_name text:=btrim(p_payload->>'company_name'); mail text; token text; result jsonb; count_pending integer;
begin
 if auth.uid() is null then raise exception 'ログインしてください。';end if;
 select * into u from auth.users where id=auth.uid() for update;
 if not found then raise exception 'ログインし直してください。';end if;
 select * into p from public.profiles where id=u.id for update;
 if p_action='status' then
  return jsonb_build_object('state',case when p.id is null then 'unregistered' when p.active and p.company_id is not null then coalesce((select case when status='active' and (expires_at is null or expires_at>now()) then 'ready' when status='pending' then 'pending' else 'suspended' end from private.company_licenses where company_id=p.company_id),'pending') else 'inactive' end,'verified',u.email_confirmed_at is not null,'email',u.email,'name',p.name,'role',p.role,'company_name',(select name from public.companies where id=p.company_id));
 end if;
 if u.email_confirmed_at is null then raise exception '確認メールを開いてメールアドレスを確認してください。';end if;
 if p_action in ('create_company','join') then
  if p.id is not null then raise exception 'このアカウントは登録済みです。会社を変更することはできません。';end if;
  if nm is null or length(nm) not between 1 and 120 or nm ~ '[<>"&''[:cntrl:]]' then raise exception '氏名を1〜120文字で入力してください。記号や改行は全角文字に置き換えてください。';end if;
  if p_action='create_company' then
   if company_name is null or length(company_name) not between 1 and 160 or company_name ~ '[<>"&''[:cntrl:]]' then raise exception '会社名を1〜160文字で入力してください。';end if;
   insert into public.companies(name) values(company_name) returning id into c;
   insert into public.profiles(id,company_id,name,role,active) values(u.id,c,nm,'admin',true);
   insert into public.billing_profiles(company_id,issuer_name) values(c,company_name);
   return jsonb_build_object('company_id',c,'state','pending');
  end if;
  token:=p_payload->>'token';
  if token is null or token !~ '^[a-f0-9]{64}$' then raise exception '参加リンクを確認してください。';end if;
  select * into inv from private.company_invitations where token_hash=encode(sha256(convert_to(token,'UTF8')),'hex') for update;
  if not found or inv.revoked or inv.used_by is not null or inv.expires_at<=now() or inv.email<>lower(u.email) then raise exception 'この参加リンクは利用できません。指定されたメールアドレスと有効期限を確認してください。';end if;
  if not exists(select 1 from public.profiles where id=inv.invited_by and company_id=inv.company_id and active and role='admin') then raise exception '管理者に参加リンクの再発行を依頼してください。';end if;
  insert into public.profiles(id,company_id,name,role,active) values(u.id,inv.company_id,nm,'employee',true);
  update private.company_invitations set used_by=u.id where id=inv.id;
  return jsonb_build_object('company_id',inv.company_id,'state','ready');
 end if;
 if p.id is null or p.active is not true or p.role<>'admin' or p.company_id is null then raise exception '会社の管理者だけが操作できます。';end if;
 if private.toya_allowed_company() is distinct from p.company_id then raise exception '会社の利用開始と端末登録を確認してください。';end if;
 if p_action='invite' then
  mail:=lower(btrim(p_payload->>'email'));
  if mail is null or length(mail)>254 or mail !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception '社員のメールアドレスを入力してください。';end if;
  if exists(select 1 from auth.users au join public.profiles pr on pr.id=au.id where lower(au.email)=mail) then raise exception 'このアドレスには参加リンクを発行できません。登録状況を本人に確認してください。';end if;
  select count(*) into count_pending from private.company_invitations where company_id=p.company_id and not revoked and used_by is null and expires_at>now();
  if count_pending>=20 then raise exception '未使用の参加リンクが20件あります。不要なリンクを取り消してください。';end if;
  token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  insert into private.company_invitations(company_id,email,token_hash,invited_by) values(p.company_id,mail,encode(sha256(convert_to(token,'UTF8')),'hex'),p.id) returning * into inv;
  return jsonb_build_object('id',inv.id,'token',token,'email',mail,'expires_at',inv.expires_at);
 elsif p_action='list' then
  return jsonb_build_object('members',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'role',role,'active',active) order by name),'[]'::jsonb) from public.profiles where company_id=p.company_id),'invitations',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'email',email,'expires_at',expires_at,'revoked',revoked,'used',used_by is not null) order by created_at desc),'[]'::jsonb) from (select * from private.company_invitations where company_id=p.company_id order by created_at desc limit 50) i));
 elsif p_action='revoke' then
  update private.company_invitations set revoked=true where id=(p_payload->>'id')::uuid and company_id=p.company_id and used_by is null;
  if not found then raise exception '未使用の参加リンクが見つかりません。';end if;
  return jsonb_build_object('ok',true);
 elsif p_action='member_active' then
  select * into member from public.profiles where id=(p_payload->>'id')::uuid and company_id=p.company_id for update;
  if not found or member.role<>'employee' or member.id=p.id then raise exception '同じ会社の社員アカウントを選択してください。';end if;
  if jsonb_typeof(p_payload->'active') is distinct from 'boolean' or jsonb_typeof(p_payload->'expected_active') is distinct from 'boolean' or member.active is distinct from (p_payload->>'expected_active')::boolean then raise exception '状態が変更されています。一覧を更新してください。';end if;
  update public.profiles set active=(p_payload->>'active')::boolean where id=member.id;
  return jsonb_build_object('ok',true);
 end if;
 raise exception '操作を確認してください。';
end $$;

-- These two legacy definer RPCs bypass table RLS, so guard them explicitly too.
do $$declare definition text; updated text;begin
 select pg_get_functiondef('public.equipment_transport_catalog_v1()'::regprocedure) into definition;
 updated:=replace(definition,'where p.id=auth.uid()', 'where p.company_id=public.toya_current_company_id() and p.id=auth.uid()');
 if updated=definition then raise exception 'catalog definition changed; review migration';end if;
 execute updated;
 select pg_get_functiondef('public.toya_rename_shared_site(uuid,integer,text)'::regprocedure) into definition;
 updated:=replace(definition,'if company is null then','if company is null or company is distinct from public.toya_current_company_id() then');
 if updated=definition then raise exception 'rename definition changed; review migration';end if;
 execute updated;
end $$;
