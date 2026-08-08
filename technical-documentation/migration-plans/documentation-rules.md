# Documentation rules (migration-plans)

Applies to everything under `migration-plans/`. On overlap with the project master [`../documentation-rules.md`](../documentation-rules.md), **this file wins** for those docs; otherwise the master applies.

## Purpose of this folder

`migration-plans/` documents **migration process**: plans, roadmaps, decisions, handoffs, cutover notes, in-flight behaviour overlays, and history.

**It is not live SoT** until content is **promoted** into live documentation under `frontend/`, `backend/`, `stack/`, `deployment/`, or another live area (with explicit go-ahead — see below).

| Here (migration-plans) | Live SoT (elsewhere) |
|------------------------|----------------------|
| Intent, options, status, history | Current behaviour operators and implementers follow |
| In-flight “how this part works after the change” overlays | Topic docs + `contents.md` task maps |
| “Done” / “partial” / “still open” for backlog items | Promoted only when the project closes |

Do not teach operators from migration-plans alone after promote — live SoT must carry the current behaviour.

## One subfolder per plan / roadmap

**New** plans and roadmaps live in their **own subfolder** named for the **work** (e.g. `mongo-driver-v2/`, `websocket-realtime/`, `swarm-stack/`). Put the plan, stage notes, change log, and behaviour overlays in that folder.

The folder name is **not** a git branch name. One branch may carry several projects; a project may span commits on whatever branch is convenient. **Project complete** means the roadmap/plan work is done and you have go-ahead to **promote** into live SoT — **not** that a particular branch was merged.

Existing top-level `*.md` files may remain until next touched; when revisited, prefer moving into a named subfolder.

Section entry / task map: [`contents.md`](./contents.md).

## Phase 1 — Assemble project folders and docs (gate)

**Every** migration project starts with **Phase 1**: build the project’s documentation home **before** any product/code work.

Phase 1 is complete only when all of the following exist and are linked:

1. **Named project subfolder** under `migration-plans/` (name of the work).
2. **`contents.md`** — Owns / Does not own / task map for the project folder.
3. **Plan or roadmap entry** — goals, phases after Phase 1, done-when, handoff notes as needed.
4. **Rules acknowledgment** in that plan/roadmap (see below).
5. **Row in** [`contents.md`](./contents.md) (section task map) pointing at the project folder.
6. **Scaffold for overlays** — enough structure that later “what changed / how it works now” and missing-SoT drafts have a clear place (stubs or empty sections are fine; invent shape as needed, same discipline as live docs / testing gaps).

**Do not start project work** (code, stack, Deployment Tool, or other product changes) until Phase 1 is done. Later phases are named in the project plan (e.g. Stage A/B) and run only after this gate.

When the project or a new/updated plan will touch Go: as part of planning (Phase 1 or when the plan names the code surfaces), run **`go fix -diff`** on **those packages/paths only** and note upgrades that should land before or with the planned work — see [`technical-rules.md`](./technical-rules.md). Do not widen the scan (or fixes) into packages outside the plan’s touch surface. Do not discover a pile of in-scope `go fix` debt only after the feature slice is written.

Phase 1 itself may only touch docs under the project folder and the section `contents.md` link — still **no** live SoT edits.

## Hard rule — do not edit live SoT during project work

**Until the plan/roadmap project is complete and you have explicit go-ahead to promote:**

- **Do not** change live docs under `frontend/`, `backend/`, `stack/`, `deployment/`, or other live SoT trees as part of that project.
- Document **all** project changes, decisions, and “how this part now works” **inside the project subfolder**.
- Missing live SoT discovered mid-work is written **into the project docs** first (same topic shape / discipline as live docs and as filling testing gaps). It rolls into live SoT only on promote.

This supersedes any “re-document live SoT in the same change as the code” guidance for **active migration projects**. After go-ahead, promote overlays into live SoT and leave history / pointers in the project folder.

## Overlay SoT while a project is active

When implementing work tracked by a migration project:

1. Start from **live** technical documentation (current behaviour).
2. Lay the **project folder docs on top**.
3. On overlap, **project docs win** for that in-flight work.
4. Where the project has **no overlay**, **live docs remain the truth**.

Project overlays must state clearly **what changed** and **how that part works after the change**.

## Product code comments are not migration docs

When implementing under an active migration project, **code comments** (and other product surfaces) still follow master [`../technical-rules.md`](../technical-rules.md) § Current behaviour only:

| Do | Don’t |
|----|--------|
| Comment ownership, invariants, and call-site rules for the live code | Reference `#N`, overlay filenames, roadmap sections, or “Section N” in product comments |
| Keep ticket/section narrative in the project overlay / roadmap | Use comments as a second migration change log |

Same bar applies to stack YAML comments and operator-facing copy produced by the change. Process detail → [`technical-rules.md`](./technical-rules.md).

## Rules acknowledgment in every plan / roadmap

Each plan or roadmap doc **must** include a short acknowledgment that these migration-plans documentation rules (and the paired [`technical-rules.md`](./technical-rules.md)) were **read** and will be followed — so later readers know the process bar was applied when the plan was written or updated.

Suggested block near the top of the plan entry file:

```markdown
**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.
```

(Adjust relative links if the entry file is nested deeper.)

## Status honesty

- Mark **done** only when code **and** an operator path exist. Docs-only or “intended in eip” ≠ done.
- Prefer **partial** + explicit “still open” over banner/backlog contradictions.
- Do not reopen closed migrate items unless deliberately revisiting a decision.
- During the project, checklists and cutover notes stay in the project folder — not in live topic docs.

## Handoff hygiene

- When statuses change, update the active roadmap’s **Handoff status**, **Start here**, and **Recommended pickup order** (or equivalent) **in the project folder**.
- **Align project docs at each step:** after each phase/slice lands (not only at the end), refresh plan status/checklists, overlay “what changed / how it works,” inventory/versions if pins or touch-surface changed, and handoff text so nothing still describes a prior step as current.
- On **promote** (go-ahead): update companion live docs so they match landed behaviour, verbs, and topology; leave history in the project folder.
- Live stack → [`../stack/contents.md`](../stack/contents.md). Host verbs → [`../deployment/deployment-tool/cli/verbs.md`](../deployment/deployment-tool/cli/verbs.md).

## Promote checklist (when go-ahead is given)

1. Fold project overlays (including missing-SoT drafts) into the correct live topic docs / `contents.md` task maps.
2. Match current-behaviour-only rules in live docs (no cutover checklists left as operator guidance).
3. Close or mark the project folder status; keep history / pointers here.
4. Git merge / ship of the carrying branch is **out of scope** for this checklist — promote closes the **docs project**; shipping code is a separate decision.
