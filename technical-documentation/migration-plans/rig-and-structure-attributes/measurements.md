# Rig and structure attributes — measurements

Raw readings this project's design is argued from, taken from the tree on 2026-09-28. Add to it as
work lands; do not replace a measurement with the conclusion drawn from it.

## The requirements table, in full

Three entries, in `Context/defaultValues.jsx`, doing three unrelated jobs.

| Id | Label | Carries | What it is |
|----|-------|---------|------------|
| 0 | The Fulcrum - Zarzak | `rigID: 0`, `systemTypeID: 3`, `structureID: 4`, `systemID: 30100000`, `taxValue: 0.25`, `allowedJobTypes` | A legality rule: one structure, in one system, manufacturing only, no rigs |
| 1 | Thukker Manufacturing Rigs | `rigID: 9`, `alternativeSystemValue: {0: 0.1, 1: 1.9, 2: 0.1}`, `allowedJobTypes` | Per-rig security data, not a constraint at all |
| 2 | NPC Station | `rigID: 0`, `structureID: 0`, `taxValue: 0.25` | A legality rule: no rigs, and a tax |

Two of the three are constraints on what a reader may pick; one is a rig's own figures. Entries 0 and
2 both set `rigID: 0`, which is the constraint "this place takes no rigs" expressed as a value to write
rather than a rule to enforce.

`taxValue: 0.25` appears on both constraint entries. ESI publishes no facility tax for either, so
neither figure could be verified against the game.

## What points into it

| Pointer | Where | Count |
|---------|-------|-------|
| A rig's own `requirementID` | `manRigs[9]` | 1 of 24 rigs across all four kinds |
| A structure's `requirementID` | `manStructure[0]` (NPC Station), `manStructure[4]` (The Fulcrum) | 2 |
| A system security's `requirementID` | `manSystem[3]` (Zarzakh) | 1 |
| A system id's, through a second table | `systemStructureRequirements[30100000]` | 1 |

Four kinds of thing point at one table of three entries, and one of those pointers is a second table
whose only row restates what requirement 0 already says.

## Five modules read the requirement machinery

`Classes/jobSetup.js`, `Functions/Blueprint Calculations/calculateMaterialsForSetup.js`,
`Components/Settings/Standard Layout/Custom Structures/structureForm.jsx`,
`Styled Components/autocomplete/virtualisedSystemSearch.jsx`, and the table itself.

`structureForm.jsx` holds its own `applyRequirements` beside `Setup`'s — the same rule written twice —
and `virtualisedSystemSearch.jsx` reads `systemStructureRequirements` to decide which systems a kind may
be offered.

## `appliedRequirementID` is written and never read

Seven mentions in `Classes/jobSetup.js`: the constructor default (`-1`), the JSDoc, `toDocument`, the
write in `applyRequirements`, and the reset in `removeRequirements`. Nothing reads it to make a
decision. It is declared on the Go side too, as `AppliedRequirementID int64` on
`services/shared/models/job.go`, so it is persisted in every stored setup.

## `removeRequirements` undoes nothing but the id

`Classes/jobSetup.js` resets `appliedRequirementID` to `-1` and leaves every field
`applyRequirements` wrote in place. Choosing The Fulcrum and then switching to a Large structure
leaves `taxValue: 0.25`, `systemID: 30100000` and `systemTypeID: 3` on the setup, and the calculation
reads them — a Large citadel in Zarzakh at Fulcrum tax. The combination survives in the stored
document, so saved setups already carry leftovers of requirements they no longer name.

## Manufacturing has no item vocabulary; reprocessing does

| Kind | Rigs | Carrying `appliesToAll` | Carrying `appliesTo` |
|------|------|-------------------------|----------------------|
| Manufacturing | 5 | 5 | 0 |
| Reaction | 4 | 4 | 0 |
| Invention | 6 | 6 | 0 |
| Reprocessing | 9 | 0 | 9 |

Reprocessing rigs name the item types they help, from `reprocessingItemTypes` — ore, moon ore, ice, gas,
scrap, unrefined ore. The other three kinds have no counterpart list, so every one of their fifteen rigs
is flagged as helping everything, and `rigSlotBonuses` counts a rig only when that flag is set.

## `manSystem` conflates a system with a security class

Four entries where the axis has three: High Sec (1), Low Sec (1.9), Null Sec / WH (2.1), and Zarzakh
(1) — a single solar system sitting in a list of security bands, carrying `requirementID: 0` to say so.

## `go fix -diff`

Run 2026-09-28 over `./core/commands/...` and `./shared/models/...`. **Not empty**: one suggestion in
`shared/models/job_test.go`, merging a struct literal with a field assigned on the next line. It is in a
test, and in neither the setup shape nor the release commands this project touches, so it is not taken
here — named so a later scan coming back non-empty is not mistaken for new debt.

## What the SDE says about rigs, read from build 3552227

Taken 2026-09-28 from the JSONL build the SDE task itself downloads.

### Rig 9's security multipliers are confirmed, and they are not special

Type 45641 is `Standup L-Set Thukker Advanced Component Manufacturing Efficiency`. Its dogma
attributes are `2355 hiSecModifier 0.1`, `2356 lowSecModifier 1.9`, `2357 nullSecModifier 0.1` —
exactly the `alternativeSystemValue` the requirements table already carries. The figures are right,
and because they sit on the rig type, they are per rig rather than per structure.

Every other rig carries the same three attributes:

| Rig | hi | low | null |
|-----|----|-----|------|
| Standup M-Set Basic Small Ship ME I / II | 1.0 | 1.9 | 2.1 |
| Standup L-Set Advanced Component ME I / II | 1.0 | 1.9 | 2.1 |
| Standup XL-Set Structure and Component | 1.0 | 1.9 | 2.1 |
| Standup L-Set Thukker Advanced Component | 0.1 | 1.9 | 0.1 |
| Standup L-Set Reprocessing Monitor II | 1.0 | 1.06 | 1.12 |

`manSystem`'s `value: 1 / 1.9 / 2.1` is therefore the standard rig's modifier trio stored on the
system as though it were a property of space. Reprocessing's own trio differs again, which the app has
no way to express.

### Rig 9 helps two families, not every item

`industryModifierSources` gives type 45641 two manufacturing material sources: attribute 2557 under
filter 14 (`Components`) and attribute 2658 under filter 15 (`Advanced Capital Components`). It
applies to nothing else. Its two material figures are `2594 attributeEngRigMatBonus -2.0` and
`2653 attributeThukkerEngRigMatBonus -3.7`; the table models one figure of 3.7 and flags it
`appliesToAll`.

### The item vocabulary already exists

`industryTargetFilters.jsonl` holds eighteen named families; `industryModifierSources.jsonl` holds 220
rows, 118 of them manufacturing-material sources. Between them they say which rig helps which family,
on which axis, from which attribute.

Structures are modifier sources too: Raitaru, Azbel and Sotiyo (group 1404) carry manufacturing
material with no filter, so a structure's own bonus genuinely does apply to every item.

### Rig set size maps to structure size

`rigSize` across the Standup rigs that are modifier sources: 2 on all 78 M-Set rigs, 3 on all 38
L-Set, 4 on all 9 XL-Set.

### Zarzakh is null sec, and no rig can ever be fitted there

`mapSolarSystems` gives 30100000 a `securityStatus` of **-1.0**, which is the null-sec band by the
standard rule, not the high-sec band `manSystem[3]`'s `value: 1` corresponds to.

It also carries `disallowedAnchorCategories: [22, 65]` — category 65 is **Structure** — so no player
structure can be anchored in Zarzakh and no rig can ever be fitted in it. With no rig, the material
formula's rig-and-system term is `1 - (0 / 100) * systemValue`, which is 1 whatever the system value
is. `manSystem[3]`'s figure is unreachable arithmetic rather than a wrong number, and the system band
reaches nothing else: `systemTypeID` feeds the material calculation, the reprocessing yield and two
display panels, and no time or cost figure.

The only industry location in the system is one NPC station, `60015187`, type 78334
`Ancient Jovian Outpost`, group 15 (Station), owner 1000438, carrying `reprocessingEfficiency: 0.5`
and `reprocessingStationsTake: 0.025`.

### The Fulcrum's figures are published nowhere machine-readable

Searched and came back empty, so that it is not searched again:

| Source | Result |
|--------|--------|
| `industryInstallationTypes` | Type 78334 absent — no assembly lines |
| `typeDogma` | Type 78334 carries no industry attributes |
| `industryModifierSources` | Type 78334 absent |
| `stationOperations[121]` | `manufacturingFactor: 0.98`, `researchFactor: 0.98` — the legacy station factors, shared with 41 other operations, so not Fulcrum-specific |
| ESI `/industry/facilities/` | Returns facility 60015187 with `owner_id`, `region_id`, `solar_system_id`, `type_id` and **no `tax` field** — the endpoint publishes tax for none of its 2321 facilities |

The Fulcrum does carry its own industry tax and gives a bonus to specific items, but both are
in-game observations rather than published data, and the app's figures have to be recorded from the
game with their source stated.

### What The Fulcrum actually gives, and how the app reads it

From [EVE University's Zarzakh page](https://wiki.eveuniversity.org/Zarzakh): a **6% material
efficiency** bonus and a **70% time efficiency** bonus when manufacturing any sub-capital Angel Cartel
or Guristas ship, and for pirate-enlisted players a **90% reduction in the SCC surcharge**.

The app stores figures in two different scales, and which one a field uses decides whether its number
is right:

| Axis | Read as | Raitaru's figure | The Fulcrum's figure | Against the wiki |
|------|---------|------------------|----------------------|------------------|
| `material` | percent — `1 - value / 100` | `1` = 1% | `1.06` = **1.06%** | wiki says 6%, so the stored figure should be `6` |
| `time` | fraction — `1 - value` | `0.15` = 15% | `0.7` = 70% | agrees |
| `cost` | fraction — `value * systemIndex` | `0.03` = 3% | `0.9` = 90% | the figure agrees, but it is applied to the system-index portion of the job cost, where the wiki describes a reduction of the SCC surcharge, conditional on pirate enlistment |

**The bonuses are item-scoped and the app applies them to everything.** `getStructureData` returns
`structureObject.material` with no notion of what is being built, so every manufacturing job in The
Fulcrum takes the bonus, not only sub-capital Angel and Guristas hulls.

The scope is expressible from the SDE, but not from `industryTargetFilters`: a type carries its own
`factionID` — 500011 Angel Cartel, 500010 Guristas Pirates — so the rule is that faction pair
intersected with not-a-capital, rather than one of the eighteen published families.

The facility tax is still not stated anywhere found.

### What the app claims for The Fulcrum

`manStructure[4]`'s `material: 1.06`, `time: 0.7` and `cost: 0.9`, like the
`taxValue: 0.25` on both constraint entries, have no SDE backing and were not verified. The app reads
`taxValue` as a percentage (`taxValue / 100` in `Functions/Installation Costs/installCosts.js`), so
0.25 means 0.25%.

## Factional warfare moves install cost, and ESI does not publish the figure

[EVE University's Factional Warfare page](https://wiki.eveuniversity.org/Factional_Warfare) gives one
industry effect: a system its faction controls and has upgraded gives **lower costs for industry
activities in NPC stations, -10% per upgrade level**, so -50% at level 5. Contested state, advantage,
frontline status and militia membership carry no industry effect of their own on that page.

ESI's `/fw/systems/` carries 160 systems, each with `owner_faction_id`, `occupier_faction_id`,
`contested` (88 contested, 72 uncontested), `victory_points` and `victory_points_threshold` — and **no
upgrade level**, which is the one figure the discount depends on.

The app already resolves a system's cost index three ways in `Functions/Helper/findSystemIndexValue.js`
— a setup's own alternative value, a predefined index in application settings, then world data. The
discount is not an index, though: it reduces the index-derived cost the way a structure's `cost` does
in `Functions/Installation Costs/installCosts.js`, and it applies in NPC stations, where a structure's
own bonus is zero.

## What the stored-data questions came back as, once the code landed

Checked against the tree after Stages A, B and C, because three of the four migration items the plan
opened with are no longer what it assumed.

**A stored `systemTypeID: 3` needs no migration.** `manSystem` keeps Zarzakh as a `legacy` band, so
`getSystemTypeFromID` still resolves it and the field still displays. A rig's `security` map names
bands 0, 1 and 2, so a rig read in band 3 falls to the unscaled `?? 1` — which is exactly the figure
`manSystem[3].value` supplied before. No figure moves, on a setup or on a custom structure.

**A stored `appliedRequirementID` needs no migration.** `DisallowUnknownFields` appears only in tests;
nothing in the decode path rejects an unknown field, so Go ignores it. It lingers as bytes in stored
documents and can be dropped whenever, or never.

**A stored `systemID` of 30100000 does.** `removeRequirements` never undid the fields
`applyRequirements` wrote, so a setup moved off The Fulcrum kept Zarzakh's system id. The declared
rule fires on `systemID` alone — correctly, because The Fulcrum is the only industry facility in the
system — so such a setup is now read as being at The Fulcrum again, and its structure, band, rigs and
tax are forced accordingly. This is the one genuinely new migration item the implementation found.

**`materialCount` for a rig-9 setup still does**, unchanged from what the plan said.

## What live actually holds, and what the release already does to it

Read from the `Public` branch and from the release steps already registered in
`services/core/commands/prepare_release.go`, because this branch carries earlier unreleased work and
its own unrun migration. Live has seen neither, so the conversion has to be right from **live**, not
from the shape this branch's history implies.

**Live names a rig by one combined id.** `manRigs` on `Public` holds ten entries, of which 5-8 are
pre-combined pairs, and a setup stores a single `rigID`:

| Live id | label | material | time |
|---------|-------|----------|------|
| 0-4 | None, T1/T2 ME, T1/T2 TE | 0 / 2.0 / 2.4 / 0 / 0 | 0 / 0 / 0 / 0.2 / 0.24 |
| 5 | T1 - ME & TE | 2.0 | 0.2 |
| 6 | T2 - ME & TE | 2.4 | 0.24 |
| 7 | T1 - ME, T2 - TE | 2.0 | 0.24 |
| 8 | T2 - ME, T1 - TE | 2.4 | 0.2 |
| 9 | Faction | 3.7 | 0.2 |

`foldRigSlots` and `foldStructureRigSlots` are already in the release, unrun, and convert `rigID` into
`rigSlot1` / `rigSlot2`, deleting `rigID`. Both are idempotent and both are ordered — the setup fold
runs after `reshape every job document`, which rewrites the setups it reads.

**The decomposition is exactly figure-preserving.** Every combined entry's material and time equal the
maximum of the pair it folds into — 5 → (1, 3) gives `max(2.0, 0)` and `max(0, 0.2)`, and so on for 6,
7 and 8. So no figure moves on the fold itself.

**Live's structure, system and requirement tables are identical to this branch's starting point.**
`manStructure` carries The Fulcrum at `material: 1.06`, `manSystem` carries the Zarzakh band at
`value: 1`, and `requirements` holds all three entries including rig 9's pointer.

**Live's rig axis is not dead.** `Setup.getRigObject` exists on `Public` and returns
`getRigInfoFromID(this.jobType, this.rigID)`, so `gatherRequirements` reaches requirement 1 and rig
9's `0.1 / 1.9 / 0.1` multipliers already apply to every live job. The dead axis belongs to **this
branch**: the rig-slot split replaced `rigID` with two slots and removed the method, leaving
`gatherRequirements` calling a member that no longer exists. So rig 9 moves no stored figure for a
live setup, and the recalculation the plan opened with is owed to nobody.

**Therefore, measured from live rather than from this branch:** a setup naming any of ids 0-8 folds
and then reads the same material figure it always did, because a standard rig's `security` trio is the
figure `manSystem` used to supply. Only a setup naming id 9 moves, and it moves in high sec and null
sec only. That is the same conclusion the branch-relative reading gave, now checked against what is
actually deployed.

**Live carries the leftovers.** `applyRequirements` stamped `systemID: 30100000` and
`systemTypeID: 3` onto a setup that named The Fulcrum, and `removeRequirements` never undid them, so
the leftover setups this project has to answer for are on live already rather than being something
this branch created.

## What the industry bonus catalogue holds, once built

Built from the extract and counted, because the plan's own figures were taken by hand from the raw
files and the converter has to agree with them.

| Kind | Count | What it is |
|------|-------|------------|
| `rig` | 125 | The Standup rigs — 78 M-Set, 38 L-Set, 9 XL-Set, as § What the SDE says about rigs counted |
| `structure` | 7 | Raitaru, Azbel, Sotiyo, Tatara and three Fortizar variants, each bonusing every item |
| `outpostRig` | 88 | Outpost Conversion Rigs, which fit no structure this app models |

The kind is read from the type's category: `Structure` is a structure, `Structure Module` is a rig,
and the Outpost Conversion Rigs group is set apart within it. All three are published and the SPA
narrows, rather than the build deciding silently what a reader may see.

**A figure is reached two ways.** `industryModifierSources` names an attribute, and a type either
carries that attribute itself — which is how Raitaru, Azbel and Sotiyo carry theirs — or reaches it
through one of its own `dogmaEffects`, which is how two rigs naming the same figure read different
attributes. Reading only the second way drops every structure; reading only the first drops every rig.

**48 of the 220 sources bonus more than one activity**, including the XL-Set Laboratory rigs, which
carry copying, invention, research-material and research-time together. A bonus therefore names its
own activity rather than the source naming one for all of them.

## Reprocessing rigs are published, through a different attribute

`industryModifierSources` carries manufacturing, reaction, invention, copying, research-material and
research-time, and no reprocessing — but that is the industry tables, not the whole of what the game
publishes. A reprocessing rig carries its bonus on the type itself, as
`717 refiningYieldMultiplier`, beside the same `rigSize`, `maxGroupFitted` and security trio every
other rig has. `Standup M-Set Asteroid Ore Grading Processor I` reads `0.51` against a 50% base
refining yield, which is the `value: 1` the app's own table holds for a T1 ore rig.

Ten are published, in the `Structure Resource Rig` groups 1941-1945, which name the ore each helps —
asteroid ore, ice, moon ore, and the L and XL sets that take everything.

**Reading only `industryModifierSources` would drop all ten.** Fourteen more carry a yield above the
base and are not offered: the `OLD Structure Resource Rig` types, every one of them
`published: false`. The Outpost Conversion Rigs carry one too and are set apart by their own kind.

## The live model and this one, compared setup by setup

`Functions/Blueprint Calculations/liveParity.corpus.test.js` runs the live material calculation —
transcribed from `Public`, with live's own rig, structure, system and requirement tables — beside the
current one over every setup live can hold: ten rig ids, five structures, four security bands, three
material efficiencies, two run/slot pairings and four raw quantities. 4,800 figures each way.

Every figure agrees except where this project set out to change one, and the residue is two causes:

| Cause | What live did | What this does |
|-------|---------------|----------------|
| The Fulcrum's material bonus | `1.06`, read as 1.06%, given to everything built there | `6`, given to sub-capital Angel and Guristas hulls and nothing else |
| A rig fitted at an NPC station | Requirement 1 overwrote requirement 2's `rigID: 0`, so the Thukker rig applied where no rig can be fitted | The place fixes both slots empty, so no rig applies |

Nothing else differs. In particular a setup naming the faction rig anywhere else asks for exactly
what it asked for on live, because live already applied that rig's own multipliers.

**The comparison found a real gap while it was being written.** Live's `manSystem[3]` carries
`requirementID: 0`, so naming the Zarzakh band was a third way of being at The Fulcrum — and the
declared list fired only on the structure and the system id. Every band-3 setup was reading a
different figure. `placeConstraints`' Fulcrum entry now names the band too.

## What a refinery yields, compared structure by structure

`Functions/Reprocessing/liveParity.corpus.test.js` does the same for reprocessing: live's yield
formula, rig table, structure table and system table transcribed from `Public`, run beside the
current ones over every saved structure live can hold — six structure types, three security bands,
nine rig ids in slot one and three in slot two — against all six item types and three skill and
implant sets. 17,496 figures each way.

**Every figure agrees, with no residue at all.** Live's rig lookup took the best `value` over the two
slots where the rig's `appliesTo` named the item type, and `reprocessingBonuses` does the same for a
legacy rig. Live scaled by `1 + reprocessingSystem[band].value`; the legacy rigs now carry that as a
`security` map of `{0: 1, 1: 1.06, 2: 1.12}` and the formula multiplies by the map's figure, which is
the same arithmetic. The structure's own ore and gas bonuses were never touched.

The reprocessing path was never on the single-rig model — `Classes/reprocessingStructure.js` on
`Public` already carried `rigSlot1` and `rigSlot2` — so the rig fold this release performs leaves a
saved refinery exactly where it was.

## What installing a setup costs, compared setup by setup

`Functions/Installation Costs/liveParity.corpus.test.js` runs live's install cost formula beside the
current one over five structures, three system index values, three tax values, one and three job
slots, and an omega and an alpha reader. 180 figures each way.

The residue is three causes, none of which is a calculation this project changed:

| Cause | What live did | What this does |
|-------|---------------|----------------|
| An alpha clone's tax | `ALPHA_CLONE_TAX / 100`, a hundredth of the quarter percent owed | The quarter percent, corrected by `Charge an alpha clone the quarter it owes, not a hundredth of it` |
| The Fulcrum's tax | The setup's own stored `taxValue` | The 0.25% the place fixes |
| An NPC station's tax | The setup's own stored `taxValue` | The 0.25% the place fixes |

An omega reader in a player structure is charged exactly what live charged, at every index and every
tax. The militia discount and the SCC surcharge reduction are both zero for a reader who has neither,
so neither term moves a figure that live also produced.

## A setup field the SPA writes and the server does not declare drops the save

Stage E gave a setup `militiaUpgradeLevel`, which `Setup.toDocument()` writes on every setup, and gave
`JobSetup` in `services/shared/models/job.go` only `enlistedFaction`. An incremental job write —
anything on a job whose revision is above zero — resolves each member of the body against that struct
in `job_write.go`, and `memberOf` returns `"militiaUpgradeLevel" is not a field of JobSetup` for a
member it cannot place. That error fails the **whole** write: the change lands in `splitJobWrites`'
failed list and never reaches the database, while the SPA's own state shows the job as saved.

So the cost of the mismatch is not the one field. It is every later edit to any setup of any existing
job, saved in the reader's session and gone when they return.

**The field is now declared**, and the class of defect is pinned by a fixture, the way the structure
kinds already are. `job_setup_fields_parity_test.go` writes every json name `JobSetup` carries to
`testing/fixtures/job-setup-fields/fields.json`, separating the fields the server always expects from
the ones it marks optional; `Classes/jobSetup.parity.test.js` reads it back and asserts that
`toDocument()` writes nothing outside that set, writes every field the server does not mark optional,
and leaves an optional field out when the setup has none. Removing the field from the Go struct and
regenerating makes the SPA test fail, which is the check the original defect needed.

Regenerate with `EIP_UPDATE_JOB_SETUP_FIELDS=1 go test ./shared/models/ -run TestTheJobSetupFieldListIsCurrent`.
