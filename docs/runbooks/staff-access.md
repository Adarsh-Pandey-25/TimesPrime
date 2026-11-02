# Staff access: switching on Panel 0, and getting back in

For the owner. Panel 0 replaces the shared admin password with named staff accounts, roles and a
second factor ([design](../design/panel-0-access-foundation.md), [PANEL_DOCS](../PANEL_DOCS.md)).
Nothing in the app applies SQL or changes settings: every step below is yours. Each step says how to
check it and how to undo it.

**Where.** Nothing is deployed until the whole project is complete (owner decision, 2026-11-02).
- **[Part A](#part-a--locally-now)** is now: the six steps against a **local** Supabase. Never
  against the database `.env.local` points at, which may be production.
- **[Part B](#part-b--at-the-aws-deployment)** is for the day of the AWS deployment: the same six
  steps against the production database ([HANDOFF](../HANDOFF.md) §11).

## The order

Do these in order, and do not start a step until the one before it checks out.

| # | Step | Check | Undo |
|--:|---|---|---|
| 1 | **Apply the SQL migrations** (before any code) | The verification queries at the end of each file | The foundation file's rollback (only before go-live) |
| 2 | **Run the code** | The shared password still works; an admin change writes an audit row | Run the previous version |
| 3 | **Bootstrap two Super Admins** | `database/bootstrap/super-admin.sql`'s checks 1–4 | Revoke the assignment (in the file) |
| 4 | **Sign in with a staff account and verify** | `/admin` says "Signed in as …"; the audit log shows the sign-in and the second factor | Nothing to undo; the shared password still works |
| 5 | **Freeze `admin_logs`** | It is still readable and no longer writable | Grant writes back (in the file) |
| 6 | **Only then, consider turning the shared password off** | It answers 403 "retired" | Remove the switch, before 1 January 2027 |

The shared password keeps working through steps 1–5, so there is always a way in while you set
staff accounts up. It stops by itself at 00:00 IST on 1 January 2027, whatever is configured.

---

## Part A — locally, now

Against the local Supabase stack (Docker), once it is set up as [HANDOFF](../HANDOFF.md) §2
describes. That setup is proposed to the owner and not in place yet, so these steps wait for it.
Step C of the Panel 0 plan runs them and records the output, and `npm run test:db` then repeats
steps 1–5 automatically.

Locally, nothing can reach production. The worst outcome is a local database to reset.

| Hosted dashboard | Local stack |
|---|---|
| SQL Editor | Studio's SQL editor, `http://127.0.0.1:54323`, or `psql` on `127.0.0.1:54322` (user and password `postgres`) |
| Authentication → Users → Invite user | Studio → Authentication → Add user. Invite emails go to Mailpit, `http://127.0.0.1:54324` |
| Sign-ups off, TOTP on | `supabase/config.toml`: `[auth] enable_signup = false`; `[auth.mfa.totp] enroll_enabled = true` and `verify_enabled = true`. **Both TOTP settings default to `false` locally** |
| Deployment | `npm run dev` (or a `next start` build) with the local env file; the guard refuses any other Supabase URL |

**A1. Apply the SQL.**
- First the base the access files sit on: `database/schema.sql`, `database/policies.sql`,
  `database/migrations/2026-11-02-indexes.sql`.
- Then `2026-11-02-access-1-foundation.sql` and `2026-11-02-access-2-catalog.sql`.
- **Check:** the verification queries at the end of each file, as in [B1](#b1-apply-the-sql-migrations).
- **Undo:** `supabase db reset`, which recreates the local database empty, then apply again.

**A2. Run the code.**
- Start the app with the local env file; the guard confirms the target is local before it starts.
- **Check:** the shared password signs in, and one admin change writes two `audit_log` rows
  (`attempted`, `succeeded`).
- **Undo:** stop the app.

**A3. Bootstrap two Super Admins.**
- Add two users in local Studio (any email: Mailpit catches the mail).
- Run `database/bootstrap/super-admin.sql` for each in Studio's SQL editor, which runs as
  `postgres`.
- **Check:** its checks 1–4. Checks 3 and 4 must fail.
- **Undo:** the file's revoke, or reset.

**A4. Sign in with a staff account.**
- Email and password, then enrol TOTP with any authenticator app (it works offline), then sign in
  again with a code.
- **Check:** a session without its code is refused on a privileged route (403 `mfa_required`), and
  the `auth.*` audit rows.
- **Undo:** nothing to undo.

**A5. Freeze `admin_logs`.**
- **Check:** the file's checks, and old rows still readable at `GET /api/admin/logs?source=legacy`.
- **Undo:** the file's grant.

**A6. The shared password off.**
- `ADMIN_LEGACY_LOGIN=off` in the local env file, then restart.
- **Check:** 403 "retired".
- **Undo:** remove the line and restart.

---

## Part B — at the AWS deployment

Only when the whole project is complete, against the production database. The detail below is for
that day.

### B1. Apply the SQL migrations

**Before you start.** In the Supabase dashboard:
- Authentication → Sign In / Providers: turn **off** "Allow new users to sign up". Staff accounts are
  invited, never self-registered.
- Authentication → Multi-factor: TOTP (authenticator app) **enabled**. It is on by default and free.
- Authentication → Sessions: leave the JWT expiry at the default, 1 hour.
- Take a backup, or confirm point-in-time recovery (Database → Backups).

Then in SQL Editor → New query, run each file whole, in this order:
1. `database/migrations/2026-11-02-access-1-foundation.sql`: the six tables, their triggers and
   grants.
2. `database/migrations/2026-11-02-access-2-catalog.sql`: the 15 roles, 39 permissions and the
   matrix (generated from `docs/PANEL_PLAN.md`).

**Check.** The verification queries at the end of each file, each with its expected answer. In short:

```sql
SELECT count(*) FROM public.roles;             -- 15
SELECT count(*) FROM public.permissions;       -- 39
SELECT count(*) FROM public.role_permissions;  -- 136
SELECT has_table_privilege('authenticated', 'public.audit_log', 'SELECT');  -- false
SELECT has_table_privilege('service_role', 'public.audit_log', 'UPDATE');   -- false
SELECT public.audit_verify_chain();            -- NULL (an empty chain is intact)
```

The running app does not use these tables until step 2, so nothing changes for anyone yet.

**Undo.** The rollback section at the end of the foundation file drops the tables and functions.
Use it only before go-live: once `audit_log` holds real rows, it is never dropped (logs are kept at
least one year).

### B2. Run the code

Deploy `main` (with Panel 0 merged) on AWS. No new environment variable is needed. `ADMIN_LEGACY_LOGIN` stays unset (the shared password stays
on).

**Check.**
- `/admin/login` shows the staff form (email and password) and "Use the shared admin password".
- The shared password still signs in. `/admin` shows a notice that it stops working on 1 January
  2027.
- Make one admin change with it, for example set a breaking-news item, then:

  ```sql
  SELECT seq, at, actor_label, action, outcome FROM public.audit_log ORDER BY seq DESC LIMIT 5;
  ```
  Expect two rows from `legacy:shared-password`, `breaking_banner.set`: `attempted`, then
  `succeeded`.
- Within 30 minutes the cron writes a `system:cron` row, action `cron.refresh_news`.

If every admin change answers 503 "The audit log could not be written", step 1 is missing, or
`SUPABASE_SERVICE_ROLE_KEY` is not set where the app runs (see
[apply-database.md](apply-database.md#which-key-the-app-uses-and-what-rls-does-to-it)). Nothing was
changed in either case: the app refuses a change it cannot record.

**Undo.** Roll back to the host's previous release. The new tables stay; the previous code ignores them.

### B3. Bootstrap two Super Admins

Super Admins are the only accounts created outside the app, and only by you (owner decision D4).
Two of them, because granting any privileged role in the app needs two different Super Admins, and
there is no single-admin mode.

For each person:
1. Authentication → Users → **Invite user**, with their email. They open the email and set a
   password.
2. Open `database/bootstrap/super-admin.sql`, fill in `v_email` and `v_name` at the top, and run it.
   It refuses to run with the placeholders, refuses if the person has not accepted the invite, and
   does nothing if they are already a Super Admin.

**Check.** The verification block at the end of the file. Run all four. Checks 3 and 4 must
**fail** with an error, and roll back:
1. Lists the Super Admins so far.
2. Lists one `bootstrap` audit row per grant; `audit_verify_chain()` returns NULL.
3. The app's role tries to bootstrap and the trigger refuses.
4. The app's role tries to edit the audit log and is refused.

**Undo.** The file's rollback revokes the assignment (assignments are history, never deleted), and
optionally suspends the profile. It applies to the person's next request.

### B4. Sign in with a staff account, and verify

Each Super Admin, on their own device:
1. `/admin/login` → email and password → **Sign In**.
2. The first time: "Set up your second factor". Scan the QR code with an authenticator app (any TOTP
   app), or type the key shown under it, then enter the 6-digit code.
3. Every time after: the code only.

**Check.**
- `/admin` says "Signed in as <name> · super admin". A Super Admin sees sync, stats, the activity
  log and the articles list, but no editorial controls: no publish form, no banner manager, and the
  list's edit and delete buttons answer 403. The plan gives Super Admin no editorial verbs. That is
  intended, not a fault.
- The audit log has the sign-in and the factor:

  ```sql
  SELECT actor_label, action, outcome, at FROM public.audit_log
   WHERE action LIKE 'auth.%' ORDER BY seq DESC LIMIT 10;
  ```
  Expect `auth.sign_in` / `succeeded`, `auth.mfa_enroll_started`, `auth.mfa_enrolled`, then
  `auth.mfa_verified` at later sign-ins.

**Undo.** Nothing to undo. If a staff sign-in fails, the shared password still works.

Granting editorial roles (Managing Editor, Desk Editor and the rest) in the app is Panel 1. Until
then, editorial work continues on the shared password, now recorded as `legacy:shared-password`.

### B5. Freeze `admin_logs`

Nothing writes `admin_logs` since the deploy: staff actions and the cron write `audit_log`. Run
`database/migrations/2026-11-02-access-3-freeze-admin-logs.sql`.

**Check.** The queries at the end of the file:

```sql
SELECT has_table_privilege('service_role', 'public.admin_logs', 'SELECT');  -- true  (still readable)
SELECT has_table_privilege('service_role', 'public.admin_logs', 'INSERT');  -- false
```

Its history stays readable in the app at `GET /api/admin/logs?source=legacy` (`audit.read`).

**Undo.** `GRANT ALL ON public.admin_logs TO service_role;` (in the file).

### B6. Only then: turning the shared password off

Turn it off only when all three hold:
- two Super Admins have signed in with their second factor, in production (after the AWS deployment);
- Panel 1 is done, so editorial staff have their own accounts and roles;
- you decide to.

Set `ADMIN_LEGACY_LOGIN=off` in the app's environment (on AWS, where its variables are configured),
then restart or redeploy it: the variable is read by the running server.

**Check.** The shared password gets 403 "The shared admin password has been retired". An old
shared-password cookie gets 401 from the proxy.

**Undo.** Remove the variable and restart. This works only until 00:00 IST on 1 January 2027. After
that, the shared password is refused by the code itself and no setting brings it back. The last
step is a code change that deletes it, with `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` (design §7).

---

## Getting back in, and other emergencies

Your own way in never depends on the app: the Supabase dashboard and the SQL editor (locally, Studio
and `psql`; there, a reset is also always available).

**A staff member lost their authenticator device.** Authentication → Users → the user → remove
their MFA factor. Then sign them out of all sessions on the same page. At their next sign-in they
get the set-up step again. Record what you did:

```sql
INSERT INTO public.audit_log (actor_type, actor_label, action, outcome, entity_type, entity_id, reason)
VALUES ('bootstrap', 'owner:sql-editor:' || current_user, 'auth.mfa_reset', 'succeeded',
        'staff', '<user id>', 'lost device: <who asked, how you checked it was them>');
```

The app itself refuses to replace a verified factor (409). A stolen password alone cannot swap one.

**The last Super Admin is locked out** (lost device and no other admin, or a forgotten password).
Reset their password or factor in the dashboard as above. Or invite a new account and run the
bootstrap script for it (step 3).

**A session may be stolen.** Authentication → Users → the user → sign out of all sessions. Then
revoke their assignments, and suspend them if needed. Until Panel 1 this is SQL:

```sql
BEGIN;
UPDATE public.role_assignments
   SET revoked_at = now(), revoked_by = NULL, revoke_reason = '<why>'
 WHERE user_id = '<user id>' AND revoked_at IS NULL;
UPDATE public.staff_profiles SET status = 'suspended' WHERE user_id = '<user id>';
COMMIT;
```

The app reads assignments and status on every request, so this applies to their next request.
Signing them out ends the session itself.

**Is the audit log intact?** Run `SELECT public.audit_verify_chain();` weekly, and whenever in
doubt. NULL means intact. A number is the first row that does not verify. A rewrite of the whole
chain is caught only by a copy of its head kept elsewhere ([BL-034](../BACKLOG.md)).
