begin;

-- Rename only site labels; financial values, document status and numbers remain snapshots.
create function public.toya_rename_site_text(p_text text,p_old text,p_new text)
returns text language sql immutable strict security invoker set search_path='' as $$
 select case when p_old<>'' and (p_text=p_old or
  (left(p_text,length(p_old))=p_old and substring(p_text from length(p_old)+1 for 1) ~ '[[:space:]　/／:：()（）・-]'))
 then p_new||substring(p_text from length(p_old)+1) else p_text end;
$$;
create function public.toya_rename_site_name_tree(p_value jsonb,p_old text,p_new text)
returns jsonb language plpgsql immutable strict security invoker set search_path='' as $$
declare result jsonb;
begin
 if jsonb_typeof(p_value)='object' then
  select coalesce(jsonb_object_agg(item.key,case
   when item.key in ('site_name','title','name','label','custom_name') and jsonb_typeof(item.value)='string'
   then to_jsonb(public.toya_rename_site_text(item.value#>>'{}',p_old,p_new))
   else public.toya_rename_site_name_tree(item.value,p_old,p_new) end),'{}'::jsonb)
  into result from jsonb_each(p_value) item;
  return result;
 elsif jsonb_typeof(p_value)='array' then
  select coalesce(jsonb_agg(public.toya_rename_site_name_tree(item.value,p_old,p_new) order by item.ordinality),'[]'::jsonb)
  into result from jsonb_array_elements(p_value) with ordinality item(value,ordinality);
  return result;
 end if;
 return p_value;
end $$;
create function public.toya_document_with_site_name(p_document jsonb,p_name text)
returns jsonb language plpgsql immutable strict security invoker set search_path='' as $$
declare result jsonb:=p_document; old_name text:=coalesce(p_document->>'site_name','');
begin
 result:=jsonb_set(result,'{site_name}',to_jsonb(p_name));
 result:=jsonb_set(result,'{subject}',to_jsonb(public.toya_rename_site_text(coalesce(p_document->>'subject',''),old_name,p_name)));
 if jsonb_typeof(p_document->'items')='array' then
  result:=jsonb_set(result,'{items}',public.toya_rename_site_name_tree(p_document->'items',old_name,p_name));
 end if;
 if jsonb_typeof(p_document->'estimate_snapshot')='object' then
  result:=jsonb_set(result,'{estimate_snapshot}',public.toya_rename_site_name_tree(p_document->'estimate_snapshot',old_name,p_name));
 end if;
 return result;
end $$;
revoke all on function public.toya_rename_site_text(text,text,text),public.toya_rename_site_name_tree(jsonb,text,text),public.toya_document_with_site_name(jsonb,text) from public,anon,authenticated;
grant execute on function public.toya_rename_site_text(text,text,text),public.toya_rename_site_name_tree(jsonb,text,text),public.toya_document_with_site_name(jsonb,text) to authenticated;


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
 -- A registered site's canonical name may be synchronized on any document.
 -- Require the exact name-only projection before skipping all financial recalculation.
 if tg_op='UPDATE' and old.site_id is not null and new.site_name is distinct from old.site_name
  and new.site_name=v_site
  and (to_jsonb(new)-'updated_at')=(public.toya_document_with_site_name(to_jsonb(old),v_site)-'updated_at') then
  new.updated_at:=clock_timestamp();return new;
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
 if tg_op='UPDATE' and old.site_id is not null and new.site_name is distinct from old.site_name
  and exists(select 1 from public.sites s where s.id=old.site_id and s.company_id=old.company_id and s.name=new.site_name)
  and (to_jsonb(new)-'updated_at')=(public.toya_document_with_site_name(to_jsonb(old),new.site_name)-'updated_at') then
  return new;
 end if;
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

CREATE OR REPLACE FUNCTION public.toya_rename_shared_site(p_site_id uuid, p_expected_version integer, p_name text)
 RETURNS sites
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  company uuid;
  target public.sites;
  renamed public.sites;
  clean_name text := btrim(p_name);
  normalized_name text;
  document public.project_documents;
  labels jsonb;
begin
  select p.company_id into company
  from public.profiles p
  where p.id = auth.uid() and p.role = 'admin' and p.active = true;

  if company is null or company is distinct from public.toya_current_company_id() then
    raise exception '現場名の変更はログイン中の管理者だけが行えます。'
      using errcode = '42501';
  end if;

  if clean_name is null or char_length(clean_name) not between 1 and 120
    or clean_name ~ '[[:cntrl:]]' then
    raise exception '現場名を1〜120文字で入力してください。';
  end if;

  normalized_name := regexp_replace(normalize(clean_name, NFKC), '[[:space:]　]', '', 'g');
  if normalized_name = '' or normalized_name in ('新しい現場', '現場名をあとで変更', '未登録現場') then
    raise exception '仮の名前ではなく実際の現場名を入力してください。';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('toya-shared-sites:' || company::text)
  );

  perform pg_advisory_xact_lock(hashtextextended(company::text,0));

  select s.* into target
  from public.sites s
  where s.id = p_site_id and s.company_id = company
  for update;

  if not found then
    raise exception '変更する現場を確認してください。';
  end if;
  if p_expected_version is null or target.lifecycle_version <> p_expected_version then
    raise exception '現場が更新されています。一覧を更新してから変更してください。';
  end if;
  if exists (
    select 1 from public.sites s
    where s.company_id = company and s.id <> target.id
      and regexp_replace(normalize(s.name, NFKC), '[[:space:]　]', '', 'g') = normalized_name
  ) then
    raise exception '同じ現場名がすでに登録されています。';
  end if;

  if target.name is distinct from clean_name then
    update public.sites
    set name=clean_name,lifecycle_version=lifecycle_version+1
    where id=target.id and company_id=company returning * into renamed;
  else
    renamed:=target;
  end if;

  with rewritten as (
    select r.id,
      public.toya_rewrite_site_labels(r.report_data, target.name, clean_name) as report_data
    from public.daily_reports r
    where r.company_id = company and target.name is distinct from clean_name
  )
  update public.daily_reports r
  set report_data = rewritten.report_data,
      updated_at = clock_timestamp()
  from rewritten
  where r.id = rewritten.id
    and r.company_id = company
    and r.report_data is distinct from rewritten.report_data;

  update public.estimate_plans
  set title=public.toya_rename_site_text(title,site_name,clean_name),
      groups=public.toya_rename_site_name_tree(groups,site_name,clean_name),
      site_name=clean_name
  where company_id=company and site_id=target.id and site_name is distinct from clean_name;

  for document in select d.* from public.project_documents d
    where d.company_id=company and d.site_id=target.id and d.site_name is distinct from clean_name
    order by d.id for update
  loop
    labels:=public.toya_document_with_site_name(to_jsonb(document),clean_name);
    update public.project_documents
    set site_name=clean_name,subject=labels->>'subject',items=labels->'items',
        estimate_snapshot=nullif(labels->'estimate_snapshot','null'::jsonb)
    where id=document.id and company_id=company;
  end loop;

  return renamed;
end;
$function$;

notify pgrst,'reload schema';

commit;
