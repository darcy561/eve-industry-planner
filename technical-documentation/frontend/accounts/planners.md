# Shared planner access (`Components/Accounts/PlannersPanel.jsx`)

Live SoT for what the Accounts page shows about the planners an account can work in. Links in this
file resolve relative to this file's own location once folded into live documentation. Page layout
is [page.md](./page.md).

## What the section shows

[`PlannersPanel`](../../../frontend/src/Components/Accounts/PlannersPanel.jsx) reads the same
listing the header's own planner switcher uses (`usePlannersQuery`) and draws one
[`EntityRow`](../components/rows.md) per planner the account may work in. **The switcher is
untouched** — choosing which planner to work in stays there; this section is for seeing and
managing them.

| The row says | Read from |
|--------------|-----------|
| The planner's name | `plannerDisplayName`, falling back to the owning corporation's name, or "My planner" for an account's own |
| What kind it is | the owner handle's kind — account, corporation, alliance, or a custom planner belonging to none of them |
| How the account got in | the join method, shown as **owner**, **invited**, **member** or **access list** |
| Which one is being worked in | matched against the switcher's active planner, so this section and the switcher never disagree |

A row wears its owner's own artwork — a corporation or alliance logo, or, for an account's own
planner, the character it signs in as (see [components/avatars.md](../components/avatars.md)). A
custom planner belongs to no EVE entity and wears no artwork at all, rather than falling back to the
reader's own picture standing in for somebody else's planner.

## Drawn, not wired

Only a custom planner's row menu carries anything. Inviting a character, seeing its members and
leaving are drawn there, disabled, each stating in the control itself what it is waiting on — an
invite API surface, an endpoint that lists a planner's members, and a revocation path, respectively.
A corporation- or alliance-backed planner, and an account's own planner, carry their status chips and
nothing else: access to those follows group membership rather than anything this page can change, so
there is nothing to draw a menu over. Leaving is never offered on a planner the account owns.

Creating a planner is not drawn at all — there is no creation endpoint for it yet, and a button for a
kind of planner the page cannot otherwise explain would read as a promise rather than a control.
