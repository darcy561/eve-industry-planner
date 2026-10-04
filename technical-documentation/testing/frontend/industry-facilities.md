# industry facilities — tests

Live SoT for test depth under
[`frontend/src/Functions/Industry Facilities`](../../../frontend/src/Functions/Industry%20Facilities).
Behaviour → [frontend/industry-facilities/contents.md](../../frontend/industry-facilities/contents.md).
Module entrypoints → [contents.md](./contents.md).

## Coverage map

**Depth:** Strong across what a rig or a structure gives, where a job may legally run, and which
militia a setup is costed against — each function has its own file beside the module it tests, plus
three corpus tests proving the current calculations against a transcription of what runs live today.

### Tested

| Area | What the tests cover |
|------|----------------------|
| `rigs.test.js` | Reading a rig out of its kind's table or the published catalogue; the per-axis combining rule, including a security band scaling only the material axis, the faction rig's own multipliers, and the better *scaled* figure winning rather than the better raw one; a rig counted only when it helps the item being built; every band a kind's system table names having a multiplier so none is silently read as zero; a rig's own name, and which combinations compete for a slot |
| `placeConstraints.test.js` | Which place a setup or a structure is subject to, by structure, system or legacy security band; what a place fixes, including a reader naming an NPC station inside Zarzakh still resolving to The Fulcrum; the enlisted-only surcharge reduction, and that the faction list itself is never handed out as a figure; what a field offers with and without a fixed value; which systems allow which kinds of job |
| `enlistedFaction.test.js` | Which militia a setup is costed against — the setup's own override winning over the character's, and both answering none where neither is known; which faction holds a system, carried in from the same payload as its cost index; which systems take an upgrade level; which militias could change what a setup costs, deduplicated where a place and a system agree |
| `militiaDiscount.test.js` | The discount at every upgrade level, clamped to five; nothing for the wrong militia, no militia, a player structure, or a system no militia holds; the setup's own named militia winning over the character's |
| `industryBonuses.test.js` | Which items a family holds, by group or by category; which items a bonus reaches, including one published with no family and one naming a family the catalogue does not carry; the best figure across two bonuses that both reach an item; which rigs fit a structure's size, in name order; what a rig field offers, including a fitted rig kept visible even where it would not otherwise be offered, and never offered twice; naming every family a rig helps |
| `structureBonusForItem.test.js` | The Fulcrum's scoped bonus reaching a pirate sub-capital and nothing else — not a pirate capital, not a hull of any other faction, not an item the catalogue does not know; an ordinary structure's flat figure reaching everything; a structure's published figure preferred over its declared scope where the game publishes one |
| `getStructureInfo.test.js` | Structure type, system security band and implant lookups by kind and id |
| `Styled Components/autocomplete/virtualisedRigSearch.test.jsx` | The field showing a setup's already-named rig whether or not it is still offered, showing no rig where none is fitted, wording a refusal, and naming itself for the field it is |
| `Functions/Blueprint Calculations/liveParity.corpus.test.js` | The current manufacturing and reaction material formulas against a transcription of what live runs, over every rig id, structure, security band, material efficiency, run/slot pairing and raw quantity live can hold |
| `Functions/Installation Costs/liveParity.corpus.test.js` | The current install-cost formula against live's, over every structure, system index, tax value, job-slot count and clone status live can hold |

## Topic-only detail

Reprocessing's own rig and structure reading, and its corpus test, are covered from
[reprocessing.md](./reprocessing.md), not here. The Custom Structures tab's own form and field-map
tests are covered from [settings.md](./settings.md). A setup's own stored shape — including
`enlistedFaction` and `militiaUpgradeLevel`, the two fields this project added to it — is not this
file's to describe; a cross-language fixture keeps the SPA's and the server's field lists in
agreement for it (`Classes/jobSetup.parity.test.js`,
`services/shared/models/job_setup_fields_parity_test.go`), covered from the testing topic that owns
the job setup's shape once it is written.
