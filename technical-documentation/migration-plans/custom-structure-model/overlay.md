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

**Landed.** One class serves every kind, the three it replaced are deleted, and every caller builds
it.

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

`Functions/Custom Structures/rigSlotBonuses.js` owns the rule: **each axis takes the better of the two slots,
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
stored shape through `Functions/Custom Structures/customStructuresFromServer.js`. One helper, because the account
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

### What this stage's sections describe

They describe the class while it was what the SPA held. Stage E replaced it with a row read and changed
by functions, and says what each caller does instead.

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

**Landed.** A reader saves a market through the one form, the store and `saleLocations.js` read it,
and the two faults this stage owns are closed. What a saved market is *priced* by belongs to
[market-price-delivery](../market-price-delivery/plan.md), which has built both reads: a station on the
server at its Stage G, a citadel in the browser at its Stage E. What a sale *from* a citadel is costed
against is still the default market's figures, and moving that is a Selling-stage decision named there
rather than a consequence of the read existing.

### One market kind, and what the place it holds decides

A place a price is asked for is one kind — `structureKinds.market` — and one row in
`fieldsByJobType`, which is what the model was built to make possible: no class, no list, no lane.

**Which sort of market it is was never a reader's to say.** An NPC station and a citadel are two
sorts of one thing, both named from the same location picker, and `resolveLocationKind` already told
them apart by the range an EVE location id falls in — in two places, before the picker asked. So the
picker offers **Market**, and the place a row holds says the rest:

| | Holding a `stationID` | Holding a `structureID` |
|---|---|---|
| What it is | an NPC station | a citadel |
| Broker fee | derived from the seller | `brokerFee`, stored |
| Reading its orders | public | a character with docking access |
| What the fee derives from | `raceID`, `ownerID` | — |

Every market carries `regionID`, and the `id`, `name` and `default` every row has. The fields that
follow from the place are asked for **once a place is named** — before that a market is asked only
where it is, because there is nothing yet to ask about.

**`setPlace` is one choice, not an accumulation.** Naming a place clears the other id and the fields
that followed from the place before it. A row holding both ids is a market of neither sort, and it
kept the last place's rate: a station carrying a citadel's fee, offered as somewhere to sell from.

**Both sorts name a region** because a price is asked for per region and then narrowed to one location, and
because price history is region-scoped — ESI publishes no per-station or per-structure history.

**Only a citadel stores a broker fee.** Its owner sets the rate and nothing can derive it. An NPC
station's comes from the seller's skills and standings, so a stored number there would stand in for
that derivation and quote the untrained rate without saying so.

**A market names no system.** An order book is read per region and narrowed to the location, so
nothing prices a market by its system, and a system is what an installation cost is derived from —
which a market does not have. It does not appear in `jobTypeMapping` for the same reason, and
`addCustomStructure` asks for a system index only from a kind whose field map names a system.

**A station stores what its fee derives from.** The race that built it names the faction a standing
is held against, and the owner is the corporation holding the other — the only two station fields
the rate reads. Both are fixed for the life of the station, and `getStationData` is a bare fetch with
no caching, so every quote was a round trip for two constants. Storing them is not storing the fee:
the rate is still derived per seller.

**A citadel stores nothing about which character reads it.** Its orders need a character with
docking access and nothing records who that is, so the answer is found by trying the account's
characters and remembered on the device beside that market's prices — not asked of the reader and
not kept on the row. [market-price-delivery](../market-price-delivery/plan.md) § Stage E owns that
read.

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
server walks are the same kind of place and differ only in who fetched the orders — yet a saved NPC
station resolved as `HUB`, which reads like a defect and is not.

The kinds are `NPC_STATION` and `CITADEL`, which is what a player calls them and what the fee rule
turns on. `priceHubID`/`priceHubName` became `pricedAtID`/`pricedAtName` for the same reason: the
field is the market the figures are priced against, and a citadel is not a hub.

**The store owns reading a saved structure.** `getSaleStructures` and `getDefaultSaleStructure`
reimplemented `getCustomStructureWithID` and `getDefaultCustomStructureWithJobType`, including a
second copy of the flagged-default-else-first rule. They call the store. `getSaleCitadels` remains
because the picker lists them, and it is a filter rather than a second rule.

`saleLocationFromCitadel` no longer looks a market up per citadel: nothing can read a citadel's
orders yet, so they all price against the same default market and a per-row lookup implied a choice
that
does not exist.

**The test harness uses the real actions.** `usersStoreHarness` builds `structureActions` against the
state a test arranged, the way it already does for the planner's actions — rather than stubbing its
own filter, which could answer differently from the store and prove the wrong rule. They are defaults
rather than opt-in because a component reaches them through a plain function, and a mock missing an
action throws rather than answering "none saved".

### One broker fee per citadel

A saved citadel's rate is a number the reader sets, and two things quoted it wrongly.

**The selling rates were cached against identity, not against the rate.** The key named the
location's kind, id and fee station, none of which move when a reader corrects what their citadel
charges, so the old figure was served back until the query fell out of cache. Inert while the rows
were placeholders nobody could edit; reachable the moment they became the reader's own. The key
carries `brokerFee` now.

**The two stages disagreed.** Planning quoted the rate recorded for the citadel while the Selling
stage read the account-wide `defaultCitadelBrokersFee`, so one sale showed two fees.
`calcSellingCharges` resolves the rate from the order itself — an order names where it was placed and
a saved citadel names the structure it is — falling back to the account figure for a citadel the
reader has not described. The rule sits with the function that applies it, so no call site has to
know which figure to pass and linking an order never depends on having saved where it sits.

Both were mutation-checked, and the cache test was written before the fix and watched to fail on the
stale rate.

### One form, driven by the field map

Three forms described the four build kinds and differed by one field each — a system, an implant,
nothing. `structureForm.jsx` renders a field when the kind carries it, reading the **same
`fieldsByJobType` the class reads** to decide what a row stores. The map that decides what is kept is
the map that decides what is asked for, so the two cannot disagree.

`structureFields.jsx` is the table: each field names what shows it, its wording, and the control.
Every control was already shared, and the market kinds needed nothing new — a place comes from
`useAssetLocations` through `VirtualisedLocationSearch`, and the seller pickers from
`AssignUsersSelect`, the picker that names a seller on the Returns panel.

The nine tests that covered the manufacturing form run against this one unchanged, which is what says
it still does what the three did. One assertion moved: it checked a `selectedJobType` argument
`addCustomStructure` never read, and reads the kind off the row instead.

**A rendered field is not a usable one.** The form calls a setter per field, and three had been
removed as dead code before the form that calls them existed — so choosing a market location threw. `structureForm.test.jsx` now asserts every field the form offers has the
setter its handler calls, because the field-map tests prove the right controls appear and say nothing
about whether they work.

### The kind picker offers every kind

`structureKindSelection.jsx` replaces `jobTypeSelection.jsx`: six radios from one table rather than
four written out, and a heading that no longer asks for a job type. Its test asserts the picker
offers as many kinds as `structureKinds` holds, so a kind the class carries fields for cannot be left
unreachable.

### A saved market knows where it is

A reader names a place and the rest is derived. `describeMarketLocation` walks
`/universe/stations/{id}` to a system, `/universe/systems/{id}` to a constellation, and
`/universe/constellations/{id}` to a region, and a station answers its `race_id` and `owner` on the
way past — the two fields the broker fee reads, fixed for the life of the station.

**It is asked when the place is chosen, not when something tries to price.** An order book is read
per region, so a market saved without one is offered in every picker and prices nothing: the row
looks complete and fails silently at the point a figure is wanted. A place whose chain could not be
walked reads as an error on the field rather than saving a row that cannot work.

A citadel is not asked for a station's fields — its owner sets a rate outright — and its region comes
from the system it sits in rather than from `/universe/structures/`, which needs the docking
character.

`structureForm.test.jsx` drives the picker and asserts what reaches the save, because the field-map
tests prove the right controls appear and the setter test proves they can be called; neither says a
value arrives.

### The two languages agree on what a kind is worth

A stored row's `jobType` is what both languages read to decide which fields it carries, and each
wrote its own copy of the values. A number changed on one side would have **misfiled every row of
that kind** — read back as another kind, with that kind's fields — rather than failing anywhere a
reader could see.

`testing/fixtures/structure-kinds/kinds.json` is what connects them, following the market-hub
fixture: Go owns it, `EIP_UPDATE_STRUCTURE_KINDS=1` regenerates it, and the SPA's
`Context/structureKinds.parity.test.js` reads it. Changing a value on either side fails — the Go test
says the committed list is stale and names the command, and the SPA test names the kind that
disagrees. A kind added to one side and not the other fails as a set mismatch.

Values are also asserted distinct, because two kinds sharing one makes a row of either
indistinguishable from the other.

### A saved structure needs a name

Nothing checked, for any kind. A nameless row saved and then appeared as an empty option in the
structure picker and the sale location picker, beside any other nameless row — a reader could not
pick the right one or tell they had picked wrong. The form refuses it, and refuses whitespace, which
is as hard to pick out as nothing.

Not filled in with a stand-in: only the reader knows which of their structures this is, and a row
called "Untitled structure" is the same problem one step later.

### What a saved market's card says

Where it is, its region, and what listing there costs. Which sort of market it is follows from the
place the row holds, so a station says its fee comes from the seller and a citadel says the rate its
owner set — neither is asked.

The card read one fee for both and got it wrong for half of them: the "set by your skills" wording
was reachable only while `brokerFee` was absent, and one market kind put the field on every row, so a
station printed `0%` as though it charged nothing.

Names come from `useLocationNames` and are described by `describeLocation`, the helper the asset
surfaces use, so a place that cannot be named reads as that rather than as a blank row.

## Stage E — A structure is plain data

**Landed.** `Classes/structure.js` is deleted. A structure is an ordinary object, and what the class
did is four functions in `Functions/Custom Structures/customStructure.js`: `structureFromDocument` reads one
from a stored row or builds one empty for a kind, `fieldsForKind` says which optional fields that kind
carries, `updateStructure` returns a structure with named fields changed, and `structureToDocument`
says what it stores.

### The Reprocessing page holds its own copy of the structure it opens with

`useReprocessingReducer` seeds `currentStructure` through `structureFromDocument(...)`, so the page starts
from a copy of the reader's saved default rather than from the stored row. The panel edits that copy in place as
it always has, and nothing it does reaches the settings store.

Before this, the seed took what `getDefaultCustomStructureWithJobType` returned, which is the row held in
`applicationSettings.customStructures` itself. Trying a different rig or structure type to compare yields
therefore rewrote the reader's saved structure: for the session always, and on disk whenever the same
visit also changed a reprocessing setting, because that panel schedules a settings save. Selecting a
structure from the page's dropdown was never affected — that path already copied.

The fallback for a reader who has saved none is unchanged: a blank reprocessing structure. It is now
expressed as the same construction rather than a second one behind `||`, because a copy of nothing is
what a blank structure is.

`useReprocessingReducer.test.js` covers all three: the copy, that editing it leaves the saved row alone,
and the blank fallback. Two of the three fail against the previous seed.

This seed was fixed before the rest of the stage, which then removed the aliasing everywhere else by
taking the class away — § What each caller does instead.

### What each caller does instead

| Caller | Then | Now |
|---|---|---|
| `customStructuresFromServer` | `new Structure(row)` | `structureFromDocument(row)` |
| `applicationSettings/core.js` | `customStructureRowToDocument`, a three-way instance/object/passthrough branch | `structureToDocument`, and the branch is gone |
| `applicationSettings/structures.js` | `setDefault` on rows inside `set` | rows mapped anew, so a flag change replaces the row it changes |
| `structureForm` | mutate then re-wrap to force a render | `updateStructure` through one `change` helper, applied functionally so two changes in one handler compose |
| `useRigSlots` | set a slot on the structure it was handed | returns the structure the slot moved on |
| `reprocessingStructurePanel` | nine mutate-and-re-wrap handlers | `updateStructure` per change |
| `reprocessingItem` | `structure.rigBonusFor` / `structureBonusFor` | the same two as functions |
| `addCustomStructure` | `structure.fields?.systemID` | `fieldsForKind(structure.jobType).systemID` |

**Reprocessing's two calculations are `Functions/Reprocessing/structureBonuses.js`.** They are
reprocessing's, as § What must not be lost has required since Stage B, and they are the only place a
structure's rigs are read against what is being worked on.

**`rigBonuses` is deleted rather than converted.** Nothing in production read it: the two callers that
want a rig's bonuses — `calculateMaterialsForSetup` and `calculateTimeForSetup` — call
`rigSlotBonuses` with the ids off a setup. Converting it would have produced a function with no
caller, so the parity cases it was tested through moved to `rigSlotBonuses.test.js`, which tests the
helper they actually use: the eight combined entries the two slots replaced, for manufacturing and
reaction, and the faction rig kept whole.

### The tests moved to where the code is

`Classes/structure.test.js` is gone, split three ways:
`Functions/Custom Structures/customStructure.test.js` (what a kind carries, ids, settling, the round trip, and
that a structure's own keys are exactly what it stores), `structureBonuses.test.js` (reprocessing's
two), and `rigSlotBonuses.test.js` (the rig parity above). The structure-only block in
`Classes/reprocessing.test.js` went with them rather than being kept as a second copy.

Two tests asserted the class by name and now state what the shape is instead: the settings read builds
plain rows settled for their kind, in both the account and the planner slice. One more was restated
rather than translated — the form's "has a setter on the class for each field a kind carries" guarded a
hazard that no longer exists, so it now checks that every field the form offers is one the kind's
document actually stores, which is the failure that remains.

### What a reader sees

Nothing new, which is the intent. A name is sanitised on the keystroke it was, tax settles on blur
through the same helper, the rig-conflict rule still clears and marks the slot it refuses, presets fill
the same fields, and a system that refuses a kind still refuses it.

The one change is that adding a structure announces itself once rather than twice — the form and
`addCustomStructure` both called `showSnackbarSuccess`, and the form's copy is gone. It has a test on
each side: that the function announces a save once, and that the form leaves the announcing to it.

**The comments in every file this stage touched came down to the two-line rule with it**, which is most
of the diff in `structureForm.jsx`, `structureForm.test.jsx` and `rigSlotBonuses.test.js`. Two doc
comments described the deleted class as what drops a field a kind does not carry; they name
`fieldsForKind` instead. A later pass over the whole area took the rest: the file headers on both
settings store slices, the in-body comments through them, the `@example` blocks in `getStructureInfo`,
and the comments in the area's tests.

**The area is off MUI Grid.** `structureForm`, `structureFields`, `structureKindSelection` and the
Reprocessing structure panel lay out with flex `Box` and the `calc(50% - 8px)` basis `currentStructures`
already used. `structureForm.test.jsx` had located a field by `.MuiGrid-root`, which is what made a
layout change break a behaviour test; it now walks up from the field's title to whatever holds the
control.

### One folder holds what a custom structure is

`Functions/Custom Structures/` is the home for the subject, named as the settings screen that edits one
already is. `Functions/Structure/` is gone, and the modules that **know something about a custom
structure** are in it: the settings read (`customStructuresFromServer`), the tables a structure's fields
index into (`getStructureInfo`, `rigs`), and what a job setup asks about the structure it references
(`customStructureSetup`).

**What the subject calls is not what the folder holds.** `coerceTaxPercentage` came in on the first pass
and went back to `Functions/Helper/`: clamping a number and reading a percentage out of what a text field
gave you is arithmetic, wanted by any rate, and it belongs beside the `coerceFiniteNumber` it is built on
rather than split from it. Being the folder's only caller today was the wrong test.

**`describeMarketLocation` moved the other way**, to `Functions/MarketOrders/`. It was in the structures
folder because Stage D put the market kind inside this model, and
[market-locations](../market-locations/contents.md) has since moved a saved market onto its own lane —
its only callers are that tab's form. A folder named for custom structures holding the market
locations' ESI walk would have been the old arrangement surviving its own reversal.

**Reprocessing's two calculations stay in `Functions/Reprocessing/`.** They are the only place a
structure's rigs are read against what is being worked on, which is reprocessing's question rather than
the structure's, and § What must not be lost has required that since Stage B. `coerceFiniteNumber` stays
in `Helper/` for the opposite reason: it is a numeric rule with consumers across the app, and only the
percentage rule on top of it belongs here.

### One file knows about rigs

`Functions/Custom Structures/rigs.js` is it. `rigSlotBonuses.js` and `rigSlotLabel.js` were two files
either side of the same subject — both read a rig out of its kind's table and answer something about the
pair of slots — and they are one module with named exports now: `getRigInfoFromID`, `rigSlotBonuses`,
`rigSlotLabel` and `rigsCompete`.

Two pieces of rig knowledge that lived elsewhere came with them.

- **Reading a rig from the table.** `getRigInfoFromID` was one of four lookups in `getStructureInfo.js`.
  It is here, and that file keeps the three that are not about rigs — a structure type, a system's
  security and an implant. Every caller that wanted a rig now asks the rigs file: the rig picker, the
  watchlist editor, reprocessing's bonuses and the material calculation.
- **Whether two rigs compete.** The predicate was inline in `Hooks/useRigSlots.js` — the same rig, or one
  that names the other in its `relatedTo`. It is `rigsCompete` here, so what a rig *is* stays with rigs
  and the hook holds only the slot state and the refusal it shows.

**What deliberately did not move.** Reprocessing's `rigBonusFor` stays in
`Functions/Reprocessing/structureBonuses.js`: it reads a rig against the ore, gas or ice being worked on,
which is reprocessing's question rather than the rig's, and § What must not be lost has required that
since Stage B. The rig tables stay in `Context/defaultValues.jsx` with every other table the SPA reads.
The two blueprint calculations keep composing their own figures from `rigSlotBonuses` — the material one
prefers a required rig where the time one does not, and that asymmetry is
[plan.md](./plan.md) § Stage BR3's to settle, not something to unify while moving files.

`rigs.test.js` is the merged suite plus the table read and `rigsCompete`. Three tests in
`Blueprint Calculations` were stubbing a rig read their subject never makes, left over from an older
shape; those stubs are gone.

### The rig-conflict rule has one home

`Hooks/useRigSlots.js` answers which slot takes which rig and which choice is refused, and its caller
applies the answer to whatever it is editing: `onChoose(slot, rigID)`. Three editors use it — the
settings form, the Reprocessing page's structure panel, and the watchlist options.

It holds the rule and nothing else on purpose. It was written against a custom structure row and called
`updateStructure` itself, which is why it could not serve a job setup: a setup's rig choice also has to
run `manageRequirements`, and a setup names its other fields differently.

**What it replaced.** The Reprocessing panel had its own inline copy, once per slot, and the reducer's
`rigSlotErrors` existed only to carry that copy's answer — both are gone, along with the
`SET_RIG_SLOT_ERRORS` action, because the hook holds the refusal beside the slot it belongs to. The two
copies had drifted in two ways a single rule settles. The panel read
`selectedEntry.relatedTo.includes(...)` where the hook reads `relatedTo?.includes(...)`; every rig in the
tables carries `relatedTo` today, so the unguarded read could not throw, but only one of the two would
have survived a rig entry without it. And the refusal said different things on each screen — "You cannot
have multiple rigs effecting the same material type." against the hook's "Cannot have the same rig or
related rigs in both slots". **The hook's wording is what both screens now say**, which is a change to
what a reader sees on the Reprocessing page: it is accurate for rigs competing on any axis rather than
only on material type, and it is spelled correctly.

**A watched item can be given both its rigs.** The watchlist options offered one `RigTypeSelect` bound
to `rigSlot1`, so `rigSlot2` could not be set or cleared by hand there at all — while `rigSlotBonuses`
counted it and the setup card printed it, so a reader who took a two-rig custom structure and then
edited by hand carried a rig they could not see, still moving their material and time. Both pickers go
through the hook now, and `Setup.updateRigSlot(slot, rig)` writes either slot. Slot 1 keeps the
requirement handling `updateRigID` always did; slot 2 writes the id only, because what a second rig's
requirement should do to a setup that already applied the first one's is a question nobody has answered.
`updateRigID` remains as the slot 1 call.

The rule is tested directly in `Hooks/useRigSlots.test.js` — taking a rig, refusing the same rig,
refusing a competing rig, clearing a slot, and naming the slot it was asked about.

### What a setup takes from a structure is written once

`setupFieldsFromCustomStructure` in `Functions/Custom Structures/customStructureSetup.js` is the one
mapping. `JobSetup.updateCustomStructureID` and `getDefaultStrutureForJobType` each carried their own
copy of the same seven fields, and they disagreed: the first defaulted both rig slots with `?? 0`, the
second passed them through, so a structure of a kind that carries no rig slots seeded a setup with
`undefined` slots through one path and `0` through the other. The guarded form is what the shared
mapping does.

`setupShowsManualStructureFields` also asks `setupHasOrphanedCustomStructure` rather than repeating the
"does the stored id still resolve" test, which is the only thing the two predicates ever differed
about — what to answer when no structure is chosen at all.

### One predicate answers whether a setup's structure is gone

`setupHasOrphanedCustomStructure` is what the watchlist row asks. It had asked
`!getCustomStructureWithID(item?.buildData?.customStructureID)` instead, and that action answers `null`
for an empty id — so a watched item built against **no** custom structure read as one whose structure had
been deleted, and every such row carried the warning triangle saying the structure used to calculate its
install costs was missing. A reader with no saved structure of that kind saw it on every row they had.

The predicate already drew the distinction the row needed: no id at all is not an orphan. Its test
covers all three states, and the middle one fails against the previous reading.

### One reading of whether a setup uses a saved structure

`setupShowsManualStructureFields` decides it everywhere a setup's structure is shown or edited. The
Planning setup card and the Purchasing info frame each branched on `customStructureID !== ""` instead,
which disagreed with it about a **deleted** structure: those two treated the reference as live and
printed "Missing Structure" in place of a name, while the Edit Setup panel and the watchlist treated it
as manual and showed the fields.

**What a deleted structure shows now:** the figures the job was built with — its structure type, both
rigs, security and system, which are still stored on the setup — plus a warning beside them saying the
structure has been deleted and that these are the values it was built with. Neither of the previous
readings did that: one hid the figures behind a label naming nothing, the other said nothing was wrong.
`Styled Components/Item/missingStructureNotice.jsx` is the one copy of that warning, and the
"Missing Structure" literal is gone from both frames — the custom-structure branch now only renders when
the structure resolves, so it has no missing case to name. The picker's own "(missing structure)" row
stays: a picker has to show *something* for a value it cannot name.

**It also took a crash out of reach.** Sending a deleted reference down the default-fields path meant
those fields had to survive ids the tables do not carry, and they did not — `structureTypeData.label`
and `systemTypeData.label` were read straight off a lookup that answers `null`. Both read as "Unknown"
now, which is the same rule the SPA already applies to a location it cannot name.

`tests/editJobFixtures.js` was describing a setup that cannot exist: no `systemTypeID`, no
`customStructureID`, and a `rigID` that Stage BR removed. It carries both rig slots, its kind's system
type and an empty structure reference, which is what a real stored setup holds. The setup card's own
figure is unchanged, the fixture charging no facility tax.

### What covers this work

Every module and surface the model owns has a test beside it, and the gaps an audit found are closed.

| What | Covered by |
|---|---|
| The shape, its kinds, settling and the round trip | `Functions/Custom Structures/customStructure.test.js` |
| The tables a structure's fields index into | `getStructureInfo.test.js` |
| Two rigs per axis, and the combinations the slots replaced | `rigSlotBonuses.test.js` |
| How a setup's rigs read on a card | `rigSlotLabel.test.js` |
| The tax percentage rule | `Functions/Helper/coerceTaxPercentage.test.js` |
| Reading either stored shape from the server | `customStructuresFromServer.test.js` |
| The system index a new structure asks for, and announcing a save once | `addCustomStructure.test.js` |
| Whether a setup's structure is gone, and what a setup takes from one | `customStructureSetup.test.js` |
| Reprocessing's two bonus calculations | `Functions/Reprocessing/structureBonuses.test.js` |
| The rig-conflict rule itself | `Hooks/useRigSlots.test.js` |
| Adding, defaulting and deleting a saved structure, and what the document carries | `Zustand/applicationSettings/structures.test.js` |
| A setup pointing at a saved structure, and fitting either rig slot | `Classes/jobSetupStructure.test.js` |
| The settings frame, the kind picker, the form, its field map and the saved list | the five tests beside them under `Components/Settings/Standard Layout/Custom Structures/` |
| The Reprocessing panel's rig slots, and the dropdown handing the page a copy | `Components/Reprocessing/reprocessingStructurePanel.test.jsx` |
| The page opening on a copy of the saved default | `Components/Reprocessing/Hooks/useReprocessingReducer.test.js` |
| A watched item's rigs, and the warning about a deleted structure | `watchlistOptions.test.jsx`, `ItemRow.test.jsx` |
| A deleted structure on a setup card | `jobSetupCard.test.jsx` |
| The stored shape, the decode-time fold, the accessors and the planner clone | `shared/models/custom_structures_test.go`, `shared/models/planner/planner_documents_test.go` |
| Each prerelease step, in unit form and against real Mongo | `release_custom_structures*`, `release_rig_slots*`, `release_structure_rig_slots*` |

**What the audit found missing**, now written: the store's three write actions had no test at all — the
rules they carry are first-of-kind default, a kind-scoped default sweep, and promoting a kind's own
first survivor when its default is deleted. Neither had `setupFieldsFromCustomStructure`, the one
mapping of what a setup takes from a structure, nor `Setup`'s two structure writers, nor the tables, nor
the field map, nor the Reprocessing panel. The store tests also join the two halves that had only been
tested apart: a structure added through the action is read back out of `toPersistPayload`, so what a
reader saves is checked against what the document carries.

### Handed to the panel redesigns

Two findings in this area are **deliberately not fixed here**, because the panels that carry them are
inside redesigns that will rewrite them from their data upwards, and a consolidation done first is work
that rewrite discards.

- **The duplicated structure display** — `UseCustomStructure` and `UseDefaultStructures` copied between
  `jobSetupCard.jsx` and `JobSetupInfoFrame.jsx`, identical but for the layout wrapper, and now
  carrying the deleted-structure notice twice over. Handed to
  [purchasing-stage-panels](../purchasing-stage-panels/plan.md) § Inherited from custom-structure-model.
- **The Edit Setup panel's single rig picker**, where a structure carries two slots and the second is
  counted in the figures but unreachable by hand. Handed to
  [planning-stage-panels](../planning-stage-panels/plan.md) § Inherited from custom-structure-model,
  with the pieces that close it named there.

Neither is a gap in this project's own model: one shape, one array, and one owner for each rule about a
custom structure all hold. They are the parts of the *screens* that outlive it.

### Still open in this stage's area

**A cross-kind structure reference reads two ways, and nothing can create one.**
`Styled Components/Select/customStructure.jsx` resolves a setup's stored id against the structures *of
that job's kind*, so a row of another kind would read as `(missing structure)`;
`getCustomStructureWithID` resolves across every kind, so `setupShowsManualStructureFields` would treat
the same reference as present and keep the manual fields hidden — neither a usable structure nor fields
to correct it.

Every path was checked and none reaches that state. Both pickers — the Edit Job setup panel and the
watchlist options — pass the setup's own `jobType`, so only ids of that kind are offered.
`setupFieldsFromCustomStructure` is fed by those pickers and by `getDefaultStrutureForJobType`, which
asks for the default *of a kind*. A job's kind comes from its recipe and nothing mutates it afterwards.
A group template carries `customStructureID` in its preset row, and its node carries the `itemID` the
job is rebuilt from, so the instantiated job has the kind the template was made from.

So the disagreement is real and unreachable. **What would make it reachable** is a setup being able to
point at a structure of another kind — a picker widened past one kind, or a template applied to a
different item — and that is the change that owes the decision about which reading is right.

**It is also what keeps a second defect unreachable, in another project's area.**
[job-document-drafts](../job-document-drafts/plan.md) records that `findFacilityTax`'s NPC-station
branch cannot fire, because `Setup` defaults `structureID` to `0` and the branch tests it against an
`undefined`. That default is not the whole guard: `setupFieldsFromCustomStructure` assigns
`structureID` straight from the structure, bypassing the constructor, so a setup referencing a structure
of a kind that carries no structure type would hold `structureID: undefined` — and `undefined ===
undefined` is what that branch tests, so it would fire and answer `NaN`. The kinds without a structure
type are the ones no setup can reference, which is the finding above. The two are one question.

## Missing live SoT found on the way

*Nothing recorded yet.* Live documentation gaps discovered while working land here first and are
folded into the live topic docs on promote.
