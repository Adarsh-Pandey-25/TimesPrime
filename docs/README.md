# TimesPrime documentation

**Start here.** This index exists so a new session — human or agent — reads the right file instead
of re-analysing 13,000 lines of source. Re-deriving what is already written here is the most
expensive mistake available.

## Read in this order

| # | File | Read it when | Size |
|--:|---|---|---|
| 1 | [`HANDOFF.md`](HANDOFF.md) | **Always first.** Current state, environment, and the gotchas that have already caused wrong conclusions | 12 min |
| 2 | [`NEWSROOM_PLAN.md`](NEWSROOM_PLAN.md) | **The plan.** What gets built, in what order, and when each phase is done (owner-approved, 4 Nov 2026; a PDF copy sits beside it) | 20 min |
| 3 | [`architecture.md`](architecture.md) | How the system fits together; where each kind of code lives; the import rules | 10 min |
| 4 | [`PERMISSIONS.md`](PERMISSIONS.md) | Working on the back office: the panels, the 15 roles, the permission matrix, the four-eyes and MFA rules and the data model | 20 min |
| 5 | [`PANEL_DOCS.md`](PANEL_DOCS.md) | Working on the back office: which panel is next, and what each finished panel does and who may use it | Reference |
| 6 | [`BACKLOG.md`](BACKLOG.md) | Before "fixing" something that looks wrong — it may be deferred deliberately | 3 min |
| 7 | [`AUDIT-FINDINGS.md`](AUDIT-FINDINGS.md) | Working on a security or quality fix: status of every audit finding (F-001..F-028), with today's code locations | Reference |
| 8 | [`RESEARCH.md`](RESEARCH.md) | Checking why the plan decided something: the sourced research behind it (CMS, hosting, SEO, Indian law, money) | Reference |

## One source of truth

**`NEWSROOM_PLAN.md` is the plan** for what gets built and in what order, approved by the owner on
4 Nov 2026. **`PERMISSIONS.md` is the access specification** (roles, matrix, approval and MFA rules).
The earlier PRD and `PANEL_PLAN.md` were retired that day; they are in git history.

A PDF export, `TimesPrime-PRD-and-Architecture.pdf`, was produced on 2026-10-29 as a stakeholder
snapshot. It is **retired**: untracked, git-ignored, and it predates the owner decisions recorded the
same day — to remove the paraphraser, RSS, the contact form and the newsletter, and to fix EN/HI as
the language scope. **Do not consult it.** If a copy exists on disk, it is wrong.

## Also here

| Path | Contents |
|---|---|
| [`adr/`](adr/) | Architecture decision records. One per structural decision, immutable once merged, each recording the alternatives rejected **and why** |
| [`runbooks/`](runbooks/) | Operational procedures, written for someone under pressure who did not build the system. [`staff-access.md`](runbooks/staff-access.md) switches Panel 0 on, in order, and gets you back in |
| [`design/`](design/) | Designs approved before a panel was built, with the owner's decisions; Panel 0's is [`panel-0-access-foundation.md`](design/panel-0-access-foundation.md) |

## If you only read two things

1. **`HANDOFF.md` §3** — the gotchas. Next.js 16 renamed Middleware to Proxy, deprecated
   `priority` in favour of `preload`, and matches image hostnames as globs. On a Windows checkout source files are CRLF in the working
   tree. When Supabase fails, the feed falls back to NewsData.io without an error,
   so check `/api/health` before diagnosing anything. Each of these has already produced a wrong
   answer once.
2. **`NEWSROOM_PLAN.md` sections 2 and 4** — the rules every phase follows, and the phases in order.
   The current phase is the first one not marked done.

## Keeping this true

A stale document is worse than a missing one, because it is trusted.

- Update `HANDOFF.md` at the end of every phase.
- Append to `BACKLOG.md` whenever something is deferred, with the reason it was deferred.
- Add an ADR whenever a structural decision is made, including the options turned down.
