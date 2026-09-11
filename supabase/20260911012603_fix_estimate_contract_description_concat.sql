-- Use PostgreSQL text concatenation for the contract description.
create or replace function public.toya_estimate_to_contract(p_id uuid,p_expected_revenue_updated_at timestamptz)
returns public.revenues language plpgsql security invoker set search_path='' as $$
declare c uuid; d public.project_documents; r public.revenues;
begin
 select company_id into c from public.profiles where id=auth.uid() and active and role='admin';
 if c is null then raise exception '管理者のログインが必要です。'; end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,0));
 select * into d from public.project_documents where id=p_id and company_id=c and kind='estimate' and status='issued';
 if not found then raise exception '確定済みの見積書を選んでください。'; end if;
 if d.subtotal<(select coalesce(sum(subtotal),0) from public.project_documents where company_id=c and site_id=d.site_id and kind<>'estimate' and status='issued') then raise exception '見積額が請求済額を下回ります。確認してください。'; end if;
 select * into r from public.revenues where company_id=c and site_id=d.site_id and revenue_type='contract' for update;
 if found then
  if r.updated_at is distinct from p_expected_revenue_updated_at then raise exception '請負金額が変更されています。読み直してください。'; end if;
  update public.revenues set amount=d.subtotal,description='請負金額（税別）／見積 '||d.document_number,updated_at=clock_timestamp() where id=r.id returning * into r;
 else
  if p_expected_revenue_updated_at is not null then raise exception '元の請負金額を確認できません。'; end if;
  insert into public.revenues(company_id,site_id,revenue_type,revenue_date,description,amount) values(c,d.site_id,'contract',d.document_date,'請負金額（税別）／見積 '||d.document_number,d.subtotal) returning * into r;
 end if;
 return r;
end $$;
