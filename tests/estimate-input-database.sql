-- Run inside BEGIN / ROLLBACK with toya.qa_admin and toya.qa_employee set.
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('toya.qa_admin'),'role','authenticated')::text,true);
do $$
declare p public.estimate_plans; d public.project_documents; saved public.project_documents; before_version timestamptz; blocked boolean; j jsonb;
begin
 j:=jsonb_build_object('entry_mode','quote','site_id',null,'site_name','QA 家屋内部残置物撤去工事','title','QA 見積書','customer_name','QA 見積先','work_period','着工から約3日間','estimate_conditions',E'残置物の撤去・運搬処分を含む。\n現地確認の範囲。','tax_rate',10,
  'groups','[{"name":"家屋内部残置物撤去工事","lines":[],"quote_lines":[{"label":"家屋内部残置物撤去工事","quantity":"1","unit":"式","quote_price":"350000"}]}]'::jsonb);
 p:=public.toya_save_estimate_plan(gen_random_uuid(),null,j);
 if p.work_period<>'着工から約3日間' or p.estimate_conditions<>j->>'estimate_conditions' then raise exception 'FAIL save plan text'; end if;
 before_version:=p.updated_at;
 p:=public.toya_save_estimate_plan(p.id,p.updated_at,to_jsonb(p)-array['work_period','estimate_conditions']);
 if p.work_period<>'着工から約3日間' or p.estimate_conditions<>j->>'estimate_conditions' then raise exception 'FAIL older client cleared plan text'; end if;
 blocked:=false;begin perform public.toya_save_estimate_plan(p.id,before_version,j);exception when others then blocked:=sqlerrm like '%更新されています%';end;
 if not blocked then raise exception 'FAIL plan version check';end if;
 d:=public.toya_create_estimate_document(p.id,p.updated_at,gen_random_uuid());
 if d.work_period<>p.work_period or d.estimate_conditions<>p.estimate_conditions or d.estimate_snapshot->>'work_period'<>p.work_period or d.total<>385000 then raise exception 'FAIL quote text snapshot or amount';end if;
 d:=public.toya_save_project_document(d.id,d.updated_at,to_jsonb(d)||jsonb_build_object('work_period','約2日間','estimate_conditions','残置物撤去を含む。','issuer',jsonb_build_object('issuer_name','QA issuer')));
 if d.work_period<>'約2日間' or d.estimate_conditions<>'残置物撤去を含む。' then raise exception 'FAIL document text edit';end if;
 d:=public.toya_save_project_document(d.id,d.updated_at,to_jsonb(d)-array['work_period','estimate_conditions']);
 if d.work_period<>'約2日間' or d.estimate_conditions<>'残置物撤去を含む。' then raise exception 'FAIL older client cleared document text';end if;
 before_version:=d.updated_at;
 d:=public.toya_save_project_document(d.id,d.updated_at,to_jsonb(d)||jsonb_build_object('work_period','','estimate_conditions',''));
 if d.work_period<>'' or d.estimate_conditions<>'' then raise exception 'FAIL deliberate blank text';end if;
 blocked:=false;begin perform public.toya_save_project_document(d.id,before_version,to_jsonb(d));exception when others then blocked:=sqlerrm like '%更新されています%';end;
 if not blocked then raise exception 'FAIL document version check';end if;
 blocked:=false;begin perform public.toya_save_project_document(d.id,d.updated_at,to_jsonb(d)||jsonb_build_object('work_period',repeat('字',201)));exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'FAIL work period length limit';end if;
 blocked:=false;begin perform public.toya_save_project_document(d.id,d.updated_at,to_jsonb(d)||jsonb_build_object('estimate_conditions',repeat('字',6001)));exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'FAIL conditions length limit';end if;
 saved:=public.toya_issue_project_document(d.id,d.updated_at);
 if saved.status<>'issued' or saved.total<>385000 then raise exception 'FAIL issue';end if;
 blocked:=false;begin update public.project_documents set work_period='変更禁止' where id=saved.id;exception when others then blocked:=sqlerrm like '%確定済み%';end;
 if not blocked then raise exception 'FAIL frozen issued period';end if;
 blocked:=false;begin update public.project_documents set estimate_conditions='変更禁止' where id=saved.id;exception when others then blocked:=sqlerrm like '%確定済み%';end;
 if not blocked then raise exception 'FAIL frozen issued conditions';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('toya.qa_employee'),'role','authenticated')::text,true);
do $$declare blocked boolean:=false;begin
 if exists(select 1 from public.project_documents) or exists(select 1 from public.estimate_plans) then raise exception 'FAIL employee visibility';end if;
 begin perform public.toya_save_estimate_plan(gen_random_uuid(),null,'{"title":"Forbidden","site_name":"Forbidden","work_period":"secret","groups":[]}');exception when others then blocked:=sqlerrm like '%管理者%';end;
 if not blocked then raise exception 'FAIL employee write';end if;
end $$;
