# Market price delivery — promotion drafts

Every file below is the whole document as it will live once folded in — not a diff. Links inside a
draft are written relative to its **live target**, so they resolve the moment it replaces the file at
that path.

| Draft | Live target | Apply |
|-------|-------------|-------|
| [`frontend/market-data/contents.md`](./frontend/market-data/contents.md) | `technical-documentation/frontend/market-data/contents.md` | **New** area `contents.md` |
| [`frontend/market-data/registry.md`](./frontend/market-data/registry.md) | `technical-documentation/frontend/market-data/registry.md` | **New** topic |
| [`frontend/market-data/cache.md`](./frontend/market-data/cache.md) | `technical-documentation/frontend/market-data/cache.md` | **New** topic |
| [`frontend/market-data/citadels.md`](./frontend/market-data/citadels.md) | `technical-documentation/frontend/market-data/citadels.md` | **New** topic |
| [`frontend/contents.md`](./frontend/contents.md) | `technical-documentation/frontend/contents.md` | Updated (Owns, task map) |
| [`frontend/pricing/contents.md`](./frontend/pricing/contents.md) | `technical-documentation/frontend/pricing/contents.md` | Updated (Does not own) |
| [`frontend/pricing/price-entry.md`](./frontend/pricing/price-entry.md) | `technical-documentation/frontend/pricing/price-entry.md` | Replaced — described the store this project deleted |
| [`backend/api/market-prices.md`](./backend/api/market-prices.md) | `technical-documentation/backend/api/market-prices.md` | **New** topic |
| [`backend/api/contents.md`](./backend/api/contents.md) | `technical-documentation/backend/api/contents.md` | Updated (Owns, task map) |
| [`backend/worker/market-orders.md`](./backend/worker/market-orders.md) | `technical-documentation/backend/worker/market-orders.md` | **New** topic |
| [`backend/worker/contents.md`](./backend/worker/contents.md) | `technical-documentation/backend/worker/contents.md` | Updated (Owns, task map) |
| [`backend/shared/objectstore.md`](./backend/shared/objectstore.md) | `technical-documentation/backend/shared/objectstore.md` | **New** topic |
| [`backend/shared/contents.md`](./backend/shared/contents.md) | `technical-documentation/backend/shared/contents.md` | Updated (Owns, Does not own, task map) |
| [`deployment/deployment-tool/cli/deploy.md`](./deployment/deployment-tool/cli/deploy.md) | `technical-documentation/deployment/deployment-tool/cli/deploy.md` | Updated (§ Package roles — `s3.Ensure` row) |
| [`testing/services/worker.md`](./testing/services/worker.md) | `technical-documentation/testing/services/worker.md` | Replaced — § Tested and § Gap were both wrong about market order test coverage |
| [`testing/services/api.md`](./testing/services/api.md) | `technical-documentation/testing/services/api.md` | Updated (§ Tested → market prices query and surface, § Topic-only detail) |
| [`testing/services/shared.md`](./testing/services/shared.md) | `technical-documentation/testing/services/shared.md` | Updated (§ Tested → `core/objectstore`, § Little/none, § Topic-only detail) |
| [`testing/frontend/market-data.md`](./testing/frontend/market-data.md) | `technical-documentation/testing/frontend/market-data.md` | **New** topic |
| [`testing/frontend/contents.md`](./testing/frontend/contents.md) | `technical-documentation/testing/frontend/contents.md` | Updated (task map, `seedPrices.js` mention) |

## Not promoted

- **Process, options and decision trail.** Why the registry composes rather than living in the
  world-data store, why the persistent tier is read-through rather than TanStack's own persister, the
  measurements behind moving station pricing server-side, and every open decision's history belong to
  plan.md and overlay.md, which stay with the project folder until it is deleted.
- **The three "Named for later, not done here" items** — sharing a structure's reachable character
  between market pricing and name resolution, and the two "What this leaves undone on purpose" items
  (a type held nothing has ordered is not cached, and two tabs rotating independently) — are decisions
  to leave alone, not current behaviour a reader needs; they stay in plan.md § Start here.
- **`priceResolution.js`** — which market and order type a caller asks for — is out of this project's
  scope by its own `contents.md` § Does not own, and is left undocumented here for the same reason: it
  belongs to [market-pricing-defaults](../market-pricing-defaults/contents.md), not to this
  promotion.
- **The Market Data and Price History dialogues reading a region's orders and history straight from
  ESI in the browser** — recorded in plan.md § Left out on purpose as an argument for later work, not
  a decision this project took. Nothing here documents it as current design, only as what H3 draws
  private markets into.
- **The `marketLocations` document lane itself** — its stored shape, validation and the
  `GET /api/v1/user/market-locations` endpoint the registry reads from — is
  [market-locations](../market-locations/contents.md)'s territory and has its own promotion in
  progress; this project's drafts name it only as the source the registry composes from and do not
  redocument its shape.
- **The four `CustomStructures` build-kind lanes and their SPA form** are
  [custom-structure-model](../custom-structure-model/contents.md)'s territory; this project's drafts
  say only what a saved row must be able to carry to be a market (a region, and a station or
  structure id), not the form that saves it.
- **`priceCache.savedSourceRefresh.test.jsx`**, named in overlay.md § G4 as retired alongside the
  station's browser-side refresh, is not listed in the testing drafts: it no longer exists, and a
  testing topic describes what runs today rather than what a stage removed.

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
