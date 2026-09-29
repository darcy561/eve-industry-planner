# Rig and structure attributes — plan

**Status:** Every stage is complete. The project is ready for promotion review.

**Code in scope:** [`frontend/src/Context/defaultValues.jsx`](../../../frontend/src/Context/defaultValues.jsx)
— the rig, structure, system and requirement tables;
[`frontend/src/Functions/Industry Facilities/rigs.js`](../../../frontend/src/Functions/Industry%20Facilities/rigs.js);
[`frontend/src/Classes/jobSetup.js`](../../../frontend/src/Classes/jobSetup.js);
[`frontend/src/Components/Settings/Standard Layout/Custom Structures/`](../../../frontend/src/Components/Settings/Standard%20Layout/Custom%20Structures/)
and [`frontend/src/Styled Components/`](../../../frontend/src/Styled%20Components/) — the pickers and
the second implementation of the same rule;
[`frontend/src/Functions/Blueprint Calculations/`](../../../frontend/src/Functions/Blueprint%20Calculations/)
and [`frontend/src/Functions/Installation Costs/`](../../../frontend/src/Functions/Installation%20Costs/)
— what reads the figures; [`frontend/src/Classes/character.js`](../../../frontend/src/Classes/character.js);
[`services/shared/models/job.go`](../../../services/shared/models/job.go) for the stored shape;
[`services/worker/tasks/sde/update/`](../../../services/worker/tasks/sde/update/) for the item
vocabulary; and release steps in [`services/core/commands/`](../../../services/core/commands/).

**Live SoT (until promote):** [frontend/settings/custom-structures.md](../../frontend/settings/custom-structures.md),
[backend/shared/custom-structures.md](../../backend/shared/custom-structures.md)

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages.
Live SoT will not be edited until this project is complete and promotion is approved.

## Why this project exists

What a rig helps, what a structure allows, and what a system does to a job's cost are facts about the
rig, the structure and the system — and none of them is recorded on one.

A rig's item family is not recorded at all, so every rig the app can fit is flagged as helping
everything. A rig's security multipliers are recorded on **space**, with the one rig whose figures
differ bolted on through a pointer. A structure's and a system's legality rules share a flat
`requirements` table with those multipliers, hanging off four different kinds of thing, read by two
execution models — one of which writes game constants onto the player's stored setup, and the other of
which does not work at all.

Both were found inside the custom structure model, which made the shape expressible and deliberately
did not schedule either. They are one project because they are the same table, read the same two ways.

## What it owes another project

[job-document-drafts](../job-document-drafts/plan.md) § A defect this found, which the cutover does
not fix records that `Setup.gatherRequirements` calls `this.getRigObject`, which is not a member, so a
rig's requirement reaches no calculation. The figure it feeds is **material quantity, which is
stored**, so correcting it changes saved figures for every affected job.
[Stage A](./stages/stage-a-rig-security.md) is what answers it, including the recalculation that has
to come with it.

## The stages

| Stage | What it does | Stored impact |
|-------|--------------|---------------|
| [A — every rig carries its own security multipliers](./stages/stage-a-rig-security.md) | The multipliers move onto the rig rows; the system tables stop carrying a `value` | **Moves `materialCount`** |
| [B — a constraint is declared where it is read](./stages/stage-b-declared-constraints.md) | One declared list replaces two tables and two implementations, and drives what every picker offers | Remaps `systemTypeID` |
| [C — the setup stops storing what the game decides](./stages/stage-c-stop-storing.md) | The requirement write path and `appliedRequirementID` are removed from both languages | Removes a field |
| [D — the real rigs, scoped to the structure they fit](./stages/stage-d-real-rigs.md) | The game's own rigs, each naming the items it helps; one filter for rig and structure bonuses alike; The Fulcrum's bonus corrected and scoped; the rig field becomes an autocomplete | **Moves `materialCount`** |
| [E — a factional warfare system carries its cost effect](./stages/stage-e-fw-cost.md) | A flagged system takes a reader-stated upgrade level that lowers install cost in NPC stations | Additive |

## Sequencing

**A, B and C are one cutover.** Each rewrites stored documents, and they want one walk rather than
three: A recalculates `materialCount`, B remaps `systemTypeID` on setups *and* custom structures, C
unsets `appliedRequirementID`. Taken separately they also leave an awkward intermediate state —
post-A, pre-C the broken write path is still stamping fields onto documents the migration has just
corrected.

**Within that cutover the order is A, then B, then C.** A stands alone. C is only safe once B has
somewhere to derive the values from.

**D and E build on what B establishes.** D needs B's picker filtering and two more files in the SDE
build; E needs the enlistment B introduces. Either can be scheduled whenever, in either order.

**D carries a second migration.** Correcting The Fulcrum's material bonus to 6% and scoping it to
sub-capital Angel and Guristas hulls moves figures in both directions — a Fulcrum setup building one
of those hulls gains the bonus it should have had, and one building anything else loses the 1.06% it
should never have had. The figure and its scope cannot land separately without making the bonus worse
than it is today, so both ride Stage D and Stage D owes its own release step.

**The one argument for splitting A out** is that [job-document-drafts](../job-document-drafts/plan.md)
is blocked on it and A alone is a contained change. The cost of doing so is a second migration later.

## Decisions taken

Recorded here so a later reader does not reopen them.

- **Legacy rigs stay, and keep their old behaviour.** The five generic `- All` rigs still resolve,
  still display and still apply to every item. They are retired from the picker, not from the data,
  and no stored rig id is remapped. A stored value that cannot be matched to the sharper vocabulary is
  kept as it is rather than migrated by guesswork. → [Stage D](./stages/stage-d-real-rigs.md)
- **One reorganisation of stored structure information has already happened** — the single rig slot
  becoming two — and that is the limit.
- **The tax keeps its current value**, moved into the declaration so it lives in one place and can be
  switched out without touching a stored document. → [Stage B](./stages/stage-b-declared-constraints.md)
- **Pickers filter rather than disable**, except the system search, which says why Zarzakh is missing.
  A value already chosen is always shown, even when it would no longer be offered.
- **Enlistment is character-based and stays in the SPA.** A corporation can be enlisted as a whole and
  ESI publishes it there too, but nothing here reads it at that level. Nothing server-side acts on
  enlistment, so nothing server-side stores it.
- **The enlistment field names a faction rather than answering yes**, because The Fulcrum wants a
  pirate militia and Stage E wants the system's owner.
- **The Fulcrum's material bonus is 6%, and it is scoped.** A citadel's flat 1% and The Fulcrum's 6%
  are the same kind of bonus; The Fulcrum's applies only to sub-capital Angel Cartel and Guristas
  ships. The stored `1.06` is wrong on both counts. Because the figure and its scope have to land
  together, this is [Stage D](./stages/stage-d-real-rigs.md)'s to correct, and it is what gives Stage
  D a migration of its own.
- **Rig 9 keeps `appliesToAll`.** It is the Thukker Advanced Component rig and its real scope is now
  known, but the legacy rule wins: it behaves as it always has, keeps its id, and is retired from the
  picker like the other four. A correctly scoped Thukker rig appears beside it from the SDE.
- **The item vocabulary is CCP's** — `industryTargetFilters` and `industryModifierSources` — not one
  this project invents.
- **Rig labels drop the size prefix and the word `Manufacturing`**, derived in the SDE build.

## What one table is doing today

`requirementID` points into a flat table of three entries and hangs off four different kinds of thing
— a structure, a rig, a system security and a system id through `systemStructureRequirements`. Those
three entries do three unrelated jobs: two are legality rules about what a reader may pick, and one is
rig 9's own security figures, which ESI publishes as dogma attributes 2355/2356/2357 on type 45641.
Every row, every pointer and every reader is counted in [measurements.md](./measurements.md).

**Two execution models read it, and neither is right.** `applyRequirements` writes the requirement's
fields onto the stored setup at selection time and persists `appliedRequirementID` — it **stores
game-derived facts**, which [planning-stage-panels](../planning-stage-panels/plan.md) § What is
stored, and where forbids. `gatherRequirements` is meant to re-derive them at calculation time and
**does not work at all** — the rig axis is dead, so rig 9's security data reaches no calculation
today.

**And the rule is written twice.** `Setup` holds one implementation and the Custom Structures
`structureForm.jsx` holds its own `applyRequirements` beside it, while `virtualisedSystemSearch.jsx`
reads the second table to decide which systems a kind may be offered.

**And removal does not remove.** `removeRequirements` resets the id and leaves every stamped field in
place, so saved setups already carry leftovers of requirements they no longer name.

## Wire compatibility

| Surface | Change | Note |
|---------|--------|------|
| The declared list and the rig `security` maps | **Additive** | SPA-only; no stored shape and nothing crosses a process boundary |
| A character's enlisted faction | **Additive, SPA-only** | One field kept from a response `Classes/character.js` already fetches |
| A system's factional warfare flag | **Additive** | Rides the per-system index payload the server already sends; no stored client shape |
| The family-specific rig rows, and retiring the generic rigs from the picker | **Additive** | The generic ids stay readable and keep displaying; nothing stored is remapped |
| The Fulcrum's material bonus and its scope | **Migrate-required, and it moves figures** | `1.06` applied to everything becomes `6` applied to sub-capital Angel and Guristas hulls. A Stage D release step, separate from the A–B–C cutover |
| The setup's enlistment override and upgrade level | **Additive** | Two new fields in both languages. Both are on `JobSetup` in Go and in `Setup.toDocument()`, and the two lists are held together by the fixture `testing/fixtures/job-setup-fields/fields.json`. The override is written whenever a reader picks one; the upgrade level has a real "none" state and is always written |
| A stored setup's and custom structure's `systemTypeID` | **Additive** | Zarzakh stays as a `legacy` band that resolves and displays but is never offered, so a stored `3` reads the same figure it always did — see [measurements.md](./measurements.md) § What the stored-data questions came back as |
| `appliedRequirementID` on a stored setup | **Additive** | Nothing rejects an unknown field, so the removal needs no migration; the bytes linger until something drops them |
| A stored `systemID` of 30100000 left behind by `removeRequirements` | **Migrate-required — step written** | `clear the system left on a setup that moved off The Fulcrum`, after the reshape and the rig fold |
| A stored setup's `materialCount` | **No migration** | A rig-9 setup's figure is corrected when its job is next opened, by the checker that keeps every derived setup figure in step — see [Stage A](./stages/stage-a-rig-security.md) § Migration |

## Open questions

Each says which stage it gates.

- **Does The Fulcrum's `cost: 0.9` reduce the system index or the SCC surcharge?** The app applies it
  to the system-index portion; the wiki describes a 90% SCC surcharge reduction, conditional on pirate
  enlistment. *Gates how Stage B declares the enlisted value.*
- **Does `faction_id` report a pirate enlistment?** `/fw/systems/` shows only the four empire militias,
  so it cannot confirm whether Angel Cartel and Guristas appear on a character's public `faction_id`.
  One call against an enlisted character settles it. *Gates The Fulcrum's condition in Stage B; Stage
  E is unaffected, since it compares against a system's owner.*
- **Should a rig's multiplier scale its time bonus too?** The game scales every one of a rig's
  bonuses by the security band; the app scales only material, and
  `manufacturingTimeModifierCalculation` has no band term at all. Stage A kept that as it was, since
  changing it moves stored job times. *Gates nothing; it is a defect this stage found and did not
  take.*
- **What is The Fulcrum's facility tax?** Not in the SDE, not on ESI's facilities endpoint, not on the
  wiki. The stored `0.25` is carried unchanged either way. *Gates nothing.*

**Closed by the SDE** (build 3552227, 2026-09-28): rig 9's multipliers are `0.1 / 1.9 / 0.1` as the
table already had them, and they are carried per rig rather than per structure. **Zarzakh's multiplier
no longer matters** — the system forbids anchoring structures, so no rig can be fitted there, and with
no rig the material formula's rig-and-system term is 1 whatever the band says.

## Stage status

| Stage | Status |
|-------|--------|
| Phase 1 — project docs | Complete |
| A — every rig's own security multipliers | Complete |
| B — a constraint declared where it is read | Complete |
| C — the setup stops storing what the game decides | Complete |
| D — the real rigs, scoped to the structure they fit | Complete |
| E — a factional warfare system's cost effect | Complete |

## Start here

Settle **the two game questions first** — The Fulcrum's material figure, and whether `faction_id`
reports a pirate enlistment. Both are cheap, and the first decides figures the cutover migrates. Then
read [measurements.md](./measurements.md) § The requirements table, in full: the three entries do
three unrelated jobs, and seeing that is what makes this plan read as one change rather than five.

Then **[Stage A](./stages/stage-a-rig-security.md)**, as the first part of the A–B–C cutover.

## Done when

- Every rig carries its own security multipliers, and no system table carries a rig's figure.
- A structure's and a system's legality rules are one declared list, evaluated where they are read,
  driving both what is legal and what each picker offers, with nothing game-derived written onto a
  stored setup.
- `appliedRequirementID` is gone from the stored shape in both languages, every stored `systemTypeID`
  of `3` has been remapped, and the stored `materialCount` of every affected setup has been
  recalculated.
- A rig names the family of items it helps and is not counted for an item it does not; a structure
  filters its bonus the same way; and the generic rigs still resolve, still display and still apply to
  everything without being offered.
- A factional warfare system takes a reader-stated upgrade level that lowers install cost in its NPC
  stations for an enlisted character.
- Live SoT promoted and this folder deleted.
