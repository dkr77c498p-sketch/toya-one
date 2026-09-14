# Company isolation and pilot preparation

Implemented 2026-09-14. This is a technical preparation step, not a completed commercial launch.

- Storage photos retain their existing `company_id/report_id/file` paths. The two legacy bucket-wide SELECT/INSERT policies were removed. A restrictive policy requires an active user's own company folder for all operations on `toya-photos`. The existing admin-only delete policy remains.
- The original TOYA company retains its exact browser storage keys and IndexedDB photo database. Other companies use company-specific keys/databases. Signed-out screens use a separate empty namespace. Existing records are not copied, moved or deleted.
- Logout or an account switch reloads the page, clearing module caches and pending UI callbacks. A transient connection error preserves the current form and namespace. Backend authorization remains authoritative.
- Other companies' writer/worker choices come from their active profiles. The original TOYA staff defaults remain for TOYA only. TOYA asset seeds and quick login buttons are not installed for other companies. Vehicle and attachment master edits remain local to each browser, now separated by company; cross-device master synchronization is not implemented by this change.
- Backups now carry a company identifier. A different company's backup is rejected; legacy unlabelled backups are accepted only for the original TOYA company.
- Estimate documents no longer automatically print TOYA's logo, representative or permit number for another company.

Verification: `tests/company-isolation-database.sql` creates two synthetic companies and users inside one transaction, verifies photo and document boundaries, and rolls everything back. `tests/company-isolation-browser.cjs` runs the complete app at mobile width with mocked network data and verifies A/B account switching, local drafts, photos, master lists, backup rejection, logout and existing TOYA data. `tests/company-document-branding.cjs` verifies estimate issuer output. Existing project-business and invoice deletion tests also pass.

Before a real pilot: obtain the participating company's name and administrator login email; provision a separate company/profile through the administrator workflow, then configure its issuer information, users, machinery and rates. Automatic customer signup, subscription billing, general dispatch-company customization and shared master synchronization remain separate work. Do not reuse a TOYA account for another company. No actual pilot accounts or invitations were created by these tests.

## Shared registration update

Added company_registries for employee rosters, vehicles, machines and attachments. Active company members can read; only active company administrators can create/update. Version checks reject concurrent overwrites; no delete grant. Existing TOYA records are not automatically copied: administrators can review/import their current device list and explicitly save each category. Other companies start empty. Saving replaces future choices, while selected in-progress values and historical reports retain original names. Shared categories load on login, navigation or manual refresh; they are not live push updates.

Registration Management now provides a setup guide and link to existing issuer/company information. Employee roster entries are names used in daily reports, not authentication accounts; login provisioning/deactivation and automatic customer signup remain pending. Dispatch-company customization is also still pending. These are required before self-service commercial onboarding. Existing company isolation verification remains applicable.

Tests: company-registry-database.sql (rolled-back fixtures, RLS, version conflicts, validation); company-registry-ui.cjs (cross-device reads, failures, edit preservation, archive and roster); full mobile company-isolation-browser.cjs includes shared list integration.
