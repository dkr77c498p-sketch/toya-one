-- Privileged provisioning stays in a non-exposed schema. No existing memberships change.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
create table private.company_invitations (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
 email text not null, token_hash text not null unique, invited_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '7 days',
 used_by uuid, revoked boolean not null default false
);
create index company_invitations_company_idx on private.company_invitations(company_id);
alter table private.company_invitations enable row level security;
revoke all on private.company_invitations from public,anon,authenticated;
-- All old company-scoped policies must also reject a disabled employee.
create or replace function public.current_company_id() returns uuid language sql stable security definer set search_path='public' as $$
 select company_id from public.profiles where id=auth.uid() and active=true limit 1;
$$;
create function private.toya_onboarding(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u auth.users; p public.profiles; member public.profiles; c uuid; inv private.company_invitations;
 nm text:=btrim(p_payload->>'name'); company_name text:=btrim(p_payload->>'company_name'); mail text; token text; result jsonb; count_pending integer;
begin
 if auth.uid() is null then raise exception 'ログインしてください。';end if;
 select * into u from auth.users where id=auth.uid() for update;
 if not found then raise exception 'ログインし直してください。';end if;
 select * into p from public.profiles where id=u.id for update;
 if p_action='status' then
  return jsonb_build_object('state',case when p.id is null then 'unregistered' when p.active and p.company_id is not null then 'ready' else 'inactive' end,'verified',u.email_confirmed_at is not null,'email',u.email,'name',p.name,'role',p.role,'company_name',(select name from public.companies where id=p.company_id));
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
   return jsonb_build_object('company_id',c,'state','ready');
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
revoke all on function private.toya_onboarding(text,jsonb) from public,anon;
grant execute on function private.toya_onboarding(text,jsonb) to authenticated;
create function public.toya_onboarding(p_action text,p_payload jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.toya_onboarding(p_action,p_payload);$$;
revoke all on function public.toya_onboarding(text,jsonb) from public,anon;
grant execute on function public.toya_onboarding(text,jsonb) to authenticated;
