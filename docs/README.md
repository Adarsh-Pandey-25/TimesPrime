# TimesPrime documentation

**Start here.** This index exists so a new session — human or agent — reads the right file instead
of re-analysing 13,000 lines of source. Re-deriving what is already written here is the most
expensive mistake available.

## Read in this order

| # | File | Read it when | Size |
|--:|---|---|---|
| 1 | [`HANDOFF.md`](HANDOFF.md) | **Always first.** Current state, environment, and nine gotchas that have already caused wrong conclusions | 12 min |
| 2 | [`CODEMAP.md`](CODEMAP.md) | "Where does X live?" · "What imports Y?" · "What moves where?" | Reference |
| 3 | [`PRD.md`](PRD.md) | What the product does, requirement by requirement, with code citations | 20 min |
| 4 | [`architecture.md`](architecture.md) | How the system fits together; the import rules | 10 min |
| 5 | [`BACKLOG.md`](BACKLOG.md) | Before "fixing" something that looks wrong — it may be deferred deliberately | 3 min |
| 6 | [`AUDIT-FINDINGS.md`](AUDIT-FINDINGS.md) | Working on a security or quality fix: status of every audit finding (F-001..F-028), with today's code locations | Reference |

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
| [`runbooks/`](runbooks/) | Operational procedures, written for someone under pressure who did not build the system |
| `_baseline-routes.txt` | Route table captured at Phase 0. The diff target the migration must match **byte for byte** |

## If you only read two things

1. **`HANDOFF.md` §3** — the gotchas. Next.js 16 renamed Middleware to Proxy, deprecated
   `priority` in favour of `preload`, and matches image hostnames as globs. Source files are CRLF.
   Supabase is currently down and the app hides it. Each of these has already produced a wrong
   answer once.
2. **`PRD.md` §11** — the defect register. Ten behaviours that exist but are **not** requirements.
   A bug written into a spec becomes permanent.

## Keeping this true

A stale document is worse than a missing one, because it is trusted.

- Regenerate `CODEMAP.md` after any file move — its columns are derived from the repo, not written
  by hand.
- Update `HANDOFF.md` at the end of every phase.
- Append to `BACKLOG.md` whenever something is deferred, with the reason it was deferred.
- Add an ADR whenever a structural decision is made, including the options turned down.
