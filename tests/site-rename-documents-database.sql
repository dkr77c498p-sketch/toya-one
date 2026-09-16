-- Runner supplies an active administrator and employee in one BEGIN / ROLLBACK.
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('toya.qa_admin'),'role','authenticated')::text,true);
do $$
declare
 c uuid:=public.toya_current_company_id();
 s public.sites; other_site public.sites; renamed public.sites;
 p public.estimate_plans; d public.project_documents; after_doc public.project_documents;
 old_name text:='QA 名称変更 '||substr(gen_random_uuid()::text,1,8);
 new_name text; next_name text; doc_kind text; state text; payload jsonb;
 original jsonb:='[]'; outside_before jsonb; before_plan jsonb; old_doc jsonb; expected jsonb;
 report_id uuid:=gen_random_uuid(); blocked boolean; n integer:=0; changed integer;
 attack text; invoice_id uuid; stale_draft public.project_documents;
begin
 new_name:=old_name||'(工事番号41-513)';next_name:=new_name||' 訂正';
 insert into public.sites(company_id,name,status) values(c,old_name,'active') returning * into s;
 insert into public.sites(company_id,name,status) values(c,'QA 別現場 '||gen_random_uuid(),'active') returning * into other_site;
 insert into public.revenues(company_id,site_id,revenue_type,revenue_date,description,amount)
 values(c,s.id,'contract',current_date,'QA contract',100000);
 insert into public.daily_reports(id,company_id,site_id,report_date,recorder_name,source_report_id,report_data)
 values(report_id,c,s.id,current_date,'QA',gen_random_uuid()::text,
  jsonb_build_object('site',old_name,'details',old_name,'siteMoves',jsonb_build_array(jsonb_build_object('site',old_name),jsonb_build_object('site','別現場'))));
 p:=public.toya_save_estimate_plan(gen_random_uuid(),null,jsonb_build_object(
  'entry_mode','quote','site_id',s.id,'title',old_name||' 見積','customer_name','QA customer',
  'work_period','約3日間','estimate_conditions',old_name||' の現地確認を含む。','quote_notes',old_name||' 自由な備考',
  'tax_rate',10,'groups',jsonb_build_array(jsonb_build_object('name',old_name||' 解体',
   'lines','[]'::jsonb,'quote_lines',jsonb_build_array(jsonb_build_object('label',old_name,'quantity','1','unit','式','quote_price','350000'))))));
 before_plan:=to_jsonb(p);
 foreach doc_kind in array array['invoice','progress','estimate'] loop
  foreach state in array array['draft','issued','void'] loop
   n:=n+1;
   if doc_kind='estimate' then
    d:=public.toya_create_estimate_document(p.id,p.updated_at,gen_random_uuid());
    d:=public.toya_save_project_document(d.id,d.updated_at,to_jsonb(d)||jsonb_build_object('issuer',jsonb_build_object('issuer_name','QA issuer')));
   else
    payload:=jsonb_build_object('site_id',s.id,'kind',doc_kind,'document_date',current_date,
     'transaction_end',current_date,'due_date',current_date+30,'customer_name','QA customer',
     'subject',old_name||' 工事','issuer',jsonb_build_object('issuer_name','QA issuer'),
     'notes',old_name||' 自由な備考','work_period','約3日間','estimate_conditions','契約条件は保存',
     'items',jsonb_build_array(jsonb_build_object('name',old_name,'quantity','1','unitPrice','100','costPrice','60','unit','式')),
     'tax_rate',10,'cumulative_amount',n*1000);
    d:=public.toya_save_project_document(gen_random_uuid(),null,payload);
   end if;
   if state<>'draft' then d:=public.toya_issue_project_document(d.id,d.updated_at); end if;
   if state='void' then d:=public.toya_void_project_document(d.id,d.updated_at,'QA cancellation'); end if;
   if doc_kind='invoice' and state='issued' then invoice_id:=d.id;end if;
   if doc_kind='invoice' and state='draft' then stale_draft:=d;end if;
   original:=original||jsonb_build_array(to_jsonb(d));
  end loop;
 end loop;
 -- A different site's custom title happens to contain the same old name.
 d:=public.toya_save_project_document(gen_random_uuid(),null,payload||jsonb_build_object('kind','invoice','site_id',other_site.id));
 select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into outside_before
 from public.project_documents x where site_id is distinct from s.id;

 renamed:=public.toya_rename_shared_site(s.id,s.lifecycle_version,new_name);
 if renamed.name<>new_name or renamed.lifecycle_version<>s.lifecycle_version+1 then raise exception 'FAIL site/version';end if;
 if (select report_data->>'site' from public.daily_reports where id=report_id)<>new_name
  or (select report_data#>>'{siteMoves,0,site}' from public.daily_reports where id=report_id)<>new_name
  or (select report_data->>'details' from public.daily_reports where id=report_id)<>old_name
  or (select report_data#>>'{siteMoves,1,site}' from public.daily_reports where id=report_id)<>'別現場'
 then raise exception 'FAIL daily report relationship/free text';end if;
 if (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.project_documents x where site_id is distinct from s.id)<>outside_before
 then raise exception 'FAIL unrelated documents changed';end if;
 select * into p from public.estimate_plans where id=p.id;
 if p.site_name<>new_name or p.title<>new_name||' 見積' or p.groups#>>'{0,name}'<>new_name||' 解体'
  or p.groups#>>'{0,quote_lines,0,label}'<>new_name or p.calculation->>'price'<>before_plan#>>'{calculation,price}'
  or p.calculation->>'total'<>before_plan#>>'{calculation,total}' or p.estimate_conditions<>before_plan->>'estimate_conditions'
 then raise exception 'FAIL saved plan labels or financial/condition preservation';end if;

 for old_doc in select value from jsonb_array_elements(original) loop
  select * into after_doc from public.project_documents where id=(old_doc->>'id')::uuid;
  if after_doc.site_name<>new_name or after_doc.subject<>new_name||substring(old_doc->>'subject' from length(old_name)+1)
   then raise exception 'FAIL document title %',after_doc.kind;end if;
  if (to_jsonb(after_doc)-array['site_name','subject','items','estimate_snapshot','updated_at'])<>
     (old_doc-array['site_name','subject','items','estimate_snapshot','updated_at'])
   then raise exception 'FAIL document amounts/status/number/conditions changed';end if;
  if exists(select 1 from jsonb_array_elements(after_doc.items) with ordinality a(value,pos)
    join jsonb_array_elements(old_doc->'items') with ordinality b(value,pos) using(pos)
    where (a.value-'name')<>(b.value-'name')) then raise exception 'FAIL item financial values changed';end if;
  if after_doc.kind='estimate' then
   if after_doc.estimate_snapshot->>'site_name'<>new_name
    or after_doc.estimate_snapshot->>'title'<>new_name||' 見積'
    or after_doc.estimate_snapshot#>>'{groups,0,quote_lines,0,label}'<>new_name
    or after_doc.estimate_snapshot->>'estimate_conditions'<>old_doc#>>'{estimate_snapshot,estimate_conditions}'
    or after_doc.estimate_snapshot#>>'{calculation,total}'<>old_doc#>>'{estimate_snapshot,calculation,total}'
    then raise exception 'FAIL immutable estimate snapshot name projection';end if;
  end if;
 end loop;
 if (select count(*) from public.project_documents where site_id=s.id and site_name=new_name)<>9
 then raise exception 'FAIL all kinds/statuses covered';end if;
 blocked:=false;
 begin perform public.toya_save_project_document(stale_draft.id,stale_draft.updated_at,to_jsonb(stale_draft));
 exception when others then blocked:=sqlerrm like '%更新されています%';end;
 if not blocked then raise exception 'FAIL stale save after rename';end if;
 blocked:=false;
 begin perform public.toya_rename_shared_site(s.id,s.lifecycle_version,next_name);
 exception when others then blocked:=sqlerrm like '%更新されています%';end;
 if not blocked then raise exception 'FAIL stale site version';end if;

 -- A canonical-name update must not create a way to edit issued financial data.
 update public.sites set name=next_name where id=s.id;
 foreach doc_kind in array array['invoice','estimate'] loop
  select * into d from public.project_documents x where x.site_id=s.id and x.kind=doc_kind and x.status='issued';
  expected:=public.toya_document_with_site_name(to_jsonb(d),next_name);
  foreach attack in array array['amount','quantity','tax','number','period','conditions','snapshot'] loop
   blocked:=false;
   begin
    update public.project_documents set site_name=next_name,subject=expected->>'subject',
     items=case when attack='amount' then jsonb_set(expected->'items','{0,unitPrice}','"999999"')
                when attack='quantity' then jsonb_set(expected->'items','{0,quantity}','"20"') else expected->'items' end,
     tax_rate=case when attack='tax' then 8 else d.tax_rate end,
     document_number=case when attack='number' then 'RENUMBER' else d.document_number end,
     work_period=case when attack='period' then '不正変更' else d.work_period end,
     estimate_conditions=case when attack='conditions' then '不正変更' else d.estimate_conditions end,
     estimate_snapshot=case when attack='snapshot' then '{"total":0}'::jsonb else nullif(expected->'estimate_snapshot','null') end
    where id=d.id;
   exception when others then blocked:=true;end;
   if not blocked then raise exception 'FAIL name-only guard bypass: % %',doc_kind,attack;end if;
  end loop;
 end loop;
 -- Existing renamed sites can repair old document labels without another lifecycle change.
 renamed:=public.toya_rename_shared_site(s.id,renamed.lifecycle_version,next_name);
 if renamed.lifecycle_version<>s.lifecycle_version+1 or
  (select count(*) from public.project_documents where site_id=s.id and site_name=next_name)<>9
 then raise exception 'FAIL existing site repair';end if;
 select jsonb_agg(to_jsonb(x) order by id) into expected from public.project_documents x where site_id=s.id;
 perform public.toya_rename_shared_site(s.id,renamed.lifecycle_version,next_name);
 if (select jsonb_agg(to_jsonb(x) order by id) from public.project_documents x where site_id=s.id)<>expected
 then raise exception 'FAIL repeated rename changed documents';end if;
 blocked:=false;
 begin update public.project_documents set subject='不正な件名変更' where id=invoice_id;
 exception when others then blocked:=true;end;
 if not blocked then raise exception 'FAIL issued document remains frozen';end if;

 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('toya.qa_employee'),'role','authenticated')::text,true);
 blocked:=false;
 begin perform public.toya_rename_shared_site(s.id,renamed.lifecycle_version,'QA forbidden');
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'FAIL employee rename';end if;
 update public.project_documents set site_name='QA forbidden' where id=invoice_id;
 get diagnostics changed=row_count;
 if changed<>0 then raise exception 'FAIL employee document mutation';end if;
 if exists(select 1 from public.project_documents where site_id=s.id) then raise exception 'FAIL employee financial visibility';end if;
end $$;
