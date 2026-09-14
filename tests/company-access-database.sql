begin;
do $$declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();e uuid:=gen_random_uuid();x uuid:=gen_random_uuid();sid uuid;begin
 insert into auth.users(id,email,email_confirmed_at) values(a,a||'@example.invalid',now()),(b,b||'@example.invalid',now()),(e,e||'@example.invalid',now()),(x,x||'@example.invalid',now());
 perform set_config('qa.a',a::text,true);perform set_config('qa.b',b::text,true);perform set_config('qa.e',e::text,true);perform set_config('qa.x',x::text,true);
 insert into auth.sessions(id,user_id,created_at) values(a,a,clock_timestamp()),(b,b,clock_timestamp()),(e,e,clock_timestamp()),(x,x,clock_timestamp());
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.a'),'role','authenticated','session_id',current_setting('qa.a'))::text,true);
do $$declare r jsonb;blocked boolean:=false;begin
 r:=public.toya_onboarding('create_company','{"name":"試験A管理者","company_name":"試験契約A"}');
 perform set_config('qa.ca',r->>'company_id',true);
 if r->>'state'<>'pending' or public.toya_current_company_id() is not null then raise exception 'unapproved company usable';end if;
 if (public.toya_access('bind',jsonb_build_object('device_key',repeat('a',64)))->>'state')<>'pending' then raise exception 'pending contract bind accepted';end if;
 if not exists(select 1 from public.profiles where id=auth.uid()) then raise exception 'own diagnostic profile unavailable';end if;
 begin insert into public.company_registries(company_id,kind) values(current_setting('qa.ca')::uuid,'vehicles');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'pending direct write accepted';end if;
 blocked:=false;begin perform public.toya_employee_admin('reserve','{"name":"不可","login_id":"bad01"}');exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'pending provisioning accepted';end if;
 blocked:=false;begin update private.company_licenses set status='active';exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'customer activated contract';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.b'),'role','authenticated','session_id',current_setting('qa.b'))::text,true);
select set_config('qa.cb',public.toya_onboarding('create_company','{"name":"試験B管理者","company_name":"試験契約B"}')->>'company_id',true);
reset role;
update private.company_licenses set status='active',max_users=2 where company_id in (current_setting('qa.ca')::uuid,current_setting('qa.cb')::uuid);
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.a'),'role','authenticated','session_id',current_setting('qa.a'),'user_metadata','{"role":"admin","internal":true}'::jsonb)::text,true);
do $$declare r jsonb;blocked boolean:=false;begin
 if public.toya_current_company_id() is not null then raise exception 'unbound JWT bypass';end if;
 r:=public.toya_access('bind',jsonb_build_object('device_key',repeat('a',64)));
 if r->>'state'<>'ready' or public.toya_current_company_id()<>current_setting('qa.ca')::uuid then raise exception 'licensed admin bind failed';end if;
 insert into public.company_registries(company_id,kind) values(current_setting('qa.ca')::uuid,'vehicles');
 r:=public.toya_employee_admin('reserve',jsonb_build_object('name','試験社員','login_id','staff01','company_id',current_setting('qa.cb'),'role','admin'));
 perform set_config('qa.reservation',r->>'reservation',true);perform set_config('qa.alias',r->>'email',true);
 begin perform public.toya_employee_finish((r->>'reservation')::uuid,auth.uid(),current_setting('qa.e')::uuid);exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'client used service RPC';end if;
end $$;
reset role;
update auth.users set email=current_setting('qa.alias') where id=current_setting('qa.e')::uuid;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.toya_employee_finish(current_setting('qa.reservation')::uuid,current_setting('qa.a')::uuid,current_setting('qa.e')::uuid);
reset role;
do $$begin if not exists(select 1 from public.profiles where id=current_setting('qa.e')::uuid and role='employee' and company_id=current_setting('qa.ca')::uuid) then raise exception 'provisioned wrong tenant/role';end if;end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.e'),'role','authenticated','session_id',current_setting('qa.e'))::text,true);
do $$declare r jsonb;blocked boolean:=false;begin
 r:=public.toya_access('bind',jsonb_build_object('device_key',repeat('e',64)));if r->>'state'<>'ready' then raise exception 'employee bind failed';end if;
 if (select count(*) from public.company_registries)<>1 then raise exception 'employee own read failed';end if;
 r:=public.toya_access('bind',jsonb_build_object('device_key',repeat('f',64)));if r->>'state'<>'device_limit' then raise exception 'employee extra device accepted';end if;
 begin perform public.toya_employee_admin('reserve','{"name":"不可","login_id":"bad01"}');exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'employee created account';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.b'),'role','authenticated','session_id',current_setting('qa.b'))::text,true);
select public.toya_access('bind',jsonb_build_object('device_key',repeat('b',64)));
do $$declare blocked boolean:=false;begin
 if exists(select 1 from public.company_registries) then raise exception 'cross-company read';end if;
 begin perform public.toya_access('reset_device',jsonb_build_object('id',current_setting('qa.e')));exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'foreign device reset';end if;
 blocked:=false;begin perform public.toya_employee_admin('reset_target',jsonb_build_object('id',current_setting('qa.e')));exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'foreign password reset';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.a'),'role','authenticated','session_id',current_setting('qa.a'))::text,true);
do $$declare blocked boolean:=false;begin
 begin perform public.toya_employee_admin('reserve','{"name":"上限超え","login_id":"staff02"}');exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'seat limit bypass';end if;
 perform public.toya_access('reset_device',jsonb_build_object('id',current_setting('qa.e')));
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.e'),'role','authenticated','session_id',current_setting('qa.e'))::text,true);
do $$declare blocked boolean:=false;begin
 if public.toya_current_company_id() is not null then raise exception 'reset session still usable';end if;
 begin perform public.toya_access('bind',jsonb_build_object('device_key',repeat('e',64)));exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'old session rebind after reset';end if;
end $$;
reset role;
insert into auth.sessions(id,user_id,created_at) values(gen_random_uuid(),current_setting('qa.e')::uuid,clock_timestamp()) returning set_config('qa.newsid',id::text,true);
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.e'),'role','authenticated','session_id',current_setting('qa.newsid'))::text,true);
do $$begin if (public.toya_access('bind',jsonb_build_object('device_key',repeat('f',64)))->>'state')<>'ready' then raise exception 'replacement device failed';end if;end $$;
reset role;
update private.company_licenses set status='suspended' where company_id=current_setting('qa.ca')::uuid;
set local role authenticated;
do $$begin
 if public.toya_current_company_id() is not null or exists(select 1 from public.company_registries) then raise exception 'suspended contract data accessible';end if;
 if (public.toya_access('status')->>'state')<>'suspended' then raise exception 'suspended status wrong';end if;
 if exists(select 1 from public.equipment_transport_catalog_v1()) then raise exception 'definer catalog bypass';end if;
end $$;
reset role;
update private.company_licenses set status='active',expires_at=now()-interval '1 second' where company_id=current_setting('qa.ca')::uuid;
set local role authenticated;
do $$begin if public.toya_current_company_id() is not null then raise exception 'expired contract usable';end if;end $$;
set local role anon;
do $$declare blocked boolean:=false;begin begin perform public.toya_access('status');exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'anonymous license access';end if;end $$;
reset role;
rollback;
select 'PASS contracts, device binding/reset, stale session rejection, employee ID provisioning, tenant/role injection, private grants, seat limits, suspension and expiry; rolled back' result;
