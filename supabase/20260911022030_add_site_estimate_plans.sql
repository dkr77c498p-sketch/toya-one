-- Site-based planned costs, independent of completion and actual-cost records.
create function public.toya_estimate_number(p_value text,p_places integer,p_max numeric,p_label text,p_positive boolean default false)
returns numeric language plpgsql immutable security invoker set search_path='' as $$
declare n numeric;
begin
 if nullif(btrim(p_value),'') is null then return null; end if;
 if btrim(p_value) !~ ('^[0-9]+(\.[0-9]{1,'||p_places||'})?$') then raise exception '%は小数%桁までの数字で入力してください。',p_label,p_places; end if;
 n:=btrim(p_value)::numeric;
 if n>p_max or (p_positive and n=0) then raise exception '%の範囲を確認してください。',p_label; end if;
 return n;
end $$;

create function public.toya_calculate_estimate_plan(p_groups jsonb,p_overhead numeric,p_markup numeric,p_override numeric,p_tax integer)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare
 g jsonb; r jsonb; result_groups jsonb:='[]'; quote_items jsonb:='[]'; groups_out jsonb:='[]';
 q numeric; m numeric; price numeric; amount numeric; cost numeric; direct numeric:=0; overhead numeric; total_cost numeric; markup numeric; selling numeric; tax numeric;
 missing integer; pending integer:=0; count_lines integer:=0; cumulative numeric:=0; denominator numeric; oh_total numeric; price_total numeric; prev_oh numeric:=0; prev_price numeric:=0;
begin
 if jsonb_typeof(p_groups) is distinct from 'array' or jsonb_array_length(p_groups)>100 then raise exception '工事項目は100件までです。'; end if;
 if jsonb_array_length(p_groups)=0 then pending:=1; end if;
 for g in select value from jsonb_array_elements(p_groups) loop
  if jsonb_typeof(g) is distinct from 'object' or length(coalesce(g->>'name',''))>200 or jsonb_typeof(g->'lines') is distinct from 'array' then raise exception '工事項目を確認してください。'; end if;
  count_lines:=count_lines+jsonb_array_length(g->'lines');
  if count_lines>300 then raise exception '内訳は合計300行までです。'; end if;
  missing:=case when nullif(btrim(g->>'name'),'') is null then 1 else 0 end;
  if jsonb_array_length(g->'lines')=0 then missing:=missing+1; end if;
  cost:=0;
  for r in select value from jsonb_array_elements(g->'lines') loop
   if jsonb_typeof(r) is distinct from 'object' or coalesce(r->>'category','') not in('labor','equipment','vehicle','attachment','tool','fuel','waste','transport','material','subcontract','other') then raise exception '費目を選んでください。'; end if;
   if length(coalesce(r->>'label',''))>200 or length(coalesce(r->>'unit',''))>20 or length(coalesce(r->>'source_table',''))>100 or length(coalesce(r->>'source_id',''))>100 or length(coalesce(r->>'source_updated_at',''))>100 then raise exception '品名・単位を確認してください。'; end if;
   q:=public.toya_estimate_number(r->>'quantity',3,1000000,'数量',true);
   m:=public.toya_estimate_number(r->>'multiplier',3,1000000,'日数・回数',true);
   price:=public.toya_estimate_number(r->>'unit_price',2,999999999999,'単価');
   if nullif(btrim(r->>'label'),'') is null or nullif(btrim(r->>'unit'),'') is null or q is null or m is null or price is null then missing:=missing+1;
   else
    amount:=floor(q*m*price);
    if amount>999999999999 then raise exception '積算金額が大きすぎます。'; end if;
    cost:=cost+amount;
   end if;
  end loop;
  pending:=pending+missing;direct:=direct+cost;
  result_groups:=result_groups||jsonb_build_array(jsonb_build_object('name',coalesce(g->>'name',''),'cost',cost,'missing',missing,'overhead',null,'price',null));
 end loop;
 if direct>999999999999 then raise exception '積算金額が大きすぎます。'; end if;
 perform public.toya_estimate_number(p_overhead::text,2,1000,'諸経費率');
 perform public.toya_estimate_number(p_markup::text,2,1000,'利益上乗せ率');
 perform public.toya_estimate_number(p_override::text,2,999999999999,'見積額');
 if p_override is not null and trunc(p_override)<>p_override then raise exception '見積額は1円単位で入力してください。'; end if;
 if p_overhead is null then pending:=pending+1; end if;
 if p_markup is null then pending:=pending+1; end if;
 if p_tax is null or p_tax not in(0,8,10) then raise exception '税率を確認してください。'; end if;
 if pending>0 then return jsonb_build_object('complete',false,'pending',pending,'known_cost',direct,'overhead',null,'total_cost',null,'markup',null,'price',null,'profit',null,'tax',null,'total',null,'groups',result_groups,'quote_items','[]'::jsonb); end if;
 overhead:=floor(direct*p_overhead/100);total_cost:=direct+overhead;markup:=floor(total_cost*p_markup/100);selling:=coalesce(p_override,total_cost+markup);tax:=floor(selling*p_tax/100);
 if greatest(overhead,total_cost,markup,selling)>999999999999 then raise exception '積算金額が大きすぎます。'; end if;
 denominator:=case when direct=0 then jsonb_array_length(result_groups) else direct end;
 for r in select value from jsonb_array_elements(result_groups) loop
  cumulative:=cumulative+case when direct=0 then 1 else (r->>'cost')::numeric end;
  oh_total:=floor(overhead*cumulative/denominator);price_total:=floor(selling*cumulative/denominator);
  groups_out:=groups_out||jsonb_build_array(r||jsonb_build_object('overhead',oh_total-prev_oh,'price',price_total-prev_price));
  quote_items:=quote_items||jsonb_build_array(jsonb_build_object('name',r->>'name','spec','','quantity','1','unit','式','unitPrice',(price_total-prev_price)::text,'costPrice',((r->>'cost')::numeric+oh_total-prev_oh)::text));
  prev_oh:=oh_total;prev_price:=price_total;
 end loop;
 return jsonb_build_object('complete',true,'pending',0,'known_cost',direct,'overhead',overhead,'total_cost',total_cost,'markup',markup,'price',selling,'profit',selling-total_cost,'tax',tax,'total',selling+tax,'groups',groups_out,'quote_items',quote_items);
end $$;

create table public.estimate_plans(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 site_id uuid not null references public.sites(id),
 source_plan_id uuid references public.estimate_plans(id),
 title text not null check(length(btrim(title)) between 1 and 200),
 customer_name text not null default '' check(length(customer_name)<=160),
 customer_address text not null default '' check(length(customer_address)<=500),
 internal_notes text not null default '' check(length(internal_notes)<=3000),
 quote_notes text not null default '' check(length(quote_notes)<=3000),
 groups jsonb not null default '[]' check(octet_length(groups::text)<=250000),
 overhead_percent numeric,
 markup_percent numeric,
 quote_amount_override numeric,
 tax_rate integer not null default 10,
 calculation jsonb not null default '{}',
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp()
);
create index estimate_plans_company_site_idx on public.estimate_plans(company_id,site_id,updated_at desc,id);
create index estimate_plans_site_idx on public.estimate_plans(site_id);
create index estimate_plans_source_idx on public.estimate_plans(source_plan_id);
alter table public.estimate_plans enable row level security;
revoke all on public.estimate_plans from public,anon,authenticated;
grant select,insert,update on public.estimate_plans to authenticated;
grant all on public.estimate_plans to service_role;
create policy estimate_plans_admin on public.estimate_plans for all to authenticated
using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.company_id=estimate_plans.company_id and p.active and p.role='admin'))
with check(exists(select 1 from public.profiles p join public.sites s on s.company_id=p.company_id where p.id=(select auth.uid()) and p.company_id=estimate_plans.company_id and p.active and p.role='admin' and s.id=estimate_plans.site_id));

create function public.toya_estimate_plan_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.company_id=new.company_id and p.active and p.role='admin') then raise exception '管理者のログインが必要です。'; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.company_id::text,0));
 if not exists(select 1 from public.sites where id=new.site_id and company_id=new.company_id) then raise exception '現場を確認してください。'; end if;
 if tg_op='UPDATE' and (new.id,new.company_id,new.site_id,new.source_plan_id,new.created_at) is distinct from (old.id,old.company_id,old.site_id,old.source_plan_id,old.created_at) then raise exception '別の現場へは積算表を複製してください。'; end if;
 if new.source_plan_id is not null and (new.source_plan_id=new.id or not exists(select 1 from public.estimate_plans where id=new.source_plan_id and company_id=new.company_id)) then raise exception '複製元の積算表を確認してください。'; end if;
 new.calculation:=public.toya_calculate_estimate_plan(new.groups,new.overhead_percent,new.markup_percent,new.quote_amount_override,new.tax_rate);
 if tg_op='INSERT' then new.created_at:=clock_timestamp(); end if;
 new.updated_at:=clock_timestamp();return new;
end $$;
create trigger estimate_plans_guard before insert or update on public.estimate_plans for each row execute function public.toya_estimate_plan_guard();

create function public.toya_save_estimate_plan(p_id uuid,p_expected_updated_at timestamptz,p_plan jsonb)
returns public.estimate_plans language plpgsql security invoker set search_path='' as $$
declare c uuid; v public.estimate_plans; r public.estimate_plans;
begin
 select company_id into c from public.profiles where id=auth.uid() and active and role='admin';
 if c is null then raise exception '管理者のログインが必要です。'; end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,0));
 v:=jsonb_populate_record(null::public.estimate_plans,p_plan);
 select * into r from public.estimate_plans where id=p_id and company_id=c for update;
 if found then
  if r.updated_at is distinct from p_expected_updated_at then raise exception '積算表が更新されています。開き直してから保存してください。'; end if;
  update public.estimate_plans set title=v.title,customer_name=coalesce(v.customer_name,''),customer_address=coalesce(v.customer_address,''),internal_notes=coalesce(v.internal_notes,''),quote_notes=coalesce(v.quote_notes,''),groups=coalesce(v.groups,'[]'),overhead_percent=v.overhead_percent,markup_percent=v.markup_percent,quote_amount_override=v.quote_amount_override,tax_rate=coalesce(v.tax_rate,10) where id=p_id and company_id=c returning * into r;
 else
  if p_expected_updated_at is not null then raise exception '元の積算表を確認できません。'; end if;
  insert into public.estimate_plans(id,company_id,site_id,source_plan_id,title,customer_name,customer_address,internal_notes,quote_notes,groups,overhead_percent,markup_percent,quote_amount_override,tax_rate)
  values(p_id,c,v.site_id,v.source_plan_id,v.title,coalesce(v.customer_name,''),coalesce(v.customer_address,''),coalesce(v.internal_notes,''),coalesce(v.quote_notes,''),coalesce(v.groups,'[]'),v.overhead_percent,v.markup_percent,v.quote_amount_override,coalesce(v.tax_rate,10)) returning * into r;
 end if;
 return r;
end $$;

alter table public.project_documents add column estimate_plan_id uuid references public.estimate_plans(id);
alter table public.project_documents add column estimate_snapshot jsonb;
alter table public.project_documents add constraint project_documents_estimate_source_check check((estimate_plan_id is null and estimate_snapshot is null) or (kind='estimate' and estimate_plan_id is not null and estimate_snapshot is not null));
create index project_documents_estimate_plan_idx on public.project_documents(estimate_plan_id);
create function public.toya_estimate_document_source_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare p public.estimate_plans;
begin
 if tg_op='UPDATE' then
  if (new.estimate_plan_id,new.estimate_snapshot) is distinct from (old.estimate_plan_id,old.estimate_snapshot) then raise exception '見積書の積算元は変更できません。'; end if;
  if old.estimate_plan_id is not null and (new.items,new.tax_rate) is distinct from (old.items,old.tax_rate) then raise exception '金額の変更は積算表で行い、見積書を作り直してください。'; end if;
 elsif new.estimate_plan_id is not null then
  select * into p from public.estimate_plans where id=new.estimate_plan_id and company_id=new.company_id and site_id=new.site_id;
  if not found or new.kind<>'estimate' then raise exception '積算元の現場を確認してください。'; end if;
  if not (p.calculation->>'complete')::boolean then raise exception '積算表の未入力を確認してください。'; end if;
  new.items:=p.calculation->'quote_items';new.tax_rate:=p.tax_rate;new.estimate_snapshot:=to_jsonb(p);
 end if;
 return new;
end $$;
create trigger project_documents_estimate_source before insert or update on public.project_documents for each row execute function public.toya_estimate_document_source_guard();

create function public.toya_create_estimate_document(p_plan_id uuid,p_expected_updated_at timestamptz,p_document_id uuid)
returns public.project_documents language plpgsql security invoker set search_path='' as $$
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
 insert into public.project_documents(id,company_id,site_id,kind,estimate_plan_id,document_date,customer_name,customer_address,subject,notes,issuer)
 values(p_document_id,c,p.site_id,'estimate',p.id,(current_timestamp at time zone 'Asia/Tokyo')::date,p.customer_name,p.customer_address,p.title,p.quote_notes,coalesce(issuer,'{}')) returning * into d;
 return d;
end $$;

revoke all on function public.toya_estimate_number(text,integer,numeric,text,boolean) from public,anon,authenticated;
revoke all on function public.toya_calculate_estimate_plan(jsonb,numeric,numeric,numeric,integer) from public,anon,authenticated;
revoke all on function public.toya_estimate_plan_guard() from public,anon,authenticated;
revoke all on function public.toya_estimate_document_source_guard() from public,anon,authenticated;
revoke all on function public.toya_save_estimate_plan(uuid,timestamptz,jsonb) from public,anon,authenticated;
revoke all on function public.toya_create_estimate_document(uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.toya_estimate_number(text,integer,numeric,text,boolean) to authenticated;
grant execute on function public.toya_calculate_estimate_plan(jsonb,numeric,numeric,numeric,integer) to authenticated;
grant execute on function public.toya_save_estimate_plan(uuid,timestamptz,jsonb) to authenticated;
grant execute on function public.toya_create_estimate_document(uuid,timestamptz,uuid) to authenticated;
