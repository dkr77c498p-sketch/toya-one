-- Unawarded estimates have their own job name/address and no operational site.
-- Keep company-admin RLS and preserve issued document snapshots.
alter table public.estimate_plans alter column site_id drop not null;
alter table public.estimate_plans add column site_name text not null default '' check(length(site_name)<=200);
alter table public.estimate_plans add column site_address text not null default '' check(length(site_address)<=500);
alter table public.estimate_plans add constraint estimate_plans_new_job_name check(site_id is not null or length(btrim(site_name))>0);
alter table public.project_documents alter column site_id drop not null;
alter table public.project_documents add column site_address text not null default '' check(length(site_address)<=500);
alter table public.project_documents add constraint project_documents_site_required check(site_id is not null or (kind='estimate' and length(btrim(site_name)) between 1 and 200));

alter policy estimate_plans_admin on public.estimate_plans with check(
 exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.company_id=estimate_plans.company_id and p.active and p.role='admin')
 and (site_id is null or exists(select 1 from public.sites s where s.id=estimate_plans.site_id and s.company_id=estimate_plans.company_id))
);
alter policy project_documents_admin on public.project_documents with check(
 exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.company_id=project_documents.company_id and p.active and p.role='admin')
 and ((site_id is null and kind='estimate') or exists(select 1 from public.sites s where s.id=project_documents.site_id and s.company_id=project_documents.company_id))
);

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
 insert into public.project_documents(id,company_id,site_id,site_name,site_address,kind,estimate_plan_id,document_date,customer_name,customer_address,subject,notes,issuer)
 values(p_document_id,c,p.site_id,p.site_name,p.site_address,'estimate',p.id,(current_timestamp at time zone 'Asia/Tokyo')::date,p.customer_name,p.customer_address,p.title,p.quote_notes,coalesce(issuer,'{}')) returning * into d;
 return d;
end $function$;

CREATE OR REPLACE FUNCTION public.toya_document_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 item jsonb; q numeric; price numeric; cp numeric; v_sum numeric:=0; v_cost numeric:=0; missing_cost boolean:=false;
 v_contract numeric; v_prior numeric; v_rate_count integer; v_site text; v_seq integer;
begin
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.company_id=new.company_id and p.active and p.role='admin') then
  raise exception '管理者のログインが必要です。';
 end if;
 -- Serializes numbering, progress deductions and voiding across tabs/devices.
 perform pg_advisory_xact_lock(hashtextextended(new.company_id::text,0));
 if new.site_id is null then
  if new.kind<>'estimate' or nullif(btrim(new.site_name),'') is null then raise exception '新しい工事名を入力してください。'; end if;
  v_site:=btrim(new.site_name);
 else
  select name into v_site from public.sites where id=new.site_id and company_id=new.company_id;
  if not found then raise exception '現場を確認してください。'; end if;
 end if;
 if tg_op='INSERT' then
  if new.status<>'draft' then raise exception '先に下書きを保存してください。'; end if;
  new.created_at:=clock_timestamp();
 else
  if (new.id,new.company_id,new.site_id,new.kind,new.created_at) is distinct from (old.id,old.company_id,old.site_id,old.kind,old.created_at) then raise exception '書類の現場・種類は変更できません。新規作成してください。'; end if;
  if old.status='void' then raise exception '取消済みの書類は変更できません。'; end if;
  if old.status='issued' then
   if new.status<>'void' or (to_jsonb(new)-array['status','void_reason','updated_at']) is distinct from (to_jsonb(old)-array['status','void_reason','updated_at']) then raise exception '確定済み書類は編集できません。取消後に作り直してください。'; end if;
   if old.kind<>'estimate' and exists(select 1 from public.project_documents d where d.company_id=old.company_id and d.site_id=old.site_id and d.kind<>'estimate' and d.status='issued' and d.issued_at>old.issued_at) then raise exception '後の請求書があります。新しい請求書から順に取り消してください。'; end if;
  end if;
 end if;
 if new.status='void' then
  if length(btrim(new.void_reason))=0 then raise exception '取消理由を入力してください。'; end if;
  new.updated_at:=clock_timestamp(); return new;
 end if;
 new.site_name:=v_site;
 select amount into v_contract from public.revenues where company_id=new.company_id and site_id=new.site_id and revenue_type='contract';
 select coalesce(sum(subtotal),0),count(*) filter(where tax_rate<>new.tax_rate) into v_prior,v_rate_count
 from public.project_documents where company_id=new.company_id and site_id=new.site_id and kind<>'estimate' and status='issued' and id<>new.id;
 if new.kind='progress' then
  if v_contract is null then raise exception '先にこの現場の請負金額を登録してください。'; end if;
  if new.cumulative_amount is null or new.cumulative_amount<=v_prior or new.cumulative_amount>v_contract then raise exception '累計出来高は請求済額より大きく、請負金額以下で入力してください。'; end if;
  if v_rate_count>0 then raise exception '既存の請求書と税率が異なります。確認してください。'; end if;
  if tg_op='UPDATE' and new.status='issued' and (old.previous_billed is distinct from v_prior or old.contract_amount is distinct from v_contract) then raise exception '請負金額または請求済額が変わりました。下書きを保存し直して今回請求額を確認してください。'; end if;
  new.items:=jsonb_build_array(jsonb_build_object('name',coalesce(nullif(new.subject,''),v_site)||' 出来高分','spec','','quantity','1','unit','式','unitPrice',(new.cumulative_amount-v_prior)::text,'costPrice',null));
 end if;
 if jsonb_array_length(new.items)=0 then raise exception '明細を1行以上入力してください。'; end if;
 for item in select value from jsonb_array_elements(new.items) loop
  if jsonb_typeof(item)<>'object' or coalesce(length(btrim(item->>'name')),0) not between 1 and 200 or length(coalesce(item->>'spec',''))>500 or length(coalesce(item->>'unit',''))>20 then raise exception '明細の品名・規格・単位を確認してください。'; end if;
  if coalesce(item->>'quantity','') !~ '^[0-9]+(\.[0-9]{1,3})?$' or coalesce(item->>'unitPrice','') !~ '^-?[0-9]+(\.[0-9]{1,2})?$' then raise exception '数量は小数3桁、単価は小数2桁までの数字で入力してください。'; end if;
  q:=(item->>'quantity')::numeric; price:=(item->>'unitPrice')::numeric;
  if q<=0 or q>1000000 or abs(price)>999999999999 then raise exception '数量または単価が範囲外です。'; end if;
  v_sum:=v_sum+floor(q*price);
  if nullif(item->>'costPrice','') is null then missing_cost:=true;
  else
   if item->>'costPrice' !~ '^[0-9]+(\.[0-9]{1,2})?$' then raise exception '原価単価を確認してください。'; end if;
   cp:=(item->>'costPrice')::numeric;
   if cp>999999999999 then raise exception '原価単価が範囲外です。'; end if;
   v_cost:=v_cost+floor(q*cp);
  end if;
 end loop;
 if v_sum<0 or v_sum>999999999999 or v_cost>999999999999 then raise exception '合計金額を確認してください。'; end if;
 new.subtotal:=v_sum; new.cost_total:=case when missing_cost then null else v_cost end;
 new.tax_amount:=floor(v_sum*new.tax_rate/100); new.total:=new.subtotal+new.tax_amount;
 new.previous_billed:=case when new.kind='estimate' then 0 else v_prior end;
 new.contract_amount:=v_contract;
 if new.kind<>'progress' then new.cumulative_amount:=null; end if;
 new.updated_at:=clock_timestamp();
 if new.status='issued' then
  if length(btrim(new.customer_name))=0 or length(btrim(new.subject))=0 or coalesce(length(btrim(new.issuer->>'issuer_name')),0)=0 then raise exception '宛先・件名・発行者名を入力してください。'; end if;
  if coalesce(new.issuer->>'registration_number','')<>'' and (new.issuer->>'registration_number') !~ '^T[0-9]{13}$' then raise exception '登録番号はTと13桁の数字で入力してください。'; end if;
  if new.kind<>'estimate' and (new.transaction_end is null or new.due_date is null or new.subtotal<=0) then raise exception '取引日（期間終了）・支払期限・請求明細を確認してください。'; end if;
  if new.kind<>'estimate' and v_contract is not null and v_prior+v_sum>v_contract then raise exception '請求済額との合計が請負金額を超えます。追加工事は請負金額を更新してから請求してください。'; end if;
  new.number_year:=extract(year from new.document_date)::integer;
  select coalesce(max(number_seq),0)+1 into v_seq from public.project_documents where company_id=new.company_id and kind=new.kind and number_year=new.number_year;
  new.number_seq:=v_seq;
  new.document_number:=(case new.kind when 'estimate' then 'EST' when 'progress' then 'PRG' else 'INV' end)||'-'||new.number_year::text||'-'||lpad(v_seq::text,greatest(4,length(v_seq::text)),'0');
  new.issued_at:=clock_timestamp();
 else
  new.document_number:=null; new.number_year:=null; new.number_seq:=null; new.issued_at:=null;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.toya_estimate_document_source_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare p public.estimate_plans;
begin
 if tg_op='UPDATE' then
  if (new.estimate_plan_id,new.estimate_snapshot) is distinct from (old.estimate_plan_id,old.estimate_snapshot) then raise exception '見積書の積算元は変更できません。'; end if;
  if old.estimate_plan_id is not null and (new.items,new.tax_rate,new.site_name,new.site_address) is distinct from (old.items,old.tax_rate,old.site_name,old.site_address) then raise exception '金額の変更は積算表で行い、見積書を作り直してください。'; end if;
 elsif new.estimate_plan_id is not null then
  select * into p from public.estimate_plans where id=new.estimate_plan_id and company_id=new.company_id and site_id is not distinct from new.site_id;
  if not found or new.kind<>'estimate' then raise exception '積算元の現場を確認してください。'; end if;
  if not (p.calculation->>'complete')::boolean then raise exception '積算表の未入力を確認してください。'; end if;
  new.site_name:=p.site_name;new.site_address:=p.site_address;
  new.items:=p.calculation->'quote_items';new.tax_rate:=p.tax_rate;new.estimate_snapshot:=to_jsonb(p);
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.toya_estimate_plan_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.company_id=new.company_id and p.active and p.role='admin') then raise exception '管理者のログインが必要です。'; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.company_id::text,0));
 if new.site_id is null then
  new.site_name:=btrim(coalesce(new.site_name,''));
  if new.site_name='' then raise exception '新しい工事名を入力してください。'; end if;
 else
  select name into new.site_name from public.sites where id=new.site_id and company_id=new.company_id;
  if not found then raise exception '現場を確認してください。'; end if;
 end if;
 if tg_op='UPDATE' and (new.id,new.company_id,new.site_id,new.source_plan_id,new.created_at) is distinct from (old.id,old.company_id,old.site_id,old.source_plan_id,old.created_at) then raise exception '別の現場へは積算表を複製してください。'; end if;
 if new.source_plan_id is not null and (new.source_plan_id=new.id or not exists(select 1 from public.estimate_plans where id=new.source_plan_id and company_id=new.company_id)) then raise exception '複製元の積算表を確認してください。'; end if;
 new.calculation:=public.toya_calculate_estimate_plan(new.groups,new.overhead_percent,new.markup_percent,new.quote_amount_override,new.tax_rate);
 if tg_op='INSERT' then new.created_at:=clock_timestamp(); end if;
 new.updated_at:=clock_timestamp();return new;
end $function$;

CREATE OR REPLACE FUNCTION public.toya_estimate_to_contract(p_id uuid, p_expected_revenue_updated_at timestamp with time zone)
 RETURNS revenues
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c uuid; d public.project_documents; r public.revenues;
begin
 select company_id into c from public.profiles where id=auth.uid() and active and role='admin';
 if c is null then raise exception '管理者のログインが必要です。'; end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,0));
 select * into d from public.project_documents where id=p_id and company_id=c and kind='estimate' and status='issued';
 if not found then raise exception '確定済みの見積書を選んでください。'; end if;
 if d.site_id is null then raise exception 'この見積は受注前の新規工事です。受注した現場の請負金額として登録してください。'; end if;
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
end $function$;

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
  update public.estimate_plans set title=v.title,site_name=coalesce(v.site_name,''),site_address=coalesce(v.site_address,''),customer_name=coalesce(v.customer_name,''),customer_address=coalesce(v.customer_address,''),internal_notes=coalesce(v.internal_notes,''),quote_notes=coalesce(v.quote_notes,''),groups=coalesce(v.groups,'[]'),overhead_percent=v.overhead_percent,markup_percent=v.markup_percent,quote_amount_override=v.quote_amount_override,tax_rate=coalesce(v.tax_rate,10) where id=p_id and company_id=c returning * into r;
 else
  if p_expected_updated_at is not null then raise exception '元の積算表を確認できません。'; end if;
  insert into public.estimate_plans(id,company_id,site_id,source_plan_id,title,site_name,site_address,customer_name,customer_address,internal_notes,quote_notes,groups,overhead_percent,markup_percent,quote_amount_override,tax_rate)
  values(p_id,c,v.site_id,v.source_plan_id,v.title,coalesce(v.site_name,''),coalesce(v.site_address,''),coalesce(v.customer_name,''),coalesce(v.customer_address,''),coalesce(v.internal_notes,''),coalesce(v.quote_notes,''),coalesce(v.groups,'[]'),v.overhead_percent,v.markup_percent,v.quote_amount_override,coalesce(v.tax_rate,10)) returning * into r;
 end if;
 return r;
end $function$;
