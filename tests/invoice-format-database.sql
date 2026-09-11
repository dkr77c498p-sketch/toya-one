-- Run in a transaction with toya.qa_admin / toya.qa_employee set; always roll back.
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('toya.qa_admin'),'role','authenticated')::text,true);
do $$
declare c uuid; s public.sites; d public.project_documents; p jsonb; j jsonb; changed integer;
begin
 select company_id into c from public.profiles where id=auth.uid();
 update public.billing_profiles set postal_code='123-4567',fax='000-1111-2222',representative='QA representative',logo_key='toya' where company_id=c;
 get diagnostics changed=row_count;
 if changed<>1 then raise exception 'FAIL admin issuer update'; end if;
 select to_jsonb(b)-array['company_id','updated_at'] into p from public.billing_profiles b where company_id=c;
 if p->>'postal_code'<>'123-4567' or p->>'fax'<>'000-1111-2222' or p->>'representative'<>'QA representative' or p->>'logo_key'<>'toya' then raise exception 'FAIL issuer fields readback'; end if;
 insert into public.sites(company_id,name) values(c,'QA transaction only - invoice format') returning * into s;
 j:=jsonb_build_object('site_id',s.id,'kind','invoice','document_date','2026-09-11','transaction_end','2026-09-11','due_date','2026-10-31','customer_name','QA customer','subject','QA invoice','issuer',p,'tax_rate',10,
 'items',jsonb_build_array(jsonb_build_object('name','QA work','quantity','1','unit','式','unitPrice','1000','code','QA-001','remark','QA note')));
 d:=public.toya_save_project_document(gen_random_uuid(),null,j);
 if d.items->0->>'code'<>'QA-001' or d.items->0->>'remark'<>'QA note' or d.issuer<>p or d.total<>1100 then raise exception 'FAIL invoice fields round trip'; end if;
 d:=public.toya_issue_project_document(d.id,d.updated_at);
 update public.billing_profiles set fax='000-9999-9999' where company_id=c;
 if (select issuer->>'fax' from public.project_documents where id=d.id)<>'000-1111-2222' then raise exception 'FAIL issued snapshot changed'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('toya.qa_employee'),'role','authenticated')::text,true);
 if exists(select 1 from public.billing_profiles where company_id=c) then raise exception 'FAIL employee issuer visibility'; end if;
 update public.billing_profiles set fax='QA forbidden' where company_id=c;
 get diagnostics changed=row_count;
 if changed<>0 then raise exception 'FAIL employee issuer update'; end if;
 if exists(select 1 from public.project_documents where id=d.id) then raise exception 'FAIL employee invoice visibility'; end if;
end $$;
