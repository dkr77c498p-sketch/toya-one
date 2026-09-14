begin;
do $$declare c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();s uuid;begin
 insert into public.companies(id,name) values(c,'QA plans rollback');
 insert into auth.users(id,email,email_confirmed_at) values(u,u||'@example.invalid',now());
 insert into public.profiles(id,company_id,name,role,active) values(u,c,'QA plan admin','admin',true);
 update private.company_licenses set status='active',plan='complete',max_users=2 where company_id=c;
 insert into auth.sessions(id,user_id,created_at) values(u,u,clock_timestamp());
 insert into public.sites(company_id,name) values(c,'QA plan site') returning id into s;
 insert into public.revenues(company_id,site_id,revenue_type,amount) values(c,s,'contract',1000);
 perform set_config('qa.plan_c',c::text,true);perform set_config('qa.plan_u',u::text,true);perform set_config('qa.plan_s',s::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.plan_u'),'session_id',current_setting('qa.plan_u'),'role','authenticated','user_metadata','{"plan":"complete"}'::jsonb)::text,true);
do $$declare d public.project_documents; result jsonb;begin
 result:=public.toya_access('bind',jsonb_build_object('device_key',repeat('a',64)));
 if result->>'plan'<>'complete' or (result->'features'->>'estimate')::boolean is not true then raise exception 'full plan binding did not return features';end if;
 for i in 1..3 loop
 d:=public.toya_save_project_document(gen_random_uuid(),null,jsonb_build_object('kind',case i when 1 then 'invoice' when 2 then 'progress' else 'estimate' end,'site_id',current_setting('qa.plan_s'),'document_date',current_date,'subject','QA plan document','customer_name','QA customer','issuer',jsonb_build_object('issuer_name','QA'),'items',jsonb_build_array(jsonb_build_object('name','work','quantity','1','unitPrice','100','unit','式')),'tax_rate',10,'cumulative_amount',100));
 end loop;
 if (select count(*) from public.project_documents)<>3 then raise exception 'full tier missing documents';end if;
end $$;
reset role;
insert into public.estimate_plans(company_id,site_id,title) values(current_setting('qa.plan_c')::uuid,current_setting('qa.plan_s')::uuid,'QA saved plan');
insert into public.estimate_quantity_sheets(company_id,title,source_filename,source_sha256,source_page_count,groups)
 values(current_setting('qa.plan_c')::uuid,'QA quantities','qa.pdf',repeat('a',64),1,'[{"name":"QA","lines":[{"label":"work","quantity":1,"unit":"式","source_page":1}]}]');
update private.company_licenses set plan='billing' where company_id=current_setting('qa.plan_c')::uuid;
set local role authenticated;
do $$declare blocked boolean:=false;d public.project_documents;begin
 if not public.toya_has_feature('invoice') or public.toya_has_feature('estimate') then raise exception 'billing entitlements wrong';end if;
 if (select count(*) from public.project_documents)<>2 then raise exception 'billing tier sees estimate';end if;
 if exists(select 1 from public.estimate_plans) or exists(select 1 from public.estimate_quantity_sheets) then raise exception 'billing tier sees saved estimating data';end if;
 begin d:=public.toya_save_project_document(gen_random_uuid(),null,jsonb_build_object('kind','estimate','site_id',current_setting('qa.plan_s'),'document_date',current_date,'subject','blocked','items',jsonb_build_array(jsonb_build_object('name','QA','quantity','1','unitPrice','100','unit','式')),'tax_rate',10));exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'billing tier created estimate';end if;
 d:=public.toya_save_project_document(gen_random_uuid(),null,jsonb_build_object('kind','invoice','site_id',current_setting('qa.plan_s'),'document_date',current_date,'subject','allowed','items',jsonb_build_array(jsonb_build_object('name','QA','quantity','1','unitPrice','100','unit','式')),'tax_rate',10));
end $$;
reset role;
update private.company_licenses set plan='daily' where company_id=current_setting('qa.plan_c')::uuid;
set local role authenticated;
do $$declare blocked boolean:=false;d public.project_documents;n integer;begin
 if not public.toya_has_feature('daily') or public.toya_has_feature('invoice') or public.toya_has_feature('estimate') or public.toya_has_feature('unknown') then raise exception 'daily entitlements wrong';end if;
 if exists(select 1 from public.project_documents) then raise exception 'daily tier sees documents';end if;
 begin d:=public.toya_save_project_document(gen_random_uuid(),null,jsonb_build_object('kind','invoice','site_id',current_setting('qa.plan_s'),'document_date',current_date,'subject','blocked','items',jsonb_build_array(jsonb_build_object('name','QA','quantity','1','unitPrice','100','unit','式')),'tax_rate',10));exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'daily tier created invoice';end if;
 update public.project_documents set subject='tampered';get diagnostics n=row_count;if n<>0 then raise exception 'daily tier updated document';end if;
 delete from public.project_documents;get diagnostics n=row_count;if n<>0 then raise exception 'daily tier deleted document';end if;
 insert into public.company_registries(company_id,kind,entries) values(current_setting('qa.plan_c')::uuid,'vehicles','[{"id":"qa","name":"QA vehicle","active":true}]');
 if not exists(select 1 from public.sites) then raise exception 'daily tier lost ordinary company data';end if;
 blocked:=false;begin update private.company_licenses set plan='complete';exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'customer changed own plan';end if;
end $$;
reset role;
update private.company_licenses set plan='complete' where company_id=current_setting('qa.plan_c')::uuid;
set local role authenticated;
do $$begin
 if (select count(*) from public.project_documents)<>4 or (select count(*) from public.estimate_plans)<>1 or (select count(*) from public.estimate_quantity_sheets)<>1 then raise exception 'downgrade deleted records';end if;
end $$;
reset role;
update private.company_licenses set status='suspended' where company_id=current_setting('qa.plan_c')::uuid;
set local role authenticated;
do $$begin if public.toya_has_feature('daily') or public.toya_has_feature('estimate') then raise exception 'suspended plan still grants features';end if;end $$;
set local role anon;
do $$declare blocked boolean:=false;begin begin perform public.toya_has_feature('daily');exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'anonymous feature RPC allowed';end if;end $$;
reset role;
rollback;
select 'PASS three tiers: invoice/progress/estimate RPC and table access, data retained across downgrade, ordinary company data, JWT tampering, seller-only changes, suspension and anonymous denial; rolled back' result;
