begin;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();ua uuid:=gen_random_uuid();ub uuid:=gen_random_uuid();ue uuid:=gen_random_uuid();ui uuid:=gen_random_uuid();
begin
 insert into public.companies(id,name) values(a,'QA registry A'),(b,'QA registry B');
 insert into auth.users(id) values(ua),(ub),(ue),(ui);
 insert into public.profiles(id,company_id,name,role,active) values(ua,a,'A admin','admin',true),(ub,b,'B admin','admin',true),(ue,a,'A employee','employee',true),(ui,a,'inactive','admin',false);
 perform set_config('qa.a',a::text,true);perform set_config('qa.b',b::text,true);perform set_config('qa.ua',ua::text,true);perform set_config('qa.ub',ub::text,true);perform set_config('qa.ue',ue::text,true);perform set_config('qa.ui',ui::text,true);
end $$;
set local role authenticated;
do $$
declare n integer;blocked boolean;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.ua'),'role','authenticated')::text,true);
 insert into public.company_registries(company_id,kind,entries) values(current_setting('qa.a')::uuid,'vehicles','[{"id":"a","name":"A車両","active":true}]');
 update public.company_registries set entries='[{"id":"a","name":"A変更","active":true}]',version=2 where company_id=current_setting('qa.a')::uuid and kind='vehicles' and version=1;
 get diagnostics n=row_count;if n<>1 then raise exception 'own admin update failed';end if;
 update public.company_registries set version=2 where company_id=current_setting('qa.a')::uuid and kind='vehicles' and version=1;
 get diagnostics n=row_count;if n<>0 then raise exception 'stale write accepted';end if;
 blocked:=false;begin insert into public.company_registries(company_id,kind) values(current_setting('qa.b')::uuid,'machines');exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'foreign insert accepted';end if;
 blocked:=false;begin update public.company_registries set entries='[{"id":"a","name":"<script>"}]',version=3 where company_id=current_setting('qa.a')::uuid;exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'unsafe input accepted';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.ue'),'role','authenticated')::text,true);
 select count(*) into n from public.company_registries;if n<>1 then raise exception 'employee own read failed';end if;
 update public.company_registries set entries='[]',version=3;get diagnostics n=row_count;if n<>0 then raise exception 'employee write accepted';end if;
 blocked:=false;begin insert into public.company_registries(company_id,kind) values(current_setting('qa.a')::uuid,'machines');exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'employee insert accepted';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.ub'),'role','authenticated')::text,true);
 select count(*) into n from public.company_registries;if n<>0 then raise exception 'foreign read accepted';end if;
 update public.company_registries set entries='[]',version=3;get diagnostics n=row_count;if n<>0 then raise exception 'foreign update accepted';end if;
 insert into public.company_registries(company_id,kind) values(current_setting('qa.b')::uuid,'machines');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.ui'),'role','authenticated')::text,true);
 select count(*) into n from public.company_registries;if n<>0 then raise exception 'inactive read accepted';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.ua'),'role','authenticated')::text,true);
insert into public.company_registries(company_id,kind,entries) values(current_setting('qa.a')::uuid,'dispatch','[{"id":"custom-vendor","name":"試験派遣会社","active":true}]');
set local role anon;
do $$ declare blocked boolean:=false;begin begin perform 1 from public.company_registries;exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'anon access accepted';end if;end $$;
reset role;
rollback;
select 'PASS registry: tenant boundaries, admin writes, employee read-only, inactive and anonymous denial, stale versions, unsafe input; fixtures rolled back' as result;
