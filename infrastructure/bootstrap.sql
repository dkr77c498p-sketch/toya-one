-- Empty independent sales database only. No users, companies, records, photos or master rows are copied.
begin;
do $$begin if to_regclass('public.companies') is not null or exists(select 1 from auth.users) or exists(select 1 from storage.objects) then raise exception '空の販売用プロジェクト以外には適用できません。';end if;end $$;
create schema if not exists private;
revoke all on schema private from PUBLIC,anon;
grant usage on schema private to authenticated,service_role;
set local search_path=public,extensions,pg_catalog;
set local check_function_bodies=false;
create table "public"."revenues" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
company_id uuid NOT NULL,
site_id uuid NOT NULL,
revenue_date date NOT NULL DEFAULT CURRENT_DATE,
revenue_type text NOT NULL DEFAULT 'invoice'::text,
description text,
amount numeric(14,2) NOT NULL DEFAULT 0,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
alter table "public"."revenues" enable row level security;
create table "public"."waste_price_master" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
company_id uuid NOT NULL,
facility text NOT NULL,
waste_type text NOT NULL,
rate_basis text NOT NULL,
unit_price numeric(12,2) NOT NULL,
vehicle_class text,
display_unit text NOT NULL,
notes text,
active boolean NOT NULL DEFAULT true,
sort_order integer NOT NULL DEFAULT 0,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
alter table "public"."waste_price_master" enable row level security;
create table "public"."labor_rate_master" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
company_id uuid NOT NULL,
code text NOT NULL,
label text NOT NULL,
kind text NOT NULL,
day_rate numeric(12,2) NOT NULL,
half_rate numeric(12,2) NOT NULL,
city_per_vehicle numeric(12,2) NOT NULL DEFAULT 0,
active boolean NOT NULL DEFAULT true,
sort_order integer NOT NULL DEFAULT 0,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
alter table "public"."labor_rate_master" enable row level security;
create table "public"."labor_cost_sheets" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
company_id uuid NOT NULL,
site_id uuid NOT NULL,
work_date date NOT NULL,
entries jsonb NOT NULL,
source_reports jsonb NOT NULL DEFAULT '[]'::jsonb,
cost_total numeric(14,0) NOT NULL,
revenue_total numeric(14,0) NOT NULL,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
alter table "public"."labor_cost_sheets" enable row level security;
create table "public"."sites" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
company_id uuid NOT NULL,
name text NOT NULL,
status text NOT NULL DEFAULT 'active'::text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
completed_on date,
lifecycle_version integer NOT NULL DEFAULT 0
);
alter table "public"."sites" enable row level security;
create table "public"."companies" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
name text NOT NULL,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
alter table "public"."companies" enable row level security;
create table "public"."workers" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
company_id uuid NOT NULL,
name text NOT NULL,
worker_type text NOT NULL DEFAULT 'employee'::text,
hourly_rate numeric(12,2) NOT NULL DEFAULT 0,
overtime_rate numeric(12,2) NOT NULL DEFAULT 0,
active boolean NOT NULL DEFAULT true,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
alter table "public"."workers" enable row level security;
create table "public"."equipment" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
company_id uuid NOT NULL,
name text NOT NULL,
ownership text NOT NULL DEFAULT 'owned'::text,
hourly_rate numeric(12,2) NOT NULL DEFAULT 0,
active boolean NOT NULL DEFAULT true,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
alter table "public"."equipment" enable row level security;
create table "public"."vehicles" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
company_id uuid NOT NULL,
name text NOT NULL,
ownership text NOT NULL DEFAULT 'owned'::text,
daily_rate numeric(12,2) NOT NULL DEFAULT 0,
km_rate numeric(12,2) NOT NULL DEFAULT 0,
active boolean NOT NULL DEFAULT true,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
alter table "public"."vehicles" enable row level security;
create table "public"."daily_reports" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
company_id uuid NOT NULL,
site_id uuid,
report_date date NOT NULL DEFAULT CURRENT_DATE,
recorder_name text,
weather text,
work_content text,
worker_count integer NOT NULL DEFAULT 0,
dispatch_count integer NOT NULL DEFAULT 0,
start_time time without time zone,
end_time time without time zone,
overtime_hours numeric(8,2) NOT NULL DEFAULT 0,
notes text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
source_report_id text,
created_by uuid DEFAULT auth.uid(),
report_data jsonb,
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
alter table "public"."daily_reports" enable row level security;
create table "public"."labor_entries" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
company_id uuid NOT NULL,
site_id uuid,
report_id uuid,
worker_id uuid,
work_date date NOT NULL DEFAULT CURRENT_DATE,
regular_hours numeric(8,2) NOT NULL DEFAULT 0,
overtime_hours numeric(8,2) NOT NULL DEFAULT 0,
hourly_rate numeric(12,2) NOT NULL DEFAULT 0,
overtime_rate numeric(12,2) NOT NULL DEFAULT 0,
amount numeric(14,2) GENERATED ALWAYS AS (((regular_hours * hourly_rate) + (overtime_hours * overtime_rate))) STORED,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
alter table "public"."labor_entries" enable row level security;
create table "public"."equipment_usage" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
company_id uuid NOT NULL,
site_id uuid,
report_id uuid,
equipment_id uuid,
use_date date NOT NULL DEFAULT CURRENT_DATE,
hours numeric(8,2) NOT NULL DEFAULT 0,
hourly_rate numeric(12,2) NOT NULL DEFAULT 0,
amount numeric(14,2) GENERATED ALWAYS AS ((hours * hourly_rate)) STORED,
attachment text,
notes text,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
alter table "public"."equipment_usage" enable row level security;
create table "public"."vehicle_usage" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
company_id uuid NOT NULL,
site_id uuid,
report_id uuid,
vehicle_id uuid,
use_date date NOT NULL DEFAULT CURRENT_DATE,
days numeric(8,2) NOT NULL DEFAULT 1,
distance_km numeric(10,2) NOT NULL DEFAULT 0,
daily_rate numeric(12,2) NOT NULL DEFAULT 0,
km_rate numeric(12,2) NOT NULL DEFAULT 0,
amount numeric(14,2) GENERATED ALWAYS AS (((days * daily_rate) + (distance_km * km_rate))) STORED,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
alter table "public"."vehicle_usage" enable row level security;
create table "public"."fuel_entries" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
company_id uuid NOT NULL,
site_id uuid,
report_id uuid,
equipment_id uuid,
vehicle_id uuid,
fuel_type text NOT NULL DEFAULT 'diesel'::text,
fuel_date date NOT NULL DEFAULT CURRENT_DATE,
liters numeric(10,2) NOT NULL DEFAULT 0,
unit_price numeric(12,2) NOT NULL DEFAULT 0,
amount numeric(14,2) GENERATED ALWAYS AS ((liters * unit_price)) STORED,
receipt_url text,
notes text,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
alter table "public"."fuel_entries" enable row level security;
create table "public"."cost_entries" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
company_id uuid NOT NULL,
site_id uuid,
report_id uuid,
cost_date date NOT NULL DEFAULT CURRENT_DATE,
category text NOT NULL,
description text,
amount numeric(14,2) NOT NULL DEFAULT 0,
receipt_url text,
notes text,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
alter table "public"."cost_entries" enable row level security;
create table "public"."waste_entries" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
company_id uuid NOT NULL,
report_id uuid,
site_id uuid,
report_date date,
waste_type text NOT NULL,
quantity numeric NOT NULL DEFAULT 0,
unit text NOT NULL DEFAULT 't'::text,
manifest_type text NOT NULL DEFAULT 'none'::text,
manifest_number text,
transporter_name text,
transporter_license_no text,
disposer_name text,
disposer_license_no text,
disposal_site text,
notes text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
source_item_id text
);
alter table "public"."waste_entries" enable row level security;
create table "public"."vehicle_rate_master" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
company_id uuid NOT NULL,
code text NOT NULL,
label text NOT NULL,
daily_rate numeric(14,2) NOT NULL,
active boolean NOT NULL DEFAULT true,
sort_order integer NOT NULL DEFAULT 0,
calculation_mode text NOT NULL DEFAULT 'add_recorded_fuel_labor_separate'::text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
alter table "public"."vehicle_rate_master" enable row level security;
create table "public"."profiles" (
id uuid NOT NULL,
company_id uuid,
name text,
role text NOT NULL DEFAULT 'employee'::text,
active boolean NOT NULL DEFAULT true,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
alter table "public"."profiles" enable row level security;
create table "public"."report_photos" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
company_id uuid NOT NULL,
report_id uuid NOT NULL,
storage_path text NOT NULL,
category text NOT NULL DEFAULT 'その他'::text,
description text,
original_name text,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
alter table "public"."report_photos" enable row level security;
create table "public"."user_activity" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
company_id uuid NOT NULL,
user_id uuid NOT NULL,
activity_type text NOT NULL,
activity_at timestamp with time zone NOT NULL DEFAULT now(),
report_id uuid,
details jsonb
);
alter table "public"."user_activity" enable row level security;
create table "public"."vehicle_cost_sheets" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
company_id uuid NOT NULL,
site_id uuid NOT NULL,
work_date date NOT NULL,
entries jsonb NOT NULL,
source_reports jsonb NOT NULL DEFAULT '[]'::jsonb,
review_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
gross_total numeric(16,2) NOT NULL DEFAULT 0,
fuel_deduction_total numeric(16,2) NOT NULL DEFAULT 0,
net_total numeric(16,2) NOT NULL DEFAULT 0,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
alter table "public"."vehicle_cost_sheets" enable row level security;
create table "public"."dispatch_crew_confirmations" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
company_id uuid NOT NULL,
report_id uuid NOT NULL,
site_id uuid NOT NULL,
work_date date NOT NULL,
dispatch_code text NOT NULL,
crew_key text NOT NULL,
report_updated_at timestamp with time zone NOT NULL,
confirmed_at timestamp with time zone NOT NULL DEFAULT now()
);
alter table "public"."dispatch_crew_confirmations" enable row level security;
create table "private"."company_licenses" (
company_id uuid NOT NULL,
company_code text NOT NULL DEFAULT upper(substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 12)),
status text NOT NULL DEFAULT 'pending'::text,
internal boolean NOT NULL DEFAULT false,
max_users integer NOT NULL DEFAULT 1,
expires_at timestamp with time zone,
created_at timestamp with time zone NOT NULL DEFAULT now(),
plan text NOT NULL DEFAULT 'daily'::text
);
alter table "private"."company_licenses" enable row level security;
create table "private"."login_devices" (
user_id uuid NOT NULL,
device_hash text NOT NULL,
session_id uuid NOT NULL,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
alter table "private"."login_devices" enable row level security;
create table "private"."device_resets" (
user_id uuid NOT NULL,
reset_at timestamp with time zone NOT NULL
);
alter table "private"."device_resets" enable row level security;
create table "private"."employee_logins" (
company_id uuid NOT NULL,
login_id text NOT NULL,
user_id uuid,
name text NOT NULL,
email text NOT NULL,
reserved_by uuid NOT NULL,
reservation uuid NOT NULL DEFAULT gen_random_uuid(),
created_at timestamp with time zone NOT NULL DEFAULT now()
);
alter table "private"."employee_logins" enable row level security;
create table "public"."billing_profiles" (
company_id uuid NOT NULL,
issuer_name text NOT NULL DEFAULT ''::text,
address text NOT NULL DEFAULT ''::text,
phone text NOT NULL DEFAULT ''::text,
registration_number text NOT NULL DEFAULT ''::text,
bank_details text NOT NULL DEFAULT ''::text,
updated_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
postal_code text NOT NULL DEFAULT ''::text,
fax text NOT NULL DEFAULT ''::text,
representative text NOT NULL DEFAULT ''::text,
logo_key text NOT NULL DEFAULT ''::text
);
alter table "public"."billing_profiles" enable row level security;
create table "public"."project_documents" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
company_id uuid NOT NULL,
site_id uuid,
kind text NOT NULL,
status text NOT NULL DEFAULT 'draft'::text,
number_year integer,
number_seq integer,
document_number text,
document_date date NOT NULL DEFAULT CURRENT_DATE,
transaction_start date,
transaction_end date,
due_date date,
valid_until date,
customer_name text NOT NULL DEFAULT ''::text,
customer_address text NOT NULL DEFAULT ''::text,
subject text NOT NULL DEFAULT ''::text,
notes text NOT NULL DEFAULT ''::text,
site_name text NOT NULL DEFAULT ''::text,
issuer jsonb NOT NULL DEFAULT '{}'::jsonb,
items jsonb NOT NULL DEFAULT '[]'::jsonb,
tax_rate integer NOT NULL DEFAULT 10,
subtotal numeric(14,0) NOT NULL DEFAULT 0,
tax_amount numeric(14,0) NOT NULL DEFAULT 0,
total numeric(14,0) NOT NULL DEFAULT 0,
cost_total numeric(14,0),
cumulative_amount numeric(14,0),
previous_billed numeric(14,0) NOT NULL DEFAULT 0,
contract_amount numeric(14,2),
issued_at timestamp with time zone,
void_reason text NOT NULL DEFAULT ''::text,
created_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
updated_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
estimate_plan_id uuid,
estimate_snapshot jsonb,
site_address text NOT NULL DEFAULT ''::text
);
alter table "public"."project_documents" enable row level security;
create table "public"."equipment_cost_sheets" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
company_id uuid NOT NULL,
site_id uuid NOT NULL,
work_date date NOT NULL,
entries jsonb NOT NULL,
source_reports jsonb NOT NULL DEFAULT '[]'::jsonb,
review_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
gross_total numeric(16,2) NOT NULL DEFAULT 0,
fuel_deduction_total numeric(16,2) NOT NULL DEFAULT 0,
net_total numeric(16,2) NOT NULL DEFAULT 0,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
alter table "public"."equipment_cost_sheets" enable row level security;
create table "public"."equipment_rate_master" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
company_id uuid NOT NULL,
code text NOT NULL,
label text NOT NULL,
daily_rate numeric(14,2) NOT NULL,
active boolean NOT NULL DEFAULT true,
sort_order integer NOT NULL DEFAULT 0,
calculation_mode text NOT NULL DEFAULT 'add_recorded_fuel_labor_separate'::text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
alter table "public"."equipment_rate_master" enable row level security;
create table "public"."company_registries" (
company_id uuid NOT NULL,
kind text NOT NULL,
entries jsonb NOT NULL DEFAULT '[]'::jsonb,
version integer NOT NULL DEFAULT 1
);
alter table "public"."company_registries" enable row level security;
create table "public"."estimate_plans" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
company_id uuid NOT NULL,
site_id uuid,
source_plan_id uuid,
title text NOT NULL,
customer_name text NOT NULL DEFAULT ''::text,
customer_address text NOT NULL DEFAULT ''::text,
internal_notes text NOT NULL DEFAULT ''::text,
quote_notes text NOT NULL DEFAULT ''::text,
groups jsonb NOT NULL DEFAULT '[]'::jsonb,
overhead_percent numeric,
markup_percent numeric,
quote_amount_override numeric,
tax_rate integer NOT NULL DEFAULT 10,
calculation jsonb NOT NULL DEFAULT '{}'::jsonb,
created_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
updated_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
site_name text NOT NULL DEFAULT ''::text,
site_address text NOT NULL DEFAULT ''::text,
entry_mode text NOT NULL DEFAULT 'cost'::text
);
alter table "public"."estimate_plans" enable row level security;
create table "public"."equipment_transport_rate_master" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
company_id uuid NOT NULL,
carrier text NOT NULL,
machine_code text NOT NULL,
machine_name text NOT NULL,
distance_code text NOT NULL,
distance_label text NOT NULL,
unit_price numeric(14,2) NOT NULL,
price_basis text NOT NULL DEFAULT 'unconfirmed'::text,
tax_basis text NOT NULL DEFAULT 'as_provided'::text,
active boolean NOT NULL DEFAULT true,
sort_order integer NOT NULL DEFAULT 0,
notes text NOT NULL DEFAULT ''::text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
alter table "public"."equipment_transport_rate_master" enable row level security;
create table "public"."estimate_quantity_sheets" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
company_id uuid NOT NULL,
title text NOT NULL,
customer_name text NOT NULL DEFAULT ''::text,
site_address text NOT NULL DEFAULT ''::text,
document_date date,
source_filename text NOT NULL,
source_sha256 text NOT NULL,
source_page_count integer NOT NULL,
groups jsonb NOT NULL,
source_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
created_at timestamp with time zone NOT NULL DEFAULT clock_timestamp()
);
alter table "public"."estimate_quantity_sheets" enable row level security;
create table "public"."small_tool_rate_master" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
company_id uuid NOT NULL,
label text NOT NULL,
hourly_rate numeric(14,4),
active boolean NOT NULL DEFAULT true,
updated_at timestamp with time zone NOT NULL DEFAULT now(),
fuel_included boolean NOT NULL DEFAULT false
);
alter table "public"."small_tool_rate_master" enable row level security;
create table "public"."site_project_profiles" (
site_id uuid NOT NULL,
company_id uuid NOT NULL,
project_category text NOT NULL DEFAULT ''::text,
structure_type text NOT NULL DEFAULT ''::text,
floors_above integer,
floors_below integer,
floor_area_sqm numeric(12,3),
site_area_sqm numeric(12,3),
foundation_volume_m3 numeric(12,3),
work_start date,
work_end date,
scope_notes text NOT NULL DEFAULT ''::text,
exclusion_notes text NOT NULL DEFAULT ''::text,
contract_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
updated_by uuid NOT NULL,
created_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
updated_at timestamp with time zone NOT NULL DEFAULT clock_timestamp()
);
alter table "public"."site_project_profiles" enable row level security;
create table "public"."attachment_rate_master" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
company_id uuid NOT NULL,
label text NOT NULL,
hourly_rate numeric(14,4),
active boolean NOT NULL DEFAULT true,
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
alter table "public"."attachment_rate_master" enable row level security;
create table "private"."company_invitations" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
company_id uuid NOT NULL,
email text NOT NULL,
token_hash text NOT NULL,
invited_by uuid NOT NULL,
created_at timestamp with time zone NOT NULL DEFAULT now(),
expires_at timestamp with time zone NOT NULL DEFAULT (now() + '7 days'::interval),
used_by uuid,
revoked boolean NOT NULL DEFAULT false
);
alter table "private"."company_invitations" enable row level security;
alter table "public"."companies" add constraint "companies_pkey" PRIMARY KEY (id);
alter table "public"."workers" add constraint "workers_pkey" PRIMARY KEY (id);
alter table "public"."equipment" add constraint "equipment_pkey" PRIMARY KEY (id);
alter table "public"."vehicles" add constraint "vehicles_pkey" PRIMARY KEY (id);
alter table "public"."sites" add constraint "sites_pkey" PRIMARY KEY (id);
alter table "public"."daily_reports" add constraint "daily_reports_pkey" PRIMARY KEY (id);
alter table "public"."labor_entries" add constraint "labor_entries_pkey" PRIMARY KEY (id);
alter table "public"."equipment_usage" add constraint "equipment_usage_pkey" PRIMARY KEY (id);
alter table "public"."vehicle_usage" add constraint "vehicle_usage_pkey" PRIMARY KEY (id);
alter table "public"."fuel_entries" add constraint "fuel_entries_pkey" PRIMARY KEY (id);
alter table "public"."cost_entries" add constraint "cost_entries_pkey" PRIMARY KEY (id);
alter table "public"."revenues" add constraint "revenues_pkey" PRIMARY KEY (id);
alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY (id);
alter table "public"."report_photos" add constraint "report_photos_pkey" PRIMARY KEY (id);
alter table "public"."report_photos" add constraint "report_photos_storage_path_key" UNIQUE (storage_path);
alter table "public"."waste_entries" add constraint "waste_entries_pkey" PRIMARY KEY (id);
alter table "public"."user_activity" add constraint "user_activity_pkey" PRIMARY KEY (id);
alter table "private"."company_licenses" add constraint "company_licenses_pkey" PRIMARY KEY (company_id);
alter table "private"."company_licenses" add constraint "company_licenses_company_code_key" UNIQUE (company_code);
alter table "private"."login_devices" add constraint "login_devices_pkey" PRIMARY KEY (user_id, device_hash);
alter table "private"."login_devices" add constraint "login_devices_user_id_session_id_key" UNIQUE (user_id, session_id);
alter table "public"."waste_price_master" add constraint "waste_price_master_pkey" PRIMARY KEY (id);
alter table "private"."device_resets" add constraint "device_resets_pkey" PRIMARY KEY (user_id);
alter table "private"."employee_logins" add constraint "employee_logins_pkey" PRIMARY KEY (company_id, login_id);
alter table "private"."employee_logins" add constraint "employee_logins_user_id_key" UNIQUE (user_id);
alter table "private"."employee_logins" add constraint "employee_logins_email_key" UNIQUE (email);
alter table "private"."employee_logins" add constraint "employee_logins_reservation_key" UNIQUE (reservation);
alter table "public"."labor_rate_master" add constraint "labor_rate_master_pkey" PRIMARY KEY (id);
alter table "public"."labor_rate_master" add constraint "labor_rate_master_company_id_code_key" UNIQUE (company_id, code);
alter table "public"."labor_cost_sheets" add constraint "labor_cost_sheets_pkey" PRIMARY KEY (id);
alter table "public"."labor_cost_sheets" add constraint "labor_cost_sheets_company_id_site_id_work_date_key" UNIQUE (company_id, site_id, work_date);
alter table "public"."vehicle_rate_master" add constraint "vehicle_rate_master_pkey" PRIMARY KEY (id);
alter table "public"."vehicle_rate_master" add constraint "vehicle_rate_master_company_id_code_key" UNIQUE (company_id, code);
alter table "public"."vehicle_cost_sheets" add constraint "vehicle_cost_sheets_pkey" PRIMARY KEY (id);
alter table "public"."vehicle_cost_sheets" add constraint "vehicle_cost_sheets_company_id_site_id_work_date_key" UNIQUE (company_id, site_id, work_date);
alter table "public"."equipment_rate_master" add constraint "equipment_rate_master_pkey" PRIMARY KEY (id);
alter table "public"."equipment_rate_master" add constraint "equipment_rate_master_company_id_code_key" UNIQUE (company_id, code);
alter table "public"."equipment_cost_sheets" add constraint "equipment_cost_sheets_pkey" PRIMARY KEY (id);
alter table "public"."equipment_cost_sheets" add constraint "equipment_cost_sheets_company_id_site_id_work_date_key" UNIQUE (company_id, site_id, work_date);
alter table "public"."equipment_transport_rate_master" add constraint "equipment_transport_rate_master_pkey" PRIMARY KEY (id);
alter table "public"."equipment_transport_rate_master" add constraint "equipment_transport_rate_mast_company_id_carrier_machine_co_key" UNIQUE (company_id, carrier, machine_code, distance_code);
alter table "public"."small_tool_rate_master" add constraint "small_tool_rate_master_pkey" PRIMARY KEY (id);
alter table "public"."small_tool_rate_master" add constraint "small_tool_rate_master_company_id_label_key" UNIQUE (company_id, label);
alter table "public"."attachment_rate_master" add constraint "attachment_rate_master_pkey" PRIMARY KEY (id);
alter table "public"."attachment_rate_master" add constraint "attachment_rate_master_company_id_label_key" UNIQUE (company_id, label);
alter table "public"."dispatch_crew_confirmations" add constraint "dispatch_crew_confirmations_pkey" PRIMARY KEY (id);
alter table "public"."dispatch_crew_confirmations" add constraint "dispatch_crew_confirmations_company_id_report_id_dispatch_c_key" UNIQUE (company_id, report_id, dispatch_code);
alter table "public"."billing_profiles" add constraint "billing_profiles_pkey" PRIMARY KEY (company_id);
alter table "public"."project_documents" add constraint "project_documents_pkey" PRIMARY KEY (id);
alter table "public"."project_documents" add constraint "project_documents_company_id_kind_number_year_number_seq_key" UNIQUE (company_id, kind, number_year, number_seq);
alter table "public"."project_documents" add constraint "project_documents_company_id_document_number_key" UNIQUE (company_id, document_number);
alter table "public"."estimate_plans" add constraint "estimate_plans_pkey" PRIMARY KEY (id);
alter table "public"."estimate_quantity_sheets" add constraint "estimate_quantity_sheets_pkey" PRIMARY KEY (id);
alter table "public"."estimate_quantity_sheets" add constraint "estimate_quantity_sheets_company_id_source_sha256_key" UNIQUE (company_id, source_sha256);
alter table "public"."site_project_profiles" add constraint "site_project_profiles_pkey" PRIMARY KEY (site_id);
alter table "public"."company_registries" add constraint "company_registries_pkey" PRIMARY KEY (company_id, kind);
alter table "private"."company_invitations" add constraint "company_invitations_pkey" PRIMARY KEY (id);
alter table "private"."company_invitations" add constraint "company_invitations_token_hash_key" UNIQUE (token_hash);
CREATE OR REPLACE FUNCTION public.current_company_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$select private.toya_allowed_company();$function$;
CREATE OR REPLACE FUNCTION public.current_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and active and company_id=private.toya_allowed_company());$function$;
CREATE OR REPLACE FUNCTION public.toya_current_company_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$select private.toya_allowed_company();$function$;
CREATE OR REPLACE FUNCTION public.toya_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$select public.current_is_admin();$function$;
CREATE OR REPLACE FUNCTION public.vehicle_cost_validate_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  e jsonb;
  k text;
  v numeric;
  codes text[] := '{}';
  gross numeric := 0;
begin
  if jsonb_typeof(new.entries) is distinct from 'array' then
    raise exception 'entries must be an array';
  end if;

  if not exists (
    select 1
    from public.sites s
    where s.id = new.site_id
      and s.company_id = new.company_id
  ) then
    raise exception 'site company mismatch';
  end if;

  for e in select value from jsonb_array_elements(new.entries) loop
    if jsonb_typeof(e) is distinct from 'object'
       or jsonb_typeof(e->'used') is distinct from 'boolean'
       or coalesce(e->>'code', '') = ''
       or coalesce(e->>'label', '') = '' then
      raise exception 'invalid vehicle entry';
    end if;

    if (e->>'code') = any(codes) then
      raise exception 'duplicate vehicle code';
    end if;
    codes = array_append(codes, e->>'code');

    foreach k in array array[
      'dayRate', 'recordedFuel', 'manualGross', 'manualFuel'
    ] loop
      if k in ('manualGross', 'manualFuel')
         and (e->k is null or e->k = 'null'::jsonb) then
        continue;
      end if;
      if jsonb_typeof(e->k) is distinct from 'number' then
        raise exception 'invalid vehicle amount: %', k;
      end if;
      v = (e->>k)::numeric;
      if v < 0 or v > 1000000000 then
        raise exception 'vehicle amount out of range';
      end if;
    end loop;

    if (e->>'used')::boolean then
      gross = gross + round(
        coalesce(
          (e->>'manualGross')::numeric,
          (e->>'dayRate')::numeric
        ),
        2
      );
    end if;
  end loop;

  new.gross_total = gross;
  new.fuel_deduction_total = 0;
  new.net_total = gross;
  new.updated_at = clock_timestamp();
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.equipment_cost_validate_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  e jsonb;
  k text;
  v numeric;
  codes text[] := '{}';
  gross numeric := 0;
begin
  if jsonb_typeof(new.entries) is distinct from 'array' then
    raise exception 'entries must be an array';
  end if;

  if not exists (
    select 1
    from public.sites s
    where s.id = new.site_id
      and s.company_id = new.company_id
  ) then
    raise exception 'site company mismatch';
  end if;

  if tg_op = 'UPDATE'
     and (
       new.company_id is distinct from old.company_id
       or new.site_id is distinct from old.site_id
       or new.work_date is distinct from old.work_date
     ) then
    raise exception 'equipment cost context cannot change';
  end if;

  for e in select value from jsonb_array_elements(new.entries) loop
    if jsonb_typeof(e) is distinct from 'object'
       or jsonb_typeof(e->'used') is distinct from 'boolean'
       or coalesce(e->>'code', '') = ''
       or coalesce(e->>'label', '') = '' then
      raise exception 'invalid equipment entry';
    end if;

    if (e->>'code') = any(codes) then
      raise exception 'duplicate equipment code';
    end if;
    codes = array_append(codes, e->>'code');

    if not exists (
      select 1
      from public.equipment_rate_master m
      where m.company_id = new.company_id
        and m.code = e->>'code'
    ) then
      raise exception 'unknown equipment code';
    end if;

    foreach k in array array[
      'dayRate', 'recordedFuel', 'manualGross', 'manualFuel'
    ] loop
      if k in ('manualGross', 'manualFuel')
         and (e->k is null or e->k = 'null'::jsonb) then
        continue;
      end if;
      if jsonb_typeof(e->k) is distinct from 'number' then
        raise exception 'invalid equipment amount: %', k;
      end if;
      v = (e->>k)::numeric;
      if v < 0 or v > 1000000000 then
        raise exception 'equipment amount out of range';
      end if;
    end loop;

    if (e->>'used')::boolean then
      gross = gross + round(
        coalesce(
          (e->>'manualGross')::numeric,
          (e->>'dayRate')::numeric
        ),
        2
      );
    end if;
  end loop;

  new.gross_total = gross;
  new.fuel_deduction_total = 0;
  new.net_total = gross;
  new.updated_at = clock_timestamp();
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.equipment_transport_catalog_v1()
 RETURNS TABLE(id uuid, carrier text, machine_code text, machine_name text, distance_code text, distance_label text, price_basis text, sort_order integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
 select m.id,m.carrier,m.machine_code,m.machine_name,m.distance_code,m.distance_label,m.price_basis,m.sort_order
 from public.equipment_transport_rate_master m
 join public.profiles p on p.company_id=m.company_id
 where p.company_id=public.toya_current_company_id() and p.id=auth.uid() and p.active=true and p.role in ('admin','employee')
 and m.active=true and m.price_basis='one_way_per_machine'
 order by m.carrier,m.sort_order,m.id;
$function$;
CREATE OR REPLACE FUNCTION public.toya_register_shared_site(p_name text)
 RETURNS TABLE(id uuid, name text, status text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  cid uuid;
  clean_name text := btrim(p_name);
  normalized_name text;
  matching_count integer;
begin
  select p.company_id into cid from public.profiles p
  where p.id = auth.uid() and p.role = 'admin' and p.active = true;
  if cid is null then
    raise exception '現場の共有登録はログイン中の管理者だけが行えます。' using errcode = '42501';
  end if;
  if clean_name is null or char_length(clean_name) not between 1 and 120 or clean_name ~ '[[:cntrl:]]' then
    raise exception '現場名を1〜120文字で入力してください。';
  end if;
  normalized_name := regexp_replace(normalize(clean_name, NFKC), '[[:space:]　]', '', 'g');
  if normalized_name = '' or normalized_name in ('新しい現場','現場名をあとで変更','未登録現場') then
    raise exception '仮の名前ではなく実際の現場名を入力してください。';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('toya-shared-sites:' || cid::text));
  select count(*) into matching_count from public.sites s
    where s.company_id = cid and regexp_replace(normalize(s.name, NFKC), '[[:space:]　]', '', 'g') = normalized_name;
  if matching_count > 1 then
    raise exception '同じ名前の現場が複数あります。追加せず管理者が登録を確認してください。';
  end if;
  if matching_count = 1 then
    if exists (select 1 from public.sites s where s.company_id = cid and regexp_replace(normalize(s.name, NFKC), '[[:space:]　]', '', 'g') = normalized_name and s.status <> 'active') then
      raise exception '同名の完了・非表示の現場があります。再開するかを管理者が確認してください。';
    end if;
    return query select s.id, s.name, s.status from public.sites s where s.company_id = cid and regexp_replace(normalize(s.name, NFKC), '[[:space:]　]', '', 'g') = normalized_name;
    return;
  end if;
  return query insert into public.sites as s (company_id, name, status)
    values (cid, clean_name, 'active') returning s.id, s.name, s.status;
end;
$function$;
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
   customer_name=coalesce(v.customer_name,''),customer_address=coalesce(v.customer_address,''),subject=coalesce(v.subject,''),notes=coalesce(v.notes,''),issuer=coalesce(v.issuer,'{}'),items=coalesce(v.items,'[]'),tax_rate=coalesce(v.tax_rate,10),cumulative_amount=v.cumulative_amount
   where id=p_id and company_id=c returning * into r;
 else
  if p_expected_updated_at is not null then raise exception '元の書類を確認できません。'; end if;
  insert into public.project_documents(id,company_id,site_id,kind,document_date,transaction_start,transaction_end,due_date,valid_until,customer_name,customer_address,subject,notes,issuer,items,tax_rate,cumulative_amount)
   values(p_id,c,v.site_id,v.kind,v.document_date,v.transaction_start,v.transaction_end,v.due_date,v.valid_until,coalesce(v.customer_name,''),coalesce(v.customer_address,''),coalesce(v.subject,''),coalesce(v.notes,''),coalesce(v.issuer,'{}'),coalesce(v.items,'[]'),coalesce(v.tax_rate,10),v.cumulative_amount) returning * into r;
 end if;
 return r;
end $function$;
CREATE OR REPLACE FUNCTION public.toya_issue_project_document(p_id uuid, p_expected_updated_at timestamp with time zone)
 RETURNS project_documents
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
end $function$;
CREATE OR REPLACE FUNCTION public.toya_set_site_completion(p_site_id uuid, p_expected_version integer, p_completed_on date, p_reopen boolean DEFAULT false)
 RETURNS sites
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c uuid; r public.sites;
begin
 select company_id into c from public.profiles where id=auth.uid() and active and role='admin';
 if c is null then raise exception '管理者のログインが必要です。'; end if;
 if not p_reopen and (p_completed_on is null or p_completed_on>(current_timestamp at time zone 'Asia/Tokyo')::date) then raise exception '完工日を今日以前の日付で入力してください。'; end if;
 update public.sites set completed_on=case when p_reopen then null else p_completed_on end,status=case when p_reopen then 'active' else 'inactive' end,lifecycle_version=lifecycle_version+1
 where id=p_site_id and company_id=c and lifecycle_version=p_expected_version returning * into r;
 if not found then raise exception '現場が更新されています。読み直してください。'; end if;
 return r;
end $function$;
CREATE OR REPLACE FUNCTION public.toya_void_project_document(p_id uuid, p_expected_updated_at timestamp with time zone, p_reason text)
 RETURNS project_documents
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
CREATE OR REPLACE FUNCTION public.toya_estimate_number(p_value text, p_places integer, p_max numeric, p_label text, p_positive boolean DEFAULT false)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare n numeric;
begin
 if nullif(btrim(p_value),'') is null then return null; end if;
 if btrim(p_value) !~ ('^[0-9]+(\.[0-9]{1,'||p_places||'})?$') then raise exception '%は小数%桁までの数字で入力してください。',p_label,p_places; end if;
 n:=btrim(p_value)::numeric;
 if n>p_max or (p_positive and n=0) then raise exception '%の範囲を確認してください。',p_label; end if;
 return n;
end $function$;
CREATE OR REPLACE FUNCTION public.toya_calculate_estimate_plan(p_groups jsonb, p_overhead numeric, p_markup numeric, p_override numeric, p_tax integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
 if tg_op='UPDATE' and new.entry_mode is distinct from old.entry_mode then raise exception '入力方式の違う見積は新しく作成してください。'; end if;
 if new.entry_mode='quote' then new.calculation:=public.toya_calculate_quote_lines(new.groups,new.tax_rate);
 else new.calculation:=public.toya_calculate_estimate_plan(new.groups,new.overhead_percent,new.markup_percent,new.quote_amount_override,new.tax_rate); end if;
 if tg_op='INSERT' then new.created_at:=clock_timestamp(); end if;
 new.updated_at:=clock_timestamp();return new;
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
  update public.estimate_plans set entry_mode=coalesce(v.entry_mode,r.entry_mode),title=v.title,site_name=coalesce(v.site_name,''),site_address=coalesce(v.site_address,''),customer_name=coalesce(v.customer_name,''),customer_address=coalesce(v.customer_address,''),internal_notes=coalesce(v.internal_notes,''),quote_notes=coalesce(v.quote_notes,''),groups=coalesce(v.groups,'[]'),overhead_percent=v.overhead_percent,markup_percent=v.markup_percent,quote_amount_override=v.quote_amount_override,tax_rate=coalesce(v.tax_rate,10) where id=p_id and company_id=c returning * into r;
 else
  if p_expected_updated_at is not null then raise exception '元の積算表を確認できません。'; end if;
  insert into public.estimate_plans(id,company_id,entry_mode,site_id,source_plan_id,title,site_name,site_address,customer_name,customer_address,internal_notes,quote_notes,groups,overhead_percent,markup_percent,quote_amount_override,tax_rate)
  values(p_id,c,coalesce(v.entry_mode,'cost'),v.site_id,v.source_plan_id,v.title,coalesce(v.site_name,''),coalesce(v.site_address,''),coalesce(v.customer_name,''),coalesce(v.customer_address,''),coalesce(v.internal_notes,''),coalesce(v.quote_notes,''),coalesce(v.groups,'[]'),v.overhead_percent,v.markup_percent,v.quote_amount_override,coalesce(v.tax_rate,10)) returning * into r;
 end if;
 return r;
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
CREATE OR REPLACE FUNCTION public.toya_validate_quantity_groups(p_groups jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare g jsonb; r jsonb; k text; n integer:=0; v text;
begin
 if jsonb_typeof(p_groups) is distinct from 'array' or jsonb_array_length(p_groups)>100 then return false; end if;
 for g in select value from jsonb_array_elements(p_groups) loop
  if jsonb_typeof(g) is distinct from 'object' or nullif(btrim(g->>'name'),'') is null or length(g->>'name')>200 or jsonb_typeof(g->'lines') is distinct from 'array' then return false; end if;
  n:=n+jsonb_array_length(g->'lines');if n>300 then return false; end if;
  for r in select value from jsonb_array_elements(g->'lines') loop
   if jsonb_typeof(r) is distinct from 'object' or nullif(btrim(r->>'label'),'') is null or length(r->>'label')>200 or length(coalesce(r->>'unit',''))>20 or length(coalesce(r->>'notes',''))>2000 or length(coalesce(r->>'section',''))>200 then return false; end if;
   v:=nullif(r->>'quantity','');if v is not null and (v !~ '^[0-9]+(\.[0-9]{1,3})?$') then return false; end if;
   if v is not null and v::numeric>1000000 then return false; end if;
   foreach k in array array['quoted_unit_price','quoted_amount'] loop
    v:=nullif(r->>k,'');if v is not null and v !~ '^-?[0-9]+(\.[0-9]{1,2})?$' then return false; end if;
    if v is not null and abs(v::numeric)>999999999999 then return false; end if;
   end loop;
   if coalesce(r->>'row_kind','work') not in ('work','allowance','adjustment') then return false; end if;
   if coalesce(r->>'source_page','') !~ '^[1-9][0-9]{0,3}$' then return false; end if;
  end loop;
 end loop;
 return n>0;
end $function$;
CREATE OR REPLACE FUNCTION public.toya_quote_signed_number(p_value text, p_places integer, p_label text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare s text:=btrim(p_value); n numeric;
begin
 if nullif(s,'') is null then return null; end if;
 if p_places=0 then
  if s !~ '^-?[0-9]+$' then raise exception '%は1円単位で入力してください。',p_label; end if;
  n:=s::numeric;if abs(n)>999999999999 then raise exception '%の範囲を確認してください。',p_label; end if;return n;
 end if;
 n:=public.toya_estimate_number(case when left(s,1)='-' then substr(s,2) else s end,p_places,999999999999,p_label);
 return case when left(s,1)='-' then -n else n end;
end $function$;
CREATE OR REPLACE FUNCTION public.toya_calculate_quote_lines(p_groups jsonb, p_tax integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
end $function$;
CREATE OR REPLACE FUNCTION public.toya_rewrite_site_labels(p_value jsonb, p_old_name text, p_new_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO ''
AS $function$
declare
  result jsonb;
begin
  if jsonb_typeof(p_value) = 'object' then
    select coalesce(jsonb_object_agg(
      item.key,
      case
        when item.key in ('site', 'travelSite')
          and jsonb_typeof(item.value) = 'string'
          and regexp_replace(normalize(item.value #>> '{}', NFKC), '[[:space:]　]', '', 'g')
            = regexp_replace(normalize(p_old_name, NFKC), '[[:space:]　]', '', 'g')
        then to_jsonb(p_new_name)
        else public.toya_rewrite_site_labels(item.value, p_old_name, p_new_name)
      end
    ), '{}'::jsonb)
    into result
    from jsonb_each(p_value) as item;
    return result;
  end if;

  if jsonb_typeof(p_value) = 'array' then
    select coalesce(jsonb_agg(
      public.toya_rewrite_site_labels(item.value, p_old_name, p_new_name)
      order by item.ordinality
    ), '[]'::jsonb)
    into result
    from jsonb_array_elements(p_value) with ordinality as item(value, ordinality);
    return result;
  end if;

  return p_value;
end;
$function$;
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
  if regexp_replace(normalize(target.name, NFKC), '[[:space:]　]', '', 'g') = normalized_name then
    return target;
  end if;
  if exists (
    select 1 from public.sites s
    where s.company_id = company and s.id <> target.id
      and regexp_replace(normalize(s.name, NFKC), '[[:space:]　]', '', 'g') = normalized_name
  ) then
    raise exception '同じ現場名がすでに登録されています。';
  end if;

  update public.sites
  set name = clean_name, lifecycle_version = lifecycle_version + 1
  where id = target.id and company_id = company
  returning * into renamed;

  with rewritten as (
    select r.id,
      public.toya_rewrite_site_labels(r.report_data, target.name, clean_name) as report_data
    from public.daily_reports r
    where r.company_id = company
  )
  update public.daily_reports r
  set report_data = rewritten.report_data,
      updated_at = clock_timestamp()
  from rewritten
  where r.id = rewritten.id
    and r.company_id = company
    and r.report_data is distinct from rewritten.report_data;

  update public.estimate_plans
  set site_name = clean_name
  where company_id = company and site_id = target.id
    and site_name is distinct from clean_name;

  return renamed;
end;
$function$;
CREATE OR REPLACE FUNCTION public.toya_site_project_profile_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  item jsonb;
  item_amount numeric;
begin
  if not exists (
    select 1 from public.profiles p
    join public.sites s on s.company_id = p.company_id
    where p.id = auth.uid() and p.active and p.role = 'admin'
      and p.company_id = new.company_id and s.id = new.site_id
  ) then
    raise exception '管理者として現場を確認してください。' using errcode = '42501';
  end if;
  if jsonb_typeof(new.contract_breakdown) is distinct from 'array'
    or jsonb_array_length(new.contract_breakdown) > 48
    or octet_length(new.contract_breakdown::text) > 30000 then
    raise exception '契約内訳は48件までです。';
  end if;
  for item in select value from jsonb_array_elements(new.contract_breakdown) loop
    if jsonb_typeof(item) is distinct from 'object'
      or length(btrim(coalesce(item->>'label',''))) not between 1 and 160
      or coalesce(item->>'target_month','') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      or coalesce(item->>'status','') not in ('planned','complete')
      or jsonb_typeof(item->'amount') is distinct from 'number' then
      raise exception '月別の契約内訳を確認してください。';
    end if;
    item_amount := (item->>'amount')::numeric;
    if item_amount < 0 or item_amount > 999999999999 or trunc(item_amount) <> item_amount
      or length(coalesce(item->>'notes','')) > 1000 then
      raise exception '契約内訳の金額または備考を確認してください。';
    end if;
  end loop;
  if tg_op = 'INSERT' then new.created_at := clock_timestamp(); end if;
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.toya_save_site_project_profile(p_site_id uuid, p_expected_updated_at timestamp with time zone, p_expected_contract_updated_at timestamp with time zone, p_contract_amount numeric, p_profile jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  company uuid;
  existing public.site_project_profiles;
  value public.site_project_profiles;
  saved public.site_project_profiles;
  contract public.revenues;
begin
  select p.company_id into company
  from public.profiles p
  where p.id = auth.uid() and p.active and p.role = 'admin';
  if company is null then
    raise exception '管理者としてログインしてください。' using errcode = '42501';
  end if;
  if not exists (select 1 from public.sites s where s.id = p_site_id and s.company_id = company) then
    raise exception '現場を確認してください。';
  end if;
  if p_contract_amount is null or p_contract_amount < 0 or p_contract_amount > 999999999999
    or trunc(p_contract_amount) <> p_contract_amount then
    raise exception '請負金額を1円単位で入力してください。';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(company::text, 0));
  value := jsonb_populate_record(null::public.site_project_profiles, coalesce(p_profile, '{}'::jsonb));

  select * into existing from public.site_project_profiles
  where site_id = p_site_id and company_id = company for update;
  if found then
    if existing.updated_at is distinct from p_expected_updated_at then
      raise exception '現場内容が更新されています。読み直してください。';
    end if;
    update public.site_project_profiles set
      project_category = coalesce(value.project_category,''),
      structure_type = coalesce(value.structure_type,''),
      floors_above = value.floors_above,
      floors_below = value.floors_below,
      floor_area_sqm = value.floor_area_sqm,
      site_area_sqm = value.site_area_sqm,
      foundation_volume_m3 = value.foundation_volume_m3,
      work_start = value.work_start,
      work_end = value.work_end,
      scope_notes = coalesce(value.scope_notes,''),
      exclusion_notes = coalesce(value.exclusion_notes,''),
      contract_breakdown = coalesce(value.contract_breakdown,'[]'::jsonb)
    where site_id = p_site_id and company_id = company
    returning * into saved;
  else
    if p_expected_updated_at is not null then
      raise exception '元の現場内容を確認できません。';
    end if;
    insert into public.site_project_profiles(
      site_id, company_id, project_category, structure_type, floors_above, floors_below,
      floor_area_sqm, site_area_sqm, foundation_volume_m3, work_start, work_end,
      scope_notes, exclusion_notes, contract_breakdown, updated_by
    ) values (
      p_site_id, company, coalesce(value.project_category,''), coalesce(value.structure_type,''),
      value.floors_above, value.floors_below, value.floor_area_sqm, value.site_area_sqm,
      value.foundation_volume_m3, value.work_start, value.work_end, coalesce(value.scope_notes,''),
      coalesce(value.exclusion_notes,''), coalesce(value.contract_breakdown,'[]'::jsonb), auth.uid()
    ) returning * into saved;
  end if;

  select * into contract from public.revenues
  where company_id = company and site_id = p_site_id and revenue_type = 'contract' for update;
  if found then
    if contract.updated_at is distinct from p_expected_contract_updated_at then
      raise exception '請負金額が更新されています。読み直してください。';
    end if;
    update public.revenues set amount = p_contract_amount,
      description = '請負金額（税別）', updated_at = clock_timestamp()
    where id = contract.id returning * into contract;
  else
    if p_expected_contract_updated_at is not null then
      raise exception '元の請負金額を確認できません。';
    end if;
    insert into public.revenues(company_id, site_id, revenue_type, revenue_date, description, amount)
    values(company, p_site_id, 'contract', (current_timestamp at time zone 'Asia/Tokyo')::date,
      '請負金額（税別）', p_contract_amount)
    returning * into contract;
  end if;

  return jsonb_build_object('profile', to_jsonb(saved), 'contract', to_jsonb(contract));
end;
$function$;
CREATE OR REPLACE FUNCTION public.toya_delete_unissued_invoice(p_id uuid, p_expected_updated_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c uuid; r public.project_documents; deleted_id uuid;
begin
  select company_id into c from public.profiles
    where id=auth.uid() and active and role='admin';
  if c is null then raise exception '管理者のログインが必要です。'; end if;
  perform pg_advisory_xact_lock(hashtextextended(c::text,0));
  select * into r from public.project_documents where id=p_id and company_id=c for update;
  if not found then raise exception '書類を確認できません。一覧を更新してください。'; end if;
  if r.updated_at is distinct from p_expected_updated_at then
    raise exception '書類が更新されています。開き直してから削除してください。';
  end if;
  if r.kind not in ('invoice','progress') or r.status not in ('draft','void')
    or r.issued_at is not null or r.document_number is not null
    or r.number_year is not null or r.number_seq is not null then
    raise exception '完全削除できるのは、一度も確定していない請求書です。';
  end if;
  delete from public.project_documents where id=r.id and company_id=c returning id into deleted_id;
  if deleted_id is null then raise exception '削除できませんでした。一覧を更新してください。'; end if;
  return deleted_id;
end $function$;
CREATE OR REPLACE FUNCTION public.toya_registry_validate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare e jsonb; k text; ids text[]:='{}'; names text[]:='{}';
begin
 if tg_op='UPDATE' and new.version<>old.version+1 then raise exception '登録内容が更新されています。読み込み直してください。';end if;
 for e in select value from jsonb_array_elements(new.entries) loop
  if jsonb_typeof(e)<>'object' or coalesce(e->>'id','') !~ '^[a-zA-Z0-9_-]{1,80}$' or jsonb_typeof(e->'name') is distinct from 'string' or length(btrim(e->>'name')) not between 1 and 120 or (e ? 'active' and jsonb_typeof(e->'active')<>'boolean') then raise exception '登録内容を確認してください。';end if;
  if e->>'id'=any(ids) or (coalesce((e->>'active')::boolean,true) and e->>'name'=any(names)) then raise exception '同じ登録が重複しています。';end if;
  ids:=array_append(ids,e->>'id');if coalesce((e->>'active')::boolean,true) then names:=array_append(names,e->>'name');end if;
  foreach k in array array['name','category','location','mountedOn','memo'] loop
   if e ? k and (jsonb_typeof(e->k)<>'string' or length(e->>k)>1000 or (e->>k) ~ '[<>"&''[:cntrl:]]') then raise exception '記号 < > & 引用符や改行は全角文字に置き換えてください。';end if;
  end loop;
 end loop;
 return new;
end $function$;
CREATE OR REPLACE FUNCTION private.toya_onboarding(p_action text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u auth.users; p public.profiles; member public.profiles; c uuid; inv private.company_invitations;
 nm text:=btrim(p_payload->>'name'); company_name text:=btrim(p_payload->>'company_name'); mail text; token text; result jsonb; count_pending integer;
begin
 if auth.uid() is null then raise exception 'ログインしてください。';end if;
 select * into u from auth.users where id=auth.uid() for update;
 if not found then raise exception 'ログインし直してください。';end if;
 select * into p from public.profiles where id=u.id for update;
 if p_action='status' then
  return jsonb_build_object('state',case when p.id is null then 'unregistered' when p.active and p.company_id is not null then coalesce((select case when status='active' and (expires_at is null or expires_at>now()) then 'ready' when status='pending' then 'pending' else 'suspended' end from private.company_licenses where company_id=p.company_id),'pending') else 'inactive' end,'verified',u.email_confirmed_at is not null,'email',u.email,'name',p.name,'role',p.role,'company_name',(select name from public.companies where id=p.company_id));
 end if;
 if u.email_confirmed_at is null then raise exception '確認メールを開いてメールアドレスを確認してください。';end if;
 if p_action in ('create_company','join') then
  if p.id is not null then raise exception 'このアカウントは登録済みです。会社を変更することはできません。';end if;
  if nm is null or length(nm) not between 1 and 120 or nm ~ '[<>"&''[:cntrl:]]' then raise exception '氏名を1〜120文字で入力してください。記号や改行は全角文字に置き換えてください。';end if;
  if p_action='create_company' then
   if company_name is null or length(company_name) not between 1 and 160 or company_name ~ '[<>"&''[:cntrl:]]' then raise exception '会社名を1〜160文字で入力してください。';end if;
   insert into public.companies(name) values(company_name) returning id into c;
   insert into public.profiles(id,company_id,name,role,active) values(u.id,c,nm,'admin',true);
   insert into public.billing_profiles(company_id,issuer_name) values(c,company_name);
   return jsonb_build_object('company_id',c,'state','pending');
  end if;
  token:=p_payload->>'token';
  if token is null or token !~ '^[a-f0-9]{64}$' then raise exception '参加リンクを確認してください。';end if;
  select * into inv from private.company_invitations where token_hash=encode(sha256(convert_to(token,'UTF8')),'hex') for update;
  if not found or inv.revoked or inv.used_by is not null or inv.expires_at<=now() or inv.email<>lower(u.email) then raise exception 'この参加リンクは利用できません。指定されたメールアドレスと有効期限を確認してください。';end if;
  if not exists(select 1 from public.profiles where id=inv.invited_by and company_id=inv.company_id and active and role='admin') then raise exception '管理者に参加リンクの再発行を依頼してください。';end if;
  insert into public.profiles(id,company_id,name,role,active) values(u.id,inv.company_id,nm,'employee',true);
  update private.company_invitations set used_by=u.id where id=inv.id;
  return jsonb_build_object('company_id',inv.company_id,'state','ready');
 end if;
 if p.id is null or p.active is not true or p.role<>'admin' or p.company_id is null then raise exception '会社の管理者だけが操作できます。';end if;
 if private.toya_allowed_company() is distinct from p.company_id then raise exception '会社の利用開始と端末登録を確認してください。';end if;
 if p_action='invite' then
  mail:=lower(btrim(p_payload->>'email'));
  if mail is null or length(mail)>254 or mail !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception '社員のメールアドレスを入力してください。';end if;
  if exists(select 1 from auth.users au join public.profiles pr on pr.id=au.id where lower(au.email)=mail) then raise exception 'このアドレスには参加リンクを発行できません。登録状況を本人に確認してください。';end if;
  select count(*) into count_pending from private.company_invitations where company_id=p.company_id and not revoked and used_by is null and expires_at>now();
  if count_pending>=20 then raise exception '未使用の参加リンクが20件あります。不要なリンクを取り消してください。';end if;
  token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  insert into private.company_invitations(company_id,email,token_hash,invited_by) values(p.company_id,mail,encode(sha256(convert_to(token,'UTF8')),'hex'),p.id) returning * into inv;
  return jsonb_build_object('id',inv.id,'token',token,'email',mail,'expires_at',inv.expires_at);
 elsif p_action='list' then
  return jsonb_build_object('members',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'role',role,'active',active) order by name),'[]'::jsonb) from public.profiles where company_id=p.company_id),'invitations',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'email',email,'expires_at',expires_at,'revoked',revoked,'used',used_by is not null) order by created_at desc),'[]'::jsonb) from (select * from private.company_invitations where company_id=p.company_id order by created_at desc limit 50) i));
 elsif p_action='revoke' then
  update private.company_invitations set revoked=true where id=(p_payload->>'id')::uuid and company_id=p.company_id and used_by is null;
  if not found then raise exception '未使用の参加リンクが見つかりません。';end if;
  return jsonb_build_object('ok',true);
 elsif p_action='member_active' then
  select * into member from public.profiles where id=(p_payload->>'id')::uuid and company_id=p.company_id for update;
  if not found or member.role<>'employee' or member.id=p.id then raise exception '同じ会社の社員アカウントを選択してください。';end if;
  if jsonb_typeof(p_payload->'active') is distinct from 'boolean' or jsonb_typeof(p_payload->'expected_active') is distinct from 'boolean' or member.active is distinct from (p_payload->>'expected_active')::boolean then raise exception '状態が変更されています。一覧を更新してください。';end if;
  update public.profiles set active=(p_payload->>'active')::boolean where id=member.id;
  return jsonb_build_object('ok',true);
 end if;
 raise exception '操作を確認してください。';
end $function$;
CREATE OR REPLACE FUNCTION public.toya_onboarding(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.toya_onboarding(p_action,p_payload);$function$;
CREATE OR REPLACE FUNCTION private.toya_new_license()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin insert into private.company_licenses(company_id) values(new.id);return new;end $function$;
CREATE OR REPLACE FUNCTION private.toya_allowed_company()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select p.company_id from public.profiles p join private.company_licenses l on l.company_id=p.company_id
 where p.id=auth.uid() and p.active and l.status='active' and (l.expires_at is null or l.expires_at>now())
 and (l.internal or exists(select 1 from private.login_devices d where d.user_id=p.id and d.session_id::text=auth.jwt()->>'session_id'));
$function$;
CREATE OR REPLACE FUNCTION private.toya_license_seat()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l private.company_licenses; n integer;
begin
 if new.active is not true or new.company_id is null then return new;end if;
 if tg_op='UPDATE' and old.active and old.company_id is not distinct from new.company_id then return new;end if;
 select * into l from private.company_licenses where company_id=new.company_id for update;
 if not found then raise exception '会社の利用登録を確認してください。';end if;
 if l.internal then return new;end if;
 select count(*) into n from public.profiles where company_id=new.company_id and active and id<>new.id;
 -- The first owner can register before seller approval, but has no business-data access.
 if l.status='pending' and n=0 and new.role='admin' then return new;end if;
 if l.status<>'active' or (l.expires_at is not null and l.expires_at<=now()) then raise exception '会社の利用開始を確認してください。';end if;
 if n>=l.max_users then raise exception '契約人数の上限です。不要な社員の利用を停止するか、契約人数を変更してください。';end if;
 return new;
end $function$;
CREATE OR REPLACE FUNCTION private.toya_access(p_action text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.profiles; l private.company_licenses; sid uuid; dh text; n integer; target uuid;
begin
 select * into p from public.profiles where id=auth.uid();
 if p.id is null or p.active is not true then return jsonb_build_object('state','inactive','message','会社の利用登録を確認してください。');end if;
 select * into l from private.company_licenses where company_id=p.company_id for update;
 if l.company_id is null or l.status<>'active' or (l.expires_at is not null and l.expires_at<=now()) then
 return jsonb_build_object('state',case when l.status='pending' then 'pending' else 'suspended' end,'company_code',l.company_code,'message',case when l.status='pending' then '会社登録を受け付けました。販売元で利用開始を確認しています。' else '会社の契約が停止中、または期限を過ぎています。会社の管理者に確認してください。' end);end if;
 if p_action='bind' and not l.internal then
  sid:=nullif(auth.jwt()->>'session_id','')::uuid;
  if sid is null or not exists(select 1 from auth.sessions where id=sid and user_id=p.id and created_at>coalesce((select reset_at from private.device_resets where user_id=p.id),'-infinity'::timestamptz)) then raise exception 'ログインし直してください。';end if;
  if coalesce(p_payload->>'device_key','') !~ '^[a-f0-9]{64}$' then raise exception '端末の保存を許可して、もう一度ログインしてください。';end if;
  dh:=encode(sha256(convert_to(p_payload->>'device_key','UTF8')),'hex');
  if not exists(select 1 from private.login_devices where user_id=p.id and device_hash=dh) then
   select count(*) into n from private.login_devices where user_id=p.id;
   if n>=(case when p.role='admin' then 2 else 1 end) then return jsonb_build_object('state','device_limit','message',case when p.role='admin' then '登録できる端末は2台までです。端末を交換した場合は販売元に登録解除を依頼してください。' else '別の端末が登録されています。機種変更した場合は会社の管理者に端末の登録解除を依頼してください。' end);end if;
  end if;
  -- One active session per registered browser. Refresh preserves the session ID.
  delete from private.login_devices where user_id=p.id and session_id=sid and device_hash<>dh;
  insert into private.login_devices(user_id,device_hash,session_id) values(p.id,dh,sid)
   on conflict(user_id,device_hash) do update set session_id=excluded.session_id;
 elsif p_action='reset_device' then
  if p.role<>'admin' or private.toya_allowed_company() is distinct from p.company_id then raise exception '管理者としてログインし直してください。';end if;
  target:=(p_payload->>'id')::uuid;
  if not exists(select 1 from public.profiles where id=target and company_id=p.company_id and role='employee') then raise exception '同じ会社の社員を選択してください。';end if;
  delete from private.login_devices where user_id=target;
  insert into private.device_resets(user_id,reset_at) values(target,clock_timestamp()) on conflict(user_id) do update set reset_at=excluded.reset_at;
 elsif p_action not in ('status','bind') then raise exception '操作を確認してください。';
 end if;
 return jsonb_build_object('state',case when private.toya_allowed_company()=p.company_id then 'ready' else 'needs_device' end,'company_code',l.company_code,'internal',l.internal,'max_users',l.max_users,'expires_at',l.expires_at);
end $function$;
CREATE OR REPLACE FUNCTION public.toya_access(p_action text DEFAULT 'status'::text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$declare result jsonb;begin
 result:=private.toya_access(p_action,p_payload);
 return result||private.toya_plan_status();
end $function$;
CREATE OR REPLACE FUNCTION private.toya_employee_admin(p_action text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.profiles; l private.company_licenses; e private.employee_logins; lid text:=lower(btrim(p_payload->>'login_id')); nm text:=btrim(p_payload->>'name');
begin
 select * into p from public.profiles where id=auth.uid() and active and role='admin' and company_id=private.toya_allowed_company();
 if p.id is null then raise exception '会社の管理者としてログインしてください。';end if;
 select * into l from private.company_licenses where company_id=p.company_id for update;
 if p_action='list' then
  return jsonb_build_object('company_code',l.company_code,'internal',l.internal,'max_users',l.max_users,'employees',(select coalesce(jsonb_agg(jsonb_build_object('id',e.user_id,'login_id',e.login_id)),'[]'::jsonb) from private.employee_logins e where e.company_id=p.company_id and e.user_id is not null));
 elsif p_action='reserve' then
  if lid is null or lid !~ '^[a-z0-9][a-z0-9_-]{2,23}$' then raise exception '社員IDは半角英数字・ハイフン・下線で3〜24文字にしてください。';end if;
  if nm is null or length(nm) not between 1 and 120 or nm ~ '[<>"&''[:cntrl:]]' then raise exception '氏名を1〜120文字で入力してください。';end if;
  if exists(select 1 from private.employee_logins where company_id=p.company_id and login_id=lid) then raise exception 'この社員IDは登録済み、または登録処理中です。別のIDを指定してください。';end if;
  if (select count(*) from public.profiles where company_id=p.company_id and active)+(select count(*) from private.employee_logins where company_id=p.company_id and user_id is null)>=l.max_users then raise exception '契約人数の上限です。不要な社員の利用を停止するか、契約人数を変更してください。';end if;
  insert into private.employee_logins(company_id,login_id,name,email,reserved_by)
   values(p.company_id,lid,nm,lower(l.company_code)||'.'||lid||'@employee.toya.invalid',p.id) returning * into e;
  return jsonb_build_object('reservation',e.reservation,'email',e.email,'actor',p.id);
 elsif p_action='reset_target' then
  select el.* into e from private.employee_logins el join public.profiles pr on pr.id=el.user_id
   where el.user_id=(p_payload->>'id')::uuid and el.company_id=p.company_id and pr.role='employee' and pr.active;
  if e.user_id is null then raise exception '利用中の社員IDアカウントを選択してください。';end if;
  return jsonb_build_object('user_id',e.user_id);
 end if;
 raise exception '操作を確認してください。';
end $function$;
CREATE OR REPLACE FUNCTION public.toya_employee_admin(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.toya_employee_admin(p_action,p_payload);$function$;
CREATE OR REPLACE FUNCTION private.toya_employee_finish(p_reservation uuid, p_actor uuid, p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e private.employee_logins; l private.company_licenses;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'アクセスできません。';end if;
 select * into e from private.employee_logins where reservation=p_reservation and reserved_by=p_actor for update;
 if e.reservation is null or e.user_id is not null then raise exception '登録処理を確認してください。';end if;
 if p_user is null then delete from private.employee_logins where reservation=p_reservation;return jsonb_build_object('ok',true);end if;
 select * into l from private.company_licenses where company_id=e.company_id for update;
 if l.status<>'active' or (l.expires_at is not null and l.expires_at<=now()) or not exists(select 1 from public.profiles where id=p_actor and company_id=e.company_id and role='admin' and active) then raise exception '会社の利用状態が変わりました。';end if;
 if not exists(select 1 from auth.users where id=p_user and email=e.email and email_confirmed_at is not null) then raise exception '社員アカウントの作成を確認してください。';end if;
 insert into public.profiles(id,company_id,name,role,active) values(p_user,e.company_id,e.name,'employee',true);
 update private.employee_logins set user_id=p_user where reservation=p_reservation;
 return jsonb_build_object('ok',true,'id',p_user);
end $function$;
CREATE OR REPLACE FUNCTION public.toya_employee_finish(p_reservation uuid, p_actor uuid, p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.toya_employee_finish(p_reservation,p_actor,p_user);$function$;
CREATE OR REPLACE FUNCTION private.toya_has_feature(p_feature text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce((select case p_feature
 when 'daily' then true
 when 'invoice' then l.internal or l.plan in ('billing','complete')
 when 'estimate' then l.internal or l.plan='complete'
 else false end
 from private.company_licenses l where l.company_id=private.toya_allowed_company()),false);
$function$;
CREATE OR REPLACE FUNCTION public.toya_has_feature(p_feature text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$select private.toya_has_feature(p_feature);$function$;
CREATE OR REPLACE FUNCTION private.toya_plan_status()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce((select jsonb_build_object('plan',case when l.internal then 'complete' else l.plan end,
 'features',jsonb_build_object('daily',private.toya_has_feature('daily'),'invoice',private.toya_has_feature('invoice'),'estimate',private.toya_has_feature('estimate')))
 from public.profiles p join private.company_licenses l on l.company_id=p.company_id where p.id=auth.uid() and p.active),'{}'::jsonb);
$function$;
alter table "public"."workers" add constraint "workers_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."equipment" add constraint "equipment_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."vehicles" add constraint "vehicles_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."sites" add constraint "sites_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."daily_reports" add constraint "daily_reports_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."daily_reports" add constraint "daily_reports_site_id_fkey" FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL;
alter table "public"."labor_entries" add constraint "labor_entries_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."labor_entries" add constraint "labor_entries_site_id_fkey" FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE;
alter table "public"."labor_entries" add constraint "labor_entries_report_id_fkey" FOREIGN KEY (report_id) REFERENCES daily_reports(id) ON DELETE CASCADE;
alter table "public"."labor_entries" add constraint "labor_entries_worker_id_fkey" FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE SET NULL;
alter table "public"."equipment_usage" add constraint "equipment_usage_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."equipment_usage" add constraint "equipment_usage_site_id_fkey" FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE;
alter table "public"."equipment_usage" add constraint "equipment_usage_report_id_fkey" FOREIGN KEY (report_id) REFERENCES daily_reports(id) ON DELETE CASCADE;
alter table "public"."equipment_usage" add constraint "equipment_usage_equipment_id_fkey" FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE SET NULL;
alter table "public"."vehicle_usage" add constraint "vehicle_usage_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."vehicle_usage" add constraint "vehicle_usage_site_id_fkey" FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE;
alter table "public"."vehicle_usage" add constraint "vehicle_usage_report_id_fkey" FOREIGN KEY (report_id) REFERENCES daily_reports(id) ON DELETE CASCADE;
alter table "public"."vehicle_usage" add constraint "vehicle_usage_vehicle_id_fkey" FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL;
alter table "public"."fuel_entries" add constraint "fuel_entries_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."fuel_entries" add constraint "fuel_entries_site_id_fkey" FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE;
alter table "public"."fuel_entries" add constraint "fuel_entries_report_id_fkey" FOREIGN KEY (report_id) REFERENCES daily_reports(id) ON DELETE CASCADE;
alter table "public"."fuel_entries" add constraint "fuel_entries_equipment_id_fkey" FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE SET NULL;
alter table "public"."fuel_entries" add constraint "fuel_entries_vehicle_id_fkey" FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL;
alter table "public"."cost_entries" add constraint "cost_entries_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."cost_entries" add constraint "cost_entries_site_id_fkey" FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE;
alter table "public"."cost_entries" add constraint "cost_entries_report_id_fkey" FOREIGN KEY (report_id) REFERENCES daily_reports(id) ON DELETE SET NULL;
alter table "public"."revenues" add constraint "revenues_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."revenues" add constraint "revenues_site_id_fkey" FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE;
alter table "public"."profiles" add constraint "profiles_role_check" CHECK ((role = ANY (ARRAY['admin'::text, 'manager'::text, 'employee'::text])));
alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table "public"."profiles" add constraint "profiles_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."report_photos" add constraint "report_photos_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."report_photos" add constraint "report_photos_report_id_fkey" FOREIGN KEY (report_id) REFERENCES daily_reports(id) ON DELETE CASCADE;
alter table "private"."company_licenses" add constraint "company_licenses_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'suspended'::text])));
alter table "public"."waste_entries" add constraint "waste_entries_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."waste_entries" add constraint "waste_entries_report_id_fkey" FOREIGN KEY (report_id) REFERENCES daily_reports(id) ON DELETE CASCADE;
alter table "public"."waste_entries" add constraint "waste_entries_site_id_fkey" FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL;
alter table "public"."waste_entries" add constraint "waste_entries_manifest_type_check" CHECK ((manifest_type = ANY (ARRAY['none'::text, 'paper'::text, 'electronic'::text])));
alter table "public"."user_activity" add constraint "user_activity_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."user_activity" add constraint "user_activity_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table "public"."user_activity" add constraint "user_activity_report_id_fkey" FOREIGN KEY (report_id) REFERENCES daily_reports(id) ON DELETE SET NULL;
alter table "public"."daily_reports" add constraint "daily_reports_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table "private"."company_licenses" add constraint "company_licenses_max_users_check" CHECK (((max_users >= 1) AND (max_users <= 10000)));
alter table "private"."company_licenses" add constraint "company_licenses_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "private"."login_devices" add constraint "login_devices_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table "public"."waste_price_master" add constraint "waste_price_master_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table "public"."labor_cost_sheets" add constraint "labor_cost_sheets_source_reports_check" CHECK ((jsonb_typeof(source_reports) = 'array'::text));
alter table "private"."device_resets" add constraint "device_resets_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table "private"."employee_logins" add constraint "employee_logins_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);
alter table "private"."employee_logins" add constraint "employee_logins_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table "public"."waste_price_master" add constraint "waste_price_master_rate_basis_check" CHECK ((rate_basis = ANY (ARRAY['kg'::text, 'm3'::text, 'vehicle'::text, 'piece'::text])));
alter table "public"."labor_rate_master" add constraint "labor_rate_master_label_check" CHECK (((length(TRIM(BOTH FROM label)) >= 1) AND (length(TRIM(BOTH FROM label)) <= 120)));
alter table "public"."labor_rate_master" add constraint "labor_rate_master_kind_check" CHECK ((kind = ANY (ARRAY['own'::text, 'dispatch'::text, 'incoming'::text, 'outgoing'::text])));
alter table "public"."labor_rate_master" add constraint "labor_rate_master_day_rate_check" CHECK ((day_rate >= (0)::numeric));
alter table "public"."labor_rate_master" add constraint "labor_rate_master_half_rate_check" CHECK ((half_rate >= (0)::numeric));
alter table "public"."labor_rate_master" add constraint "labor_rate_master_city_per_vehicle_check" CHECK ((city_per_vehicle >= (0)::numeric));
alter table "public"."labor_rate_master" add constraint "labor_rate_master_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);
alter table "public"."labor_cost_sheets" add constraint "labor_cost_sheets_entries_check" CHECK (((jsonb_typeof(entries) = 'array'::text) AND (jsonb_array_length(entries) <= 200)));
alter table "public"."labor_cost_sheets" add constraint "labor_cost_sheets_cost_total_check" CHECK ((cost_total >= (0)::numeric));
alter table "public"."labor_cost_sheets" add constraint "labor_cost_sheets_revenue_total_check" CHECK ((revenue_total >= (0)::numeric));
alter table "public"."labor_cost_sheets" add constraint "labor_cost_sheets_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);
alter table "public"."labor_cost_sheets" add constraint "labor_cost_sheets_site_id_fkey" FOREIGN KEY (site_id) REFERENCES sites(id);
alter table "public"."vehicle_rate_master" add constraint "vehicle_rate_master_code_check" CHECK (((length(code) >= 1) AND (length(code) <= 80)));
alter table "public"."vehicle_rate_master" add constraint "vehicle_rate_master_label_check" CHECK (((length(label) >= 1) AND (length(label) <= 120)));
alter table "public"."vehicle_rate_master" add constraint "vehicle_rate_master_daily_rate_check" CHECK (((daily_rate >= (0)::numeric) AND (daily_rate <= (1000000000)::numeric)));
alter table "private"."employee_logins" add constraint "employee_logins_reserved_by_fkey" FOREIGN KEY (reserved_by) REFERENCES profiles(id);
alter table "public"."vehicle_rate_master" add constraint "vehicle_rate_master_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);
alter table "public"."attachment_rate_master" add constraint "attachment_rate_master_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);
alter table "public"."vehicle_cost_sheets" add constraint "vehicle_cost_sheets_entries_check" CHECK (((jsonb_typeof(entries) = 'array'::text) AND ((jsonb_array_length(entries) >= 1) AND (jsonb_array_length(entries) <= 100))));
alter table "public"."vehicle_cost_sheets" add constraint "vehicle_cost_sheets_source_reports_check" CHECK ((jsonb_typeof(source_reports) = 'array'::text));
alter table "public"."vehicle_cost_sheets" add constraint "vehicle_cost_sheets_review_warnings_check" CHECK ((jsonb_typeof(review_warnings) = 'array'::text));
alter table "public"."vehicle_cost_sheets" add constraint "vehicle_cost_sheets_gross_total_check" CHECK (((gross_total >= (0)::numeric) AND (gross_total <= ('100000000000'::bigint)::numeric)));
alter table "public"."vehicle_cost_sheets" add constraint "vehicle_cost_sheets_fuel_deduction_total_check" CHECK (((fuel_deduction_total >= (0)::numeric) AND (fuel_deduction_total <= ('100000000000'::bigint)::numeric)));
alter table "public"."vehicle_cost_sheets" add constraint "vehicle_cost_sheets_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);
alter table "public"."vehicle_cost_sheets" add constraint "vehicle_cost_sheets_site_id_fkey" FOREIGN KEY (site_id) REFERENCES sites(id);
alter table "public"."project_documents" add constraint "project_documents_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);
alter table "public"."project_documents" add constraint "project_documents_site_id_fkey" FOREIGN KEY (site_id) REFERENCES sites(id);
alter table "public"."equipment_rate_master" add constraint "equipment_rate_master_code_check" CHECK (((length(code) >= 1) AND (length(code) <= 80)));
alter table "public"."equipment_rate_master" add constraint "equipment_rate_master_label_check" CHECK (((length(label) >= 1) AND (length(label) <= 120)));
alter table "public"."equipment_rate_master" add constraint "equipment_rate_master_daily_rate_check" CHECK (((daily_rate >= (0)::numeric) AND (daily_rate <= (1000000000)::numeric)));
alter table "public"."equipment_rate_master" add constraint "equipment_rate_master_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);
alter table "public"."equipment_cost_sheets" add constraint "equipment_cost_sheets_entries_check" CHECK (((jsonb_typeof(entries) = 'array'::text) AND ((jsonb_array_length(entries) >= 1) AND (jsonb_array_length(entries) <= 100))));
alter table "public"."equipment_cost_sheets" add constraint "equipment_cost_sheets_source_reports_check" CHECK ((jsonb_typeof(source_reports) = 'array'::text));
alter table "public"."equipment_cost_sheets" add constraint "equipment_cost_sheets_review_warnings_check" CHECK ((jsonb_typeof(review_warnings) = 'array'::text));
alter table "public"."equipment_cost_sheets" add constraint "equipment_cost_sheets_gross_total_check" CHECK (((gross_total >= (0)::numeric) AND (gross_total <= ('100000000000'::bigint)::numeric)));
alter table "public"."equipment_cost_sheets" add constraint "equipment_cost_sheets_fuel_deduction_total_check" CHECK (((fuel_deduction_total >= (0)::numeric) AND (fuel_deduction_total <= ('100000000000'::bigint)::numeric)));
alter table "public"."equipment_cost_sheets" add constraint "equipment_cost_sheets_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);
alter table "public"."equipment_cost_sheets" add constraint "equipment_cost_sheets_site_id_fkey" FOREIGN KEY (site_id) REFERENCES sites(id);
alter table "public"."equipment_transport_rate_master" add constraint "equipment_transport_rate_master_carrier_check" CHECK (((length(carrier) >= 1) AND (length(carrier) <= 120)));
alter table "public"."equipment_transport_rate_master" add constraint "equipment_transport_rate_master_machine_code_check" CHECK (((length(machine_code) >= 1) AND (length(machine_code) <= 80)));
alter table "public"."equipment_transport_rate_master" add constraint "equipment_transport_rate_master_machine_name_check" CHECK (((length(machine_name) >= 1) AND (length(machine_name) <= 120)));
alter table "public"."equipment_transport_rate_master" add constraint "equipment_transport_rate_master_distance_code_check" CHECK ((distance_code = ANY (ARRAY['near'::text, 'city'::text, 'outside'::text, 'far'::text])));
alter table "public"."equipment_transport_rate_master" add constraint "equipment_transport_rate_master_distance_label_check" CHECK (((length(distance_label) >= 1) AND (length(distance_label) <= 80)));
alter table "public"."equipment_transport_rate_master" add constraint "equipment_transport_rate_master_unit_price_check" CHECK (((unit_price >= (0)::numeric) AND (unit_price <= (1000000000)::numeric)));
alter table "public"."equipment_transport_rate_master" add constraint "equipment_transport_rate_master_price_basis_check" CHECK ((price_basis = ANY (ARRAY['unconfirmed'::text, 'one_way_per_machine'::text, 'round_trip_per_machine'::text, 'per_transport'::text])));
alter table "public"."equipment_transport_rate_master" add constraint "equipment_transport_rate_master_tax_basis_check" CHECK ((tax_basis = ANY (ARRAY['as_provided'::text, 'exclusive'::text, 'inclusive'::text])));
alter table "public"."equipment_transport_rate_master" add constraint "equipment_transport_rate_master_notes_check" CHECK ((length(notes) <= 2000));
alter table "public"."equipment_transport_rate_master" add constraint "equipment_transport_rate_master_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);
alter table "public"."small_tool_rate_master" add constraint "small_tool_rate_master_label_check" CHECK (((length(TRIM(BOTH FROM label)) >= 1) AND (length(TRIM(BOTH FROM label)) <= 160)));
alter table "public"."small_tool_rate_master" add constraint "small_tool_rate_master_hourly_rate_check" CHECK (((hourly_rate >= (0)::numeric) AND (hourly_rate <= (1000000000)::numeric)));
alter table "public"."small_tool_rate_master" add constraint "small_tool_rate_master_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);
alter table "public"."attachment_rate_master" add constraint "attachment_rate_master_label_check" CHECK (((length(TRIM(BOTH FROM label)) >= 1) AND (length(TRIM(BOTH FROM label)) <= 160)));
alter table "public"."attachment_rate_master" add constraint "attachment_rate_master_hourly_rate_check" CHECK (((hourly_rate >= (0)::numeric) AND (hourly_rate <= (1000000000)::numeric)));
alter table "public"."small_tool_rate_master" add constraint "small_tool_rate_master_fuel_separate_check" CHECK ((fuel_included = false));
alter table "public"."vehicle_rate_master" add constraint "vehicle_rate_master_calculation_mode_check" CHECK ((calculation_mode = 'add_recorded_fuel_labor_separate'::text));
alter table "public"."equipment_rate_master" add constraint "equipment_rate_master_calculation_mode_check" CHECK ((calculation_mode = 'add_recorded_fuel_labor_separate'::text));
alter table "public"."vehicle_cost_sheets" add constraint "vehicle_cost_sheets_check" CHECK (((fuel_deduction_total = (0)::numeric) AND (net_total = gross_total)));
alter table "private"."company_licenses" add constraint "company_licenses_plan_check" CHECK ((plan = ANY (ARRAY['daily'::text, 'billing'::text, 'complete'::text])));
alter table "public"."equipment_cost_sheets" add constraint "equipment_cost_sheets_check" CHECK (((fuel_deduction_total = (0)::numeric) AND (net_total = gross_total)));
alter table "public"."revenues" add constraint "revenues_contract_amount_range" CHECK (((revenue_type <> 'contract'::text) OR ((amount >= (0)::numeric) AND (amount <= 999999999999.99))));
alter table "public"."dispatch_crew_confirmations" add constraint "dispatch_crew_confirmations_dispatch_code_check" CHECK ((dispatch_code = ANY (ARRAY['meiken'::text, 'asahi'::text])));
alter table "public"."dispatch_crew_confirmations" add constraint "dispatch_crew_confirmations_crew_key_check" CHECK (((length(crew_key) >= 1) AND (length(crew_key) <= 100)));
alter table "public"."dispatch_crew_confirmations" add constraint "dispatch_crew_confirmations_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);
alter table "public"."dispatch_crew_confirmations" add constraint "dispatch_crew_confirmations_report_id_fkey" FOREIGN KEY (report_id) REFERENCES daily_reports(id) ON DELETE CASCADE;
alter table "public"."dispatch_crew_confirmations" add constraint "dispatch_crew_confirmations_site_id_fkey" FOREIGN KEY (site_id) REFERENCES sites(id);
alter table "public"."sites" add constraint "sites_completion_state" CHECK (((completed_on IS NULL) OR (status = 'inactive'::text)));
alter table "public"."billing_profiles" add constraint "billing_profiles_issuer_name_check" CHECK ((length(issuer_name) <= 160));
alter table "public"."billing_profiles" add constraint "billing_profiles_address_check" CHECK ((length(address) <= 500));
alter table "public"."billing_profiles" add constraint "billing_profiles_phone_check" CHECK ((length(phone) <= 80));
alter table "public"."billing_profiles" add constraint "billing_profiles_registration_number_check" CHECK (((registration_number = ''::text) OR (registration_number ~ '^T[0-9]{13}$'::text)));
alter table "public"."billing_profiles" add constraint "billing_profiles_bank_details_check" CHECK ((length(bank_details) <= 1000));
alter table "public"."billing_profiles" add constraint "billing_profiles_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);
alter table "public"."project_documents" add constraint "project_documents_kind_check" CHECK ((kind = ANY (ARRAY['estimate'::text, 'invoice'::text, 'progress'::text])));
alter table "public"."project_documents" add constraint "project_documents_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'issued'::text, 'void'::text])));
alter table "public"."project_documents" add constraint "project_documents_customer_name_check" CHECK ((length(customer_name) <= 160));
alter table "public"."project_documents" add constraint "project_documents_customer_address_check" CHECK ((length(customer_address) <= 500));
alter table "public"."project_documents" add constraint "project_documents_subject_check" CHECK ((length(subject) <= 200));
alter table "public"."project_documents" add constraint "project_documents_notes_check" CHECK ((length(notes) <= 3000));
alter table "public"."project_documents" add constraint "project_documents_issuer_check" CHECK (((jsonb_typeof(issuer) = 'object'::text) AND (octet_length((issuer)::text) <= 6000)));
alter table "public"."project_documents" add constraint "project_documents_items_check" CHECK (((jsonb_typeof(items) = 'array'::text) AND (jsonb_array_length(items) <= 200)));
alter table "public"."project_documents" add constraint "project_documents_tax_rate_check" CHECK ((tax_rate = ANY (ARRAY[0, 8, 10])));
alter table "public"."project_documents" add constraint "project_documents_subtotal_check" CHECK (((subtotal >= (0)::numeric) AND (subtotal <= ('999999999999'::bigint)::numeric)));
alter table "public"."project_documents" add constraint "project_documents_void_reason_check" CHECK ((length(void_reason) <= 500));
alter table "public"."project_documents" add constraint "project_documents_check" CHECK (((transaction_start IS NULL) OR (transaction_end IS NULL) OR (transaction_end >= transaction_start)));
alter table "public"."estimate_plans" add constraint "estimate_plans_title_check" CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 200)));
alter table "public"."estimate_plans" add constraint "estimate_plans_customer_name_check" CHECK ((length(customer_name) <= 160));
alter table "public"."estimate_plans" add constraint "estimate_plans_customer_address_check" CHECK ((length(customer_address) <= 500));
alter table "public"."estimate_plans" add constraint "estimate_plans_internal_notes_check" CHECK ((length(internal_notes) <= 3000));
alter table "public"."estimate_plans" add constraint "estimate_plans_quote_notes_check" CHECK ((length(quote_notes) <= 3000));
alter table "public"."estimate_plans" add constraint "estimate_plans_groups_check" CHECK ((octet_length((groups)::text) <= 250000));
alter table "public"."estimate_plans" add constraint "estimate_plans_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);
alter table "public"."estimate_plans" add constraint "estimate_plans_site_id_fkey" FOREIGN KEY (site_id) REFERENCES sites(id);
alter table "public"."estimate_plans" add constraint "estimate_plans_source_plan_id_fkey" FOREIGN KEY (source_plan_id) REFERENCES estimate_plans(id);
alter table "public"."project_documents" add constraint "project_documents_estimate_plan_id_fkey" FOREIGN KEY (estimate_plan_id) REFERENCES estimate_plans(id);
alter table "public"."project_documents" add constraint "project_documents_estimate_source_check" CHECK ((((estimate_plan_id IS NULL) AND (estimate_snapshot IS NULL)) OR ((kind = 'estimate'::text) AND (estimate_plan_id IS NOT NULL) AND (estimate_snapshot IS NOT NULL))));
alter table "public"."estimate_quantity_sheets" add constraint "estimate_quantity_sheets_title_check" CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 200)));
alter table "public"."estimate_quantity_sheets" add constraint "estimate_quantity_sheets_customer_name_check" CHECK ((length(customer_name) <= 200));
alter table "public"."estimate_quantity_sheets" add constraint "estimate_quantity_sheets_site_address_check" CHECK ((length(site_address) <= 500));
alter table "public"."estimate_quantity_sheets" add constraint "estimate_quantity_sheets_source_filename_check" CHECK (((length(source_filename) >= 1) AND (length(source_filename) <= 500)));
alter table "public"."estimate_quantity_sheets" add constraint "estimate_quantity_sheets_source_sha256_check" CHECK ((source_sha256 ~ '^[0-9a-f]{64}$'::text));
alter table "public"."estimate_quantity_sheets" add constraint "estimate_quantity_sheets_source_page_count_check" CHECK (((source_page_count >= 1) AND (source_page_count <= 1000)));
alter table "public"."estimate_quantity_sheets" add constraint "estimate_quantity_sheets_groups_check" CHECK (((octet_length((groups)::text) <= 500000) AND toya_validate_quantity_groups(groups)));
alter table "public"."estimate_quantity_sheets" add constraint "estimate_quantity_sheets_source_summary_check" CHECK (((jsonb_typeof(source_summary) = 'object'::text) AND (octet_length((source_summary)::text) <= 100000)));
alter table "public"."estimate_quantity_sheets" add constraint "estimate_quantity_sheets_warnings_check" CHECK (((jsonb_typeof(warnings) = 'array'::text) AND (octet_length((warnings)::text) <= 30000)));
alter table "public"."estimate_quantity_sheets" add constraint "estimate_quantity_sheets_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);
alter table "public"."estimate_plans" add constraint "estimate_plans_site_name_check" CHECK ((length(site_name) <= 200));
alter table "public"."estimate_plans" add constraint "estimate_plans_site_address_check" CHECK ((length(site_address) <= 500));
alter table "public"."estimate_plans" add constraint "estimate_plans_new_job_name" CHECK (((site_id IS NOT NULL) OR (length(btrim(site_name)) > 0)));
alter table "public"."project_documents" add constraint "project_documents_site_address_check" CHECK ((length(site_address) <= 500));
alter table "public"."project_documents" add constraint "project_documents_site_required" CHECK (((site_id IS NOT NULL) OR ((kind = 'estimate'::text) AND ((length(btrim(site_name)) >= 1) AND (length(btrim(site_name)) <= 200)))));
alter table "public"."estimate_plans" add constraint "estimate_plans_entry_mode_check" CHECK ((entry_mode = ANY (ARRAY['cost'::text, 'quote'::text])));
alter table "public"."billing_profiles" add constraint "billing_profiles_postal_code_check" CHECK (((postal_code = ''::text) OR (postal_code ~ '^[0-9]{3}-[0-9]{4}$'::text)));
alter table "public"."billing_profiles" add constraint "billing_profiles_fax_check" CHECK ((length(fax) <= 80));
alter table "public"."billing_profiles" add constraint "billing_profiles_representative_check" CHECK ((length(representative) <= 160));
alter table "public"."billing_profiles" add constraint "billing_profiles_logo_key_check" CHECK ((logo_key = ANY (ARRAY[''::text, 'toya'::text])));
alter table "public"."site_project_profiles" add constraint "site_project_profiles_project_category_check" CHECK ((project_category = ANY (ARRAY[''::text, 'full_demolition'::text, 'interior_demolition'::text, 'skeleton'::text, 'renovation'::text, 'exterior'::text, 'pavement'::text, 'clearing'::text, 'other'::text])));
alter table "public"."site_project_profiles" add constraint "site_project_profiles_scope_notes_check" CHECK ((length(scope_notes) <= 5000));
alter table "public"."site_project_profiles" add constraint "site_project_profiles_exclusion_notes_check" CHECK ((length(exclusion_notes) <= 5000));
alter table "public"."site_project_profiles" add constraint "site_project_profiles_structure_type_check" CHECK ((structure_type = ANY (ARRAY[''::text, 'wood'::text, 'steel'::text, 'rc'::text, 'src'::text, 'mixed'::text, 'none'::text, 'other'::text])));
alter table "public"."site_project_profiles" add constraint "site_project_profiles_floors_above_check" CHECK (((floors_above >= 0) AND (floors_above <= 100)));
alter table "public"."site_project_profiles" add constraint "site_project_profiles_floors_below_check" CHECK (((floors_below >= 0) AND (floors_below <= 20)));
alter table "public"."site_project_profiles" add constraint "site_project_profiles_floor_area_sqm_check" CHECK (((floor_area_sqm >= (0)::numeric) AND (floor_area_sqm <= (100000000)::numeric)));
alter table "public"."site_project_profiles" add constraint "site_project_profiles_site_area_sqm_check" CHECK (((site_area_sqm >= (0)::numeric) AND (site_area_sqm <= (100000000)::numeric)));
alter table "public"."site_project_profiles" add constraint "site_project_profiles_foundation_volume_m3_check" CHECK (((foundation_volume_m3 >= (0)::numeric) AND (foundation_volume_m3 <= (100000000)::numeric)));
alter table "public"."site_project_profiles" add constraint "site_project_profiles_contract_breakdown_check" CHECK (((jsonb_typeof(contract_breakdown) = 'array'::text) AND (jsonb_array_length(contract_breakdown) <= 48) AND (octet_length((contract_breakdown)::text) <= 30000)));
alter table "public"."site_project_profiles" add constraint "site_project_profiles_check" CHECK (((work_start IS NULL) OR (work_end IS NULL) OR (work_end >= work_start)));
alter table "public"."site_project_profiles" add constraint "site_project_profiles_site_id_fkey" FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE;
alter table "public"."site_project_profiles" add constraint "site_project_profiles_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);
alter table "public"."site_project_profiles" add constraint "site_project_profiles_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id);
alter table "public"."company_registries" add constraint "company_registries_entries_check" CHECK (((jsonb_typeof(entries) = 'array'::text) AND (jsonb_array_length(entries) <= 500)));
alter table "public"."company_registries" add constraint "company_registries_version_check" CHECK ((version > 0));
alter table "public"."company_registries" add constraint "company_registries_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);
alter table "private"."company_invitations" add constraint "company_invitations_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);
alter table "private"."company_invitations" add constraint "company_invitations_invited_by_fkey" FOREIGN KEY (invited_by) REFERENCES profiles(id);
alter table "public"."company_registries" add constraint "company_registries_kind_check" CHECK ((kind = ANY (ARRAY['vehicles'::text, 'machines'::text, 'attachments'::text, 'employees'::text, 'dispatch'::text])));
CREATE INDEX project_documents_site_idx ON public.project_documents USING btree (site_id);
CREATE INDEX project_documents_estimate_plan_idx ON public.project_documents USING btree (estimate_plan_id);
CREATE INDEX project_documents_company_site_idx ON public.project_documents USING btree (company_id, site_id, document_date DESC, id);
CREATE INDEX estimate_plans_site_idx ON public.estimate_plans USING btree (site_id);
CREATE INDEX labor_cost_sheets_company_date_idx ON public.labor_cost_sheets USING btree (company_id, work_date);
CREATE INDEX estimate_plans_source_idx ON public.estimate_plans USING btree (source_plan_id);
CREATE INDEX revenues_site_id_idx ON public.revenues USING btree (site_id);
CREATE UNIQUE INDEX revenues_one_contract_per_site ON public.revenues USING btree (company_id, site_id) WHERE (revenue_type = 'contract'::text);
CREATE UNIQUE INDEX waste_entries_company_source_unique ON public.waste_entries USING btree (company_id, source_item_id);
CREATE INDEX estimate_plans_company_site_idx ON public.estimate_plans USING btree (company_id, site_id, updated_at DESC, id);
CREATE INDEX company_invitations_company_idx ON private.company_invitations USING btree (company_id);
CREATE INDEX site_project_profiles_company_idx ON public.site_project_profiles USING btree (company_id, updated_at DESC, site_id);
CREATE INDEX waste_price_master_company_facility_idx ON public.waste_price_master USING btree (company_id, facility, active, sort_order);
CREATE UNIQUE INDEX daily_reports_company_source_unique ON public.daily_reports USING btree (company_id, source_report_id) WHERE (source_report_id IS NOT NULL);
CREATE INDEX dispatch_crew_confirmations_company_date_idx ON public.dispatch_crew_confirmations USING btree (company_id, work_date);
create view "public"."site_financial_summary" with (security_invoker=true) as  SELECT id AS site_id,
    company_id,
    name AS site_name,
    COALESCE(( SELECT sum(le.amount) AS sum
           FROM labor_entries le
          WHERE le.site_id = s.id), 0::numeric) AS labor_cost,
    COALESCE(( SELECT sum(eu.amount) AS sum
           FROM equipment_usage eu
          WHERE eu.site_id = s.id), 0::numeric) AS equipment_cost,
    COALESCE(( SELECT sum(vu.amount) AS sum
           FROM vehicle_usage vu
          WHERE vu.site_id = s.id), 0::numeric) AS vehicle_cost,
    COALESCE(( SELECT sum(fe.amount) AS sum
           FROM fuel_entries fe
          WHERE fe.site_id = s.id), 0::numeric) AS fuel_cost,
    COALESCE(( SELECT sum(ce.amount) AS sum
           FROM cost_entries ce
          WHERE ce.site_id = s.id), 0::numeric) AS other_cost,
    COALESCE(( SELECT sum(le.amount) AS sum
           FROM labor_entries le
          WHERE le.site_id = s.id), 0::numeric) + COALESCE(( SELECT sum(eu.amount) AS sum
           FROM equipment_usage eu
          WHERE eu.site_id = s.id), 0::numeric) + COALESCE(( SELECT sum(vu.amount) AS sum
           FROM vehicle_usage vu
          WHERE vu.site_id = s.id), 0::numeric) + COALESCE(( SELECT sum(fe.amount) AS sum
           FROM fuel_entries fe
          WHERE fe.site_id = s.id), 0::numeric) + COALESCE(( SELECT sum(ce.amount) AS sum
           FROM cost_entries ce
          WHERE ce.site_id = s.id), 0::numeric) AS total_cost,
    COALESCE(( SELECT sum(r.amount) AS sum
           FROM revenues r
          WHERE r.site_id = s.id AND (r.revenue_type = ANY (ARRAY['contract'::text, 'invoice'::text, 'payment'::text]))), 0::numeric) AS revenue,
    COALESCE(( SELECT sum(r.amount) AS sum
           FROM revenues r
          WHERE r.site_id = s.id AND (r.revenue_type = ANY (ARRAY['contract'::text, 'invoice'::text, 'payment'::text]))), 0::numeric) - (COALESCE(( SELECT sum(le.amount) AS sum
           FROM labor_entries le
          WHERE le.site_id = s.id), 0::numeric) + COALESCE(( SELECT sum(eu.amount) AS sum
           FROM equipment_usage eu
          WHERE eu.site_id = s.id), 0::numeric) + COALESCE(( SELECT sum(vu.amount) AS sum
           FROM vehicle_usage vu
          WHERE vu.site_id = s.id), 0::numeric) + COALESCE(( SELECT sum(fe.amount) AS sum
           FROM fuel_entries fe
          WHERE fe.site_id = s.id), 0::numeric) + COALESCE(( SELECT sum(ce.amount) AS sum
           FROM cost_entries ce
          WHERE ce.site_id = s.id), 0::numeric)) AS profit,
        CASE
            WHEN COALESCE(( SELECT sum(r.amount) AS sum
               FROM revenues r
              WHERE r.site_id = s.id AND (r.revenue_type = ANY (ARRAY['contract'::text, 'invoice'::text, 'payment'::text]))), 0::numeric) = 0::numeric THEN 0::numeric
            ELSE round((COALESCE(( SELECT sum(r.amount) AS sum
               FROM revenues r
              WHERE r.site_id = s.id AND (r.revenue_type = ANY (ARRAY['contract'::text, 'invoice'::text, 'payment'::text]))), 0::numeric) - (COALESCE(( SELECT sum(le.amount) AS sum
               FROM labor_entries le
              WHERE le.site_id = s.id), 0::numeric) + COALESCE(( SELECT sum(eu.amount) AS sum
               FROM equipment_usage eu
              WHERE eu.site_id = s.id), 0::numeric) + COALESCE(( SELECT sum(vu.amount) AS sum
               FROM vehicle_usage vu
              WHERE vu.site_id = s.id), 0::numeric) + COALESCE(( SELECT sum(fe.amount) AS sum
               FROM fuel_entries fe
              WHERE fe.site_id = s.id), 0::numeric) + COALESCE(( SELECT sum(ce.amount) AS sum
               FROM cost_entries ce
              WHERE ce.site_id = s.id), 0::numeric))) / COALESCE(( SELECT sum(r.amount) AS sum
               FROM revenues r
              WHERE r.site_id = s.id AND (r.revenue_type = ANY (ARRAY['contract'::text, 'invoice'::text, 'payment'::text]))), 0::numeric) * 100::numeric, 2)
        END AS profit_margin_percent
   FROM sites s;
CREATE TRIGGER vehicle_cost_validate BEFORE INSERT OR UPDATE ON public.vehicle_cost_sheets FOR EACH ROW EXECUTE FUNCTION vehicle_cost_validate_totals();
CREATE TRIGGER equipment_cost_validate BEFORE INSERT OR UPDATE ON public.equipment_cost_sheets FOR EACH ROW EXECUTE FUNCTION equipment_cost_validate_totals();
CREATE TRIGGER project_documents_guard BEFORE INSERT OR UPDATE ON public.project_documents FOR EACH ROW EXECUTE FUNCTION toya_document_guard();
CREATE TRIGGER estimate_plans_guard BEFORE INSERT OR UPDATE ON public.estimate_plans FOR EACH ROW EXECUTE FUNCTION toya_estimate_plan_guard();
CREATE TRIGGER project_documents_estimate_source BEFORE INSERT OR UPDATE ON public.project_documents FOR EACH ROW EXECUTE FUNCTION toya_estimate_document_source_guard();
CREATE TRIGGER site_project_profiles_guard BEFORE INSERT OR UPDATE ON public.site_project_profiles FOR EACH ROW EXECUTE FUNCTION toya_site_project_profile_guard();
CREATE TRIGGER toya_new_license AFTER INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION private.toya_new_license();
CREATE TRIGGER company_registries_validate BEFORE INSERT OR UPDATE ON public.company_registries FOR EACH ROW EXECUTE FUNCTION toya_registry_validate();
CREATE TRIGGER toya_license_seat BEFORE INSERT OR UPDATE OF active, company_id ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.toya_license_seat();
create policy "revenues_delete_admin" on "public"."revenues" as PERMISSIVE for DELETE to "authenticated" using (((company_id = current_company_id()) AND current_is_admin()));
create policy "revenues_insert_admin" on "public"."revenues" as PERMISSIVE for INSERT to "authenticated" with check (((company_id = current_company_id()) AND current_is_admin()));
create policy "revenues_select_admin" on "public"."revenues" as PERMISSIVE for SELECT to "authenticated" using (((company_id = current_company_id()) AND current_is_admin()));
create policy "revenues_update_admin" on "public"."revenues" as PERMISSIVE for UPDATE to "authenticated" using (((company_id = current_company_id()) AND current_is_admin())) with check (((company_id = current_company_id()) AND current_is_admin()));
create policy "toya_contract_access" on "public"."revenues" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "toya_contract_access" on "public"."waste_price_master" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "waste_price_master_delete_admin" on "public"."waste_price_master" as PERMISSIVE for DELETE to "authenticated" using (((company_id = current_company_id()) AND current_is_admin()));
create policy "waste_price_master_insert_admin" on "public"."waste_price_master" as PERMISSIVE for INSERT to "authenticated" with check (((company_id = current_company_id()) AND current_is_admin()));
create policy "waste_price_master_select_company" on "public"."waste_price_master" as PERMISSIVE for SELECT to "authenticated" using ((company_id = current_company_id()));
create policy "waste_price_master_update_admin" on "public"."waste_price_master" as PERMISSIVE for UPDATE to "authenticated" using (((company_id = current_company_id()) AND current_is_admin())) with check (((company_id = current_company_id()) AND current_is_admin()));
create policy "labor_rates_admin" on "public"."labor_rate_master" as PERMISSIVE for ALL to "authenticated" using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.company_id = labor_rate_master.company_id) AND (p.role = 'admin'::text) AND p.active)))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.company_id = labor_rate_master.company_id) AND (p.role = 'admin'::text) AND p.active))));
create policy "toya_contract_access" on "public"."labor_rate_master" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "labor_sheets_admin" on "public"."labor_cost_sheets" as PERMISSIVE for ALL to "authenticated" using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.company_id = labor_cost_sheets.company_id) AND (p.role = 'admin'::text) AND p.active)))) with check (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.company_id = labor_cost_sheets.company_id) AND (p.role = 'admin'::text) AND p.active))) AND (EXISTS ( SELECT 1
   FROM sites s
  WHERE ((s.id = labor_cost_sheets.site_id) AND (s.company_id = labor_cost_sheets.company_id))))));
create policy "toya_contract_access" on "public"."labor_cost_sheets" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "toya_contract_photos" on "storage"."objects" as RESTRICTIVE for ALL to "authenticated" using (((bucket_id <> 'toya-photos'::text) OR ((storage.foldername(name))[1] = (( SELECT toya_current_company_id() AS toya_current_company_id))::text))) with check (((bucket_id <> 'toya-photos'::text) OR ((storage.foldername(name))[1] = (( SELECT toya_current_company_id() AS toya_current_company_id))::text)));
create policy "toya_photos_company_delete" on "storage"."objects" as PERMISSIVE for DELETE to "authenticated" using (((bucket_id = 'toya-photos'::text) AND ((storage.foldername(name))[1] = (current_company_id())::text) AND current_is_admin()));
create policy "toya_photos_company_insert" on "storage"."objects" as PERMISSIVE for INSERT to "authenticated" with check (((bucket_id = 'toya-photos'::text) AND ((storage.foldername(name))[1] = (current_company_id())::text)));
create policy "toya_photos_company_select" on "storage"."objects" as PERMISSIVE for SELECT to "authenticated" using (((bucket_id = 'toya-photos'::text) AND ((storage.foldername(name))[1] = (current_company_id())::text)));
create policy "toya_photos_company_update" on "storage"."objects" as PERMISSIVE for UPDATE to "authenticated" using (((bucket_id = 'toya-photos'::text) AND ((storage.foldername(name))[1] = (current_company_id())::text))) with check (((bucket_id = 'toya-photos'::text) AND ((storage.foldername(name))[1] = (current_company_id())::text)));
create policy "toya_photos_tenant_boundary" on "storage"."objects" as RESTRICTIVE for ALL to "authenticated" using (((bucket_id <> 'toya-photos'::text) OR ((storage.foldername(name))[1] = (( SELECT toya_current_company_id() AS toya_current_company_id))::text))) with check (((bucket_id <> 'toya-photos'::text) OR ((storage.foldername(name))[1] = (( SELECT toya_current_company_id() AS toya_current_company_id))::text)));
create policy "sites_delete_admin" on "public"."sites" as PERMISSIVE for DELETE to "authenticated" using (((company_id = current_company_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))));
create policy "sites_insert_company" on "public"."sites" as PERMISSIVE for INSERT to "authenticated" with check ((company_id = current_company_id()));
create policy "sites_lifecycle_admin" on "public"."sites" as RESTRICTIVE for UPDATE to "authenticated" using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.company_id = sites.company_id) AND p.active AND (p.role = 'admin'::text))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.company_id = sites.company_id) AND p.active AND (p.role = 'admin'::text)))));
create policy "sites_select_company" on "public"."sites" as PERMISSIVE for SELECT to "authenticated" using ((company_id = current_company_id()));
create policy "sites_update_company" on "public"."sites" as PERMISSIVE for UPDATE to "authenticated" using ((company_id = current_company_id())) with check ((company_id = current_company_id()));
create policy "toya_contract_access" on "public"."sites" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "toya_sites_company_select" on "public"."sites" as PERMISSIVE for SELECT to "authenticated" using ((company_id = toya_current_company_id()));
create policy "toya_contract_access" on "public"."workers" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "workers_delete_admin" on "public"."workers" as PERMISSIVE for DELETE to "authenticated" using (((company_id = current_company_id()) AND current_is_admin()));
create policy "workers_insert_company" on "public"."workers" as PERMISSIVE for INSERT to "authenticated" with check ((company_id = current_company_id()));
create policy "workers_select_company" on "public"."workers" as PERMISSIVE for SELECT to "authenticated" using ((company_id = current_company_id()));
create policy "workers_update_company" on "public"."workers" as PERMISSIVE for UPDATE to "authenticated" using ((company_id = current_company_id())) with check ((company_id = current_company_id()));
create policy "equipment_delete_admin" on "public"."equipment" as PERMISSIVE for DELETE to "authenticated" using (((company_id = current_company_id()) AND current_is_admin()));
create policy "equipment_insert_company" on "public"."equipment" as PERMISSIVE for INSERT to "authenticated" with check ((company_id = current_company_id()));
create policy "equipment_select_company" on "public"."equipment" as PERMISSIVE for SELECT to "authenticated" using ((company_id = current_company_id()));
create policy "equipment_update_company" on "public"."equipment" as PERMISSIVE for UPDATE to "authenticated" using ((company_id = current_company_id())) with check ((company_id = current_company_id()));
create policy "toya_contract_access" on "public"."equipment" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "toya_contract_access" on "public"."vehicles" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "vehicles_delete_admin" on "public"."vehicles" as PERMISSIVE for DELETE to "authenticated" using (((company_id = current_company_id()) AND current_is_admin()));
create policy "vehicles_insert_company" on "public"."vehicles" as PERMISSIVE for INSERT to "authenticated" with check ((company_id = current_company_id()));
create policy "vehicles_select_company" on "public"."vehicles" as PERMISSIVE for SELECT to "authenticated" using ((company_id = current_company_id()));
create policy "vehicles_update_company" on "public"."vehicles" as PERMISSIVE for UPDATE to "authenticated" using ((company_id = current_company_id())) with check ((company_id = current_company_id()));
create policy "daily_reports_delete_admin_or_creator" on "public"."daily_reports" as PERMISSIVE for DELETE to "authenticated" using (((company_id = current_company_id()) AND (current_is_admin() OR (created_by = auth.uid()))));
create policy "daily_reports_insert_company" on "public"."daily_reports" as PERMISSIVE for INSERT to "authenticated" with check ((company_id = current_company_id()));
create policy "daily_reports_select_company" on "public"."daily_reports" as PERMISSIVE for SELECT to "authenticated" using ((company_id = current_company_id()));
create policy "daily_reports_update_admin_or_creator" on "public"."daily_reports" as PERMISSIVE for UPDATE to "authenticated" using (((company_id = current_company_id()) AND (current_is_admin() OR (created_by = auth.uid())))) with check (((company_id = current_company_id()) AND (current_is_admin() OR (created_by = auth.uid()))));
create policy "toya_contract_access" on "public"."daily_reports" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "toya_daily_reports_company_select" on "public"."daily_reports" as PERMISSIVE for SELECT to "authenticated" using ((company_id = toya_current_company_id()));
create policy "labor_entries_delete_admin" on "public"."labor_entries" as PERMISSIVE for DELETE to "authenticated" using (((company_id = current_company_id()) AND current_is_admin()));
create policy "labor_entries_insert_company" on "public"."labor_entries" as PERMISSIVE for INSERT to "authenticated" with check ((company_id = current_company_id()));
create policy "labor_entries_select_company" on "public"."labor_entries" as PERMISSIVE for SELECT to "authenticated" using ((company_id = current_company_id()));
create policy "labor_entries_update_company" on "public"."labor_entries" as PERMISSIVE for UPDATE to "authenticated" using ((company_id = current_company_id())) with check ((company_id = current_company_id()));
create policy "toya_contract_access" on "public"."labor_entries" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "equipment_usage_delete_admin" on "public"."equipment_usage" as PERMISSIVE for DELETE to "authenticated" using (((company_id = current_company_id()) AND current_is_admin()));
create policy "equipment_usage_insert_company" on "public"."equipment_usage" as PERMISSIVE for INSERT to "authenticated" with check ((company_id = current_company_id()));
create policy "equipment_usage_select_company" on "public"."equipment_usage" as PERMISSIVE for SELECT to "authenticated" using ((company_id = current_company_id()));
create policy "equipment_usage_update_company" on "public"."equipment_usage" as PERMISSIVE for UPDATE to "authenticated" using ((company_id = current_company_id())) with check ((company_id = current_company_id()));
create policy "toya_contract_access" on "public"."equipment_usage" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "toya_contract_access" on "public"."vehicle_usage" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "vehicle_usage_delete_admin" on "public"."vehicle_usage" as PERMISSIVE for DELETE to "authenticated" using (((company_id = current_company_id()) AND current_is_admin()));
create policy "vehicle_usage_insert_company" on "public"."vehicle_usage" as PERMISSIVE for INSERT to "authenticated" with check ((company_id = current_company_id()));
create policy "vehicle_usage_select_company" on "public"."vehicle_usage" as PERMISSIVE for SELECT to "authenticated" using ((company_id = current_company_id()));
create policy "vehicle_usage_update_company" on "public"."vehicle_usage" as PERMISSIVE for UPDATE to "authenticated" using ((company_id = current_company_id())) with check ((company_id = current_company_id()));
create policy "fuel_entries_delete_admin" on "public"."fuel_entries" as PERMISSIVE for DELETE to "authenticated" using (((company_id = current_company_id()) AND current_is_admin()));
create policy "fuel_entries_insert_admin" on "public"."fuel_entries" as PERMISSIVE for INSERT to "authenticated" with check (((company_id = current_company_id()) AND current_is_admin()));
create policy "fuel_entries_select_admin" on "public"."fuel_entries" as PERMISSIVE for SELECT to "authenticated" using (((company_id = current_company_id()) AND current_is_admin()));
create policy "fuel_entries_update_admin" on "public"."fuel_entries" as PERMISSIVE for UPDATE to "authenticated" using (((company_id = current_company_id()) AND current_is_admin())) with check (((company_id = current_company_id()) AND current_is_admin()));
create policy "toya_contract_access" on "public"."fuel_entries" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "cost_entries_delete_admin" on "public"."cost_entries" as PERMISSIVE for DELETE to "authenticated" using (((company_id = current_company_id()) AND current_is_admin()));
create policy "cost_entries_insert_admin" on "public"."cost_entries" as PERMISSIVE for INSERT to "authenticated" with check (((company_id = current_company_id()) AND current_is_admin()));
create policy "cost_entries_select_admin" on "public"."cost_entries" as PERMISSIVE for SELECT to "authenticated" using (((company_id = current_company_id()) AND current_is_admin()));
create policy "cost_entries_update_admin" on "public"."cost_entries" as PERMISSIVE for UPDATE to "authenticated" using (((company_id = current_company_id()) AND current_is_admin())) with check (((company_id = current_company_id()) AND current_is_admin()));
create policy "toya_contract_access" on "public"."cost_entries" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "toya_contract_access" on "public"."waste_entries" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "waste_entries_delete_admin" on "public"."waste_entries" as PERMISSIVE for DELETE to "authenticated" using (((company_id = current_company_id()) AND current_is_admin()));
create policy "waste_entries_insert_company" on "public"."waste_entries" as PERMISSIVE for INSERT to "authenticated" with check ((company_id = current_company_id()));
create policy "waste_entries_select_company" on "public"."waste_entries" as PERMISSIVE for SELECT to "authenticated" using ((company_id = current_company_id()));
create policy "waste_entries_update_company" on "public"."waste_entries" as PERMISSIVE for UPDATE to "authenticated" using ((company_id = current_company_id())) with check ((company_id = current_company_id()));
create policy "toya_contract_access" on "public"."vehicle_rate_master" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "vehicle_rate_insert_admin" on "public"."vehicle_rate_master" as PERMISSIVE for INSERT to "authenticated" with check (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT current_is_admin() AS current_is_admin)));
create policy "vehicle_rate_select_admin" on "public"."vehicle_rate_master" as PERMISSIVE for SELECT to "authenticated" using (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT current_is_admin() AS current_is_admin)));
create policy "vehicle_rate_update_admin" on "public"."vehicle_rate_master" as PERMISSIVE for UPDATE to "authenticated" using (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT current_is_admin() AS current_is_admin))) with check (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT current_is_admin() AS current_is_admin)));
create policy "profiles_select_own" on "public"."profiles" as PERMISSIVE for SELECT to "authenticated" using ((id = auth.uid()));
create policy "toya_contract_profile_read" on "public"."profiles" as RESTRICTIVE for SELECT to "authenticated" using (((id = auth.uid()) OR (company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))));
create policy "toya_profiles_company_select" on "public"."profiles" as PERMISSIVE for SELECT to "authenticated" using ((company_id = toya_current_company_id()));
create policy "report_photos_delete_admin_or_report_creator" on "public"."report_photos" as PERMISSIVE for DELETE to "authenticated" using (((company_id = current_company_id()) AND (current_is_admin() OR (EXISTS ( SELECT 1
   FROM daily_reports dr
  WHERE ((dr.id = report_photos.report_id) AND (dr.company_id = report_photos.company_id) AND (dr.created_by = auth.uid())))))));
create policy "report_photos_insert_company" on "public"."report_photos" as PERMISSIVE for INSERT to "authenticated" with check ((company_id = current_company_id()));
create policy "report_photos_select_company" on "public"."report_photos" as PERMISSIVE for SELECT to "authenticated" using ((company_id = current_company_id()));
create policy "report_photos_update_company" on "public"."report_photos" as PERMISSIVE for UPDATE to "authenticated" using ((company_id = current_company_id())) with check ((company_id = current_company_id()));
create policy "toya_contract_access" on "public"."report_photos" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "toya_report_photos_company_select" on "public"."report_photos" as PERMISSIVE for SELECT to "authenticated" using ((company_id = toya_current_company_id()));
create policy "toya_contract_access" on "public"."user_activity" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "toya_user_activity_admin_select" on "public"."user_activity" as PERMISSIVE for SELECT to "authenticated" using ((toya_is_admin() AND (company_id = toya_current_company_id())));
create policy "user_activity_insert_own" on "public"."user_activity" as PERMISSIVE for INSERT to "authenticated" with check (((user_id = auth.uid()) AND (company_id = current_company_id())));
create policy "user_activity_select_admin" on "public"."user_activity" as PERMISSIVE for SELECT to "authenticated" using (((company_id = current_company_id()) AND current_is_admin()));
create policy "toya_contract_access" on "public"."vehicle_cost_sheets" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "vehicle_sheet_insert_admin" on "public"."vehicle_cost_sheets" as PERMISSIVE for INSERT to "authenticated" with check (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT current_is_admin() AS current_is_admin) AND (EXISTS ( SELECT 1
   FROM sites s
  WHERE ((s.id = vehicle_cost_sheets.site_id) AND (s.company_id = vehicle_cost_sheets.company_id))))));
create policy "vehicle_sheet_select_admin" on "public"."vehicle_cost_sheets" as PERMISSIVE for SELECT to "authenticated" using (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT current_is_admin() AS current_is_admin)));
create policy "vehicle_sheet_update_admin" on "public"."vehicle_cost_sheets" as PERMISSIVE for UPDATE to "authenticated" using (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT current_is_admin() AS current_is_admin))) with check (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT current_is_admin() AS current_is_admin) AND (EXISTS ( SELECT 1
   FROM sites s
  WHERE ((s.id = vehicle_cost_sheets.site_id) AND (s.company_id = vehicle_cost_sheets.company_id))))));
create policy "dispatch_crew_confirmations_admin" on "public"."dispatch_crew_confirmations" as PERMISSIVE for ALL to "authenticated" using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.company_id = dispatch_crew_confirmations.company_id) AND (p.role = 'admin'::text) AND (p.active = true))))) with check ((EXISTS ( SELECT 1
   FROM (profiles p
     JOIN daily_reports d ON ((d.company_id = p.company_id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.company_id = dispatch_crew_confirmations.company_id) AND (p.role = 'admin'::text) AND (p.active = true) AND (d.id = dispatch_crew_confirmations.report_id) AND (d.site_id = dispatch_crew_confirmations.site_id) AND (d.report_date = dispatch_crew_confirmations.work_date) AND (d.updated_at = dispatch_crew_confirmations.report_updated_at)))));
create policy "toya_contract_access" on "public"."dispatch_crew_confirmations" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "billing_profiles_admin" on "public"."billing_profiles" as PERMISSIVE for ALL to "authenticated" using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.company_id = billing_profiles.company_id) AND p.active AND (p.role = 'admin'::text))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.company_id = billing_profiles.company_id) AND p.active AND (p.role = 'admin'::text)))));
create policy "toya_contract_access" on "public"."billing_profiles" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "project_documents_admin" on "public"."project_documents" as PERMISSIVE for ALL to "authenticated" using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.company_id = project_documents.company_id) AND p.active AND (p.role = 'admin'::text))))) with check (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.company_id = project_documents.company_id) AND p.active AND (p.role = 'admin'::text)))) AND (((site_id IS NULL) AND (kind = 'estimate'::text)) OR (EXISTS ( SELECT 1
   FROM sites s
  WHERE ((s.id = project_documents.site_id) AND (s.company_id = project_documents.company_id)))))));
create policy "project_documents_delete_unissued_only" on "public"."project_documents" as RESTRICTIVE for DELETE to "authenticated" using (((kind = ANY (ARRAY['invoice'::text, 'progress'::text])) AND (status = ANY (ARRAY['draft'::text, 'void'::text])) AND (issued_at IS NULL) AND (document_number IS NULL) AND (number_year IS NULL) AND (number_seq IS NULL) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.company_id = project_documents.company_id) AND p.active AND (p.role = 'admin'::text))))));
create policy "toya_contract_access" on "public"."project_documents" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "toya_document_plan" on "public"."project_documents" as RESTRICTIVE for ALL to "authenticated" using ((((kind = ANY (ARRAY['invoice'::text, 'progress'::text])) AND ( SELECT toya_has_feature('invoice'::text) AS toya_has_feature)) OR ((kind = 'estimate'::text) AND ( SELECT toya_has_feature('estimate'::text) AS toya_has_feature)))) with check ((((kind = ANY (ARRAY['invoice'::text, 'progress'::text])) AND ( SELECT toya_has_feature('invoice'::text) AS toya_has_feature)) OR ((kind = 'estimate'::text) AND ( SELECT toya_has_feature('estimate'::text) AS toya_has_feature))));
create policy "equipment_sheet_insert_admin" on "public"."equipment_cost_sheets" as PERMISSIVE for INSERT to "authenticated" with check (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT current_is_admin() AS current_is_admin) AND (EXISTS ( SELECT 1
   FROM sites s
  WHERE ((s.id = equipment_cost_sheets.site_id) AND (s.company_id = equipment_cost_sheets.company_id))))));
create policy "equipment_sheet_select_admin" on "public"."equipment_cost_sheets" as PERMISSIVE for SELECT to "authenticated" using (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT current_is_admin() AS current_is_admin)));
create policy "equipment_sheet_update_admin" on "public"."equipment_cost_sheets" as PERMISSIVE for UPDATE to "authenticated" using (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT current_is_admin() AS current_is_admin))) with check (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT current_is_admin() AS current_is_admin) AND (EXISTS ( SELECT 1
   FROM sites s
  WHERE ((s.id = equipment_cost_sheets.site_id) AND (s.company_id = equipment_cost_sheets.company_id))))));
create policy "toya_contract_access" on "public"."equipment_cost_sheets" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "equipment_rate_insert_admin" on "public"."equipment_rate_master" as PERMISSIVE for INSERT to "authenticated" with check (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT current_is_admin() AS current_is_admin)));
create policy "equipment_rate_select_admin" on "public"."equipment_rate_master" as PERMISSIVE for SELECT to "authenticated" using (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT current_is_admin() AS current_is_admin)));
create policy "equipment_rate_update_admin" on "public"."equipment_rate_master" as PERMISSIVE for UPDATE to "authenticated" using (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT current_is_admin() AS current_is_admin))) with check (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT current_is_admin() AS current_is_admin)));
create policy "toya_contract_access" on "public"."equipment_rate_master" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "registry_insert" on "public"."company_registries" as PERMISSIVE for INSERT to "authenticated" with check (((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)) AND ( SELECT toya_is_admin() AS toya_is_admin)));
create policy "registry_read" on "public"."company_registries" as PERMISSIVE for SELECT to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "registry_update" on "public"."company_registries" as PERMISSIVE for UPDATE to "authenticated" using (((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)) AND ( SELECT toya_is_admin() AS toya_is_admin))) with check (((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)) AND ( SELECT toya_is_admin() AS toya_is_admin)));
create policy "toya_contract_access" on "public"."company_registries" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "estimate_plans_admin" on "public"."estimate_plans" as PERMISSIVE for ALL to "authenticated" using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.company_id = estimate_plans.company_id) AND p.active AND (p.role = 'admin'::text))))) with check (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.company_id = estimate_plans.company_id) AND p.active AND (p.role = 'admin'::text)))) AND ((site_id IS NULL) OR (EXISTS ( SELECT 1
   FROM sites s
  WHERE ((s.id = estimate_plans.site_id) AND (s.company_id = estimate_plans.company_id)))))));
create policy "toya_contract_access" on "public"."estimate_plans" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "toya_estimate_plan" on "public"."estimate_plans" as RESTRICTIVE for ALL to "authenticated" using (( SELECT toya_has_feature('estimate'::text) AS toya_has_feature)) with check (( SELECT toya_has_feature('estimate'::text) AS toya_has_feature));
create policy "toya_contract_access" on "public"."equipment_transport_rate_master" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "transport_rate_admin_insert" on "public"."equipment_transport_rate_master" as PERMISSIVE for INSERT to "authenticated" with check (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT current_is_admin() AS current_is_admin)));
create policy "transport_rate_admin_select" on "public"."equipment_transport_rate_master" as PERMISSIVE for SELECT to "authenticated" using (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT current_is_admin() AS current_is_admin)));
create policy "transport_rate_admin_update" on "public"."equipment_transport_rate_master" as PERMISSIVE for UPDATE to "authenticated" using (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT current_is_admin() AS current_is_admin))) with check (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT current_is_admin() AS current_is_admin)));
create policy "estimate_quantity_sheets_admin_read" on "public"."estimate_quantity_sheets" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.company_id = estimate_quantity_sheets.company_id) AND p.active AND (p.role = 'admin'::text)))));
create policy "toya_contract_access" on "public"."estimate_quantity_sheets" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "toya_quantity_plan" on "public"."estimate_quantity_sheets" as RESTRICTIVE for ALL to "authenticated" using (( SELECT toya_has_feature('estimate'::text) AS toya_has_feature)) with check (( SELECT toya_has_feature('estimate'::text) AS toya_has_feature));
create policy "small_tool_rates_admin_insert" on "public"."small_tool_rate_master" as PERMISSIVE for INSERT to "authenticated" with check (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT current_is_admin() AS current_is_admin)));
create policy "small_tool_rates_admin_select" on "public"."small_tool_rate_master" as PERMISSIVE for SELECT to "authenticated" using (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT current_is_admin() AS current_is_admin)));
create policy "small_tool_rates_admin_update" on "public"."small_tool_rate_master" as PERMISSIVE for UPDATE to "authenticated" using (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT current_is_admin() AS current_is_admin))) with check (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT current_is_admin() AS current_is_admin)));
create policy "toya_contract_access" on "public"."small_tool_rate_master" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "site_project_profiles_admin" on "public"."site_project_profiles" as PERMISSIVE for ALL to "authenticated" using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.company_id = site_project_profiles.company_id) AND p.active AND (p.role = 'admin'::text))))) with check ((EXISTS ( SELECT 1
   FROM (profiles p
     JOIN sites s ON ((s.company_id = p.company_id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.company_id = site_project_profiles.company_id) AND p.active AND (p.role = 'admin'::text) AND (s.id = site_project_profiles.site_id)))));
create policy "toya_contract_access" on "public"."site_project_profiles" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
create policy "attachment_rates_admin_insert" on "public"."attachment_rate_master" as PERMISSIVE for INSERT to "authenticated" with check (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT current_is_admin() AS current_is_admin)));
create policy "attachment_rates_admin_select" on "public"."attachment_rate_master" as PERMISSIVE for SELECT to "authenticated" using (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT current_is_admin() AS current_is_admin)));
create policy "attachment_rates_admin_update" on "public"."attachment_rate_master" as PERMISSIVE for UPDATE to "authenticated" using (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT current_is_admin() AS current_is_admin))) with check (((company_id = ( SELECT current_company_id() AS current_company_id)) AND ( SELECT current_is_admin() AS current_is_admin)));
create policy "toya_contract_access" on "public"."attachment_rate_master" as RESTRICTIVE for ALL to "authenticated" using ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id))) with check ((company_id = ( SELECT toya_current_company_id() AS toya_current_company_id)));
revoke all on "public"."revenues" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."waste_price_master" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."labor_rate_master" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."labor_cost_sheets" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."sites" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."companies" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."workers" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."equipment" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."vehicles" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."daily_reports" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."labor_entries" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."equipment_usage" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."vehicle_usage" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."fuel_entries" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."cost_entries" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."waste_entries" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."vehicle_rate_master" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."profiles" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."report_photos" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."user_activity" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."vehicle_cost_sheets" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."dispatch_crew_confirmations" from PUBLIC,anon,authenticated,service_role;
revoke all on "private"."company_licenses" from PUBLIC,anon,authenticated,service_role;
revoke all on "private"."login_devices" from PUBLIC,anon,authenticated,service_role;
revoke all on "private"."device_resets" from PUBLIC,anon,authenticated,service_role;
revoke all on "private"."employee_logins" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."billing_profiles" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."project_documents" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."equipment_cost_sheets" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."equipment_rate_master" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."company_registries" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."estimate_plans" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."equipment_transport_rate_master" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."estimate_quantity_sheets" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."small_tool_rate_master" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."site_project_profiles" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."attachment_rate_master" from PUBLIC,anon,authenticated,service_role;
revoke all on "private"."company_invitations" from PUBLIC,anon,authenticated,service_role;
revoke all on "public"."site_financial_summary" from PUBLIC,anon,authenticated,service_role;
grant INSERT on "public"."revenues" to "service_role";
grant SELECT on "public"."revenues" to "service_role";
grant UPDATE on "public"."revenues" to "service_role";
grant DELETE on "public"."revenues" to "service_role";
grant TRUNCATE on "public"."revenues" to "service_role";
grant REFERENCES on "public"."revenues" to "service_role";
grant TRIGGER on "public"."revenues" to "service_role";
grant MAINTAIN on "public"."revenues" to "service_role";
grant INSERT on "public"."revenues" to "authenticated";
grant SELECT on "public"."revenues" to "authenticated";
grant UPDATE on "public"."revenues" to "authenticated";
grant DELETE on "public"."revenues" to "authenticated";
grant INSERT on "public"."waste_price_master" to "anon";
grant SELECT on "public"."waste_price_master" to "anon";
grant UPDATE on "public"."waste_price_master" to "anon";
grant DELETE on "public"."waste_price_master" to "anon";
grant INSERT on "public"."waste_price_master" to "authenticated";
grant SELECT on "public"."waste_price_master" to "authenticated";
grant UPDATE on "public"."waste_price_master" to "authenticated";
grant DELETE on "public"."waste_price_master" to "authenticated";
grant INSERT on "public"."waste_price_master" to "service_role";
grant SELECT on "public"."waste_price_master" to "service_role";
grant UPDATE on "public"."waste_price_master" to "service_role";
grant DELETE on "public"."waste_price_master" to "service_role";
grant TRUNCATE on "public"."waste_price_master" to "service_role";
grant REFERENCES on "public"."waste_price_master" to "service_role";
grant TRIGGER on "public"."waste_price_master" to "service_role";
grant MAINTAIN on "public"."waste_price_master" to "service_role";
grant INSERT on "public"."labor_rate_master" to "service_role";
grant SELECT on "public"."labor_rate_master" to "service_role";
grant UPDATE on "public"."labor_rate_master" to "service_role";
grant DELETE on "public"."labor_rate_master" to "service_role";
grant TRUNCATE on "public"."labor_rate_master" to "service_role";
grant REFERENCES on "public"."labor_rate_master" to "service_role";
grant TRIGGER on "public"."labor_rate_master" to "service_role";
grant MAINTAIN on "public"."labor_rate_master" to "service_role";
grant INSERT on "public"."labor_rate_master" to "authenticated";
grant SELECT on "public"."labor_rate_master" to "authenticated";
grant UPDATE on "public"."labor_rate_master" to "authenticated";
grant DELETE on "public"."labor_rate_master" to "authenticated";
grant INSERT on "public"."labor_cost_sheets" to "service_role";
grant SELECT on "public"."labor_cost_sheets" to "service_role";
grant UPDATE on "public"."labor_cost_sheets" to "service_role";
grant DELETE on "public"."labor_cost_sheets" to "service_role";
grant TRUNCATE on "public"."labor_cost_sheets" to "service_role";
grant REFERENCES on "public"."labor_cost_sheets" to "service_role";
grant TRIGGER on "public"."labor_cost_sheets" to "service_role";
grant MAINTAIN on "public"."labor_cost_sheets" to "service_role";
grant INSERT on "public"."labor_cost_sheets" to "authenticated";
grant SELECT on "public"."labor_cost_sheets" to "authenticated";
grant UPDATE on "public"."labor_cost_sheets" to "authenticated";
grant DELETE on "public"."labor_cost_sheets" to "authenticated";
grant INSERT on "public"."sites" to "anon";
grant SELECT on "public"."sites" to "anon";
grant UPDATE on "public"."sites" to "anon";
grant DELETE on "public"."sites" to "anon";
grant INSERT on "public"."sites" to "authenticated";
grant SELECT on "public"."sites" to "authenticated";
grant UPDATE on "public"."sites" to "authenticated";
grant DELETE on "public"."sites" to "authenticated";
grant INSERT on "public"."sites" to "service_role";
grant SELECT on "public"."sites" to "service_role";
grant UPDATE on "public"."sites" to "service_role";
grant DELETE on "public"."sites" to "service_role";
grant TRUNCATE on "public"."sites" to "service_role";
grant REFERENCES on "public"."sites" to "service_role";
grant TRIGGER on "public"."sites" to "service_role";
grant MAINTAIN on "public"."sites" to "service_role";
grant INSERT on "public"."companies" to "anon";
grant SELECT on "public"."companies" to "anon";
grant UPDATE on "public"."companies" to "anon";
grant DELETE on "public"."companies" to "anon";
grant INSERT on "public"."companies" to "authenticated";
grant SELECT on "public"."companies" to "authenticated";
grant UPDATE on "public"."companies" to "authenticated";
grant DELETE on "public"."companies" to "authenticated";
grant INSERT on "public"."companies" to "service_role";
grant SELECT on "public"."companies" to "service_role";
grant UPDATE on "public"."companies" to "service_role";
grant DELETE on "public"."companies" to "service_role";
grant TRUNCATE on "public"."companies" to "service_role";
grant REFERENCES on "public"."companies" to "service_role";
grant TRIGGER on "public"."companies" to "service_role";
grant MAINTAIN on "public"."companies" to "service_role";
grant INSERT on "public"."workers" to "anon";
grant SELECT on "public"."workers" to "anon";
grant UPDATE on "public"."workers" to "anon";
grant DELETE on "public"."workers" to "anon";
grant INSERT on "public"."workers" to "authenticated";
grant SELECT on "public"."workers" to "authenticated";
grant UPDATE on "public"."workers" to "authenticated";
grant DELETE on "public"."workers" to "authenticated";
grant INSERT on "public"."workers" to "service_role";
grant SELECT on "public"."workers" to "service_role";
grant UPDATE on "public"."workers" to "service_role";
grant DELETE on "public"."workers" to "service_role";
grant TRUNCATE on "public"."workers" to "service_role";
grant REFERENCES on "public"."workers" to "service_role";
grant TRIGGER on "public"."workers" to "service_role";
grant MAINTAIN on "public"."workers" to "service_role";
grant INSERT on "public"."equipment" to "anon";
grant SELECT on "public"."equipment" to "anon";
grant UPDATE on "public"."equipment" to "anon";
grant DELETE on "public"."equipment" to "anon";
grant INSERT on "public"."equipment" to "authenticated";
grant SELECT on "public"."equipment" to "authenticated";
grant UPDATE on "public"."equipment" to "authenticated";
grant DELETE on "public"."equipment" to "authenticated";
grant INSERT on "public"."equipment" to "service_role";
grant SELECT on "public"."equipment" to "service_role";
grant UPDATE on "public"."equipment" to "service_role";
grant DELETE on "public"."equipment" to "service_role";
grant TRUNCATE on "public"."equipment" to "service_role";
grant REFERENCES on "public"."equipment" to "service_role";
grant TRIGGER on "public"."equipment" to "service_role";
grant MAINTAIN on "public"."equipment" to "service_role";
grant INSERT on "public"."vehicles" to "anon";
grant SELECT on "public"."vehicles" to "anon";
grant UPDATE on "public"."vehicles" to "anon";
grant DELETE on "public"."vehicles" to "anon";
grant INSERT on "public"."vehicles" to "authenticated";
grant SELECT on "public"."vehicles" to "authenticated";
grant UPDATE on "public"."vehicles" to "authenticated";
grant DELETE on "public"."vehicles" to "authenticated";
grant INSERT on "public"."vehicles" to "service_role";
grant SELECT on "public"."vehicles" to "service_role";
grant UPDATE on "public"."vehicles" to "service_role";
grant DELETE on "public"."vehicles" to "service_role";
grant TRUNCATE on "public"."vehicles" to "service_role";
grant REFERENCES on "public"."vehicles" to "service_role";
grant TRIGGER on "public"."vehicles" to "service_role";
grant MAINTAIN on "public"."vehicles" to "service_role";
grant INSERT on "public"."daily_reports" to "anon";
grant SELECT on "public"."daily_reports" to "anon";
grant UPDATE on "public"."daily_reports" to "anon";
grant DELETE on "public"."daily_reports" to "anon";
grant INSERT on "public"."daily_reports" to "authenticated";
grant SELECT on "public"."daily_reports" to "authenticated";
grant UPDATE on "public"."daily_reports" to "authenticated";
grant DELETE on "public"."daily_reports" to "authenticated";
grant INSERT on "public"."daily_reports" to "service_role";
grant SELECT on "public"."daily_reports" to "service_role";
grant UPDATE on "public"."daily_reports" to "service_role";
grant DELETE on "public"."daily_reports" to "service_role";
grant TRUNCATE on "public"."daily_reports" to "service_role";
grant REFERENCES on "public"."daily_reports" to "service_role";
grant TRIGGER on "public"."daily_reports" to "service_role";
grant MAINTAIN on "public"."daily_reports" to "service_role";
grant INSERT on "public"."labor_entries" to "anon";
grant SELECT on "public"."labor_entries" to "anon";
grant UPDATE on "public"."labor_entries" to "anon";
grant DELETE on "public"."labor_entries" to "anon";
grant INSERT on "public"."labor_entries" to "authenticated";
grant SELECT on "public"."labor_entries" to "authenticated";
grant UPDATE on "public"."labor_entries" to "authenticated";
grant DELETE on "public"."labor_entries" to "authenticated";
grant INSERT on "public"."labor_entries" to "service_role";
grant SELECT on "public"."labor_entries" to "service_role";
grant UPDATE on "public"."labor_entries" to "service_role";
grant DELETE on "public"."labor_entries" to "service_role";
grant TRUNCATE on "public"."labor_entries" to "service_role";
grant REFERENCES on "public"."labor_entries" to "service_role";
grant TRIGGER on "public"."labor_entries" to "service_role";
grant MAINTAIN on "public"."labor_entries" to "service_role";
grant INSERT on "public"."equipment_usage" to "anon";
grant SELECT on "public"."equipment_usage" to "anon";
grant UPDATE on "public"."equipment_usage" to "anon";
grant DELETE on "public"."equipment_usage" to "anon";
grant INSERT on "public"."equipment_usage" to "authenticated";
grant SELECT on "public"."equipment_usage" to "authenticated";
grant UPDATE on "public"."equipment_usage" to "authenticated";
grant DELETE on "public"."equipment_usage" to "authenticated";
grant INSERT on "public"."equipment_usage" to "service_role";
grant SELECT on "public"."equipment_usage" to "service_role";
grant UPDATE on "public"."equipment_usage" to "service_role";
grant DELETE on "public"."equipment_usage" to "service_role";
grant TRUNCATE on "public"."equipment_usage" to "service_role";
grant REFERENCES on "public"."equipment_usage" to "service_role";
grant TRIGGER on "public"."equipment_usage" to "service_role";
grant MAINTAIN on "public"."equipment_usage" to "service_role";
grant INSERT on "public"."vehicle_usage" to "anon";
grant SELECT on "public"."vehicle_usage" to "anon";
grant UPDATE on "public"."vehicle_usage" to "anon";
grant DELETE on "public"."vehicle_usage" to "anon";
grant INSERT on "public"."vehicle_usage" to "authenticated";
grant SELECT on "public"."vehicle_usage" to "authenticated";
grant UPDATE on "public"."vehicle_usage" to "authenticated";
grant DELETE on "public"."vehicle_usage" to "authenticated";
grant INSERT on "public"."vehicle_usage" to "service_role";
grant SELECT on "public"."vehicle_usage" to "service_role";
grant UPDATE on "public"."vehicle_usage" to "service_role";
grant DELETE on "public"."vehicle_usage" to "service_role";
grant TRUNCATE on "public"."vehicle_usage" to "service_role";
grant REFERENCES on "public"."vehicle_usage" to "service_role";
grant TRIGGER on "public"."vehicle_usage" to "service_role";
grant MAINTAIN on "public"."vehicle_usage" to "service_role";
grant INSERT on "public"."fuel_entries" to "anon";
grant SELECT on "public"."fuel_entries" to "anon";
grant UPDATE on "public"."fuel_entries" to "anon";
grant DELETE on "public"."fuel_entries" to "anon";
grant INSERT on "public"."fuel_entries" to "authenticated";
grant SELECT on "public"."fuel_entries" to "authenticated";
grant UPDATE on "public"."fuel_entries" to "authenticated";
grant DELETE on "public"."fuel_entries" to "authenticated";
grant INSERT on "public"."fuel_entries" to "service_role";
grant SELECT on "public"."fuel_entries" to "service_role";
grant UPDATE on "public"."fuel_entries" to "service_role";
grant DELETE on "public"."fuel_entries" to "service_role";
grant TRUNCATE on "public"."fuel_entries" to "service_role";
grant REFERENCES on "public"."fuel_entries" to "service_role";
grant TRIGGER on "public"."fuel_entries" to "service_role";
grant MAINTAIN on "public"."fuel_entries" to "service_role";
grant INSERT on "public"."cost_entries" to "anon";
grant SELECT on "public"."cost_entries" to "anon";
grant UPDATE on "public"."cost_entries" to "anon";
grant DELETE on "public"."cost_entries" to "anon";
grant INSERT on "public"."cost_entries" to "authenticated";
grant SELECT on "public"."cost_entries" to "authenticated";
grant UPDATE on "public"."cost_entries" to "authenticated";
grant DELETE on "public"."cost_entries" to "authenticated";
grant INSERT on "public"."cost_entries" to "service_role";
grant SELECT on "public"."cost_entries" to "service_role";
grant UPDATE on "public"."cost_entries" to "service_role";
grant DELETE on "public"."cost_entries" to "service_role";
grant TRUNCATE on "public"."cost_entries" to "service_role";
grant REFERENCES on "public"."cost_entries" to "service_role";
grant TRIGGER on "public"."cost_entries" to "service_role";
grant MAINTAIN on "public"."cost_entries" to "service_role";
grant INSERT on "public"."site_financial_summary" to "anon";
grant SELECT on "public"."site_financial_summary" to "anon";
grant UPDATE on "public"."site_financial_summary" to "anon";
grant DELETE on "public"."site_financial_summary" to "anon";
grant INSERT on "public"."site_financial_summary" to "authenticated";
grant SELECT on "public"."site_financial_summary" to "authenticated";
grant UPDATE on "public"."site_financial_summary" to "authenticated";
grant DELETE on "public"."site_financial_summary" to "authenticated";
grant INSERT on "public"."site_financial_summary" to "service_role";
grant SELECT on "public"."site_financial_summary" to "service_role";
grant UPDATE on "public"."site_financial_summary" to "service_role";
grant DELETE on "public"."site_financial_summary" to "service_role";
grant TRUNCATE on "public"."site_financial_summary" to "service_role";
grant REFERENCES on "public"."site_financial_summary" to "service_role";
grant TRIGGER on "public"."site_financial_summary" to "service_role";
grant MAINTAIN on "public"."site_financial_summary" to "service_role";
grant INSERT on "public"."waste_entries" to "anon";
grant SELECT on "public"."waste_entries" to "anon";
grant UPDATE on "public"."waste_entries" to "anon";
grant DELETE on "public"."waste_entries" to "anon";
grant INSERT on "public"."waste_entries" to "authenticated";
grant SELECT on "public"."waste_entries" to "authenticated";
grant UPDATE on "public"."waste_entries" to "authenticated";
grant DELETE on "public"."waste_entries" to "authenticated";
grant INSERT on "public"."waste_entries" to "service_role";
grant SELECT on "public"."waste_entries" to "service_role";
grant UPDATE on "public"."waste_entries" to "service_role";
grant DELETE on "public"."waste_entries" to "service_role";
grant TRUNCATE on "public"."waste_entries" to "service_role";
grant REFERENCES on "public"."waste_entries" to "service_role";
grant TRIGGER on "public"."waste_entries" to "service_role";
grant MAINTAIN on "public"."waste_entries" to "service_role";
grant INSERT on "public"."vehicle_rate_master" to "service_role";
grant SELECT on "public"."vehicle_rate_master" to "service_role";
grant UPDATE on "public"."vehicle_rate_master" to "service_role";
grant DELETE on "public"."vehicle_rate_master" to "service_role";
grant TRUNCATE on "public"."vehicle_rate_master" to "service_role";
grant REFERENCES on "public"."vehicle_rate_master" to "service_role";
grant TRIGGER on "public"."vehicle_rate_master" to "service_role";
grant MAINTAIN on "public"."vehicle_rate_master" to "service_role";
grant INSERT on "public"."vehicle_rate_master" to "authenticated";
grant SELECT on "public"."vehicle_rate_master" to "authenticated";
grant UPDATE on "public"."vehicle_rate_master" to "authenticated";
grant INSERT on "public"."profiles" to "anon";
grant SELECT on "public"."profiles" to "anon";
grant UPDATE on "public"."profiles" to "anon";
grant DELETE on "public"."profiles" to "anon";
grant INSERT on "public"."profiles" to "authenticated";
grant SELECT on "public"."profiles" to "authenticated";
grant UPDATE on "public"."profiles" to "authenticated";
grant DELETE on "public"."profiles" to "authenticated";
grant INSERT on "public"."profiles" to "service_role";
grant SELECT on "public"."profiles" to "service_role";
grant UPDATE on "public"."profiles" to "service_role";
grant DELETE on "public"."profiles" to "service_role";
grant TRUNCATE on "public"."profiles" to "service_role";
grant REFERENCES on "public"."profiles" to "service_role";
grant TRIGGER on "public"."profiles" to "service_role";
grant MAINTAIN on "public"."profiles" to "service_role";
grant INSERT on "public"."report_photos" to "anon";
grant SELECT on "public"."report_photos" to "anon";
grant UPDATE on "public"."report_photos" to "anon";
grant DELETE on "public"."report_photos" to "anon";
grant INSERT on "public"."report_photos" to "authenticated";
grant SELECT on "public"."report_photos" to "authenticated";
grant UPDATE on "public"."report_photos" to "authenticated";
grant DELETE on "public"."report_photos" to "authenticated";
grant INSERT on "public"."report_photos" to "service_role";
grant SELECT on "public"."report_photos" to "service_role";
grant UPDATE on "public"."report_photos" to "service_role";
grant DELETE on "public"."report_photos" to "service_role";
grant TRUNCATE on "public"."report_photos" to "service_role";
grant REFERENCES on "public"."report_photos" to "service_role";
grant TRIGGER on "public"."report_photos" to "service_role";
grant MAINTAIN on "public"."report_photos" to "service_role";
grant INSERT on "public"."user_activity" to "anon";
grant SELECT on "public"."user_activity" to "anon";
grant UPDATE on "public"."user_activity" to "anon";
grant DELETE on "public"."user_activity" to "anon";
grant INSERT on "public"."user_activity" to "authenticated";
grant SELECT on "public"."user_activity" to "authenticated";
grant UPDATE on "public"."user_activity" to "authenticated";
grant DELETE on "public"."user_activity" to "authenticated";
grant INSERT on "public"."user_activity" to "service_role";
grant SELECT on "public"."user_activity" to "service_role";
grant UPDATE on "public"."user_activity" to "service_role";
grant DELETE on "public"."user_activity" to "service_role";
grant TRUNCATE on "public"."user_activity" to "service_role";
grant REFERENCES on "public"."user_activity" to "service_role";
grant TRIGGER on "public"."user_activity" to "service_role";
grant MAINTAIN on "public"."user_activity" to "service_role";
grant INSERT on "public"."vehicle_cost_sheets" to "service_role";
grant SELECT on "public"."vehicle_cost_sheets" to "service_role";
grant UPDATE on "public"."vehicle_cost_sheets" to "service_role";
grant DELETE on "public"."vehicle_cost_sheets" to "service_role";
grant TRUNCATE on "public"."vehicle_cost_sheets" to "service_role";
grant REFERENCES on "public"."vehicle_cost_sheets" to "service_role";
grant TRIGGER on "public"."vehicle_cost_sheets" to "service_role";
grant MAINTAIN on "public"."vehicle_cost_sheets" to "service_role";
grant INSERT on "public"."vehicle_cost_sheets" to "authenticated";
grant SELECT on "public"."vehicle_cost_sheets" to "authenticated";
grant UPDATE on "public"."vehicle_cost_sheets" to "authenticated";
grant INSERT on "public"."dispatch_crew_confirmations" to "service_role";
grant SELECT on "public"."dispatch_crew_confirmations" to "service_role";
grant UPDATE on "public"."dispatch_crew_confirmations" to "service_role";
grant DELETE on "public"."dispatch_crew_confirmations" to "service_role";
grant TRUNCATE on "public"."dispatch_crew_confirmations" to "service_role";
grant REFERENCES on "public"."dispatch_crew_confirmations" to "service_role";
grant TRIGGER on "public"."dispatch_crew_confirmations" to "service_role";
grant MAINTAIN on "public"."dispatch_crew_confirmations" to "service_role";
grant INSERT on "public"."dispatch_crew_confirmations" to "authenticated";
grant SELECT on "public"."dispatch_crew_confirmations" to "authenticated";
grant UPDATE on "public"."dispatch_crew_confirmations" to "authenticated";
grant DELETE on "public"."dispatch_crew_confirmations" to "authenticated";
grant INSERT on "public"."billing_profiles" to "service_role";
grant SELECT on "public"."billing_profiles" to "service_role";
grant UPDATE on "public"."billing_profiles" to "service_role";
grant DELETE on "public"."billing_profiles" to "service_role";
grant TRUNCATE on "public"."billing_profiles" to "service_role";
grant REFERENCES on "public"."billing_profiles" to "service_role";
grant TRIGGER on "public"."billing_profiles" to "service_role";
grant MAINTAIN on "public"."billing_profiles" to "service_role";
grant INSERT on "public"."billing_profiles" to "authenticated";
grant SELECT on "public"."billing_profiles" to "authenticated";
grant UPDATE on "public"."billing_profiles" to "authenticated";
grant INSERT on "public"."project_documents" to "service_role";
grant SELECT on "public"."project_documents" to "service_role";
grant UPDATE on "public"."project_documents" to "service_role";
grant DELETE on "public"."project_documents" to "service_role";
grant TRUNCATE on "public"."project_documents" to "service_role";
grant REFERENCES on "public"."project_documents" to "service_role";
grant TRIGGER on "public"."project_documents" to "service_role";
grant MAINTAIN on "public"."project_documents" to "service_role";
grant INSERT on "public"."project_documents" to "authenticated";
grant SELECT on "public"."project_documents" to "authenticated";
grant UPDATE on "public"."project_documents" to "authenticated";
grant DELETE on "public"."project_documents" to "authenticated";
grant INSERT on "public"."equipment_cost_sheets" to "service_role";
grant SELECT on "public"."equipment_cost_sheets" to "service_role";
grant UPDATE on "public"."equipment_cost_sheets" to "service_role";
grant DELETE on "public"."equipment_cost_sheets" to "service_role";
grant TRUNCATE on "public"."equipment_cost_sheets" to "service_role";
grant REFERENCES on "public"."equipment_cost_sheets" to "service_role";
grant TRIGGER on "public"."equipment_cost_sheets" to "service_role";
grant MAINTAIN on "public"."equipment_cost_sheets" to "service_role";
grant INSERT on "public"."equipment_cost_sheets" to "authenticated";
grant SELECT on "public"."equipment_cost_sheets" to "authenticated";
grant UPDATE on "public"."equipment_cost_sheets" to "authenticated";
grant INSERT on "public"."equipment_rate_master" to "service_role";
grant SELECT on "public"."equipment_rate_master" to "service_role";
grant UPDATE on "public"."equipment_rate_master" to "service_role";
grant DELETE on "public"."equipment_rate_master" to "service_role";
grant TRUNCATE on "public"."equipment_rate_master" to "service_role";
grant REFERENCES on "public"."equipment_rate_master" to "service_role";
grant TRIGGER on "public"."equipment_rate_master" to "service_role";
grant MAINTAIN on "public"."equipment_rate_master" to "service_role";
grant INSERT on "public"."equipment_rate_master" to "authenticated";
grant SELECT on "public"."equipment_rate_master" to "authenticated";
grant UPDATE on "public"."equipment_rate_master" to "authenticated";
grant INSERT on "public"."company_registries" to "service_role";
grant SELECT on "public"."company_registries" to "service_role";
grant UPDATE on "public"."company_registries" to "service_role";
grant DELETE on "public"."company_registries" to "service_role";
grant TRUNCATE on "public"."company_registries" to "service_role";
grant REFERENCES on "public"."company_registries" to "service_role";
grant TRIGGER on "public"."company_registries" to "service_role";
grant MAINTAIN on "public"."company_registries" to "service_role";
grant INSERT on "public"."company_registries" to "authenticated";
grant SELECT on "public"."company_registries" to "authenticated";
grant INSERT on "public"."estimate_plans" to "service_role";
grant SELECT on "public"."estimate_plans" to "service_role";
grant UPDATE on "public"."estimate_plans" to "service_role";
grant DELETE on "public"."estimate_plans" to "service_role";
grant TRUNCATE on "public"."estimate_plans" to "service_role";
grant REFERENCES on "public"."estimate_plans" to "service_role";
grant TRIGGER on "public"."estimate_plans" to "service_role";
grant MAINTAIN on "public"."estimate_plans" to "service_role";
grant INSERT on "public"."estimate_plans" to "authenticated";
grant SELECT on "public"."estimate_plans" to "authenticated";
grant UPDATE on "public"."estimate_plans" to "authenticated";
grant INSERT on "public"."equipment_transport_rate_master" to "service_role";
grant SELECT on "public"."equipment_transport_rate_master" to "service_role";
grant UPDATE on "public"."equipment_transport_rate_master" to "service_role";
grant DELETE on "public"."equipment_transport_rate_master" to "service_role";
grant TRUNCATE on "public"."equipment_transport_rate_master" to "service_role";
grant REFERENCES on "public"."equipment_transport_rate_master" to "service_role";
grant TRIGGER on "public"."equipment_transport_rate_master" to "service_role";
grant MAINTAIN on "public"."equipment_transport_rate_master" to "service_role";
grant INSERT on "public"."equipment_transport_rate_master" to "authenticated";
grant SELECT on "public"."equipment_transport_rate_master" to "authenticated";
grant UPDATE on "public"."equipment_transport_rate_master" to "authenticated";
grant INSERT on "public"."estimate_quantity_sheets" to "service_role";
grant SELECT on "public"."estimate_quantity_sheets" to "service_role";
grant UPDATE on "public"."estimate_quantity_sheets" to "service_role";
grant DELETE on "public"."estimate_quantity_sheets" to "service_role";
grant TRUNCATE on "public"."estimate_quantity_sheets" to "service_role";
grant REFERENCES on "public"."estimate_quantity_sheets" to "service_role";
grant TRIGGER on "public"."estimate_quantity_sheets" to "service_role";
grant MAINTAIN on "public"."estimate_quantity_sheets" to "service_role";
grant SELECT on "public"."estimate_quantity_sheets" to "authenticated";
grant INSERT on "public"."small_tool_rate_master" to "service_role";
grant SELECT on "public"."small_tool_rate_master" to "service_role";
grant UPDATE on "public"."small_tool_rate_master" to "service_role";
grant DELETE on "public"."small_tool_rate_master" to "service_role";
grant TRUNCATE on "public"."small_tool_rate_master" to "service_role";
grant REFERENCES on "public"."small_tool_rate_master" to "service_role";
grant TRIGGER on "public"."small_tool_rate_master" to "service_role";
grant MAINTAIN on "public"."small_tool_rate_master" to "service_role";
grant INSERT on "public"."small_tool_rate_master" to "authenticated";
grant SELECT on "public"."small_tool_rate_master" to "authenticated";
grant UPDATE on "public"."small_tool_rate_master" to "authenticated";
grant INSERT on "public"."site_project_profiles" to "service_role";
grant SELECT on "public"."site_project_profiles" to "service_role";
grant UPDATE on "public"."site_project_profiles" to "service_role";
grant DELETE on "public"."site_project_profiles" to "service_role";
grant TRUNCATE on "public"."site_project_profiles" to "service_role";
grant REFERENCES on "public"."site_project_profiles" to "service_role";
grant TRIGGER on "public"."site_project_profiles" to "service_role";
grant MAINTAIN on "public"."site_project_profiles" to "service_role";
grant INSERT on "public"."site_project_profiles" to "authenticated";
grant SELECT on "public"."site_project_profiles" to "authenticated";
grant UPDATE on "public"."site_project_profiles" to "authenticated";
grant INSERT on "public"."attachment_rate_master" to "service_role";
grant SELECT on "public"."attachment_rate_master" to "service_role";
grant UPDATE on "public"."attachment_rate_master" to "service_role";
grant DELETE on "public"."attachment_rate_master" to "service_role";
grant TRUNCATE on "public"."attachment_rate_master" to "service_role";
grant REFERENCES on "public"."attachment_rate_master" to "service_role";
grant TRIGGER on "public"."attachment_rate_master" to "service_role";
grant MAINTAIN on "public"."attachment_rate_master" to "service_role";
grant INSERT on "public"."attachment_rate_master" to "authenticated";
grant SELECT on "public"."attachment_rate_master" to "authenticated";
grant UPDATE on "public"."attachment_rate_master" to "authenticated";
grant UPDATE ("entries") on "public"."company_registries" to "authenticated";
grant UPDATE ("version") on "public"."company_registries" to "authenticated";
revoke all on function "public"."current_company_id"() from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."current_company_id"() to "authenticated";
grant execute on function "public"."current_company_id"() to "service_role";
revoke all on function "public"."current_is_admin"() from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."current_is_admin"() to "authenticated";
grant execute on function "public"."current_is_admin"() to "service_role";
revoke all on function "public"."toya_current_company_id"() from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."toya_current_company_id"() to "authenticated";
grant execute on function "public"."toya_current_company_id"() to "service_role";
revoke all on function "public"."toya_is_admin"() from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."toya_is_admin"() to "authenticated";
grant execute on function "public"."toya_is_admin"() to "service_role";
revoke all on function "public"."vehicle_cost_validate_totals"() from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."vehicle_cost_validate_totals"() to "authenticated";
grant execute on function "public"."vehicle_cost_validate_totals"() to "service_role";
revoke all on function "public"."equipment_cost_validate_totals"() from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."equipment_cost_validate_totals"() to "service_role";
revoke all on function "public"."equipment_transport_catalog_v1"() from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."equipment_transport_catalog_v1"() to "authenticated";
grant execute on function "public"."equipment_transport_catalog_v1"() to "service_role";
revoke all on function "public"."toya_register_shared_site"(p_name text) from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."toya_register_shared_site"(p_name text) to "authenticated";
grant execute on function "public"."toya_register_shared_site"(p_name text) to "service_role";
revoke all on function "public"."toya_document_guard"() from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."toya_document_guard"() to "service_role";
revoke all on function "public"."toya_save_project_document"(p_id uuid, p_expected_updated_at timestamp with time zone, p_document jsonb) from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."toya_save_project_document"(p_id uuid, p_expected_updated_at timestamp with time zone, p_document jsonb) to "service_role";
grant execute on function "public"."toya_save_project_document"(p_id uuid, p_expected_updated_at timestamp with time zone, p_document jsonb) to "authenticated";
revoke all on function "public"."toya_issue_project_document"(p_id uuid, p_expected_updated_at timestamp with time zone) from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."toya_issue_project_document"(p_id uuid, p_expected_updated_at timestamp with time zone) to "service_role";
grant execute on function "public"."toya_issue_project_document"(p_id uuid, p_expected_updated_at timestamp with time zone) to "authenticated";
revoke all on function "public"."toya_set_site_completion"(p_site_id uuid, p_expected_version integer, p_completed_on date, p_reopen boolean) from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."toya_set_site_completion"(p_site_id uuid, p_expected_version integer, p_completed_on date, p_reopen boolean) to "service_role";
grant execute on function "public"."toya_set_site_completion"(p_site_id uuid, p_expected_version integer, p_completed_on date, p_reopen boolean) to "authenticated";
revoke all on function "public"."toya_void_project_document"(p_id uuid, p_expected_updated_at timestamp with time zone, p_reason text) from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."toya_void_project_document"(p_id uuid, p_expected_updated_at timestamp with time zone, p_reason text) to "service_role";
grant execute on function "public"."toya_void_project_document"(p_id uuid, p_expected_updated_at timestamp with time zone, p_reason text) to "authenticated";
revoke all on function "public"."toya_estimate_to_contract"(p_id uuid, p_expected_revenue_updated_at timestamp with time zone) from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."toya_estimate_to_contract"(p_id uuid, p_expected_revenue_updated_at timestamp with time zone) to "service_role";
grant execute on function "public"."toya_estimate_to_contract"(p_id uuid, p_expected_revenue_updated_at timestamp with time zone) to "authenticated";
revoke all on function "public"."toya_estimate_number"(p_value text, p_places integer, p_max numeric, p_label text, p_positive boolean) from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."toya_estimate_number"(p_value text, p_places integer, p_max numeric, p_label text, p_positive boolean) to "service_role";
grant execute on function "public"."toya_estimate_number"(p_value text, p_places integer, p_max numeric, p_label text, p_positive boolean) to "authenticated";
revoke all on function "public"."toya_calculate_estimate_plan"(p_groups jsonb, p_overhead numeric, p_markup numeric, p_override numeric, p_tax integer) from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."toya_calculate_estimate_plan"(p_groups jsonb, p_overhead numeric, p_markup numeric, p_override numeric, p_tax integer) to "service_role";
grant execute on function "public"."toya_calculate_estimate_plan"(p_groups jsonb, p_overhead numeric, p_markup numeric, p_override numeric, p_tax integer) to "authenticated";
revoke all on function "public"."toya_estimate_plan_guard"() from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."toya_estimate_plan_guard"() to "service_role";
revoke all on function "public"."toya_save_estimate_plan"(p_id uuid, p_expected_updated_at timestamp with time zone, p_plan jsonb) from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."toya_save_estimate_plan"(p_id uuid, p_expected_updated_at timestamp with time zone, p_plan jsonb) to "service_role";
grant execute on function "public"."toya_save_estimate_plan"(p_id uuid, p_expected_updated_at timestamp with time zone, p_plan jsonb) to "authenticated";
revoke all on function "public"."toya_estimate_document_source_guard"() from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."toya_estimate_document_source_guard"() to "service_role";
revoke all on function "public"."toya_create_estimate_document"(p_plan_id uuid, p_expected_updated_at timestamp with time zone, p_document_id uuid) from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."toya_create_estimate_document"(p_plan_id uuid, p_expected_updated_at timestamp with time zone, p_document_id uuid) to "service_role";
grant execute on function "public"."toya_create_estimate_document"(p_plan_id uuid, p_expected_updated_at timestamp with time zone, p_document_id uuid) to "authenticated";
revoke all on function "public"."toya_validate_quantity_groups"(p_groups jsonb) from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."toya_validate_quantity_groups"(p_groups jsonb) to "service_role";
revoke all on function "public"."toya_quote_signed_number"(p_value text, p_places integer, p_label text) from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."toya_quote_signed_number"(p_value text, p_places integer, p_label text) to "service_role";
grant execute on function "public"."toya_quote_signed_number"(p_value text, p_places integer, p_label text) to "authenticated";
revoke all on function "public"."toya_calculate_quote_lines"(p_groups jsonb, p_tax integer) from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."toya_calculate_quote_lines"(p_groups jsonb, p_tax integer) to "service_role";
grant execute on function "public"."toya_calculate_quote_lines"(p_groups jsonb, p_tax integer) to "authenticated";
revoke all on function "public"."toya_rewrite_site_labels"(p_value jsonb, p_old_name text, p_new_name text) from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."toya_rewrite_site_labels"(p_value jsonb, p_old_name text, p_new_name text) to "service_role";
revoke all on function "public"."toya_rename_shared_site"(p_site_id uuid, p_expected_version integer, p_name text) from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."toya_rename_shared_site"(p_site_id uuid, p_expected_version integer, p_name text) to "service_role";
grant execute on function "public"."toya_rename_shared_site"(p_site_id uuid, p_expected_version integer, p_name text) to "authenticated";
revoke all on function "public"."toya_site_project_profile_guard"() from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."toya_site_project_profile_guard"() to "service_role";
revoke all on function "public"."toya_save_site_project_profile"(p_site_id uuid, p_expected_updated_at timestamp with time zone, p_expected_contract_updated_at timestamp with time zone, p_contract_amount numeric, p_profile jsonb) from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."toya_save_site_project_profile"(p_site_id uuid, p_expected_updated_at timestamp with time zone, p_expected_contract_updated_at timestamp with time zone, p_contract_amount numeric, p_profile jsonb) to "service_role";
grant execute on function "public"."toya_save_site_project_profile"(p_site_id uuid, p_expected_updated_at timestamp with time zone, p_expected_contract_updated_at timestamp with time zone, p_contract_amount numeric, p_profile jsonb) to "authenticated";
revoke all on function "public"."toya_delete_unissued_invoice"(p_id uuid, p_expected_updated_at timestamp with time zone) from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."toya_delete_unissued_invoice"(p_id uuid, p_expected_updated_at timestamp with time zone) to "service_role";
grant execute on function "public"."toya_delete_unissued_invoice"(p_id uuid, p_expected_updated_at timestamp with time zone) to "authenticated";
revoke all on function "public"."toya_registry_validate"() from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."toya_registry_validate"() to "service_role";
revoke all on function "private"."toya_onboarding"(p_action text, p_payload jsonb) from PUBLIC,anon,authenticated,service_role;
grant execute on function "private"."toya_onboarding"(p_action text, p_payload jsonb) to "authenticated";
revoke all on function "public"."toya_onboarding"(p_action text, p_payload jsonb) from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."toya_onboarding"(p_action text, p_payload jsonb) to "authenticated";
grant execute on function "public"."toya_onboarding"(p_action text, p_payload jsonb) to "service_role";
revoke all on function "private"."toya_new_license"() from PUBLIC,anon,authenticated,service_role;
revoke all on function "private"."toya_allowed_company"() from PUBLIC,anon,authenticated,service_role;
grant execute on function "private"."toya_allowed_company"() to "authenticated";
revoke all on function "private"."toya_license_seat"() from PUBLIC,anon,authenticated,service_role;
revoke all on function "private"."toya_access"(p_action text, p_payload jsonb) from PUBLIC,anon,authenticated,service_role;
grant execute on function "private"."toya_access"(p_action text, p_payload jsonb) to "authenticated";
revoke all on function "public"."toya_access"(p_action text, p_payload jsonb) from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."toya_access"(p_action text, p_payload jsonb) to "authenticated";
grant execute on function "public"."toya_access"(p_action text, p_payload jsonb) to "service_role";
revoke all on function "private"."toya_employee_admin"(p_action text, p_payload jsonb) from PUBLIC,anon,authenticated,service_role;
grant execute on function "private"."toya_employee_admin"(p_action text, p_payload jsonb) to "authenticated";
revoke all on function "public"."toya_employee_admin"(p_action text, p_payload jsonb) from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."toya_employee_admin"(p_action text, p_payload jsonb) to "authenticated";
grant execute on function "public"."toya_employee_admin"(p_action text, p_payload jsonb) to "service_role";
revoke all on function "private"."toya_employee_finish"(p_reservation uuid, p_actor uuid, p_user uuid) from PUBLIC,anon,authenticated,service_role;
grant execute on function "private"."toya_employee_finish"(p_reservation uuid, p_actor uuid, p_user uuid) to "service_role";
revoke all on function "public"."toya_employee_finish"(p_reservation uuid, p_actor uuid, p_user uuid) from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."toya_employee_finish"(p_reservation uuid, p_actor uuid, p_user uuid) to "service_role";
revoke all on function "private"."toya_has_feature"(p_feature text) from PUBLIC,anon,authenticated,service_role;
grant execute on function "private"."toya_has_feature"(p_feature text) to "authenticated";
revoke all on function "public"."toya_has_feature"(p_feature text) from PUBLIC,anon,authenticated,service_role;
grant execute on function "public"."toya_has_feature"(p_feature text) to "authenticated";
grant execute on function "public"."toya_has_feature"(p_feature text) to "service_role";
revoke all on function "private"."toya_plan_status"() from PUBLIC,anon,authenticated,service_role;
grant execute on function "private"."toya_plan_status"() to "authenticated";
insert into storage.buckets(id,name,public) values('toya-photos','toya-photos',false);
commit;
-- Provision the first company through verified customer onboarding after deployment.
