begin;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();e uuid:=gen_random_uuid();w uuid:=gen_random_uuid();unverified uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email,email_confirmed_at) values(a,a||'@example.invalid',now()),(b,b||'@example.invalid',now()),(e,e||'@example.invalid',now()),(w,w||'@example.invalid',now()),(unverified,unverified||'@example.invalid',null);
 perform set_config('qa.admin',a::text,true);perform set_config('qa.other',b::text,true);perform set_config('qa.employee',e::text,true);perform set_config('qa.wrong',w::text,true);perform set_config('qa.unverified',unverified::text,true);
end $$;
set local role authenticated;
do $$
declare result jsonb; inv jsonb; blocked boolean; a uuid; b uuid;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.unverified'),'role','authenticated')::text,true);
 blocked:=false;begin perform public.toya_onboarding('create_company','{"name":"未確認","company_name":"不可"}');exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'unverified creation accepted';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.admin'),'role','authenticated')::text,true);
 result:=public.toya_onboarding('status','{}');if result->>'state'<>'unregistered' then raise exception 'new state incorrect';end if;
 result:=public.toya_onboarding('create_company','{"name":"試験管理者","company_name":"試験会社A"}');a:=(result->>'company_id')::uuid;
 if public.toya_current_company_id()<>a or not public.toya_is_admin() then raise exception 'created owner invalid';end if;
 if exists(select 1 from public.company_registries) then raise exception 'new company seeded';end if;
 blocked:=false;begin perform public.toya_onboarding('create_company','{"name":"もう一度","company_name":"不可"}');exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'duplicate creation accepted';end if;
 inv:=public.toya_onboarding('invite',jsonb_build_object('email',current_setting('qa.employee')||'@example.invalid'));
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.wrong'),'role','authenticated')::text,true);
 blocked:=false;begin perform public.toya_onboarding('join',jsonb_build_object('name','別人','token',inv->>'token'));exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'wrong email accepted';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.employee'),'role','authenticated','user_metadata',jsonb_build_object('role','admin'))::text,true);
 result:=public.toya_onboarding('join',jsonb_build_object('name','試験社員','token',inv->>'token','role','admin','company_id',gen_random_uuid()));
 if public.toya_current_company_id()<>a or public.toya_is_admin() then raise exception 'join tenant/role invalid';end if;
 blocked:=false;begin perform public.toya_onboarding('invite','{"email":"no@example.invalid"}');exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'employee invite accepted';end if;
 blocked:=false;begin perform public.toya_onboarding('join',jsonb_build_object('name','再参加','token',inv->>'token'));exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'reuse accepted';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.other'),'role','authenticated')::text,true);
 result:=public.toya_onboarding('create_company','{"name":"別管理者","company_name":"試験会社B"}');b:=(result->>'company_id')::uuid;
 blocked:=false;begin perform public.toya_onboarding('member_active',jsonb_build_object('id',current_setting('qa.employee'),'active',false,'expected_active',true));exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'foreign member update accepted';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.admin'),'role','authenticated')::text,true);
 perform public.toya_onboarding('member_active',jsonb_build_object('id',current_setting('qa.employee'),'active',false,'expected_active',true));
 blocked:=false;begin perform public.toya_onboarding('member_active',jsonb_build_object('id',current_setting('qa.admin'),'active',false,'expected_active',true));exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'owner disabled';end if;
 inv:=public.toya_onboarding('invite',jsonb_build_object('email',current_setting('qa.wrong')||'@example.invalid'));perform public.toya_onboarding('revoke',jsonb_build_object('id',inv->>'id'));
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.wrong'),'role','authenticated')::text,true);
 blocked:=false;begin perform public.toya_onboarding('join',jsonb_build_object('name','取消済み','token',inv->>'token'));exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'revoked invite accepted';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.employee'),'role','authenticated')::text,true);
 if public.current_company_id() is not null or public.toya_current_company_id() is not null then raise exception 'disabled member retains data access';end if;
 blocked:=false;begin perform public.toya_onboarding('create_company','{"name":"利用停止者","company_name":"不可"}');exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'disabled escape accepted';end if;
end $$;
reset role;
insert into private.company_invitations(company_id,email,token_hash,invited_by,expires_at)
select company_id,current_setting('qa.wrong')||'@example.invalid',encode(sha256(convert_to(repeat('f',64),'UTF8')),'hex'),id,now()-interval '1 minute' from public.profiles where id=current_setting('qa.admin')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.wrong'),'role','authenticated')::text,true);
do $$declare blocked boolean:=false;begin begin perform public.toya_onboarding('join',jsonb_build_object('name','期限切れ','token',repeat('f',64)));exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'expired invitation accepted';end if;end $$;
set local role anon;
do $$declare blocked boolean:=false;begin begin perform public.toya_onboarding('status','{}');exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'anonymous provisioning access';end if;end $$;
reset role;
rollback;
select 'PASS self-service provisioning: verified new owner, empty company, single membership, email-bound single-use invitation, role tampering, cross-company updates, revocation, disabled user and anonymous denial; rolled back' result;
