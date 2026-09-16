begin;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();ua uuid:=gen_random_uuid();ub uuid:=gen_random_uuid();ue uuid:=gen_random_uuid();ui uuid:=gen_random_uuid();
begin
 insert into public.companies(id,name) values(a,'QA slogan A'),(b,'QA slogan B');
 insert into auth.users(id) values(ua),(ub),(ue),(ui);
 update private.company_licenses set status='active',internal=true,max_users=10000 where company_id in(a,b);
 insert into public.profiles(id,company_id,name,role,active) values(ua,a,'A admin','admin',true),(ub,b,'B admin','admin',true),(ue,a,'A employee','employee',true),(ui,a,'inactive','admin',false);
 perform set_config('qa.a',a::text,true);perform set_config('qa.b',b::text,true);
 perform set_config('qa.ua',ua::text,true);perform set_config('qa.ub',ub::text,true);perform set_config('qa.ue',ue::text,true);perform set_config('qa.ui',ui::text,true);
end $$;
set local role authenticated;
do $$
declare n integer;blocked boolean;message text;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.ua'),'role','authenticated')::text,true);
 insert into public.company_home_settings(company_id,slogan,version) values(current_setting('qa.a')::uuid,'今日も、安全に。',1);
 update public.company_home_settings set slogan=E'安全第一\n全員で笑顔の帰宅',version=2 where company_id=current_setting('qa.a')::uuid and version=1;
 get diagnostics n=row_count;if n<>1 then raise exception 'admin save failed';end if;
 update public.company_home_settings set slogan='stale',version=2 where company_id=current_setting('qa.a')::uuid and version=1;
 get diagnostics n=row_count;if n<>0 then raise exception 'stale save accepted';end if;
 blocked:=false;begin update public.company_home_settings set slogan='wrong version' where company_id=current_setting('qa.a')::uuid;exception when raise_exception then blocked:=true;end;if not blocked then raise exception 'version not enforced';end if;
 blocked:=false;begin update public.company_home_settings set slogan=repeat('あ',81),version=3;exception when check_violation then blocked:=true;end;if not blocked then raise exception 'long slogan accepted';end if;
 blocked:=false;begin update public.company_home_settings set slogan=E' \n\t',version=3;exception when check_violation then blocked:=true;end;if not blocked then raise exception 'blank slogan accepted';end if;
 blocked:=false;begin update public.company_home_settings set company_id=current_setting('qa.b')::uuid;exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'company reassignment accepted';end if;
 blocked:=false;begin insert into public.company_home_settings(company_id,slogan) values(current_setting('qa.b')::uuid,'foreign');exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'foreign insert accepted';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.ue'),'role','authenticated')::text,true);
 select slogan into message from public.company_home_settings where company_id=current_setting('qa.a')::uuid;
 if message is distinct from E'安全第一\n全員で笑顔の帰宅' then raise exception 'employee cannot read saved slogan';end if;
 update public.company_home_settings set slogan='employee',version=3;get diagnostics n=row_count;if n<>0 then raise exception 'employee update accepted';end if;
 blocked:=false;begin insert into public.company_home_settings(company_id,slogan) values(current_setting('qa.a')::uuid,'employee');exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'employee insert accepted';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.ub'),'role','authenticated')::text,true);
 select count(*) into n from public.company_home_settings;if n<>0 then raise exception 'foreign read accepted';end if;
 update public.company_home_settings set slogan='foreign',version=3;get diagnostics n=row_count;if n<>0 then raise exception 'foreign update accepted';end if;
 insert into public.company_home_settings(company_id,slogan) values(current_setting('qa.b')::uuid,repeat('あ',80));
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.ui'),'role','authenticated')::text,true);
 select count(*) into n from public.company_home_settings;if n<>0 then raise exception 'inactive read accepted';end if;
end $$;
set local role anon;
do $$ declare blocked boolean:=false;begin begin perform 1 from public.company_home_settings;exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'anonymous read accepted';end if;end $$;
reset role;
rollback;
select 'PASS slogan: company isolation, admin saves, employee reads, inactive/anonymous denial, stale version and text validation; fixtures rolled back' as result;
