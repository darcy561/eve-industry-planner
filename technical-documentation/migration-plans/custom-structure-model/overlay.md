# Custom structure model — overlay

What changed and how each part works **after** the change. Live docs remain the truth wherever this
file has no entry. Fill a section as its slice lands; do not pre-write behaviour that has not shipped.

Promote target on go-ahead: [frontend/](../../frontend/contents.md) and
[backend/](../../backend/contents.md).

## Stage A — One shape, server side

**Landed.** Both settings documents hold one array of structures, of every kind.

### The shape

`models.CustomStructure` carries the seven fields every kind shares, plus `rigType`, `rigSlot1`,
`rigSlot2`, `implant` and `systemID` for the kinds that use them. `ReprocessingStructure` and
`InventionStructure` are gone; what told them apart was which optional fields they carried, and a row
now carries the ones its kind uses.

`models.CustomStructures` is **a bare `[]CustomStructure`, not a wrapper struct** — the decision the
plan left open. Nothing in this project or in the shelved
[market-price-delivery](../market-price-delivery/contents.md) names a field that would sit beside the
array, so the wrapper's only value was speculative while its extra level of nesting would have been
paid on every read in Go and in the SPA. Another schema bump is the cost if a sibling field is ever
wanted, and this stage is the evidence that bump is cheap.

`JobTypeManufacturing`, `JobTypeReaction`, `JobTypeInvention` and `JobTypeReprocessing` are now named
in `models`. The values were previously only in the SPA's `Context/defaultValues.jsx`, and the fold
has to stamp a kind onto a legacy row, so the server needed them as more than literals.

Three accessors replace what choosing a list used to do: `OfJobType`, `DefaultOfJobType` (flagged
default, else first configured) and `WithID`, which finds a structure **without being told its kind**
— the read that cost four lookups under the lanes. They have no Go caller yet; the SPA store does
exactly these three reads today and Stage B is where they get one.

### The fold, and the conversion that persists it

**The fold happens at decode**, in `CustomStructures.UnmarshalBSON`. The shapes are told apart by what
BSON says the value is — an array, the four keyed lists, or null — rather than by a version.

That is forced by the upgrader, not a preference. `Upgrader.ApplicationSettings` stamps an
unversioned document with the current version on sight, so a version test would skip exactly the
legacy documents that need folding. The existing `DefaultPricing` fills in the same method test the
data for the same reason, and both `ApplicationSettings` and the planner's `Settings` embed this type,
so one decode-time fold serves both.

A legacy row carries no `jobType` of its own, so the key it was stored under supplies one. **A row
that does name its own kind keeps it**: the row is the thing that says what it is, and a misfiled row
must not be relabelled by where it was found.

**No schema version moves.** `ApplicationSettingsSchemaCurrent` and `planner.SettingsSchemaCurrent`
both stay at 1. Reading folds either shape, so nothing is broken before the conversion runs and
nothing breaks if it runs late — which is what makes this a data conversion rather than a schema
change. The v0→v1 step that seeded an empty `Invention` lane is deleted: an absent kind is now simply
no rows, so there is nothing to seed.

What a read does **not** do is persist. It hands its caller one array and leaves the document as it
found it, so without a conversion the stored documents would keep both shapes indefinitely and every
reader would pay the fold forever.

### The prerelease step

`foldCustomStructures` in `core/commands/release_custom_structures.go` rewrites what is on disk,
registered in the `0.9.0` release as **"fold custom structures into one array"**.

It runs **after** `give every account its planner` and `move each account's extras categories onto its
planner`, because those create the planner settings documents it also converts; a fold before them
would report nothing to do and leave what they wrote in the old shape.
`TestTheStructureFoldRunsAfterThePlannerDocumentsExist` holds that ordering.

Both collections are already in the release's copy through `metaOwnerCollections` and
`accountPlannerCollections`, so `revertRelease` can put them back —
`TestTheStructureFoldsCollectionsAreBackedUp` checks that rather than trusting it.

Two decisions inside it:

- **Decode and write back, not an aggregation pipeline.** The decoder is the one place that knows how
  a legacy row without a `jobType` gets one, and a second implementation in a pipeline could disagree
  with the one every read goes through — invisibly, until a player's structure changed kind under
  them. This follows `seedPricingDefaults`, which uses the upgrader for the same reason.
- **`$set` on the one field, not a document replace.** These documents are edited by their owner while
  a release runs against a live stack, and replacing the whole document would take every other field
  back to what it held when the step read it.

**The selection filter is the trap.** Documents owing a conversion are selected by **not already being
an array**, not by being the keyed lists:

```go
owing := bson.M{"customStructures": bson.M{"$not": bson.M{"$type": "array"}}}
```

A `$type` test against an array in MongoDB matches when any **element** has that type. So
`{"$type": "object"}` matches a folded document too — every row in it is an object — and the step
rewrote the same documents on every run. The live test caught it: the conversion itself was correct
and the second run still reported work.

### The null that the live test caught

A settings document with no structures configured stores **null**, because a nil slice marshals to
null. That is neither shape the fold reads, and it failed the whole document's decode with
`error decoding key customStructures: EOF` — every account with no structures, which is every new one.

The unit tests missed it: they seeded `bson.M{}` and `[]bson.M{}` and never a null. It was caught by
`TestLive_scopedReadsFindWhatTheirWritesStore` against real Mongo. `UnmarshalBSON` now absorbs null as
no rows, with regression coverage in `TestCustomStructuresRoundTripsWithNoStructures` and
`TestCustomStructuresReadsAStoredNull`.

A `MarshalBSONValue` that would have written an empty array instead of null was written and then
**removed**: the driver short-circuits a nil slice to null without consulting it, so it never fired
for the case it existed for, and for every other case it did what the default encoder already does.

### `omitempty` on the optional fields

The struct in [plan.md](./plan.md) § The shape being built tags the optional fields
`json:"…,omitempty"`. That is wrong on a number, and `TestScalarFieldsDoNotClaimOmitempty` in
`shared/jsoncodec` rejects it: `omitempty` drops empty JSON values, so on an int it does nothing and
the zero is written anyway. They ship as `bson:"…,omitempty" json:"…,omitzero"`, which is the
convention already in `archived_job_stats.go` and `job.go`.

### The planner settings clone

`SettingsFromAccount` cloned four lists; it is now one `slices.Clone`. The deep-copy contract is
unchanged and still covered — an edit on the account's copy must not reach the planner's.

### What proves it

- `shared/models/custom_structures_test.go` — the fold, a row keeping its own `jobType`, the array
  branch, idempotency, absent/empty/null values, and the three accessors.
- `core/commands/prepare_release_test.go` — the step's place in the release, that it covers both
  settings collections, and that both are in the release's copy.
- `core/commands/live_release_custom_structures_test.go` — the conversion against real Mongo, checked
  as **stored BSON** rather than through the decoder, which folds either shape and would report
  success over a document the step never converted. Covers the dry run writing nothing and a second
  run finding nothing to do.
- `shared/mongo/live_parity_custom_structures_test.go` — the fold against real Mongo, seeded as the
  four keyed lists, then written back and re-read to prove the second read lands on the same rows.

The live test **first passed by skipping**: it cloned an existing settings document and the test
database has none. Dropping a lane from the fold still passed. It now builds its seed from
`DefaultApplicationSettings`, and the same mutation fails it. Every assertion above was mutation-checked
— lane dropped, `jobType` stamp removed, stamp made to override the row's own, null guard removed —
and in each case the intended test failed.

### Wire

`application_settings.customStructures` is an array on the wire where it was four keyed lists;
`testing/fixtures/session-responses/surface.json` moves with it. Breaking and shipped together, as
[plan.md](./plan.md) § Wire compatibility has it — the SPA and API deploy together and there is no
third consumer. **The SPA has not moved yet**, so the API currently sends a shape the SPA does not
read: Stage B is not optional follow-up, it is the other half of this change.

## Stage B — One class, SPA side

**In progress.** The class exists and is proved; nothing imports it yet.

### Built alongside, not cut over

`Classes/structure.js` is written **beside** the three classes it replaces rather than in place of
them, so both can be exercised against the same stored rows before any caller moves. Nothing in the
app imports it yet, so the running SPA is unchanged.

What holds the fold honest is a **parity suite**: for each kind, the same stored row through the new
class and through the old one must produce the same document, and reprocessing's two bonus
calculations must agree across every item type. Those tests fail if the fold drifts, and they are
what makes moving the callers a mechanical step rather than a leap.

### One class, and what a kind carries

`Structure` serves every kind, with `jobType` as the discriminator. A table keyed by `jobType` —
`fieldsByJobType` — decides which optional fields a row carries:

| Kind | Carries |
|------|---------|
| Manufacturing, reaction | `rigSlot1`, `rigSlot2`, `systemID` |
| Reprocessing | `rigSlot1`, `rigSlot2`, `implant` |
| Invention | `rigSlot1`, `rigSlot2` |

A field its kind does not carry is **left unset and left out of the document**, rather than written as
a zero. That keeps a stored row saying what its kind means, and it is why `toDocument` composes the
optional parts rather than listing every field. Adding a kind is a row in that table, not a class.

A kind the table does not know about still reads: it carries the shared fields and none of the
optional ones, so an unrecognised row is inert rather than broken.

### Reprocessing's calculations

`rigBonusFor` and `structureBonusFor` moved onto the one class unchanged in substance, but they now
read `this.jobType` where they had the reprocessing constant baked in. `rigBonusFor` **answers zero
for a kind that carries no rig slots**, so a caller holding a list of mixed kinds can ask any row for
a bonus without first asking what kind it is — which is the point of one array. Parity across every
`reprocessingItemTypes` value is asserted against the old class.

### The invention tax, fixed

`InventionStructure` takes `tax` raw in both its constructor and its `setTax`, where the other two run
it through `coerceFiniteNumber`. So a tax arriving as `"abc"` stayed the string `"abc"`, and `""`
survived `?? 0` because that guards only null and undefined. Downstream, `installCosts.js` divides it
by 100 — `"" / 100` is `0` and `"abc" / 100` is `NaN`.

The one class settles `tax` for every kind. This is the single place the fold **deliberately differs**
from what it replaces, so it is asserted as a difference rather than as parity:
`new InventionStructure({tax: "abc"}).tax` is `"abc"` and the folded class gives `0`.

There was no `InventionStructure` test file at all, which is why it survived — `reprocessing.test.js`
has had the equivalent coercion test since it was written.

### Tax means one thing

**Tax is a percentage, never a fraction**, on every kind: `2.5` means 2.5%, and a consumer divides by
100 where it costs something. That was already what the code did — `installCosts.js` divides by 100,
the form collects through `TaxPercentageTextField`, and the settings screen prints `${tax}%` — but it
was nowhere stated, and **every JSDoc block said the opposite**: `Tax rate (0-1)` in
`customStructure.js`, `reprocessingStructure.js` and `jobSetup.js` describes a fraction nothing has
ever stored. Those are corrected, because JSDoc is the SPA's only type surface and a wrong annotation
is worse than none.

`Functions/Helper/coerceTaxPercentage.js` owns the rule so it is applied identically rather than
restated per class. It settles the figure the way `coerceFiniteNumber` does and **clamps a negative to
zero**: a structure charges or it does not, and a negative would pay a job to run. None of the three
classes clamped, so all three would store one — that is the second place the fold deliberately
differs from what it replaces, and it is asserted as a difference.

The figure is not rescaled anywhere on the way in or out, so a stored row always holds the number the
reader typed.

### Rigs became slots on every kind

Manufacturing and reaction held **one combined `rigType`** where reprocessing and invention hold two
slots. That was not a difference in the mechanics: invention rigs carry `cost` and `time` as two
independent axes, structurally the same as manufacturing's `material` and `time`, and invention was
already modelled with slots. The two models existed for one shape.

The old manufacturing table held ten entries, of which five were **pre-combined pairs** — `T1 - ME &
TE`, `T1 - ME, T2 - TE` and the rest — one id standing for what two fitted rigs do together. The
tables now hold one rig per entry:

| Kind | Entries | Axes |
|------|---------|------|
| Manufacturing | None, T1/T2 ME - All, T1/T2 TE - All, Faction - ME - All | `material`, `time` |
| Reaction | None, T1/T2 ME - All, T1/T2 TE - All | `material`, `time` |

`relatedTo` carries over from the reprocessing and invention tables, naming the rigs that compete for
the same purpose so a slot cannot hold two of them.

**Faction stays whole.** At `material: 3.7` it beats any T2 ME rig, so it never decomposed into two
rigs — it is one rig that moves both axes, and a slot holds it as it is.

`fieldsByJobType` therefore loses `rigType` entirely: every kind has `rigSlots`, and only `implant`
and `systemID` remain optional.

### How two rigs combine

`Functions/Helper/rigSlotBonuses.js` owns the rule: **each axis takes the better of the two slots,
independently**. The slots are not ranked against each other, because a rig that cuts build time must
not cost the material bonus of the rig beside it.

It returns an object rather than a number, which is why `Structure` gained a `rigBonuses` getter. A
caller reads the axis it prices with, and a rig that does nothing for that axis reads as zero rather
than as the absence of a rig.

`rigBonusFor(itemType)` stays for reprocessing, whose rigs are the one kind whose value depends on
what is being worked on — it asks each rig whether it `appliesTo` the item before taking the better.

**What proves the conversion** is that the two slots reproduce what each combined entry gave. All
eight combinations are asserted for manufacturing and reaction, against the exact `material` and
`time` the old id carried. Mutation-checked: ranking the rigs instead of taking each axis — the most
plausible wrong rule — fails six tests including every combination case.

### What a rig applies to, and what is not known

A real manufacturing rig helps **one family of items** — ships, modules, drones — the way a
reprocessing rig helps one kind of ore. Reprocessing already models this with `appliesTo`, and carries
both specific entries (`T1 - Ore`) and generic ones (`T1 - All`).

The manufacturing and reaction tables cannot say which family a rig helped, because **the stored data
never recorded it**. A setup named its rig by a combined id — `5`, meaning "T1 - ME & TE" — and that
id carried one bonus with no item scope. So the conversion produces the *generic* rigs, which is the
one thing actually known: the labels are now `T1 - ME - All`, `T2 - TE - All`, `Faction - ME - All`,
matching reprocessing's "All" naming, and each entry carries **`appliesToAll: true`**.

`rigSlotBonuses` counts **only** rigs carrying that flag. A rig that names a family instead is skipped
rather than counted for items it does not help, because reading it needs to know what is being built
and the helper does not. Invention's rigs carry the flag too — cost and time optimisation apply to any
invention job.

That guard is what makes the later work safe: when item-specific rigs land, an unflagged rig cannot
silently apply to everything. It is tested by putting a specific rig into the real table for the
length of one test, because nothing in the tree carries one yet — a stand-in table would pass even if
the helper ignored the flag, and the mutation confirms it.

**Reading a rig against what is being built is a separate piece of work** and is not attempted here.
It needs an item-family vocabulary for manufacturing, which does not exist — there is no counterpart
to `reprocessingItemTypes`. This stage leaves the model able to express it.

### The prerelease step that converts stored setups

`foldRigSlots` in `core/commands/release_rig_slots.go` rewrites every stored setup that names its rig
by a combined id, registered in the `0.9.0` release as **"fold rig slots onto every setup"**.

Without it a stored setup is silently wrong rather than broken: the rig tables no longer hold ids 5-8,
so `getRigInfoFromID` finds nothing and both the material and time bonuses read zero. A job just costs
more than it should.

**The conversion is a fixed table**, and manufacturing and reaction shared these ids entry for entry,
so one table serves both and the step never asks which kind a setup is:

| Stored `rigID` | Becomes |
|----------------|---------|
| 0 | 0, 0 |
| 1-4 (already one rig) | itself, 0 |
| 5 T1 ME & TE | 1, 3 |
| 6 T2 ME & TE | 2, 4 |
| 7 T1 ME, T2 TE | 1, 4 |
| 8 T2 ME, T1 TE | 2, 3 |
| 9 Faction | 9, 0 |

**Four collections, two shapes.** `job_documents`, `jobs` and `archived_jobs` hold setups as a map at
`build.setup`; `group_template_payloads` holds them as an array at `jobs[].presetSetups`. A template
left naming a combined id would point at a rig the tables no longer hold, which is why it is in scope
— it is easy to miss, because the job reshape does not touch it.

`group_template_payloads` was **not in the release's copy** and is added to it. Nothing may be written
that a revert cannot put back, and `TestTheRigFoldsCollectionsAreBackedUp` checks that rather than
trusting it.

Two decisions inside it:

- **Raw documents, not decoded models.** A job document holds more shapes than one release's model
  knows about, and decoding would rewrite fields this step has no business touching. It walks
  `bson.M` the way the job reshape does.
- **`$set` on the field holding the setups only**, for the same reason the structure fold does: these
  documents are edited by their owner while a release runs against a live stack.

A setup already carrying `rigSlot1` is skipped, which is what makes the step safe to re-run and safe
to run late. An id the table does not know about is **left as it is** rather than guessed at.

**What proves it.** `TestEveryStoredRigIDKeepsItsBonuses` recomputes each pair under the per-axis
best-of-two rule the SPA reads them back with, against the exact `material` and `time` the combined
id carried — so the table cannot drift from the class. Mutation-checked: mapping id 7 to the wrong
pair fails with the figures named, and dropping template payloads fails the coverage test. The live
test converts both document shapes against real Mongo and is mutation-checked for the dry run writing
and for the template walk being skipped.

### The prerelease step that converts stored structures

`foldStructureRigSlots` in `core/commands/release_structure_rig_slots.go` rewrites every saved
structure that names its rig by a combined id, registered in the `0.9.0` release as **"fold rig slots
onto every saved structure"**. It reuses `rigSlotsByStoredID` — the same table the setup fold walks,
above — because manufacturing and reaction structures chose from the same list a setup did.

**This one destroys data rather than only misreading it**, which is what separates it from the setup
fold. An unconverted structure reads back with no rigs, so every material and time bonus it gives is
zero; and `Structure.toDocument()` then writes `rigSlot1: 0, rigSlot2: 0` where the `rigType` was, so
the reader's next save of that structure overwrites the only copy. Each row is recoverable until its
owner touches it. `models.CustomStructure.RigType` is therefore kept, unread, until the step has run
everywhere — it is the source the conversion reads, not a leftover.

**It runs after the lane fold**, which is what makes it correct rather than merely tidy: it reads the
structures as one array, and a document still holding the four keyed lists is one that fold could not
move.

**Three things independently keep a keyed-list document safe** — the query filter, the type assertion
on the structures field, and `bson` decoding such a document as `bson.M` rather than `bson.A`. This
was measured rather than assumed: removing the filter, weakening the assertion, and removing both in
turn each left the live test passing, because any one of the three suffices. The filter is there to
avoid reading documents the step can never convert, not to protect them. The live test asserts the
outcome — the lists arrive untouched — so it holds whichever of the three a later change leaves.

A structure already carrying `rigSlot1` is skipped, and a stale `rigType` beside slots is **dropped**
rather than kept as a second answer to the same question. An id the table does not know about is left
as it is.

**What proves it.** The live test seeds one structure per case — a combined id, a single-rig faction
id, a structure naming no rig, and a reprocessing structure already holding slots — and reads what
Mongo holds as raw BSON rather than through `models.CustomStructures`, which does not name `rigType`
and so cannot tell a converted row from one the step never reached. Mutation-checked: writing a zero
into either slot fails with the figures named, and swapping the pair fails. Re-running finds nothing.

### The store slices hold one array

Both settings slices now hold `customStructures` as one array of `Structure`, and both read **either**
stored shape through `Functions/Helper/customStructuresFromServer.js`. One helper, because the account
slice and the planner slice were carrying the same four-lane builder twice.

That closes a failure that was **silent**: `typeof [] === "object"` is true, so an incoming array took
the four-lane branch, every lane read `undefined`, and all four became empty with no error. Proved
with a probe rather than read. Since settings autosave, the emptied state would have been written
back — data loss rather than a display fault.

Reading both shapes is what makes the SPA and the prerelease step independent: a browser meeting a
document the step has not reached yet still reads it.

**A row keeps a kind it names, and a stored zero means unnamed** — the same reading the server's fold
takes, so the two sides cannot disagree. That is not a spread with a default under it: `{ jobType:
lane, ...row }` would let a stored `0` override the lane, which a probe caught before it shipped.

### What the four actions had to learn

`Zustand/applicationSettings/structures.js` lost its id-prefix parsing entirely — a row carries its
own `jobType`, so nothing has to recover one from the id's prefix, and `getCustomStructureWithID` is
now a single `find` rather than a prefix scan, a map lookup and a search within one list.

The two that needed care are the ones where the list was doing the scoping:

- **`setDefaultCustomStructure`** clears the flag only on structures **of the same kind**. One list
  holds every kind now, so an unscoped sweep would clear the defaults of kinds the reader never
  touched.
- **`deleteCustomStructure`** promotes the first survivor **of that kind**, not whatever sits at the
  front of the whole list.
- **`addCustomStructure`** decides "first of its kind" by asking whether any structure of that
  `jobType` exists, rather than by the list being empty.

### A dead writer, removed

`applicationSettings`'s legacy `toDocument` action is deleted. It wrote a Firebase-era shape — a
`structures` key holding three lists and no invention — and **nothing called it**. Converting it would
have carried a fourth copy of the lane shape forward for no reader.

### The three classes are gone

`customStructure.js`, `reprocessingStructure.js` and `inventionStructure.js` are **deleted**, along
with `customStructure.test.js`. Every caller builds `Structure` instead: the two remaining settings
forms, the reprocessing panel and its reducer, and `reprocessingItem`'s default parameter.

A bare construction passes the kind — `new Structure(undefined, jobTypes.reprocessing)` — where the
old classes hard-coded it; one rebuilding an existing structure reads the kind off the row.

`structure.test.js`'s parity suite went with them. It existed to prove the fold matched what it
replaced while both were in the tree, and a comparison against a deleted class is not a test. What
survives is the behaviour asserted directly: every kind's fields, the round trip, reprocessing's two
calculations, and the tax and rig rules.

### Still to do

*Nothing outstanding in Stages A to C and BR.* Stage D has landed its model and owes its surfaces —
see its section below. Stage BR2 remains and is not scheduled here — see [plan.md](./plan.md).

### The surfaces that write a rig

The manufacturing and reaction form renders **two slot pickers** where it rendered one rig picker, and
a setup stores `rigSlot1` and `rigSlot2` where it stored one `rigID`. That closes the half the
prerelease step could not: the form was still writing a shape the rig tables can no longer read.

`useRigSlots` holds the rule that two rigs competing for the same purpose cannot both be fitted — a
conflicting choice clears that slot and marks it, rather than keeping the old value silently. The
reprocessing and invention forms carried that logic twice each; rather than add a third and fourth
copy, it moved into one hook beside them.

`jobSetup` reads its bonuses through `rigSlotBonuses` like everything else. The two time modifiers
now take **the time bonus** rather than a rig id, so the per-axis rule is applied in one place instead
of each of them looking a rig up for itself. `rigSlotLabel` formats the pair for the two setup cards
that print it: both rigs, or the one fitted, and "None" only when neither is — an empty slot is left
unsaid rather than printed beside a rig.

**A requirement names one rig**, so it fills the first slot and clears the second. A requirement
describes a whole fit rather than adding to what the reader chose, and requirements 0 and 2 mean "no
rig", which is now two empty slots.

**The calculation paths read the slots, not the getter.** `calculateTimeForSetup` and
`calculateMaterialsForSetup` call `rigSlotBonuses` directly rather than `setup.rigBonuses`, because a
caller may hand them a plain stored setup rather than a `Setup` instance — which is exactly what the
skills panel does, and what a getter would have thrown on.

**What proves it**: the form refusing a competing rig and accepting one that does something else,
mutation-checked by removing the conflict check. The combination-equivalence tests from the stored
conversion still hold, so the form and the prerelease table agree.

## Stage C — The surfaces

**Landed.** No screen names a lane.

### What a screen reads

A surface wanting one kind now reads the whole array and filters on `jobType`. Two did the naming:
`currentStructures.jsx`, which lists a kind in settings, and `Styled Components/Select/customStructure.jsx`,
the picker a job setup chooses through.

Both had gone **silently empty** the moment the store became an array — `array["manufacturing"]` is
`undefined`, and each had a `?? []` under it — so every list rendered blank rather than failing. That
is the same shape of fault as the hydration one, and it is why these landed with Stage B rather than
after it.

The filter runs in the component under `useMemo` rather than inside the store selector: a selector
returning a fresh array every call would wake its subscriber on every unrelated store change.

`customStructureMap` survives as the one thing it is still needed for — reading a document that stores
the four lists, inside `customStructuresFromServer`. Nothing else names a lane.

### The login path

`getSystemIndexDataFromUserStructures` prefetches the system indexes a job's install cost is read
against. It read `cs.manufacturing` and `cs.reaction` directly, so it too went quietly empty: no
indexes fetched, and every install cost read against index zero.

It now reads through `customStructuresFromServer` like every other consumer, and takes the structures
that carry a `systemID` — which is the same set, because only manufacturing and reaction have one.
The shim in `runPostLoginAccountSync.js` that rebuilt a two-lane object purely to feed it is gone; it
passes the array as the store holds it.

### What proves it

`currentStructures.test.jsx` gained a case seeding **two kinds and expecting one**, and the picker —
which had no test at all, despite being how a structure reaches a job setup — gained a file covering
the same, plus the orphaned-reference path and a structure of another kind reading as missing.

Both were mutation-checked by removing the filter. Worth recording: the first mutation run against
the picker **passed**, because the string being replaced had been reformatted across lines and the
replacement silently did nothing. A mutation that changes no bytes proves nothing, and the only way to
tell is to assert the edit applied.

## Stage D — The kind that is a market

**The model landed; nothing reads it yet.** A saved location can be expressed as either kind and
stored, and no surface offers one — the form, `saleLocations.js` and the two faults that stage owns
are still to come.

### The two kinds, and what each carries

A place a price is asked for is either an NPC station or a player citadel. Both are a kind and a row
in `fieldsByJobType`, which is what the model was built to make possible: no class, no list, no lane.

| | NPC station | Player citadel |
|---|---|---|
| Inside its region | `stationID` | `structureID` |
| Broker fee | derived from the seller | `brokerFee` |
| Reading its book | public | `characterHash` |
| System index | — | `systemID` |

Both carry `regionID`, and both carry the `id`, `name` and `default` every row has.

**Both name a region** because a price is asked for per region and then narrowed to one location, and
because price history is region-scoped — ESI publishes no per-station or per-structure history.

**Only a citadel stores a broker fee.** Its owner sets the rate and nothing can derive it. An NPC
station's comes from the seller's skills and standings, so a stored number there would stand in for
that derivation and quote the untrained rate without saying so. `TestAMarketStructuresFieldsReachTheDocument`
asserts a station stores neither a fee nor an access character.

**Only a citadel names a system**, because the installation-cost calculation asks a location for its
system index. It is a market that sits in a system rather than a place to build, so it has no entry
in `jobTypeMapping` and no install cost of its own.

**The access character is stored and not yet read.** SPA market reads are public and unauthenticated,
and no `/markets/structures/` call exists; the field is what lets that fetch be built.

### A market is a kind of structure, not a kind of job

`jobTypes` answers what work a character is performing. A market is a place, so the kinds a saved
structure can be are drawn from **`structureKinds`** instead — the four build kinds at the values
they have always had, and the market kinds continuing past them so a stored row is unambiguous.
`models` has the same split: `StructureKindNPCStation` and `StructureKindCitadelMarket` sit beside
the job types rather than among them, and `jobTypeNames` no longer names a market.

**The stored field is still `jobType`.** Renaming it would migrate every structure document in both
settings collections for a naming improvement; the class says why the name is what it is instead.

### The three build fields stopped being shared

`systemType`, `structureType` and `tax` were written by every kind. They are a place a job is
performed in: a security modifier, a structure type carrying bonuses, and an installation tax. They
read as shared only because every kind was a build kind, and they now sit behind `built` in the field
map — gating the constructor and `toDocument` alike, so an instance holds exactly what it stores. A
kind with no entry in the map carries none of them.

### A sale location is an NPC station or a citadel

`SALE_LOCATION_KIND` was `HUB` and `STRUCTURE`. Neither word survived a reader saving their own
market: the four markets this server prices **are** NPC stations, so one a reader saved and one the
server walks are the same kind of place and differ only in who fetched the book — yet a saved NPC
station resolved as `HUB`, which reads like a defect and is not.

The kinds are `NPC_STATION` and `CITADEL`, which is what a player calls them and what the fee rule
turns on. `priceHubID`/`priceHubName` became `pricedAtID`/`pricedAtName` for the same reason: the
field is the market the figures are priced against, and a citadel is not a hub.

**The store owns reading a saved structure.** `getSaleStructures` and `getDefaultSaleStructure`
reimplemented `getCustomStructureWithID` and `getDefaultCustomStructureWithJobType`, including a
second copy of the flagged-default-else-first rule. They call the store. `getSaleCitadels` remains
because the picker lists them, and it is a filter rather than a second rule.

`saleLocationFromCitadel` no longer looks a market up per citadel: nothing can read a citadel's book
yet, so they all price against the same default market and a per-row lookup implied a choice that
does not exist.

**The test harness uses the real actions.** `usersStoreHarness` builds `structureActions` against the
state a test arranged, the way it already does for the planner's actions — rather than stubbing its
own filter, which could answer differently from the store and prove the wrong rule. They are defaults
rather than opt-in because a component reaches them through a plain function, and a mock missing an
action throws rather than answering "none saved".

### Still to fill

The surface for saving one; what replaces the placeholder rows in `saleLocations.js` and how a saved
row reaches `allMarketSources()`; what becomes of `priceHub` once a location can be priced directly;
how a stored access character that no longer resolves is shown; and the two faults the stage owns —
the selling-rates cache key, and the Selling stage reading an account-wide citadel fee.

## Missing live SoT found on the way

*Nothing recorded yet.* Live documentation gaps discovered while working land here first and are
folded into the live topic docs on promote.
