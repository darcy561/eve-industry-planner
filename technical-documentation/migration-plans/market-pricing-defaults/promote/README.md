# Market pricing defaults — promotion drafts

Every file below is the whole document as it will live once folded in — not a diff. Links inside a
draft are written relative to its **live target**, so they resolve the moment it replaces the file at
that path.

| Draft | Live target | Apply |
|-------|-------------|-------|
| [`frontend/pricing/defaults.md`](./frontend/pricing/defaults.md) | `technical-documentation/frontend/pricing/defaults.md` | **New** topic |
| [`frontend/pricing/contents.md`](./frontend/pricing/contents.md) | `technical-documentation/frontend/pricing/contents.md` | Updated (Owns, Does not own, task map) |
| [`frontend/contents.md`](./frontend/contents.md) | `technical-documentation/frontend/contents.md` | Updated (Owns, task map) |
| [`frontend/settings/job-settings.md`](./frontend/settings/job-settings.md) | `technical-documentation/frontend/settings/job-settings.md` | **New** topic |
| [`frontend/settings/contents.md`](./frontend/settings/contents.md) | `technical-documentation/frontend/settings/contents.md` | **New** area `contents.md` **or** updated (Owns, Does not own, task map) — see note below |
| [`frontend/dashboard/watchlist.md`](./frontend/dashboard/watchlist.md) | `technical-documentation/frontend/dashboard/watchlist.md` | Updated (§ Prices) |
| [`backend/shared/pricing-defaults.md`](./backend/shared/pricing-defaults.md) | `technical-documentation/backend/shared/pricing-defaults.md` | **New** topic |
| [`backend/shared/contents.md`](./backend/shared/contents.md) | `technical-documentation/backend/shared/contents.md` | Updated (Owns, Does not own, task map) |
| [`testing/services/shared.md`](./testing/services/shared.md) | `technical-documentation/testing/services/shared.md` | Updated (§ Tested → `models`, new `documentschema` row) |
| [`testing/frontend/pricing.md`](./testing/frontend/pricing.md) | `technical-documentation/testing/frontend/pricing.md` | **New** topic |
| [`testing/frontend/contents.md`](./testing/frontend/contents.md) | `technical-documentation/testing/frontend/contents.md` | Updated (task map) |

## A dependency on `market-locations`' own promotion

`frontend/settings/` does not exist live yet. Both this project and
[market-locations](../../market-locations/contents.md) add a topic to it — that project's Market
Locations tab, this project's Job Settings tab market-group panel — and both promote independently.

`frontend/settings/contents.md` above is drafted as the **merged** result of both: it carries
market-locations' Owns clause and task-map rows for `market-locations.md` verbatim (read from
[`market-locations/promote/frontend/settings/contents.md`](../../market-locations/promote/frontend/settings/contents.md),
not edited), plus this project's own for `job-settings.md`. `frontend/contents.md` above does the same
for the one line naming the Settings page.

**If `market-locations` promotes its own `frontend/settings/contents.md` and `frontend/contents.md`
first**, this project's drafts for those two files can be folded in as written — they already carry
market-locations' content. **If this project promotes first**, market-locations' own promotion still
needs to check its drafts of those two files match what is folded in, since this draft was taken from
whatever market-locations' promote folder held when this was written, not from a live file. Either way
only one project's copy of those two files should be folded in per promotion; the second promotion to
run should diff its own draft of them against what is already live rather than folding blind.

## Not promoted

- **Process, options and decision trail.** Why the two axes are named as they are, the options
  weighed for `orderType` vs. a made-up "basis" name, the measurements behind the market group tree
  and the vocabulary survey, and every trap recorded while building this belong to plan.md and
  overlay.md, which stay with the project folder until it is deleted.
- **`measurements/market-group-tree.md`** and **`measurements/vocabulary-counts.md`** — sizing data
  for decisions already taken, not current behaviour a reader needs. Stay in the project folder.
- **The rest of the Settings page.** `job-settings.md` documents only the market-group pricing panel;
  the tab's default asset location, default market character, custom system indexes and custom extras
  controls have no draft here and stay undocumented, the same way market-locations' own drafts leave
  the custom-structures form undocumented.
- **`PricingOrderTypeSelect`** (`Styled Components/Select/pricingOrderType.jsx`), the header control
  that lets a reader compare a panel's total under each of the four order types. It is a consumer of
  `materialCostByOrderType`, documented at the point `defaults.md` names that function, and does not
  own any part of the resolution ladder itself — a full topic for it was judged out of this project's
  scope, since nothing in plan.md or overlay.md attributes it to this project's stages.

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
