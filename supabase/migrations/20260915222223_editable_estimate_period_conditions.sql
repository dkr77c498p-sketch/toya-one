-- Nullable fields retain the printed terms of existing documents.
-- New and edited estimates can use explicit text, including an empty string.

alter table public.estimate_plans
 add column work_period text check (char_length(work_period)<=200),
 add column estimate_conditions text check (char_length(estimate_conditions)<=6000);

alter table public.project_documents
 add column work_period text check (char_length(work_period)<=200),
 add column estimate_conditions text check (char_length(estimate_conditions)<=6000);

CREATE OR REPLACE FUNCTION public.toya_save_estimate_plan(p_id uuid, p_expected_updated_at timestamp with time zone, p_plan jsonb)
 RETURNS estimate_plans
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c uuid; v public.estimate_plans; r public.estimate_plans;
begin
 select company_id into c from public.profiles where id=auth.uid() and active and role='admin';
 if c is null then raise exception '管理者のログインが必要です。'; end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,0));
 v:=jsonb_populate_record(null::public.estimate_plans,p_plan);
 select * into r from public.estimate_plans where id=p_id and company_id=c for update;
 if found then
  if r.updated_at is distinct from p_expected_updated_at then raise exception '積算表が更新されています。開き直してから保存してください。'; end if;
  update public.estimate_plans set entry_mode=coalesce(v.entry_mode,r.entry_mode),title=v.title,site_name=coalesce(v.site_name,''),site_address=coalesce(v.site_address,''),customer_name=coalesce(v.customer_name,''),customer_address=coalesce(v.customer_address,''),internal_notes=coalesce(v.internal_notes,''),quote_notes=coalesce(v.quote_notes,''),work_period=case when p_plan?'work_period' then v.work_period else r.work_period end,estimate_conditions=case when p_plan?'estimate_conditions' then v.estimate_conditions else r.estimate_conditions end,groups=coalesce(v.groups,'[]'),overhead_percent=v.overhead_percent,markup_percent=v.markup_percent,quote_amount_override=v.quote_amount_override,tax_rate=coalesce(v.tax_rate,10) where id=p_id and company_id=c returning * into r;
 else
  if p_expected_updated_at is not null then raise exception '元の積算表を確認できません。'; end if;
  insert into public.estimate_plans(id,company_id,entry_mode,site_id,source_plan_id,title,site_name,site_address,customer_name,customer_address,internal_notes,quote_notes,work_period,estimate_conditions,groups,overhead_percent,markup_percent,quote_amount_override,tax_rate)
  values(p_id,c,coalesce(v.entry_mode,'cost'),v.site_id,v.source_plan_id,v.title,coalesce(v.site_name,''),coalesce(v.site_address,''),coalesce(v.customer_name,''),coalesce(v.customer_address,''),coalesce(v.internal_notes,''),coalesce(v.quote_notes,''),v.work_period,v.estimate_conditions,coalesce(v.groups,'[]'),v.overhead_percent,v.markup_percent,v.quote_amount_override,coalesce(v.tax_rate,10)) returning * into r;
 end if;
 return r;
end $function$;

CREATE OR REPLACE FUNCTION public.toya_create_estimate_document(p_plan_id uuid, p_expected_updated_at timestamp with time zone, p_document_id uuid)
 RETURNS project_documents
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c uuid; p public.estimate_plans; d public.project_documents; issuer jsonb;
begin
 select company_id into c from public.profiles where id=auth.uid() and active and role='admin';
 if c is null then raise exception '管理者のログインが必要です。'; end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,0));
 select * into d from public.project_documents where id=p_document_id and company_id=c;
 if found then
  if d.estimate_plan_id is distinct from p_plan_id then raise exception '書類を確認してください。'; end if;
  return d;
 end if;
 select * into p from public.estimate_plans where id=p_plan_id and company_id=c for update;
 if not found or p.updated_at is distinct from p_expected_updated_at then raise exception '積算表が更新されています。開き直してください。'; end if;
 if not (p.calculation->>'complete')::boolean then raise exception '積算表の未入力を確認してください。'; end if;
 select to_jsonb(b)-array['company_id','updated_at'] into issuer from public.billing_profiles b where company_id=c;
 insert into public.project_documents(id,company_id,site_id,site_name,site_address,kind,estimate_plan_id,document_date,customer_name,customer_address,subject,notes,work_period,estimate_conditions,issuer)
 values(p_document_id,c,p.site_id,p.site_name,p.site_address,'estimate',p.id,(current_timestamp at time zone 'Asia/Tokyo')::date,p.customer_name,p.customer_address,p.title,p.quote_notes,p.work_period,p.estimate_conditions,coalesce(issuer,'{}')) returning * into d;
 return d;
end $function$;

CREATE OR REPLACE FUNCTION public.toya_save_project_document(p_id uuid, p_expected_updated_at timestamp with time zone, p_document jsonb)
 RETURNS project_documents
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c uuid; r public.project_documents; v public.project_documents;
begin
 select company_id into c from public.profiles where id=auth.uid() and active and role='admin';
 if c is null then raise exception '管理者のログインが必要です。'; end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,0));
 v:=jsonb_populate_record(null::public.project_documents,p_document);
 select * into r from public.project_documents where company_id=c and id=p_id for update;
 if found then
  if r.status<>'draft' or r.updated_at is distinct from p_expected_updated_at then raise exception '書類が更新されています。一覧から開き直してください。'; end if;
  update public.project_documents set document_date=v.document_date,transaction_start=v.transaction_start,transaction_end=v.transaction_end,due_date=v.due_date,valid_until=v.valid_until,
   customer_name=coalesce(v.customer_name,''),customer_address=coalesce(v.customer_address,''),subject=coalesce(v.subject,''),notes=coalesce(v.notes,''),work_period=case when p_document?'work_period' then v.work_period else r.work_period end,estimate_conditions=case when p_document?'estimate_conditions' then v.estimate_conditions else r.estimate_conditions end,issuer=coalesce(v.issuer,'{}'),items=coalesce(v.items,'[]'),tax_rate=coalesce(v.tax_rate,10),cumulative_amount=v.cumulative_amount
   where id=p_id and company_id=c returning * into r;
 else
  if p_expected_updated_at is not null then raise exception '元の書類を確認できません。'; end if;
  insert into public.project_documents(id,company_id,site_id,kind,document_date,transaction_start,transaction_end,due_date,valid_until,customer_name,customer_address,subject,notes,work_period,estimate_conditions,issuer,items,tax_rate,cumulative_amount)
   values(p_id,c,v.site_id,v.kind,v.document_date,v.transaction_start,v.transaction_end,v.due_date,v.valid_until,coalesce(v.customer_name,''),coalesce(v.customer_address,''),coalesce(v.subject,''),coalesce(v.notes,''),v.work_period,v.estimate_conditions,coalesce(v.issuer,'{}'),coalesce(v.items,'[]'),coalesce(v.tax_rate,10),v.cumulative_amount) returning * into r;
 end if;
 return r;
end $function$;

notify pgrst, 'reload schema';
