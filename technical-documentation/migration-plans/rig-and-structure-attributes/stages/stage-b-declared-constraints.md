# Stage B — A constraint is declared where it is read

**Depends on:** nothing, but ships with [Stage C](./stage-c-stop-storing.md), which removes the
machinery this replaces. **Moves stored figures:** no, but it remaps `systemTypeID`.

## What is wrong

The two remaining requirement entries are legality rules — what a reader may pick — and the app
expresses them as values to write rather than rules to enforce. `requirements[0]` (The Fulcrum) and
`requirements[2]` (NPC Station) both set `rigID: 0`, which is "this place takes no rigs" written as a
field assignment.

They are applied twice. `Setup.manageRequirements` fires from four updaters — `updateStructureID`,
`updateRigSlot` (slot 1 only), `updateSystemType` and `updateSystemID` — and stamps up to five fields
onto the stored setup. Then `calculateMaterialsForSetup` re-derives the same thing at calculation
time and **prefers** the requirement's `structureID` and `rigID` over the setup's own. They agree only
because the write path put them there.

The rule is also written twice in source: `Setup` holds one implementation and
[`structureForm.jsx`](../../../../frontend/src/Components/Settings/Standard%20Layout/Custom%20Structures/structureForm.jsx)
holds its own `applyRequirements` beside it, while
[`virtualisedSystemSearch.jsx`](../../../../frontend/src/Styled%20Components/autocomplete/virtualisedSystemSearch.jsx)
reads `systemStructureRequirements` to decide which systems a kind may be offered.

And removal does not remove. `Setup.removeRequirements` resets `appliedRequirementID` and leaves every
stamped field in place — see [measurements.md](../measurements.md) § `removeRequirements` undoes
nothing but the id. Saved setups already carry leftovers of requirements they no longer name.

## The shape

One declared list, keyed on the choice that triggers it:

```
{ label, when, forces, offers }
```

- **`when`** is a predicate over the setup — The Fulcrum fires on `structureID === 4` or
  `systemID === 30100000`, since today three separate pointers say the same thing.
- **`forces`** is what the rule fixes and what it therefore locks: a field a declaration forces cannot
  be changed out from under it, which is the hole today — nothing stops a reader choosing The Fulcrum
  and then changing the system.
- **`offers`** is what the pickers read, so the same declaration answers "is this legal" and "may I
  offer it".

`systemStructureRequirements` becomes a reverse index derived from that list rather than a second
table, which is what removes the duplicate implementation and the picker's direct read.

## Steps

1. **Write the declared list** in
   [`Context/defaultValues.jsx`](../../../../frontend/src/Context/defaultValues.jsx), replacing
   `requirements` and `systemStructureRequirements`. Two entries: The Fulcrum and NPC Station.
2. **Carry the tax as a declared value**, `0.25`, unchanged. Nothing published confirms it
   ([measurements.md](../measurements.md) § The Fulcrum's figures are published nowhere
   machine-readable), and the point of moving it is that it then lives in one place and can be
   switched out later without touching a stored document.
3. **Allow a value to depend on the enlisted faction.** The Fulcrum's SCC surcharge reduction applies
   only to a pirate-enlisted character, so a declaration may carry a value that holds for a named
   faction beside the one that holds otherwise. Declare it **against the axis it affects** — the
   surcharge — rather than folding it into `cost`, which is applied to the system-index portion and is
   its own open question.
4. **Keep the enlisted faction on the character, in the SPA.**
   [`Classes/character.js`](../../../../frontend/src/Classes/character.js) already fetches
   `GET /characters/{id}/` and keeps only `corporation_id`; keep `faction_id` from the same response.
   Nothing server-side acts on enlistment, so nothing server-side stores it — the affiliation lookup
   feeding session grants receives a faction and goes on ignoring it.
5. **Give the setup an enlistment override**, written only when it differs from the character's own
   faction, for a reader estimating rather than recording.
6. **Write the read-time selector** that evaluates the list against a setup and returns the values in
   force. It replaces `gatherRequirements`, `getObjectRequirements` and `getSystemIDRequirements`.
7. **Point every picker at it** — the structure select, the system-type select,
   `virtualisedSystemSearch` and both rig fields — so each offers only what is legal. Delete
   `structureForm.jsx`'s own `applyRequirements`.
8. **Fold Zarzakh out of the security bands.** `manSystem` returns to the three bands ESI names.
   Zarzakh's specialness is a legality rule and belongs in the list: the system forbids anchoring
   structures, so no rig can be fitted there, and with no rig the material formula's rig-and-system
   term is 1 whatever the band says — the band it maps to changes no figure.

## Rules for the pickers

**Filter, do not disable.** A greyed row carrying a reason teaches why a combination is illegal, but
nearly every illegal combination here is "this place takes no rigs", where a list of greyed-out rigs
is noise. The exception is the system search: a reader who knows Zarzakh exists needs to know why it
is missing, so that field says so in its helper text rather than offering a dead row.

**A value already chosen is always shown, even when it would no longer be offered.** Filtering decides
what a reader may pick next, never what their saved setup is allowed to say. A legacy rig, a structure
built as a workaround, or a field left behind by `removeRequirements` keeps displaying its real value
rather than rendering blank. Expect the leftovers to surface here first, and to look like a bug in the
new filter when they are old data being shown honestly.

## Tests

- The selector: each declaration firing on each of its triggers; a forced field refusing to change.
- Every picker offering only what is legal, and still showing a selected value that is not offered.
- The reverse index deriving from the list rather than being stated twice.
- An enlisted-conditional value resolving from the character, and from the override when set.

## Migration — none, as it turned out

`systemTypeID` is stored in both languages — [`job.go`](../../../../services/shared/models/job.go)
`JobSetup.SystemTypeID` and [`accountDocuments.go`](../../../../services/shared/models/accountDocuments.go)
`SystemType` on a custom structure — and dropping Zarzakh's band would have meant remapping every
stored `3` across both.

It was not dropped. Zarzakh stays in `manSystem` marked `legacy`, so it resolves, displays and reads
the same figure it always did, and no picker offers it. Nothing is remapped and no release step is
owed — see [measurements.md](../measurements.md) § What the stored-data questions came back as.

The one step this stage does owe is the Zarzakh **system id** a setup kept when it moved off The
Fulcrum, which is [Stage C](./stage-c-stop-storing.md)'s to carry.

## Done when

- One declared list, evaluated where it is read, drives both legality and what each picker offers.
- `requirements`, `systemStructureRequirements` and `structureForm.jsx`'s `applyRequirements` are gone.
- `manSystem` names three bands, and every stored `systemTypeID: 3` has been remapped.
- A setup's enlistment resolves from its character, with an override stored only when it differs.
