# Documentation rules (migration-plans)

Applies to everything under `migration-plans/`. On overlap with the project master [`../documentation-rules.md`](../documentation-rules.md), **this file wins** for those docs; otherwise the master applies.

## Purpose of this folder

`migration-plans/` documents **migration process**: backlog, decisions, handoffs, cutover notes, and work-in-progress plans.

**It is not live SoT.** Nothing here is the source of truth for how the product runs today until that content is **committed into the live documentation** under `frontend/`, `backend/`, `stack/`, `deployment/`, or another live area (and the migration note updated or closed accordingly).

| Here (migration-plans) | Live SoT (elsewhere) |
|------------------------|----------------------|
| Intent, options, status, history | Current behaviour operators and implementers follow |
| “Done” / “partial” / “still open” for backlog items | Topic docs + `contents.md` task maps |
| Roadmaps and cutover logs | Stack / Deployment Tool / service docs |

When work lands: **re-document in the live SoT first** (or in the same change), then leave only history / pointers here. Do not teach operators from migration-plans alone.

Canonical Swarm backlog file: [`swarm-roadmap.md`](./swarm-roadmap.md) (still not live SoT).

## Status honesty

- Mark **done** only when code **and** an operator path exist. Docs-only or “intended in eip” ≠ done.
- Prefer **partial** + explicit “still open” over banner/backlog contradictions.
- Do not reopen closed migrate items unless deliberately revisiting a decision.
- Companion live docs describe **current setup**, not migration checklists. Fold orphans into live SoT; keep history here.

## Handoff hygiene

- When statuses change, update the active roadmap’s **Handoff status**, **Start here**, and **Recommended pickup order** (or equivalent).
- Companion live docs must match backlog verb names and topology in the same change when a slice lands.
- Live stack → [`../stack/contents.md`](../stack/contents.md). Host verbs → [`../deployment/deployment-tool/cli/verbs.md`](../deployment/deployment-tool/cli/verbs.md).

## Later (placeholder)

More rules for how we write and structure migration docs will land in this file (templates, promotion checklist, naming). Until then, status honesty + handoff hygiene above apply to all files in this folder.
