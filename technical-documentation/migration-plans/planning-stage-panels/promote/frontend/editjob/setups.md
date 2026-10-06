# Setups (`Edit Job Components/Planning/Standard Layout/Setups`)

Live SoT for the Planning stage's **Setups** panel: the setups a job is built from, the facility they
share, and the editor each one opens. How a setup's figures are calculated — materials, time, install
cost — is the job model's, not this panel's.

## The facility, said once

`Functions/Industry Facilities/setupFacility.js` compares every setup on what fixes where it builds:
the saved structure, structure size, security, system, both rig slots and facility tax, each as the
place settles it, so a field the place overrides (an NPC station's tax) never counts as a difference.
`sharedFacility` takes the facility most setups use — the earliest setup's on a tie — and says which
setups depart from it.

The line above the rows states that facility in words through `useFacilityWords`: the saved
structure's name, or its size where none is saved; then its size again only when a saved structure
names the facility, its security, rigs, tax and system; and the system's own cost index, which ignores
any index a setup types in for itself. Its counts are words through `numberWord`: "All three build at"
when every setup agrees, "Two of three build at" when one departs, and "Builds at" for a single setup. A
departing setup says on its own row only the fields it changes — "Builds in Rens instead", "Builds at
1% facility tax instead" — with its own index, the typed one where it has one. That line and the
deleted-structure notice are all a setup elsewhere gets. A saved structure that has since been deleted
is flagged wherever it is named.

The line states the facility; it is not a control. Nothing in the app edits every setup at once.

## The rows

One row per setup, never grouped, because each row is the object an edit writes to. The run count and
slots lead, then the character, ME and TE as the game shows them, and how long a slot takes; on the
right, the items the setup contributes and its install cost across its slots. A footer totals the
items and the install cost. Both install figures are `setupInstallCost`
(`Functions/Installation Costs/installCosts.js`), the one per-setup install cost, which
`sumSetupInstallCostEstimates` totals.

Each row is the shared `ExpandableRow`. A press anywhere on it, or on its chevron, opens its editor
under it and makes it the **selected** setup — `layout.setupToEdit`, the setup the stage's other panels
read; a press on its ✕ does neither, and pressing it again folds the editor away. Which editor is open
is the panel's own state, apart from the selection: one editor is open at a time, folding it away
leaves the selection where it was, and the selected row keeps the open-row tint (`openRowBackground`)
while its editor is shut, so the stage always shows which setup it is reading. On a phone the editor
opens as a bottom sheet titled by the setup, and the row's ✕ moves into it.

## The editor

Its fields are grouped as three decisions:

- **How much** — Runs, Job slots, and for manufacturing ME and TE, with a note giving the most runs
  the blueprint takes in one slot: "200 runs is the most this blueprint takes in one slot." (from
  `job.maxProductionLimit`).
- **Where** — the saved structure, and then either the facility asked field by field — size, security,
  Rig 1 and Rig 2 under the two-slot and conflict rules of `useRigSlots`, system and tax — or, when a
  saved structure answers it, its size, security, rigs, tax and system shown as facts. The militia
  fields appear where a militia holds the system. The system index sits last: *Use my own system index*
  and *Your system index (%)*, with a line saying where the figure comes from — "Off, the index for
  Rens is used — 4.12% right now. On, you type the figure the game shows you." or "On — 3.50%, as you
  typed it. Clearing the box goes back to the figure for Rens." A system with no index yet reads "not
  yet known" rather than 0%.
- **Who** — the character, with a note that their industry skills set the time a slot takes, naming
  it, and that the install cost is the same whoever runs it.

Every change is saved as it is made, through `applySetupChange`, which names the step.

## Adding and deleting

**Add setup** is the panel's header action; the new setup continues from the selected one, becomes the
selected one, and its editor opens. A muted ✕ on each row and *Delete this setup* in the editor remove
that setup with `deleteSetup`; on the last setup neither is drawn, since a job always builds from
something. Deleting the open setup folds its editor away, and deleting the selected one moves the
selection to the last setup left.
