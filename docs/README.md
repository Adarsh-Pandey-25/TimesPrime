# TimesPrime documentation

**Start here.** This index exists so a new session — human or agent — reads the right file instead
of re-analysing 13,000 lines of source. Re-deriving what is already written here is the most
expensive mistake available.

## Read in this order

| # | File | Read it when | Size |
|--:|---|---|---|
| 1 | [`HANDOFF.md`](HANDOFF.md) | **Always first.** Current state, environment, and the gotchas that have already caused wrong conclusions | 12 min |
| 2 | [`architecture.md`](architecture.md) | How the system fits together; where each kind of code lives; the import rules | 10 min |
| 3 | [`PRD.md`](PRD.md) | What the product does, requirement by requirement, with code citations | 20 min |
| 4 | [`BACKLOG.md`](BACKLOG.md) | Before "fixing" something that looks wrong — it may be deferred deliberately | 3 min |
| 5 | [`AUDIT-FINDINGS.md`](AUDIT-FINDINGS.md) | Working on a security or quality fix: status of every audit finding (F-001..F-028), with today's code locations | Reference |
| 6 | [`PANEL_PLAN.md`](PANEL_PLAN.md) | Working on the back office: the owner's plan for the panels, the 15 roles, the permission matrix, the four-eyes and MFA rules and the data model. A plan, not a spec; not edited | 25 min |
| 7 | [`PANEL_DOCS.md`](PANEL_DOCS.md) | Working on the back office: which panel is next, and what each finished panel does and who may use it | Reference |
| 8 | [`NEWSROOM_PLAN.md`](NEWSROOM_PLAN.md) | Planning what comes next: the phased build plan from Panel 0 to launch and after (proposed, awaiting the owner's sign-off; a PDF copy sits beside it) | 20 min |

## One source of truth

**`PRD.md` is the canonical product specification.** Nothing else describes the product
authoritatively.

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
2. **`PRD.md` §11** — the defect register. Ten behaviours that exist but are **not** requirements.
   A bug written into a spec becomes permanent.

## Keeping this true

A stale document is worse than a missing one, because it is trusted.

- Update `HANDOFF.md` at the end of every phase.
- Append to `BACKLOG.md` whenever something is deferred, with the reason it was deferred.
- Add an ADR whenever a structural decision is made, including the options turned down.
