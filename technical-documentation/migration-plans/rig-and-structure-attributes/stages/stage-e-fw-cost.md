# Stage E — A factional warfare system carries its cost effect

**Landed.** Behaviour: [overlay.md](../overlay.md) § Stage E.

**Depends on:** [Stage B](./stage-b-declared-constraints.md) for the enlistment the condition reads.
**Moves stored figures:** no. Additive.

## What the game does

A system its faction controls and has upgraded lowers the cost of industry **in its NPC stations** by
10% per upgrade level, to -50% at level 5. Contested state, advantage, frontline status and militia
membership carry no industry effect of their own.

It reduces the index-derived cost the way a structure's `cost` bonus does rather than changing the
index, and it lands exactly where a structure's own bonus is zero — so it is a new contributor to a
term [`installCosts.js`](../../../../frontend/src/Functions/Installation%20Costs/installCosts.js)
already has, not a new term.

Readings: [measurements.md](../measurements.md) § Factional warfare moves install cost.

## Steps

1. **Flag a system as factional warfare.** The flag rides beside that system's cost index in the
   per-system payload the server already delivers —
   [`Zustand/worldDataSlice/systemIndexes.js`](../../../../frontend/src/Zustand/worldDataSlice/systemIndexes.js),
   filled on login and on reconcile for the systems a reader's jobs touch. It is live data that moves
   with the war and ESI's `/fw/systems/` is the source, so it belongs with the index rather than in a
   table in the SPA.
2. **Store an upgrade level on the setup**, because nothing publishes it. ESI carries ownership,
   contested state and victory points but no level, so a reader-stated figure is the only honest
   option — the same position the facility tax is in.
3. **Show the control only when it can matter.** When a setup names a flagged system, it shows an
   upgrade-level dropdown beside the enlistment. Everywhere else, neither appears.
4. **Apply it in NPC stations only**, as a contributor to the facility modifier, and only when the
   character's enlisted faction matches the system's owner.

## The enlistment is one field, and it names a faction

The Fulcrum's surcharge reduction is for the pirate-enlisted; this discount is for the controlling
faction's own militia. A boolean cannot tell those apart, so the setup's enlistment (Stage B) records
**which faction**, not whether. The Fulcrum asks whether it is Angel Cartel or Guristas; this stage
asks whether it matches the system's owner. One field, two questions answered, and no second toggle
when a third conditional bonus turns up.

## Tests

- A flagged system showing the control, an unflagged one not.
- The discount applying in an NPC station and not in a player structure.
- The discount applying only when the enlisted faction matches the system's owner.
- Level 0 through 5 against the expected -10% per level.

## Done when

- A system carries its factional warfare flag from the payload that already carries its index.
- A setup in a flagged system can state an upgrade level, and the install cost reflects it.
- The discount is conditional on the enlisted faction matching the system's owner.
