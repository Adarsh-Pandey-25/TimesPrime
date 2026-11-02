# Staff sign-in or an admin action is failing

Panel 0's main flow is: email and password, then the authenticator code, then an admin action that
writes two audit rows. This page starts from what the person sees, names the cause, says how to
confirm it, and what to do. Getting a locked-out person back in is in
[`staff-access.md`](staff-access.md#getting-back-in-and-other-emergencies).

Two rules hold whatever is wrong:

- **Nothing here needs the app.** The Supabase dashboard and its SQL editor always work, and the
  SQL in this page runs there. The queries that only read are safe at any time; anything that writes
  is an owner action.
- **A refusal never changes anything.** Every 403 and 503 below was decided before the change, so
  there is nothing to undo. Check `audit_log` to see what was refused, and why.

## First: what Sentry says

Every failure of the system on this path reaches Sentry with `tags.source = supabase` and an
`extra.operation`. A person's own mistake (a wrong password or code) is not reported.

| `extra.operation` | Where | What failed |
|---|---|---|
| `loadStaffRecord` | sign-in (`extra.at = sign-in`), and every admin request | reading `staff_profiles` or `role_assignments` |
| `listFactors` | `POST /api/admin/mfa` | reading the user's factors from Supabase Auth |
| `enroll` | `POST /api/admin/mfa` | starting a TOTP enrolment |
| `beginAudit` | every audited change | writing the `attempted` row: the change was refused |
| `finishAudit` | every audited change | writing the outcome row: the change happened, its outcome row is missing |

## By what the person sees

| They see | Cause | Confirm | Do |
|---|---|---|---|
| **"Incorrect email or password."** for everyone, right password or not | The email provider is off, or Supabase Auth is down. Supabase answers "Email logins are disabled", which the app does not pass on (it never says which part was wrong) | Dashboard → Authentication → Sign In / Providers → Email: the provider must be on | Turn the provider on. Sign-ups stay off through "Allow new users to sign up" |
| "Incorrect email or password." for one person | Their password | Dashboard → Users → the user → last sign-in | Send them a password reset |
| **"This account is not a staff account."** (403) | A valid user without a `staff_profiles` row | `SELECT * FROM public.staff_profiles WHERE user_id = '<id>';` returns nothing | Add the profile. Until Panel 1, by SQL, as in `staff-access.md` |
| **"This staff account is suspended."** (403) | `status = 'suspended'` | The same query | Reactivate only if that was a mistake; the suspension is recorded in the audit log |
| **"Could not check your account. Try again."** (503 at sign-in) | The staff record could not be read: the database is unreachable, or a grant is missing | Sentry `loadStaffRecord`. `SELECT has_table_privilege('service_role', 'public.staff_profiles', 'SELECT');` must be `true` | Restore the database or the grant (re-apply `2026-11-02-access-1-foundation.sql`: idempotent). The person was signed back out; they retry |
| "Staff sign-in is not configured." (503) | `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` unset on the server | The deployment's environment | Set both, redeploy. The shared password still works meanwhile, until it is retired |
| **"Could not start the set-up."** (502), or "Could not read your second-factor status." (503) | Supabase Auth refused the MFA call; TOTP is off for the project | Sentry `enroll` or `listFactors`. Dashboard → Authentication → Multi-factor: TOTP on | Turn TOTP on |
| **"That code is not right."** (401) every time | The phone's clock is off: a code is valid for 30 seconds | The time on the phone against an accurate clock | Set the phone to automatic time. After five tries in 15 minutes, that user gets 429 |
| "A second factor is already set up." (409) at set-up | They lost the device and are enrolling again | — | The lost-device steps in `staff-access.md`. The app never replaces a verified factor, on purpose |
| "Too many login attempts." (429) | Ten attempts from one address in 15 minutes | — | Wait the minutes the message names. Without Upstash each server instance counts on its own |
| **"This action needs a second factor."** (403, `mfa_required`) | Signed in with the password, not yet the code | `audit_log`: a `denied` row with `reason = 'mfa_required'` and `aal = 'aal1'` | Finish signing in with the code (the dashboard links to it) |
| "You don't have permission for this action." (403, `forbidden`) | No live assignment grants it (none, revoked or expired), or the shared password, which has a fixed list | `SELECT role_key, language, section, expires_at, revoked_at FROM public.role_assignments WHERE user_id = '<id>';` | Grant the role. A privileged role needs two Super Admins (the database refuses otherwise) |
| "This action needs a second approver…" (403, `needs_approval`) | The permission is A (two people) in the plan's matrix, and approvals come with a later panel | — | Nothing to fix: refused by design until then |
| **"The audit log could not be written, so nothing was changed."** (503) | The `attempted` row failed, so the change was refused (owner decision Q2) | Sentry `beginAudit`. `SELECT has_table_privilege('service_role', 'public.audit_log', 'INSERT');` must be `true`. Then `SELECT public.audit_verify_chain();` | Restore the grant (re-apply access-1) or the database. Retry the action: nothing was half-done |
| "Could not check your permissions. Nothing was changed." (503) | The staff record could not be read on an admin request | Sentry `loadStaffRecord` | As for "Could not check your account" |
| "The shared admin password has been retired." (403) | `ADMIN_LEGACY_LOGIN=off`, or it is 2027-01-01 IST or later | — | Use a staff account. Before the date, removing the variable brings it back (`staff-access.md`, step B6) |
| "Unauthorized: please log in." (401) on every request after signing in | The session cookie is not kept: a `secure` cookie over plain HTTP, or a clock far off on the server | The browser's cookies for the site | Serve over HTTPS. A production build (`next start`) marks both session cookies `secure`; browsers accept that on `http://localhost` only, so a LAN address over HTTP signs no one in |

## If an action happened but its outcome row is missing

Sentry `finishAudit`. The change was made. Its `attempted` row stands, and no row points back to it
(an attempt without an outcome, owner decision Q2). Check the change itself, then record it:

```sql
INSERT INTO public.audit_log (actor_type, actor_label, action, outcome, attempt_id, entity_type, entity_id, reason)
VALUES ('bootstrap', 'owner:sql-editor:' || current_user, '<the action>', 'succeeded', '<attempted row id>',
        '<entity type>', '<entity id>', 'outcome written by hand: <how the change was checked>');
```

## What the automated tests cover

The unit tests cover the routes' answers on this page with Supabase stubbed:
`backend/api/admin/login.test.ts`, `mfa.test.ts`, `access.test.ts` and `backend/auth/*.test.ts`.
What Supabase itself answers (a provider switched off, TOTP disabled) they cannot show. The browser tests (`npm run test:e2e`)
are read-only: the refused access while signed out, and the sign-in page's accessibility. Nothing
automated signs in against the real database, so after a change to this flow the check is the
owner's, by hand: [`staff-access.md`](staff-access.md), step B4.
