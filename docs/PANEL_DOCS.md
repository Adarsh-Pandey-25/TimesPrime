# Back-office panels

This file records what the back office can do, panel by panel, and who is allowed to do it. The
plan behind it is [`PANEL_PLAN.md`](PANEL_PLAN.md): the panels, the 15 roles, the permission
matrix, the four-eyes and MFA rules, and the data model. That file says what to build. This file
says what has been built, and it must match the code.

The panels are built **one at a time**. A panel is finished (backend, screens, permissions, tests
and docs) before the next one starts. Panel 0 comes first because every other panel depends on it.
When a panel is done, its section below is filled in from the template and the index is updated in
the same piece of work.

## Index

| # | Panel | Status | Date completed | Commits |
|--:|---|---|---|---|
| 0 | Access foundation: staff accounts, roles, permissions, MFA, audit log, the permission check | Planned | — | — |
| 1 | Administration: users, role assignments with scope and expiry, access review | Planned | — | — |
| 2 | Desk: articles (write, review, approve, publish, unpublish) | Planned | — | — |
| 3 | Front page: breaking banner, pinned slots, curation | Planned | — | — |
| 4 | Ingestion: sync, source registry, licence controls, kill switch, purge | Planned | — | — |
| 5 | AI assistant | Planned | — | — |
| 6 | Insights: read-only stats | Planned | — | — |
| 7 | Compliance: grievances, corrections, legal orders, content records | Planned | — | — |
| 8 | Privacy & security: data-rights requests, incidents, audit viewer | Planned | — | — |
| 9 | Commercial: only once ads or subscriptions exist | Planned | — | — |

**Status:** *Planned* means not started. *In progress* means design or code has started. *Done*
means every item in the definition of done holds (`CLAUDE.md`, "Back-office panels"). A panel is
never marked Done while an owner action it depends on is unrecorded.

## Words used in this file

| Word | Meaning |
|---|---|
| Permission | One action on one kind of thing, written as `object.verb`, for example `article.publish`. The full list is the matrix in `PANEL_PLAN.md` |
| Role | A named bundle of permissions, for example Desk Editor. Roles are generic: there is no "Hindi sports editor" role |
| Scope | Where a role applies: a language desk (`en`, `hi`, or all) and a section (one, or all) |
| Assignment | One person holding one role in one scope, with an expiry date and the name of whoever granted it |
| Four-eyes | An action that needs a second, different person to approve it |
| MFA / `aal2` | The person signed in with a second factor. Supabase calls this assurance level `aal2`; a password alone is `aal1` |
| Audit log | The append-only record of who did what, when, and why |
| Owner action | A step only the owner can take, such as applying SQL to the database or setting a production variable |

## Template

Copy this section for each panel, replace the guidance in italics, and keep the headings in this
order. Write for someone who has not seen the code: a new developer, or the senior reviewer.

### Panel N: Name

#### Panel

- **Name:** *the panel's name, as in the index*
- **URLs:** *every page and API route it adds or uses, for example `/admin/desk` and
  `/api/admin/articles`*
- **Code:** *where its code lives: the view in `frontend/views/`, the route bodies in `backend/api/`,
  services, repositories, and the SQL in `database/migrations/`*

#### Purpose

*What the panel is for, in two or three sentences. Say which problem it solves for the newsroom.*

#### Roles and responsibilities

*Which roles use it and what each one does there.*

| Role | What they do in this panel |
|---|---|
| *Desk Editor* | *Approves and publishes articles in their language and section* |

#### Features and functionality

*What a user can see and do, one line each. Mark anything partly built as partial and say what is
missing.*

#### Access permissions and authorization rules

*Every permission the panel checks, who holds it, and the extra rules around it. The server checks
each one; hiding a button in the UI is never the check.*

| Permission | Roles that hold it, and their scope | Four-eyes | MFA (`aal2`) | Audited |
|---|---|---|---|---|
| *`article.publish`* | *Managing Editor (all); Desk Editor and Sub-editor (own language and section)* | *Yes: approved by someone other than the author and last editor* | *Yes* | *Yes* |

*Also state: what a person without the permission sees (status code and message), what is written
to the audit log for each action (action name, target, before and after, reason), and any action
that needs a reason code.*

#### Database changes

| Migration file | What it does | Rollback | Applied by the owner |
|---|---|---|---|
| *`database/migrations/YYYY-MM-DD-name.sql`* | *Tables, columns, indexes, policies it adds* | *Where its rollback section is* | *No / Yes, on date* |

*Say if a table or column existing before this panel changed meaning.*

#### Tests and verification

| Test file | What it proves | Denied case covered |
|---|---|---|
| *`backend/api/admin/…test.ts`* | *A Desk Editor in `hi` can publish a `hi` article* | *A Desk Editor in `en` gets 403 for the same article; an expired assignment gets 403* |

*Every permission check needs an allowed test and a denied test. Add what was checked by hand, and
the `npm run verify` and CI result at the time the panel was marked Done.*

#### Known limits and not yet built

*What the plan asks for that this panel does not do yet, and why. Link each item to its
`BACKLOG.md` entry or to the later panel that will do it.*

## Panels

No panel is done yet. Each panel's section goes here, copied from the template, when its work
starts.
