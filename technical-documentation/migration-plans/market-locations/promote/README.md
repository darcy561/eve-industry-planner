# Market locations — promotion drafts

Every file below is the whole document as it will live once folded in — not a diff. Links inside a
draft are written relative to its **live target**, so they resolve the moment it replaces the file at
that path.

| Draft | Live target | Apply |
|-------|-------------|-------|
| [`backend/api/market-locations.md`](./backend/api/market-locations.md) | `technical-documentation/backend/api/market-locations.md` | **New** topic |
| [`backend/api/contents.md`](./backend/api/contents.md) | `technical-documentation/backend/api/contents.md` | Updated (Owns, task map) |
| [`frontend/settings/market-locations.md`](./frontend/settings/market-locations.md) | `technical-documentation/frontend/settings/market-locations.md` | **New** topic, **new** area |
| [`frontend/settings/contents.md`](./frontend/settings/contents.md) | `technical-documentation/frontend/settings/contents.md` | **New** area `contents.md` |
| [`frontend/contents.md`](./frontend/contents.md) | `technical-documentation/frontend/contents.md` | Updated (Owns, task map) |
| [`testing/frontend/settings.md`](./testing/frontend/settings.md) | `technical-documentation/testing/frontend/settings.md` | **New** topic |
| [`testing/frontend/contents.md`](./testing/frontend/contents.md) | `technical-documentation/testing/frontend/contents.md` | Updated (task map) |
| [`testing/services/api.md`](./testing/services/api.md) | `technical-documentation/testing/services/api.md` | Updated (§ Tested → `marketsources`, § Thin → `v1endpoints/planners`, § Topic-only detail) |
| [`testing/services/shared.md`](./testing/services/shared.md) | `technical-documentation/testing/services/shared.md` | Updated (§ Tested → `models`, § Thin) |
| [`testing/services/core.md`](./testing/services/core.md) | `technical-documentation/testing/services/core.md` | Updated (§ Thin, § Little / none) |

## Not promoted

- **Whether the move renames the stored field `jobType` on the remaining build kinds** — plan.md
  § Open decisions records this as out of scope as written, the other half of the same misfit, left
  for a later migration. Stays in the project folder; nothing to fold.
- **Process, options and decision trail** — why a market leaving `custom-structures` does not disturb
  custom-structure-model's reasoning, why the settings schema version does not move for either
  release step, why the region id widened to `int64` everywhere, and the ordering argument for why
  this project promotes ahead of custom-structure-model. All of this is the *why now* rather than the
  *how it works*, and belongs to plan.md, which stays with the project folder until it is deleted.
- **The two projects this one borders, left where they are:**
  - How a saved market's orders are fetched, derived, held and rotated once registered for pricing —
    `market-price-delivery`'s territory. Its own promotion, not drafted here; the new backend topic
    names `api/marketsources` as where a lane feeds that machinery and stops.
  - The four build kinds' class, array and custom-structures form — `custom-structure-model`'s
    territory, not yet live SoT itself. The new frontend `contents.md` states plainly that the rest of
    the Settings page's frames, including the custom-structures form, are "not yet documented here"
    rather than describing them.
  - Citadel raw-order IndexedDB storage merged into the Market Data dialogue, which landed very
    recently in the market area. It is not this project's — `market-price-delivery`'s — and neither
    plan.md nor overlay.md for this project claims it, so nothing needed removing.
- **Both test gaps this draft recorded are now closed.** `mongo.MarketLocationsForAccount` and
  `PutPlannerSettingsHandler`'s market write each have a live-gated test of their own, and the
  testing drafts above name them under § Tested rather than § Thin.

## Eight of these drafts are shared with the other market projects

`backend/api/contents.md`, `backend/shared/contents.md`, `frontend/contents.md`,
`frontend/pricing/contents.md`, `frontend/settings/contents.md`,
`testing/frontend/contents.md`, `testing/services/api.md` and
`testing/services/shared.md` are each drafted by more than one of
[market-locations](../../market-locations/promote/README.md),
[market-price-delivery](../../market-price-delivery/promote/README.md) and
[market-pricing-defaults](../../market-pricing-defaults/promote/README.md).

Each project first drafted its own whole-file replacement carrying only its own rows, which would
have meant the last promotion to run silently dropped the others' — `frontend/contents.md` alone was
three files, one per project, each missing two thirds of the task map. **They have been reconciled:
every project's copy of these eight is now byte-identical and carries all three projects' content.**

So they fold once, in any order, and folding the same file again from another project is a no-op
rather than a loss. Anything that changes one of the eight must change every copy, or the next
promotion undoes it.
