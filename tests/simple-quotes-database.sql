-- Run inside BEGIN / ROLLBACK; supply toya.qa_admin and toya.qa_employee.
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('toya.qa_admin'),'role','authenticated')::text,true);
do $$
declare c uuid; j jsonb; p public.estimate_plans; d public.project_documents; saved public.project_documents; blocked boolean; before_sites integer; before_revenues integer;
begin
 select company_id into c from public.profiles where id=auth.uid();select count(*) into before_sites from public.sites where company_id=c;select count(*) into before_revenues from public.revenues where company_id=c;
 j:='{"entry_mode":"quote","site_id":null,"site_name":"QA new quote","site_address":"QA job location","title":"QA quotation","customer_name":"QA customer","tax_rate":10,"groups":[{"name":"QA scaffold","lines":[],"quote_lines":[{"label":"QA scaffold","quantity":"270","unit":"㎡","quote_price":"800"},{"label":"QA unused","quantity":"","unit":"検体","quote_price":"35000","excluded":true}]},{"name":"QA discount","lines":[],"quote_lines":[{"label":"QA discount","quantity":"1","unit":"式","quote_price":"-16000"}]}]}'::jsonb;
 p:=public.toya_save_estimate_plan(gen_random_uuid(),null,j);
 if p.entry_mode<>'quote' or p.site_id is not null or not (p.calculation->>'complete')::boolean or (p.calculation->>'price')::numeric<>200000 or p.calculation->>'profit' is not null then raise exception 'FAIL simple quote save';end if;
 d:=public.toya_create_estimate_document(p.id,p.updated_at,gen_random_uuid());
 if d.subtotal<>200000 or d.total<>220000 or d.cost_total is not null or d.estimate_snapshot->'groups'->0->'quote_lines'->0->>'quantity'<>'270' then raise exception 'FAIL simple quote snapshot';end if;
 d:=public.toya_save_project_document(d.id,d.updated_at,to_jsonb(d)||jsonb_build_object('issuer',jsonb_build_object('issuer_name','QA issuer')));
 saved:=public.toya_issue_project_document(d.id,d.updated_at);
 if saved.status<>'issued' then raise exception 'FAIL quote issuing';end if;
 j:=jsonb_set(j,'{groups,0,quote_lines,0,quantity}','"100"');p:=public.toya_save_estimate_plan(p.id,p.updated_at,j);
 if (select total from public.project_documents where id=saved.id)<>220000 then raise exception 'FAIL changed existing document';end if;
 blocked:=false;begin update public.project_documents set estimate_snapshot=jsonb_set(estimate_snapshot,'{groups,0,quote_lines,0,quantity}','"999"') where id=saved.id;exception when others then blocked:=true;end;
 if not blocked then raise exception 'FAIL mutable quote snapshot';end if;
 j:=jsonb_set(j,'{groups,0,quote_lines,1,excluded}','false');p:=public.toya_save_estimate_plan(p.id,p.updated_at,j);
 if (p.calculation->>'complete')::boolean then raise exception 'FAIL missing included quantity';end if;
 blocked:=false;begin perform public.toya_create_estimate_document(p.id,p.updated_at,gen_random_uuid());exception when others then blocked:=true;end;
 if not blocked then raise exception 'FAIL issuing incomplete quote';end if;
 if (select count(*) from public.sites where company_id=c)<>before_sites or (select count(*) from public.revenues where company_id=c)<>before_revenues then raise exception 'FAIL changed sites or revenue';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('toya.qa_employee'),'role','authenticated')::text,true);
do $$declare n integer;blocked boolean:=false;begin
 select count(*) into n from public.estimate_plans;if n<>0 then raise exception 'FAIL employee reads estimates';end if;
 begin perform public.toya_save_estimate_plan(gen_random_uuid(),null,'{"entry_mode":"quote","site_name":"Forbidden","title":"Forbidden","groups":[]}');exception when others then blocked:=true;end;
 if not blocked then raise exception 'FAIL employee writes estimate';end if;
end $$;
