# Skills (`Edit Job Components/Planning/Standard Layout/Skills Panel`)

Live SoT for what a build asks of a character. `SkillsPanel` models it as three groups rather than a
pass/fail list, since a skill can affect more than one and Industry usually appears in the first two.

| Group | Answers |
|-------|---------|
| **Required to build** | What must be trained for the job to run at all |
| **Shortens the job** | What reduces build time — no skill reduces build cost in ISK. Materials come from the blueprint's ME and the structure's rigs, and install cost is the system index over the job's value; skills only move time (`calculateTimeForSetup`) |
| **Affects selling cost** | Broker Relations and Accounting, which drive the fee and tax figures — see [selling-charges.md](./selling-charges.md) |

The selling group is read from the **seller's** skills, not the build character's —
`useJobSellingContext` resolves who that is, the same hook Returns and Cost Breakdown use — because
market skills live on whoever lists the order, routinely a different character from the one running
the job. At a citadel, Broker Relations is still listed but marked as not applying, since the rate is
the structure owner's rather than a reduction the seller earns; a skill silently vanishing from the
panel would read as a bug. Standings are named beside the skills on the station path, for the same
character, since they move the fee the same way.

Level pips replace a bare fraction, so a shortfall is visible as a shape before it is read as
arithmetic; a group header states how much of the requirement is met, and an impact row says what a
shortfall actually blocks. The pips and the row are the shared `Styled Components/Skills/SkillLevelPips.jsx`
and `SkillLevelRow.jsx`.

## What-if

Clicking a pip asks what that level would be worth; clicking the level already trained puts the
question back. The panel re-derives every dependent figure — job time, broker fee, sales tax, net
return, break-even — from the working the rates already came with, standings intact, rather than
re-fetching anything. A level being tried is drawn in the primary colour rather than success, since it
is not a state the character is in; the superseded figure stays struck through beside the one
replacing it, so the delta is read on one panel rather than diffed across two.

**Nothing is persisted.** The tried levels live in the panel's own component state and reach no
store, no document and no other panel — a player who returns later must never read a figure that was
never true.

No skill's time-to-level is stated: that depends on attributes and implants, neither of which the app
reads. Signed out, the panel states the *required* group from the job's own recipe with no levels
column, rather than hiding the panel entirely.

## Layout

Stacked with its sibling panels, so it sets `AppShellPanel`'s `paperSx={{ height: "auto" }}` — see
[../technical-rules.md](../technical-rules.md) § Stacked panels.
