# Track F: administration, two-step sign-in, email, content pages and SEO

## What was built

- **Two-step sign-in (MFA)** for every member at `/account/security`: set up an authenticator app (QR code or setup key), confirm with a code, remove it. Staff must use it: the admin area needs a session that has entered a code (Supabase assurance level `aal2`).
- **Admin dashboard** at `/admin`, with a side menu that shows only the areas your role can use.
- **Transactional email module** (`src/lib/email`) with 17 branded templates, a Resend sender and a development sender that records "not sent".
- **Newsletter links**: `/newsletter/confirm?token=` and `/newsletter/unsubscribe?token=` (also one-click POST).
- **Content pages**: how it works, buyer protection, seller guide, about, contact (with a member contact form), FAQ, and draft terms, privacy, shipping and returns policies.
- **SEO**: page titles and descriptions, canonical links, Organization and WebSite structured data (with site search) on the homepage, FAQ structured data on the FAQ page.
- **Database** (`supabase/migrations/20261102000400_admin.sql`): server-only admin functions, fee-history protection, settings validation, `support_messages`, `email_deliveries`.

## For the owner: how to use each screen

First, make yourself an admin (see README, "Make someone an admin"), sign in and open **Account → Admin**. The first time, you'll be asked to set up an authenticator app; after that you'll enter a 6-digit code each time you sign in and open the admin area.

| Screen | What it's for |
| --- | --- |
| **Overview** | Live counts: members, active sellers (with a live listing), active listings by category and manufacturer, orders, gross merchandise value (item prices of paid orders; not your revenue), marketplace commission, refunds, open disputes and reports. Zeros are real zeros. |
| **Members** | Search by username or email. Open a member to suspend or reactivate them (with a reason), ban them (you must type their username to confirm; only an admin can lift a ban), or give and remove staff roles. You can't remove your own admin role. |
| **Listings** | Filter by status, category or title. **Remove…** asks for a reason, then takes the listing down and sends the seller a notification with that reason. **Feature** until a date, or **Unfeature**. |
| **Reports** | Member reports, oldest open first. Move them to reviewing, actioned or dismissed; closing needs resolution notes. |
| **Support messages** | Messages from the contact page. Reply by email, then mark them handled. |
| **Products** | Search the catalog, publish or archive with one click, or open a product to edit names, year, stamps, certification status and source, retail price, release date, and mark bat specs verified (with a source). |
| **Submissions** | Members' requests for missing models. Approve to create a product (draft or published, optionally with a bat spec), or reject with a note. |
| **Manufacturers / Categories** | Add, edit, activate or deactivate. A category's listing fields are a JSON list, checked before saving. |
| **Fees** | The fee history and a worked $200 example. To change a fee, create a new version that starts now or at a future time. Past versions are never edited; a scheduled version can be cancelled before it starts. |
| **Settings** | Price guide thresholds, offer and listing expiry, message limit, new-release signals, and the featured/premium switches. Values are checked (whole numbers in range, on/off). |
| **Advertising** | Add, edit and delete sponsor campaigns. A campaign shows only while it is active, paid and within its dates. Links must be https. |
| **CSV exports** | Members (no addresses or ZIP codes), listings, orders and fee history. |
| **Audit log** | Every staff action and every fee or setting change, filterable by who, what, type and date. Entries can't be edited or deleted. |
| **Integrations** | Which services (Stripe, Shippo, Resend…) have their keys set, without showing the keys, plus the last few emails and whether they were sent. |
| **Refunds, Disputes, Payouts, Shipping exceptions** | Placeholders that explain what they'll do once checkout and shipping launch. |

Roles: **admins** can use everything. **Moderators** handle members' status, listings, reports and the catalog. **Support** sees members and support messages. Anyone without a role gets a normal "page not found" at `/admin`.

### Email

Set `RESEND_API_KEY` (and a verified sending domain in Resend, matching `brand.email.fromAddress`). Without it, emails are not sent; each attempt is recorded in `email_deliveries` as "not sent" and logged without the message body. Marketing email always carries an unsubscribe link and the `List-Unsubscribe` headers.

### Legal pages

They are drafts. Each starts with "Draft for review by a qualified attorney before launch. Not legal advice." Yellow bracketed items are decisions for you (problem-report window, return shipping, payout holds, insurance, minimum age, governing law, liability clauses). The commission, offer expiry and listing expiry are read from the database, so they stay correct when you change them.

## How it is secured

- Every admin page, server action and export checks on the server: signed-in user (`getUser`), staff role read from `user_roles` with the service role, active account, and `aal2` (`src/lib/admin/auth.ts`: `requireStaff`, `assertStaff`).
- Writes go through `security definer` SQL functions (`admin_*`) that can only be called with the service role key. Each one checks the acting staff member's role again and writes the audit entry with that person as `actor_user_id`. Fee and setting changes made through them record the admin as the actor too.
- Fee rows that have taken effect can't have their name, type, value or start date changed (database trigger). Settings are type-checked by a database trigger as well as in the screen.
- Result messages in the admin are signed, so a crafted link can't show fake messages.
- CSV cells are quoted per RFC 4180, and cells starting with `=`, `+`, `-`, `@`, tab or carriage return are prefixed with `'` so spreadsheets don't run them.

## Tests

- `tests/db/admin.test.ts`: access to admin functions, audit actors, suspend/ban/roles rules, listing removal and featuring, reports, submissions, fee versions and history protection, settings validation, overview, support messages and the email log.
- `tests/unit/admin.test.ts`, `tests/unit/email.test.ts`: CSV escaping and formula guard, settings validation, fee version parsing and status, role access, catalog validation, every email template (escaping, branding, text version, unsubscribe), Resend and dev providers.
- `tests/e2e/admin.spec.ts`: non-staff 404, enrolment for admins without MFA, the code challenge in a new session, suspension with audit entry, a new fee version, settings validation, listing removal with seller notification, CSV export, phone layouts, content pages and the attorney notice, contact form, newsletter links. The test computes TOTP codes itself and deletes the members, listings, fees and subscribers it creates.

## Limitations

- Refunds, disputes, payouts and shipping exceptions are placeholders until checkout and shipping are built.
- The email module isn't wired to events yet (sign-up, orders, offers); other features call `sendEmail(to, templates.x(...))` when they're built. The homepage newsletter form doesn't send a confirmation email yet (`templates.newsletterConfirm` is ready). Supabase still sends the account emails.
- Confirm and unsubscribe links work on GET, so an email security scanner that follows links could confirm or unsubscribe an address.
- Members can't yet see their notifications in the site (the removal notification is stored for the notifications screen).
- There is no recovery code flow: a staff member who loses their authenticator needs another admin to remove the factor in the Supabase dashboard (Authentication → Users).
- Deleting a member's account clears their id from audit entries they made (the entries stay). This is the only change the append-only audit log allows.
- The README still says to change fees in the Supabase table editor; with this migration, fees that have taken effect can't be edited there. Use the Fees screen instead.
