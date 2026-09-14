alter table public.company_registries drop constraint company_registries_kind_check;
alter table public.company_registries add constraint company_registries_kind_check check(kind in ('vehicles','machines','attachments','employees','dispatch'));
