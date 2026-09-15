-- Fix the employee list table alias without changing the employee record variable.
-- Preserve administrator, company, licence, and device checks and existing function grants.
CREATE OR REPLACE FUNCTION private.toya_employee_admin(p_action text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.profiles; l private.company_licenses; e private.employee_logins; lid text:=lower(btrim(p_payload->>'login_id')); nm text:=btrim(p_payload->>'name');
begin
 select * into p from public.profiles where id=auth.uid() and active and role='admin' and company_id=private.toya_allowed_company();
 if p.id is null then raise exception '会社の管理者としてログインしてください。';end if;
 select * into l from private.company_licenses where company_id=p.company_id for update;
 if p_action='list' then
  return jsonb_build_object('company_code',l.company_code,'internal',l.internal,'max_users',l.max_users,'employees',(select coalesce(jsonb_agg(jsonb_build_object('id',el.user_id,'login_id',el.login_id)),'[]'::jsonb) from private.employee_logins el where el.company_id=p.company_id and el.user_id is not null));
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
end $function$
;
