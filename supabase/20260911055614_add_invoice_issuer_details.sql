-- Optional issuer details for the supplied invoice form. Existing company/admin RLS remains in force.
alter table public.billing_profiles
 add column postal_code text not null default '' check (postal_code='' or postal_code ~ '^[0-9]{3}-[0-9]{4}$'),
 add column fax text not null default '' check (length(fax)<=80),
 add column representative text not null default '' check (length(representative)<=160),
 add column logo_key text not null default '' check (logo_key in ('','toya'));
-- Existing document issuer JSON snapshots already retain these optional fields.
