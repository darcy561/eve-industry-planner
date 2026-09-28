# Custom structures (`services/shared/models`, `services/core/commands`)

Live SoT for the stored shape of a player's custom structures — the four places a job is built in —
and the upgrade that keeps every settings document on that shape. What a saved market's row carries
instead, and the release steps that lifted it onto its own lane, is
[api/market-locations.md](../api/market-locations.md); what reads this shape client-side is
[frontend/settings/custom-structures.md](../../frontend/settings/custom-structures.md).

## The stored shape

`models.CustomStructure` (`shared/models/accountDocuments.go`) is one structure a player has
configured, of whatever kind. `JobType` says which — `JobTypeManufacturing`, `JobTypeReaction`,
`JobTypeInvention` or `JobTypeReprocessing` — and is what every field below is read against; a market
kind shares the same struct and the same `JobType` slot, and is
[api/market-locations.md](../api/market-locations.md)'s to describe.

| Field | Carries |
|-------|---------|
| `id`, `jobType`, `name`, `default` | Every kind |
| `systemType`, `structureType`, `tax` | Manufacturing, reaction, reprocessing, invention |
| `rigSlot1`, `rigSlot2` | Manufacturing, reaction, reprocessing, invention |
| `implant` | Reprocessing only |
| `systemID` | Manufacturing and reaction only |

**Adding a kind is a `JobType` value and the fields it needs, not another list.** Nothing here keys a
kind to a lane or a class; a row is self-describing through the field it already carries, and a kind
the field map does not recognise simply carries none of the optional fields.

`models.CustomStructures` is `[]CustomStructure` — a bare array rather than a wrapper struct, so
nothing pays an extra level of nesting for a sibling field that has never been wanted.

Three accessors read it without a caller having to know which kind a row is:

| Accessor | Answers |
|----------|---------|
| `OfJobType(jobType)` | Every row of one kind, in stored order |
| `DefaultOfJobType(jobType)` | The kind's default, else its first row, else `nil` |
| `WithID(id)` | The row with an id, of whatever kind, or `nil` |

## The fold, at decode

A row is not always stored under one array. `CustomStructures.UnmarshalBSON` reads either shape a
document may hold: the array, or four lists keyed `manufacturing` / `reaction` / `reprocessing` /
`invention`. The two are told apart by what BSON says the value is, not by a schema version, because
the document's own upgrader stamps an unversioned document current before any version test could fire
— a version test would miss exactly the documents that still need folding. A document holding no
structures at all stores `null`, which the fold reads as no rows rather than failing the decode.

A row read out of a keyed list is stamped with the kind that list held, **unless it already names its
own** — a row that says what it is is never relabelled by where it was found. Reading folds the shape
on every call and does not persist it; a settings document keeps whichever shape it was last written
in until a prerelease step converts it.

Both `ApplicationSettings` and the planner's `Settings` embed `CustomStructures`, so one fold serves
both documents. Today this shape lives on the account's own settings lane; a planner's settings
document carries a clone of it (`slices.Clone`, taken when the planner's settings are seeded from the
account that created it), but nothing reads a planner's own copy.

## Rigs are two slots, on every kind

A structure carries two independent rig slots rather than one combined rig id, on every kind that
carries rigs at all. `RigType` is still declared on `CustomStructure`, but nothing decodes it into a
row read through the current field map — it is kept **only** so the prerelease step below has
something to convert. **It cannot be removed until that step has run against every stored document**:
a structure's next save writes `rigSlot1: 0, rigSlot2: 0` over whatever `rigType` held, so the field is
the last surviving copy of a rig chosen before the two-slot shape, not a leftover with nothing left to
read.

## Prerelease steps

Three steps in `core/commands`, registered in order because each depends on what the one before it
left behind:

| Step | File | What it converts |
|------|------|-------------------|
| `foldCustomStructures` | `release_custom_structures.go` | Every settings document still storing the four keyed lists, into one array |
| `foldStructureRigSlots` | `release_structure_rig_slots.go` | A saved structure naming its rig by a combined id, into two slots |
| `foldRigSlots` | `release_rig_slots.go` | A stored job setup naming its rig by a combined id, into two slots |

`foldCustomStructures` runs over both `models.ApplicationSettings` and `planner.Settings`, selecting a
document by **not already being an array** rather than by holding the keyed lists — a `$type` test
for an array element matches a folded document too, since every row in it is one, so testing the
positive shape would reconvert the same documents on every run. It writes back only the
`customStructures` field with `$set`, because these documents are edited by their owner while a
release runs against a live stack, and a whole-document replace would take every other field back to
what it held when the step read it.

`foldStructureRigSlots` runs after the lane fold, because it reads the structures as one array and
would find nothing to do against a document still holding the four keyed lists. It shares the same
combined-id table a setup's own fold uses, because manufacturing and reaction structures chose their
rig from the same list a setup did. A structure already carrying `rigSlot1` is skipped, and an id the
table does not know is left as it is.

`foldRigSlots` converts stored job setups across `job_documents`, `jobs`, `archived_jobs` and
`group_template_payloads`, walking raw BSON documents rather than decoded models so it touches only
the field naming a rig.

## Wire compatibility

**Migrate-required.** The array shape is what both settings documents are read and written as; a
document still holding the four keyed lists is folded on every read until the prerelease step
converts it, so nothing is broken before that runs and nothing breaks if it runs late. No schema
version moves for either document — reading accepts either shape, so a version bump would gate
nothing the fold does not already handle.

**A stored setup's rig fields are additive until every structure and setup is converted.**
`rigSlot1` / `rigSlot2` are written beside whatever a legacy `rigID` held; the prerelease steps remove
the combined id once they have converted it, and the SPA deploys reading only the two slots.

## Where every file lives

| Path | Holds |
|------|-------|
| `shared/models/accountDocuments.go` | `JobTypeManufacturing` / `JobTypeReaction` / `JobTypeInvention` / `JobTypeReprocessing`, `CustomStructure`, `CustomStructures`, `OfJobType`, `DefaultOfJobType`, `WithID`, `UnmarshalBSON` |
| `shared/models/planner/settings.go` | The planner settings clone of `CustomStructures` |
| `core/commands/release_custom_structures.go` | `foldCustomStructures` |
| `core/commands/release_structure_rig_slots.go` | `foldStructureRigSlots` |
| `core/commands/release_rig_slots.go` | `foldRigSlots` |

## Topic-only detail

What a saved market's row carries, and the release steps that moved it onto its own lane →
[api/market-locations.md](../api/market-locations.md). What the SPA holds a structure as, the
per-kind field map, and the rig-conflict rule → [frontend/settings/custom-structures.md](../../frontend/settings/custom-structures.md).
