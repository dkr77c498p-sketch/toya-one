-- Construction documents are separate from revenues: issuing never adds sales again.
alter table public.sites add column completed_on date;
alter table public.sites add column lifecycle_version integer not null default 0;
alter table public.sites add constraint sites_completion_state check (completed_on is null or status = 'inactive');
create policy sites_lifecycle_admin on public.sites as restrictive for update to authenticated
using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.company_id=sites.company_id and p.active and p.role='admin'))
with check (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.company_id=sites.company_id and p.active and p.role='admin'));

create table public.billing_profiles (
 company_id uuid primary key references public.companies(id),
 issuer_name text not null default '' check(length(issuer_name)<=160),
 address text not null default '' check(length(address)<=500),
 phone text not null default '' check(length(phone)<=80),
 registration_number text not null default '' check(registration_number='' or registration_number ~ '^T[0-9]{13}$'),
 bank_details text not null default '' check(length(bank_details)<=1000),
 updated_at timestamptz not null default clock_timestamp()
);
alter table public.billing_profiles enable row level security;
revoke all on public.billing_profiles from public,anon,authenticated;
grant select,insert,update on public.billing_profiles to authenticated;
grant all on public.billing_profiles to service_role;
create policy billing_profiles_admin on public.billing_profiles for all to authenticated
using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.company_id=billing_profiles.company_id and p.active and p.role='admin'))
with check (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.company_id=billing_profiles.company_id and p.active and p.role='admin'));

create table public.project_documents (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 site_id uuid not null references public.sites(id),
 kind text not null check(kind in('estimate','invoice','progress')),
 status text not null default 'draft' check(status in('draft','issued','void')),
 number_year integer,
 number_seq integer,
 document_number text,
 document_date date not null default current_date,
 transaction_start date,
 transaction_end date,
 due_date date,
 valid_until date,
 customer_name text not null default '' check(length(customer_name)<=160),
 customer_address text not null default '' check(length(customer_address)<=500),
 subject text not null default '' check(length(subject)<=200),
 notes text not null default '' check(length(notes)<=3000),
 site_name text not null default '',
 issuer jsonb not null default '{}'::jsonb check(jsonb_typeof(issuer)='object' and octet_length(issuer::text)<=6000),
 items jsonb not null default '[]'::jsonb check(jsonb_typeof(items)='array' and jsonb_array_length(items)<=200),
 tax_rate integer not null default 10 check(tax_rate in(0,8,10)),
 subtotal numeric(14,0) not null default 0 check(subtotal between 0 and 999999999999),
 tax_amount numeric(14,0) not null default 0,
 total numeric(14,0) not null default 0,
 cost_total numeric(14,0),
 cumulative_amount numeric(14,0),
 previous_billed numeric(14,0) not null default 0,
 contract_amount numeric(14,2),
 issued_at timestamptz,
 void_reason text not null default '' check(length(void_reason)<=500),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(company_id,kind,number_year,number_seq),
 unique(company_id,document_number),
 check(transaction_start is null or transaction_end is null or transaction_end>=transaction_start)
);
create index project_documents_company_site_idx on public.project_documents(company_id,site_id,document_date desc,id);
create index project_documents_site_idx on public.project_documents(site_id);
alter table public.project_documents enable row level security;
revoke all on public.project_documents from public,anon,authenticated;
grant select,insert,update on public.project_documents to authenticated;
grant all on public.project_documents to service_role;
create policy project_documents_admin on public.project_documents for all to authenticated
using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.company_id=project_documents.company_id and p.active and p.role='admin'))
with check (exists(select 1 from public.profiles p join public.sites s on s.company_id=p.company_id where p.id=(select auth.uid()) and p.company_id=project_documents.company_id and p.active and p.role='admin' and s.id=project_documents.site_id));

create function public.toya_document_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare
 item jsonb; q numeric; price numeric; cp numeric; v_sum numeric:=0; v_cost numeric:=0; missing_cost boolean:=false;
 v_contract numeric; v_prior numeric; v_rate_count integer; v_site text; v_seq integer;
begin
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.company_id=new.company_id and p.active and p.role='admin') then
  raise exception '管理者のログインが必要です。';
 end if;
 -- Serializes numbering, progress deductions and voiding across tabs/devices.
 perform pg_advisory_xact_lock(hashtextextended(new.company_id::text,0));
 select name into v_site from public.sites where id=new.site_id and company_id=new.company_id;
 if not found then raise exception '現場を確認してください。'; end if;
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
end $$;
revoke all on function public.toya_document_guard() from public,anon,authenticated;
create trigger project_documents_guard before insert or update on public.project_documents for each row execute function public.toya_document_guard();

create function public.toya_save_project_document(p_id uuid,p_expected_updated_at timestamptz,p_document jsonb)
returns public.project_documents language plpgsql security invoker set search_path='' as $$
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
   customer_name=coalesce(v.customer_name,''),customer_address=coalesce(v.customer_address,''),subject=coalesce(v.subject,''),notes=coalesce(v.notes,''),issuer=coalesce(v.issuer,'{}'),items=coalesce(v.items,'[]'),tax_rate=coalesce(v.tax_rate,10),cumulative_amount=v.cumulative_amount
   where id=p_id and company_id=c returning * into r;
 else
  if p_expected_updated_at is not null then raise exception '元の書類を確認できません。'; end if;
  insert into public.project_documents(id,company_id,site_id,kind,document_date,transaction_start,transaction_end,due_date,valid_until,customer_name,customer_address,subject,notes,issuer,items,tax_rate,cumulative_amount)
   values(p_id,c,v.site_id,v.kind,v.document_date,v.transaction_start,v.transaction_end,v.due_date,v.valid_until,coalesce(v.customer_name,''),coalesce(v.customer_address,''),coalesce(v.subject,''),coalesce(v.notes,''),coalesce(v.issuer,'{}'),coalesce(v.items,'[]'),coalesce(v.tax_rate,10),v.cumulative_amount) returning * into r;
 end if;
 return r;
end $$;

create function public.toya_issue_project_document(p_id uuid,p_expected_updated_at timestamptz)
returns public.project_documents language plpgsql security invoker set search_path='' as $$
declare c uuid; r public.project_documents;
begin
 select company_id into c from public.profiles where id=auth.uid() and active and role='admin';
 if c is null then raise exception '管理者のログインが必要です。'; end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,0));
 select * into r from public.project_documents where id=p_id and company_id=c for update;
 if not found then raise exception '書類を確認できません。'; end if;
 if r.status='issued' then return r; end if;
 if r.status<>'draft' or r.updated_at is distinct from p_expected_updated_at then raise exception '書類が更新されています。開き直してください。'; end if;
 update public.project_documents set status='issued' where id=p_id and company_id=c returning * into r;
 return r;
end $$;

create function public.toya_set_site_completion(p_site_id uuid,p_expected_version integer,p_completed_on date,p_reopen boolean default false)
returns public.sites language plpgsql security invoker set search_path='' as $$
declare c uuid; r public.sites;
begin
 select company_id into c from public.profiles where id=auth.uid() and active and role='admin';
 if c is null then raise exception '管理者のログインが必要です。'; end if;
 if not p_reopen and (p_completed_on is null or p_completed_on>(current_timestamp at time zone 'Asia/Tokyo')::date) then raise exception '完工日を今日以前の日付で入力してください。'; end if;
 update public.sites set completed_on=case when p_reopen then null else p_completed_on end,status=case when p_reopen then 'active' else 'inactive' end,lifecycle_version=lifecycle_version+1
 where id=p_site_id and company_id=c and lifecycle_version=p_expected_version returning * into r;
 if not found then raise exception '現場が更新されています。読み直してください。'; end if;
 return r;
end $$;

create function public.toya_void_project_document(p_id uuid,p_expected_updated_at timestamptz,p_reason text)
returns public.project_documents language plpgsql security invoker set search_path='' as $$
declare c uuid; r public.project_documents;
begin
 select company_id into c from public.profiles where id=auth.uid() and active and role='admin';
 if c is null then raise exception '管理者のログインが必要です。'; end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,0));
 select * into r from public.project_documents where id=p_id and company_id=c for update;
 if not found then raise exception '書類を確認できません。'; end if;
 if r.status='void' and r.void_reason=p_reason then return r; end if;
 if r.updated_at is distinct from p_expected_updated_at then raise exception '書類が更新されています。開き直してください。'; end if;
 update public.project_documents set status='void',void_reason=p_reason where id=p_id and company_id=c returning * into r;
 return r;
end $$;

create function public.toya_estimate_to_contract(p_id uuid,p_expected_revenue_updated_at timestamptz)
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
  update public.revenues set amount=d.subtotal,description='請負金額（税別）／見積 '+d.document_number,updated_at=clock_timestamp() where id=r.id returning * into r;
 else
  if p_expected_revenue_updated_at is not null then raise exception '元の請負金額を確認できません。'; end if;
  insert into public.revenues(company_id,site_id,revenue_type,revenue_date,description,amount) values(c,d.site_id,'contract',d.document_date,'請負金額（税別）／見積 '+d.document_number,d.subtotal) returning * into r;
 end if;
 return r;
end $$;

revoke all on function public.toya_save_project_document(uuid,timestamptz,jsonb) from public,anon,authenticated;
revoke all on function public.toya_issue_project_document(uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.toya_set_site_completion(uuid,integer,date,boolean) from public,anon,authenticated;
revoke all on function public.toya_estimate_to_contract(uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.toya_void_project_document(uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.toya_save_project_document(uuid,timestamptz,jsonb) to authenticated;
grant execute on function public.toya_issue_project_document(uuid,timestamptz) to authenticated;
grant execute on function public.toya_set_site_completion(uuid,integer,date,boolean) to authenticated;
grant execute on function public.toya_estimate_to_contract(uuid,timestamptz) to authenticated;
grant execute on function public.toya_void_project_document(uuid,timestamptz,text) to authenticated;
