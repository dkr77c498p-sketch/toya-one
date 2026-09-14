-- Two synthetic companies/users only. Always roll back, including storage metadata.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); ua uuid:=gen_random_uuid(); ub uuid:=gen_random_uuid(); inactive uuid:=gen_random_uuid(); sa uuid; sb uuid;
begin
 insert into public.companies(id,name) values(a,'QA tenant A rollback'),(b,'QA tenant B rollback');
 insert into auth.users(id) values(ua),(ub),(inactive);
 insert into public.profiles(id,company_id,name,role,active) values(ua,a,'QA A','admin',true),(ub,b,'QA B','admin',true),(inactive,a,'QA inactive','employee',false);
 insert into public.sites(company_id,name) values(a,'QA A site') returning id into sa;
 insert into public.sites(company_id,name) values(b,'QA B site') returning id into sb;
 insert into storage.objects(bucket_id,name) values('toya-photos',a::text||'/qa/existing.jpg'),('toya-photos',b::text||'/qa/existing.jpg');
 perform set_config('toya.qa_company_a',a::text,true);perform set_config('toya.qa_company_b',b::text,true);
 perform set_config('toya.qa_user_a',ua::text,true);perform set_config('toya.qa_user_b',ub::text,true);perform set_config('toya.qa_inactive',inactive::text,true);
 perform set_config('toya.qa_site_a',sa::text,true);perform set_config('toya.qa_site_b',sb::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('toya.qa_user_a'),'role','authenticated')::text,true);
do $$
declare a text:=current_setting('toya.qa_company_a'); b text:=current_setting('toya.qa_company_b'); n integer; blocked boolean; d public.project_documents;
begin
 select count(*) into n from storage.objects where bucket_id='toya-photos';
 if n<>1 then raise exception 'FAIL photo SELECT must expose only company A'; end if;
 insert into storage.objects(bucket_id,name) values('toya-photos',a||'/qa/upload.jpg');
 update storage.objects set metadata='{"qa":true}'::jsonb where bucket_id='toya-photos' and name=a||'/qa/upload.jpg';get diagnostics n=row_count;
 if n<>1 then raise exception 'FAIL own-company photo update'; end if;
 blocked:=false;begin insert into storage.objects(bucket_id,name) values('toya-photos',b||'/qa/foreign.jpg');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'FAIL cross-company photo upload';end if;
 update storage.objects set metadata='{"qa":true}'::jsonb where bucket_id='toya-photos' and name=b||'/qa/existing.jpg';get diagnostics n=row_count;
 if n<>0 then raise exception 'FAIL cross-company photo update';end if;
 blocked:=false;begin update storage.objects set name=b||'/qa/moved.jpg' where bucket_id='toya-photos' and name=a||'/qa/upload.jpg';exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'FAIL photo reassignment';end if;
 if exists(select 1 from public.sites where id=current_setting('toya.qa_site_b')::uuid) then raise exception 'FAIL foreign site read';end if;
 if exists(select 1 from public.profiles where id=current_setting('toya.qa_user_b')::uuid) then raise exception 'FAIL foreign profile read';end if;
 d:=public.toya_save_project_document(gen_random_uuid(),null,jsonb_build_object('site_id',current_setting('toya.qa_site_a'),'kind','invoice','document_date',current_date,'subject','QA isolated invoice','customer_name','QA customer','issuer',jsonb_build_object('issuer_name','QA A'),'items',jsonb_build_array(jsonb_build_object('name','QA work','quantity','1','unitPrice','1000','unit','式')),'tax_rate',10));
 perform set_config('toya.qa_document',d.id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('toya.qa_user_b'),'role','authenticated')::text,true);
 if exists(select 1 from public.project_documents where id=d.id) then raise exception 'FAIL foreign invoice read';end if;
 blocked:=false;begin perform public.toya_delete_unissued_invoice(d.id,d.updated_at);exception when others then blocked:=true;end;
 if not blocked then raise exception 'FAIL foreign invoice delete';end if;
 select count(*) into n from storage.objects where bucket_id='toya-photos';
 if n<>1 then raise exception 'FAIL company B photo visibility';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('toya.qa_inactive'),'role','authenticated')::text,true);
 if exists(select 1 from storage.objects where bucket_id='toya-photos') then raise exception 'FAIL inactive photo access';end if;
 blocked:=false;begin insert into storage.objects(bucket_id,name) values('toya-photos',a||'/qa/inactive.jpg');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'FAIL inactive photo upload';end if;
 perform set_config('request.jwt.claims','{}',true);
 if exists(select 1 from storage.objects where bucket_id='toya-photos') then raise exception 'FAIL missing identity photo access';end if;
end $$;
reset role;
rollback;
select 'PASS two companies: own photo read/upload/update, foreign photo read/upload/update/move denied, foreign sites/profiles/invoices hidden, foreign invoice delete denied, inactive and missing identity denied; all fixtures rolled back' as result;
