# Frontend — industry facilities

## Owns (SoT)

What the game itself says about a rig, a structure and a system, under
[`frontend/src/Functions/Industry Facilities`](../../../frontend/src/Functions/Industry%20Facilities):
which items a rig or a structure helps and by how much, a rig's own security multipliers, where a job
may legally run and what that place fixes about a setup built there, and the militia a setup is costed
against for a place's or a system's conditional bonus.

## Does not own

- The reader's own saved structures — the shape a saved row is, the field map that decides what a kind
  carries, and the rig-conflict rule shared by every editor offering two rig slots →
  [../settings/custom-structures.md](../settings/custom-structures.md)
- The Reprocessing page's own structure panel → [../reprocessing/structure-panel.md](../reprocessing/structure-panel.md)
- A job setup's own stored shape, including `enlistedFaction` and `militiaUpgradeLevel` →
  job-document-drafts (not yet promoted)
- The Edit Job and Planning panels that display or edit a setup → planning-stage-panels,
  purchasing-stage-panels (not yet promoted)
- Which faction holds a system in factional warfare, and how that rides in beside a system's cost index
  → [../../backend/worker/system-indexes.md](../../backend/worker/system-indexes.md)
- A solar system's own name and which security band it is in → [../static-data/solar-systems.md](../static-data/solar-systems.md)
- Every other install-cost term besides the militia discount → not documented here

## Task map

| I need to… | Read |
|------------|------|
| Change a rig's security multipliers, or how two fitted rigs combine | [bonuses.md](./bonuses.md) § A rig's own security multipliers, § What a fitted rig gives |
| Change what the published bonus catalogue holds, or how a rig field reads it | [bonuses.md](./bonuses.md) § The published bonus catalogue |
| Change what a structure gives the item being built | [bonuses.md](./bonuses.md) § What a structure gives |
| Change the shared rig field, or which editors use it | [bonuses.md](./bonuses.md) § The rig field is one autocomplete everywhere |
| Understand why a generic rig still resolves and still applies to everything | [bonuses.md](./bonuses.md) § The generic rigs stay, and keep their old meaning |
| Change what a setup's stored figures are corrected against when its job opens | [bonuses.md](./bonuses.md) § A setup's stored figures are kept in step |
| Change where a job may run, or what a place fixes about a setup there | [constraints.md](./constraints.md) § A place is declared once, and read where it matters |
| Change what a picker offers, or why a system is missing from the search | [constraints.md](./constraints.md) § Driving what a picker offers |
| Change which militia a setup is costed against | [constraints.md](./constraints.md) § The militia a setup is costed against |
| Change the factional warfare install-cost discount | [constraints.md](./constraints.md) § A factional warfare system lowers install cost in its own NPC stations |
| Change which rigs are refused as a double bonus | [bonuses.md](./bonuses.md) § A structure may not carry the same bonus twice |
| Change what choosing a system settles a setup's band to | [bonuses.md](./bonuses.md) § Choosing a system settles the band |
