alter table public.estimate_plans add column entry_mode text not null default 'cost' check(entry_mode in ('cost','quote'));

create function public.toya_quote_signed_number(p_value text,p_places integer,p_label text)
returns numeric language plpgsql immutable security invoker set search_path='' as $$
declare s text:=btrim(p_value); n numeric;
begin
 if nullif(s,'') is null then return null; end if;
 if p_places=0 then
  if s !~ '^-?[0-9]+$' then raise exception '%は1円単位で入力してください。',p_label; end if;
  n:=s::numeric;if abs(n)>999999999999 then raise exception '%の範囲を確認してください。',p_label; end if;return n;
 end if;
 n:=public.toya_estimate_number(case when left(s,1)='-' then substr(s,2) else s end,p_places,999999999999,p_label);
 return case when left(s,1)='-' then -n else n end;
end $$;

create function public.toya_calculate_quote_lines(p_groups jsonb,p_tax integer)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare
 g jsonb; r jsonb; rows_out jsonb; groups_out jsonb:='[]'; items_out jsonb:='[]'; q numeric; m numeric; p numeric; fixed numeric; amount numeric;
 price numeric; cost numeric; known_price numeric:=0; known_cost numeric:=0; tax numeric; missing integer; cost_missing integer; pending integer:=0; cost_pending integer:=0; active_count integer:=0; row_count integer:=0; cost_count integer:=0;
 complete boolean; excluded boolean; amount_mode boolean; active boolean; all_complete boolean; cost_complete boolean;
begin
 if jsonb_typeof(p_groups) is distinct from 'array' or jsonb_array_length(p_groups)>100 then raise exception '工事項目は100件までです。'; end if;
 if p_tax is null or p_tax not in(0,8,10) then raise exception '税率を確認してください。'; end if;
 for g in select value from jsonb_array_elements(p_groups) loop
  if jsonb_typeof(g) is distinct from 'object' or length(coalesce(g->>'name',''))>200 or jsonb_typeof(g->'quote_lines') is distinct from 'array' or jsonb_typeof(g->'lines') is distinct from 'array' then raise exception '工事項目を確認してください。'; end if;
  row_count:=row_count+jsonb_array_length(g->'quote_lines');cost_count:=cost_count+jsonb_array_length(g->'lines');
  if row_count>300 or cost_count>300 then raise exception '明細・原価内訳はそれぞれ300行までです。'; end if;
  rows_out:='[]';price:=0;cost:=0;missing:=0;cost_missing:=case when jsonb_array_length(g->'lines')=0 then 1 else 0 end;active:=false;
  for r in select value from jsonb_array_elements(g->'quote_lines') loop
   if jsonb_typeof(r) is distinct from 'object' or length(coalesce(r->>'label',''))>200 or length(coalesce(r->>'spec',''))>500 or length(coalesce(r->>'unit',''))>20 then raise exception '品名・備考・単位を確認してください。'; end if;
   if (r ? 'excluded' and jsonb_typeof(r->'excluded') is distinct from 'boolean') or (r ? 'amount_mode' and jsonb_typeof(r->'amount_mode') is distinct from 'boolean') then raise exception '見積に含める項目・金額の入力方法を確認してください。'; end if;
   excluded:=coalesce((r->>'excluded')::boolean,false);amount_mode:=coalesce((r->>'amount_mode')::boolean,false);
   q:=public.toya_estimate_number(r->>'quantity',3,1000000,'数量',true);
   p:=public.toya_quote_signed_number(r->>'quote_price',2,'見積単価');
   fixed:=public.toya_quote_signed_number(r->>'quote_amount',0,'見積金額');
   complete:=nullif(btrim(r->>'label'),'') is not null and nullif(btrim(r->>'unit'),'') is not null and q is not null and (case when amount_mode then fixed is not null else p is not null or fixed is not null end);
   amount:=case when complete then coalesce(fixed,floor(q*p)) else null end;
   if abs(amount)>999999999999 then raise exception '明細金額が大きすぎます。'; end if;
   rows_out:=rows_out||jsonb_build_array(jsonb_build_object('complete',complete,'excluded',excluded,'amount',amount));
   if not excluded then active:=true;active_count:=active_count+1;if complete then price:=price+amount;else missing:=missing+1;end if;end if;
  end loop;
  if active and nullif(btrim(g->>'name'),'') is null then missing:=missing+1;end if;
  for r in select value from jsonb_array_elements(g->'lines') loop
   if jsonb_typeof(r) is distinct from 'object' or coalesce(r->>'category','') not in('labor','equipment','vehicle','attachment','tool','fuel','waste','transport','material','subcontract','other') then raise exception '費目を選んでください。';end if;
   if length(coalesce(r->>'label',''))>200 or length(coalesce(r->>'unit',''))>20 or length(coalesce(r->>'source_table',''))>100 or length(coalesce(r->>'source_id',''))>100 or length(coalesce(r->>'source_updated_at',''))>100 then raise exception '原価の品名・単位を確認してください。';end if;
   q:=public.toya_estimate_number(r->>'quantity',3,1000000,'数量',true);m:=public.toya_estimate_number(r->>'multiplier',3,1000000,'日数・回数',true);p:=public.toya_estimate_number(r->>'unit_price',2,999999999999,'原価単価');
   if nullif(btrim(r->>'label'),'') is null or nullif(btrim(r->>'unit'),'') is null or q is null or m is null or p is null then cost_missing:=cost_missing+1;
   else amount:=floor(q*m*p);if amount>999999999999 then raise exception '積算金額が大きすぎます。';end if;cost:=cost+amount;end if;
  end loop;
  if cost>999999999999 or abs(price)>999999999999 then raise exception '工事項目の金額が大きすぎます。';end if;
  if active then pending:=pending+missing;known_price:=known_price+price;known_cost:=known_cost+cost;cost_pending:=cost_pending+cost_missing;end if;
  groups_out:=groups_out||jsonb_build_array(jsonb_build_object('name',coalesce(g->>'name',''),'active',active,'rows',rows_out,'missing',missing,'price',price,'cost',cost,'cost_complete',active and cost_missing=0,'overhead',0));
  if active then items_out:=items_out||jsonb_build_array(jsonb_build_object('name',g->>'name','spec','内訳別紙','quantity','1','unit','式','unitPrice',price::text,'costPrice',case when cost_missing=0 then cost::text else null end));end if;
 end loop;
 if active_count=0 then pending:=pending+1;end if;
 if known_cost>999999999999 or abs(known_price)>999999999999 or (pending=0 and known_price<0) then raise exception '見積の合計金額を確認してください。';end if;
 all_complete:=pending=0;cost_complete:=active_count>0 and cost_pending=0;tax:=case when all_complete then floor(known_price*p_tax/100) else null end;
 return jsonb_build_object('mode','quote','complete',all_complete,'pending',pending,'known_price',known_price,'known_cost',known_cost,'cost_pending',cost_pending,'total_cost',case when cost_complete then known_cost else null end,'overhead',0,'markup',null,'price',case when all_complete then known_price else null end,'profit',case when all_complete and cost_complete then known_price-known_cost else null end,'tax',tax,'total',case when tax is not null then known_price+tax else null end,'groups',groups_out,'quote_items',case when all_complete then items_out else '[]'::jsonb end);
end $$;

revoke all on function public.toya_quote_signed_number(text,integer,text) from public,anon,authenticated;
revoke all on function public.toya_calculate_quote_lines(jsonb,integer) from public,anon,authenticated;
grant execute on function public.toya_quote_signed_number(text,integer,text) to authenticated;
grant execute on function public.toya_calculate_quote_lines(jsonb,integer) to authenticated;

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
 if tg_op='UPDATE' and new.entry_mode is distinct from old.entry_mode then raise exception '入力方式の違う見積は新しく作成してください。'; end if;
 if new.entry_mode='quote' then new.calculation:=public.toya_calculate_quote_lines(new.groups,new.tax_rate);
 else new.calculation:=public.toya_calculate_estimate_plan(new.groups,new.overhead_percent,new.markup_percent,new.quote_amount_override,new.tax_rate); end if;
 if tg_op='INSERT' then new.created_at:=clock_timestamp(); end if;
 new.updated_at:=clock_timestamp();return new;
end $function$
;
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
  update public.estimate_plans set entry_mode=coalesce(v.entry_mode,r.entry_mode),title=v.title,site_name=coalesce(v.site_name,''),site_address=coalesce(v.site_address,''),customer_name=coalesce(v.customer_name,''),customer_address=coalesce(v.customer_address,''),internal_notes=coalesce(v.internal_notes,''),quote_notes=coalesce(v.quote_notes,''),groups=coalesce(v.groups,'[]'),overhead_percent=v.overhead_percent,markup_percent=v.markup_percent,quote_amount_override=v.quote_amount_override,tax_rate=coalesce(v.tax_rate,10) where id=p_id and company_id=c returning * into r;
 else
  if p_expected_updated_at is not null then raise exception '元の積算表を確認できません。'; end if;
  insert into public.estimate_plans(id,company_id,entry_mode,site_id,source_plan_id,title,site_name,site_address,customer_name,customer_address,internal_notes,quote_notes,groups,overhead_percent,markup_percent,quote_amount_override,tax_rate)
  values(p_id,c,coalesce(v.entry_mode,'cost'),v.site_id,v.source_plan_id,v.title,coalesce(v.site_name,''),coalesce(v.site_address,''),coalesce(v.customer_name,''),coalesce(v.customer_address,''),coalesce(v.internal_notes,''),coalesce(v.quote_notes,''),coalesce(v.groups,'[]'),v.overhead_percent,v.markup_percent,v.quote_amount_override,coalesce(v.tax_rate,10)) returning * into r;
 end if;
 return r;
end $function$
;
