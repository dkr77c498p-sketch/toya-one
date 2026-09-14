# Customer access operations

Implemented 2026-09-14. This is a hosted-service access control, not billing or a legal licensing system.

## Customer flow

1. Owner registers and verifies their email at `docs/start.html`, then registers an empty company.
2. New companies are **pending**. Only the seller can activate a contract; customer UI/RPCs cannot change licenses.
3. Once activated, the owner signs into the main app. Up to two owner browsers are registered.
4. Registration management → 社員のログイン・参加リンク → enter a name and unique employee ID. The server creates an Auth account without sending email.
5. Give the employee the company-specific `employee.html?company=...` link, ID and the generated password. Password display is temporary; there is no plaintext password database.
6. External employees register one browser. The company admin can reset an employee password, disable access or release a device after a phone change. A device reset rejects sessions created before that reset; the employee must sign in again.

Existing installed internal company access is preserved, including previous local records and photo storage. Internal accounts are exempt from device limits. No new real employee or customer was created during this release.

## Seller activation

Use the database operator connection, never a browser key. First inspect the exact company and owner. Get the agreed number of active users (including admins) and expiry before activation. There are no default paid prices, charges or automatic payments.

```sql
select c.id, c.name, l.company_code, l.status, l.max_users, l.expires_at,
       p.name as owner_name, u.email as owner_email
from public.companies c
join private.company_licenses l on l.company_id=c.id
join public.profiles p on p.company_id=c.id and p.role='admin'
join auth.users u on u.id=p.id
where not l.internal;
```

Activate only the verified company using bound parameters in a transaction. Check exactly one returned row. Choose an actual future expiry or explicitly agree no expiry; do not guess.

```sql
update private.company_licenses
set status='active', max_users=:agreed_active_users, expires_at=:agreed_expiry
where company_id=:verified_company_id and not internal and status='pending'
returning company_id,company_code,status,max_users,expires_at;
```

Suspension uses the same exact company predicate with `status='suspended'`. It blocks cloud reads/writes without deleting records. Existing downloaded/offline copies cannot be recalled. Renewal and seat changes require seller action; no customer can grant themself a contract or more seats. Do not reduce seats below the current active member count.

## Owner device replacement

Employees have an in-app reset. For an owner locked out of both registered browsers, verify the contract owner outside the affected account before an operator resets devices. In one transaction, delete only the verified owner's rows from `private.login_devices`, and upsert `private.device_resets(user_id,reset_at)` with `clock_timestamp()`. The owner must sign in again. Never reset by an unverified company name alone.

## Failed employee creation

`employee-admin` validates the JWT with Auth, then an authenticated database RPC checks the current company/admin/contract/session before reserving an ID. It uses server-only Admin.createUser with email_confirm=true for a routing address under `.invalid`; no email is sent. A service-only RPC finalizes the employee profile in the same company. Creation failures delete only that request's new Auth user and release its reservation. If cleanup fails, the reservation remains, preventing unsafe reuse.

Inspect an old unfinished reservation by its exact company/ID. Compare its routing email to Auth, verify there is no finalized profile, then use Auth Admin to remove only the orphaned Auth user. Release the matching unfinalized reservation afterward. Do not delete all pending reservations or all accounts with a routing domain. A password reset succeeds independently of device cleanup: the UI still returns the new password and asks to retry device release if the second step fails.

## Boundaries and deferred work

- Company identity, active membership, active contract, expiry, seats and registered session are server-checked. Existing tenant policies remain in place; restrictive policies add the contract guard.
- Binding uses a random browser-stored secret whose hash is stored on the server. It is not hardware attestation. A copied browser secret/session, shared credentials, or deliberate company-admin collusion cannot be completely prevented. Public source can also be deployed with a separately operated backend. Do not market this as uncopyable software.
- Three feature tiers, prices, payment collection, subscription webhooks and a seller-facing contract console are not included in this release.
- Owner email delivery is unchanged and was not tested by sending messages. Employees created through the ID path do not require email delivery.
- Edge function `employee-admin` has verify_jwt=true and also performs getUser verification and database authorization. It has no public account-creation endpoint. Its SDK import is pinned to 2.49.8.
- New private tables intentionally deny direct client access (RLS with no client policies). The security advisor's prior public-helper/legacy-definer and leaked-password-protection warnings are unchanged. See [RLS advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Verification

`company-access-database.sql` tests pending/active/expired/suspended contracts, direct-data denial, role/tenant injection, service-only grants, seats, device limits and stale-session rejection. Fixtures roll back. Existing company isolation, registry and onboarding SQL tests also roll back; their legacy-mode fixtures are explicitly activated only inside the test transaction.

`employee-admin-edge.mjs` tests authorization before Auth administration, exact-user failure cleanup and partial reset recovery. `employee-login-ui.cjs`, `company-member-id-ui.cjs` and existing UI/browser tests verify the actual UI scripts, payloads, password clearing, phone layout/account isolation and preservation of internal data. Browser/Auth tests use mocks; no real employee password/login has been issued as a test.

Official API references: [Admin.createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [getUser](https://supabase.com/docs/reference/javascript/auth-getuser).
