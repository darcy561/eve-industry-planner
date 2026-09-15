# Promotion drafts — planning-stage-panels

Every stage is done (`plan.md` § Stage status, § Start here). Links inside each drafted file are
written relative to the file's **live target**, not to this folder, so they resolve the moment the
draft is folded in.

## Index

| Draft | Live target | Apply |
|-------|-------------|-------|
| [`frontend/contents.md`](./frontend/contents.md) | `technical-documentation/frontend/contents.md` | Updated (Owns, task map row for `editjob/`) |
| [`frontend/editjob/contents.md`](./frontend/editjob/contents.md) | `technical-documentation/frontend/editjob/contents.md` | **New** area |
| [`frontend/editjob/materials-sourcing.md`](./frontend/editjob/materials-sourcing.md) | `technical-documentation/frontend/editjob/materials-sourcing.md` | **New** topic |
| [`frontend/editjob/cost-breakdown.md`](./frontend/editjob/cost-breakdown.md) | `technical-documentation/frontend/editjob/cost-breakdown.md` | **New** topic |
| [`frontend/editjob/returns.md`](./frontend/editjob/returns.md) | `technical-documentation/frontend/editjob/returns.md` | **New** topic |
| [`frontend/editjob/skills.md`](./frontend/editjob/skills.md) | `technical-documentation/frontend/editjob/skills.md` | **New** topic |
| [`frontend/editjob/selling-charges.md`](./frontend/editjob/selling-charges.md) | `technical-documentation/frontend/editjob/selling-charges.md` | **New** topic |

## Addition owed to a rules file

`technical-documentation/frontend/technical-rules.md` — insert as a new `##` section after
**§ A poke is not a value** and before **§ Lint and format**. Do not replace the file; fold this
section in among what is already there.

---

## Stacked panels

`AppShellPanel` is full height by default, which is meant for panels sharing a grid row. A panel in a
vertical stack of panels — each with its own height rather than a shared row — sets
`paperSx={{ height: "auto" }}`, or it renders as a tall empty box that pushes its siblings down. Every
panel in such a stack needs this, including one that predates its neighbours. Nothing in a jsdom test
can catch a missing one, because jsdom has no layout — it takes a browser.

Do not reach for `Masonry` to stack panels of varying height in a single column. A masonry packs
items of differing heights into **several** columns without leaving gaps; at one column there is
nothing to pack, and the measuring it does to find that out is not free — it positions every child
absolutely and re-lays out the whole column whenever any one child's height changes, so opening a
drawer or a row appearing anywhere in the stack moves every panel beneath it. A plain `Stack` gives
the same varying heights for nothing.

---

## Not promoted

**Handed to the custom-structure work** (`plan.md` § Handed to the custom-structure work) — the
`CustomStructures.Sale` lane storing saved citadels, the settings-page editing surface and
add-a-citadel form, the collection backups the upgrader needs before it writes, and the design for
where a citadel's own prices and materials will eventually be bought from. This is a proposal for
work not yet started and has no project folder of its own. **Its content has no home once this folder
is deleted** — a decision is owed (open a project folder for it, or drop the proposal) before this
folder goes.

**Handed to the market pricing defaults work** — retiring the account's single
`defaultMarketLocation`/`defaultOrderType` in favour of separate buying and selling defaults, and
keying defaults to the market group tree. This now has its own project folder,
[`market-pricing-defaults/`](../../market-pricing-defaults/contents.md), which carries the ladder, the
surface inventory and the market group tree; this project's plan keeps only a pointer to it.

**Open questions** (`plan.md` § Open questions) — none block promotion, and none are decided:

- Whether the Cost Breakdown pricing-model toggle should ever drive what the rest of the app costs
  against, rather than staying display-only.
- How deep speculative child jobs should recurse beyond the current one level.
- Whether a Price Entry purchase price should override the pricing basis automatically or only when
  told to.
- Where a saved citadel should be edited from once the custom-structure work builds the form —
  application settings alone, or also reachable from the Returns rate block.

**Known limits carried forward, not resolved** (`plan.md` § Known limits) — the per-component "vs last
build" comparison needs a statistics endpoint change (`ProductionTotalsRow` does not serve the cost
split) and belongs to that work, not this one; the sourcing memo on the Materials & Sourcing panel
re-runs on every Edit Job dispatch, costing a sub-millisecond re-walk, and stays that way until the
Edit Job `actions` object separates its dispatch-only members from its state-reading ones.

**Owed to the shared-planners release** (`plan.md` § Owed to the shared-planners release) — 184
archived jobs and 12 live job documents in the live snapshot carry numeric invention entry ids rather
than uuids; switching them rides that project's release window rather than a migration of its own, and
is recorded there, not here.

## Left for the caller

- The fold into live SoT, the row removal from `migration-plans/contents.md`, and the folder deletion.
- **The citation check says this folder is not yet safe to delete as-is:**

  ```
  $ grep -rn 'planning-stage-panels/' --include='*.md' technical-documentation/ \
      | grep -v '^technical-documentation/migration-plans/planning-stage-panels/'
  technical-documentation/migration-plans/contents.md:29
  technical-documentation/migration-plans/shared-planners/plan.md:2121
  technical-documentation/migration-plans/effect-state-sync/contents.md:27,29
  technical-documentation/migration-plans/job-document-drafts/contents.md:60
  technical-documentation/migration-plans/job-document-drafts/plan.md:749
  ```

  Three **active** project folders cite this one directly (`shared-planners`, `job-document-drafts`,
  and `effect-state-sync`, which is itself closed and kept only because `job-document-drafts` cites
  it). Per `migration-plans/documentation-rules.md` § A promoted project
  folder is deleted, not archived, an active citation is a reason to keep the folder — deleting it now
  would leave those citations pointing at nothing. Each citing project's own reference should be
  checked against what has actually promoted (this project's `contents.md` row is not itself a reason
  to keep the folder, but these other three are) before the folder goes.
- The custom-structure proposal still has no destination project folder — see § Not promoted.
