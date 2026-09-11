-- Run inside BEGIN / ROLLBACK, setting toya.qa_admin and toya.qa_employee.
-- Uses no customer data or fixed production identifiers. Never commit the transaction.
do $$
declare g jsonb;
begin
 g:='[{"name":"QA","lines":[{"label":"QA work","quantity":null,"unit":"m³","quoted_unit_price":"-35000","quoted_amount":null,"source_page":1}]}]'::jsonb;
 if not public.toya_validate_quantity_groups(g) then raise exception 'FAIL preserve blank quantity and signed reference price'; end if;
 if public.toya_validate_quantity_groups(jsonb_set(g,'{0,lines,0,quantity}','"-1"')) then raise exception 'FAIL negative work quantity'; end if;
 if public.toya_validate_quantity_groups(jsonb_set(g,'{0,lines,0,quantity}','"1.2345"')) then raise exception 'FAIL quantity precision'; end if;
 if has_table_privilege('anon','public.estimate_quantity_sheets','SELECT') or has_table_privilege('authenticated','public.estimate_quantity_sheets','INSERT,UPDATE,DELETE') then raise exception 'FAIL quantity source privileges'; end if;
 if has_function_privilege('authenticated','public.toya_validate_quantity_groups(jsonb)','EXECUTE') then raise exception 'FAIL exposed import helper'; end if;
 perform set_config('toya.qa_quantity_count',(select count(*)::text from public.estimate_quantity_sheets where company_id=(select company_id from public.profiles where id=current_setting('toya.qa_admin')::uuid)),true);
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('toya.qa_admin'),'role','authenticated')::text,true);
do $$
declare c uuid; s uuid; p public.estimate_plans; g jsonb;
begin
 select company_id into c from public.profiles where id=auth.uid();
 if (select count(*) from public.estimate_quantity_sheets)<>current_setting('toya.qa_quantity_count')::int or current_setting('toya.qa_quantity_count')::int=0 then raise exception 'FAIL active admin cannot read imported quantities'; end if;
 if exists(select 1 from public.estimate_quantity_sheets where company_id<>c) then raise exception 'FAIL cross-company visibility'; end if;
 select id into s from public.sites where company_id=c order by id limit 1;
 g:='[{"name":"QA quantity copy","lines":[{"category":"other","label":"QA floor","quantity":"21.60","multiplier":"1","unit":"m²","unit_price":"","source_quantity_sheet_id":"synthetic-sheet","source_page":2,"source_quantity":"21.60","source_unit":"ｍ2","source_quoted_unit_price":"2000","source_quoted_amount":null},{"category":"waste","label":"QA credit","quantity":"0.80","multiplier":"1","unit":"t","unit_price":"","source_quoted_amount":"-28000"},{"category":"waste","label":"QA unknown","quantity":"","multiplier":"1","unit":"m³","unit_price":"","source_quantity":null}]}]'::jsonb;
 p:=public.toya_save_estimate_plan(gen_random_uuid(),null,jsonb_build_object('site_id',s,'title','QA quantity copy - rollback','groups',g,'tax_rate',10));
 if p.groups<>g or (p.calculation->>'complete')::boolean or p.calculation->'price'<>'null'::jsonb then raise exception 'FAIL quantity copy persistence'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('toya.qa_employee'),'role','authenticated')::text,true);
 if exists(select 1 from public.estimate_quantity_sheets) then raise exception 'FAIL employee visibility'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
 if exists(select 1 from public.estimate_quantity_sheets) then raise exception 'FAIL unknown identity visibility'; end if;
end $$;
reset role;
select 'PASS quantity validation, copy persistence, private admin reads, employee isolation and read-only source privileges' as result;
