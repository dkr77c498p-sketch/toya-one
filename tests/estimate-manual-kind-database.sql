-- Only temporary fixtures are changed; ROLLBACK removes them all.
begin;
do $$declare c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();begin
 insert into public.companies(id,name) values(c,'QA manual estimate rollback');
 insert into auth.users(id,email,email_confirmed_at) values(u,u||'@example.invalid',now());
 insert into public.profiles(id,company_id,name,role,active) values(u,c,'QA manual estimate admin','admin',true);
 update private.company_licenses set status='active',plan='complete',internal=true,max_users=2 where company_id=c;
 insert into auth.sessions(id,user_id,created_at) values(u,u,clock_timestamp());
 perform set_config('qa.manual_company',c::text,true);
 perform set_config('qa.manual_user',u::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.manual_user'),'session_id',current_setting('qa.manual_user'),'role','authenticated')::text,true);
do $$declare r public.estimate_plans;loaded public.estimate_plans;data jsonb;binding jsonb;begin
 binding:=public.toya_access('bind',jsonb_build_object('device_key',repeat('d',64)));
 if (binding->'features'->>'estimate')::boolean is not true then raise exception 'fixture estimate access missing';end if;
 data:='{"entry_mode":"quote","title":"手入力の見積試験","site_name":"試験現場","customer_name":"試験見積先","tax_rate":10,"groups":[{"name":"草刈り <南側>","lines":[],"auto_input":{"kind":"custom","custom_name":"草刈り <南側>","area_m2":"300","overhead_rate":"20"},"auto_draft":{"kind":"custom","custom_name":"草刈り <南側>"},"quote_lines":[{"label":"草刈り <南側>","spec":"","quantity":"","unit":"","quote_price":"","quote_amount":null,"quantity_pending":true,"excluded":false}]}]}'::jsonb;
 r:=public.toya_save_estimate_plan(gen_random_uuid(),null,data);
 if r.calculation->>'complete' is distinct from 'false' or r.calculation->>'total' is not null then raise exception 'blank custom estimate was finalized';end if;
 if r.groups is distinct from data->'groups' then raise exception 'draft metadata or manual group changed during save';end if;
 data:=jsonb_set(data,'{groups,0,quote_lines,0,quantity}','"100"');
 data:=jsonb_set(data,'{groups,0,quote_lines,0,unit}','"㎡"');
 data:=jsonb_set(data,'{groups,0,quote_lines,0,quote_price}','"500"');
 data:=jsonb_set(data,'{groups,0,quote_lines}',(data#>'{groups,0,quote_lines}')||'[{"label":"集草・運搬","quantity":"1","unit":"式","quote_price":"5000","quote_amount":null,"excluded":false}]'::jsonb);
 r:=public.toya_save_estimate_plan(r.id,r.updated_at,data);
 select * into strict loaded from public.estimate_plans where id=r.id;
 if loaded.groups is distinct from data->'groups' then raise exception 'custom entry did not survive reload';end if;
 if loaded.calculation->>'complete' is distinct from 'true'
  or loaded.calculation->>'price' is distinct from '55000'
  or loaded.calculation->>'tax' is distinct from '5500'
  or loaded.calculation->>'total' is distinct from '60500'
 then raise exception 'manual estimate calculation mismatch: %',loaded.calculation;end if;
 if loaded.company_id is distinct from current_setting('qa.manual_company')::uuid then raise exception 'wrong company';end if;
end $$;
reset role;
rollback;
select 'PASS manual estimate: authenticated save, incomplete draft, metadata reload and 60500 total; all fixtures rolled back' as result;
