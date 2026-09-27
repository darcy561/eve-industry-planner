# Custom structure model — promotion drafts

| Draft | Live target | Apply |
|-------|-------------|-------|
| [`backend/shared/custom-structures.md`](./backend/shared/custom-structures.md) | `technical-documentation/backend/shared/custom-structures.md` | **New** topic |
| [`backend/shared/contents.md`](./backend/shared/contents.md) | `technical-documentation/backend/shared/contents.md` | Updated (Owns, Does not own, task map) |
| [`frontend/settings/custom-structures.md`](./frontend/settings/custom-structures.md) | `technical-documentation/frontend/settings/custom-structures.md` | **New** topic |
| [`frontend/settings/contents.md`](./frontend/settings/contents.md) | `technical-documentation/frontend/settings/contents.md` | Updated (Owns, Does not own — drops the "not yet documented" line for the custom-structures form, task map) |
| [`frontend/reprocessing/structure-panel.md`](./frontend/reprocessing/structure-panel.md) | `technical-documentation/frontend/reprocessing/structure-panel.md` | **New** topic |
| [`frontend/reprocessing/contents.md`](./frontend/reprocessing/contents.md) | `technical-documentation/frontend/reprocessing/contents.md` | Updated (Owns, Does not own, task map) |
| [`frontend/contents.md`](./frontend/contents.md) | `technical-documentation/frontend/contents.md` | Updated (Owns paragraph, task map — names the Custom Structures tab and the reprocessing structure panel) |
| [`testing/frontend/settings.md`](./testing/frontend/settings.md) | `technical-documentation/testing/frontend/settings.md` | Updated (§ Coverage map — Custom Structures tab rows added) |
| [`testing/frontend/reprocessing.md`](./testing/frontend/reprocessing.md) | `technical-documentation/testing/frontend/reprocessing.md` | **New** topic |
| [`testing/frontend/contents.md`](./testing/frontend/contents.md) | `technical-documentation/testing/frontend/contents.md` | Updated (task map — Custom Structures row, reprocessing row) |
| [`testing/services/core.md`](./testing/services/core.md) | `technical-documentation/testing/services/core.md` | Updated (§ Tested — the three prerelease steps, § Topic-only detail) |
| [`testing/services/shared.md`](./testing/services/shared.md) | `technical-documentation/testing/services/shared.md` | Updated (header links, `models` row, `mongo` live row) |

## Not promoted

- **Stages BR2 and BR3** — named in the plan for what they inherit, but not owned or landed by this
  project (a rig's item-family vocabulary, and the requirements table's replacement). They stay in
  the project folder for whichever project schedules them.
- **The duplicated structure display** (`jobSetupCard.jsx` / `JobSetupInfoFrame.jsx`) and **the Edit
  Setup panel's single rig picker** — both real findings, both explicitly handed to the panel
  redesigns that will rewrite the surfaces carrying them (purchasing-stage-panels and
  planning-stage-panels respectively). Drafting them now would be rewritten the moment those
  redesigns land, so they are left for those projects to pick up.
- **The cross-kind structure reference disagreement** between the setup picker (resolves within a
  setup's own kind) and `getCustomStructureWithID` (resolves across every kind) — real, but every
  path today is checked and unreachable. It only becomes live once something lets a setup point at a
  structure of another kind, which is a change nobody has scheduled; there is nothing current to
  state as behaviour, so it is not drafted.
- **The Edit Job setup card's and watchlist's own display of a setup's structure** — the deleted-
  structure warning, "Missing Structure" wording, and how each screen decides between saved and
  manual fields — are real, landed behaviour, but no live topic yet owns Edit Job's setup-editing
  surfaces at all (`frontend/editjob/contents.md` explicitly defers the reducer and its actions to
  `technical-rules.md` rather than a behaviour topic). Documenting these screens is a larger gap than
  this promotion closes and is left for a future pass rather than drafted thin.
- **`JobSetup`'s own stored fields** (`rigSlot1`/`rigSlot2`, `customStructureID`, `structureID`,
  `updateRigID`/`updateRigSlot`) — for the same reason: no area topic currently owns the setup class's
  shape, and adding one is out of this promotion's scope.
- **`CustomStructure`'s market-kind fields** (`regionID`, `stationID`, `structureID`, `raceID`,
  `ownerID`, `brokerFee`) — already the market-locations project's live SoT
  (`backend/api/market-locations.md`) even though they share the Go struct with the four build kinds;
  not restated here.

## Citation check

```bash
grep -rn 'custom-structure-model/' --include='*.md' technical-documentation/ \
  | grep -v '^technical-documentation/migration-plans/custom-structure-model/'
```

Run already, from the repo root:

```
technical-documentation/migration-plans/contents.md:32:| Custom structure model (...) | [custom-structure-model/contents.md](...) |
technical-documentation/migration-plans/market-locations/plan.md (×2)
technical-documentation/migration-plans/market-locations/contents.md
technical-documentation/migration-plans/planning-stage-panels/plan.md
technical-documentation/migration-plans/purchasing-stage-panels/plan.md
technical-documentation/migration-plans/building-stage-panels/contents.md
technical-documentation/migration-plans/building-stage-panels/plan.md
technical-documentation/migration-plans/market-price-delivery/overlay.md
technical-documentation/migration-plans/market-price-delivery/plan.md (×4)
technical-documentation/migration-plans/job-document-drafts/plan.md (×2)
```

Every hit is another migration-plans project's own plan/overlay/contents.md, or this project's row in
the section's `contents.md` — no live SoT document cites this folder.

**This folder is kept after promoting, not deleted.** Three of the projects citing it are active:
`planning-stage-panels` and `purchasing-stage-panels` each inherit a finding from it — the Edit Setup
panel's single rig picker and the duplicated structure display, both listed under Not promoted above —
and `building-stage-panels` cites it for what a setup's place resolves to. `market-locations` and
`market-price-delivery` have promoted and so are not themselves a reason to keep it. What goes on
promote is the section `contents.md` row's claim that this project is awaiting promotion; the folder
goes when the last active project citing it no longer needs it.
