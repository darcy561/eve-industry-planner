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
| Manufacturing, reaction | `rigType`, `systemID` |
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

### Still to do

**Stage B** — the callers: the settings screens and the pickers still read a lane by name, which is
Stage C. **Stage BR** — the settings form's two slot pickers and `setup.rigID` becoming two fields, with the
`requirements` table naming which slots it sets. Until the form moves it keeps writing a `rigType` the
rig tables can no longer read, so the stored conversion above is only half the fix.
[plan.md](./plan.md) § Stage BR lists what is left.

## Stage C — The surfaces

*Nothing landed yet.*

Sections to fill: what a screen reads to list structures of one kind; what the reprocessing panel
reads; anything the one-card-body settings screens assumed about lanes that had to move with them.

## Stage D — The kind that is a market

*Nothing landed yet.*

Sections to fill: the kind and the fields it carries; what replaced the placeholder rows in
`saleLocations.js` and how a saved row reaches `allMarketSources()`; what became of `priceHub` once a
structure can be priced directly; the surface for saving one.

## Missing live SoT found on the way

*Nothing recorded yet.* Live documentation gaps discovered while working land here first and are
folded into the live topic docs on promote.
