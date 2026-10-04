# Solar systems (`Hooks/useSolarSystems.js`)

Live SoT for how the SPA reads what the game calls a solar system — its name and the security band
it is in — from the `SOLAR_SYSTEMS` static file:
[`Hooks/useSolarSystems.js`](../../../frontend/src/Hooks/useSolarSystems.js), reading through
[`Functions/Helper/getCachedData.js`](../../../frontend/src/Functions/Helper/getCachedData.js).
Links below are relative to this file's own folder once it lands under `frontend/static-data/`.

What a system's band is used for once a job setup names one — settling the setup's own security band
— is [../industry-facilities/bonuses.md](../industry-facilities/bonuses.md) § Choosing a system
settles the band.

## What the file holds

Each entry is `{ name, security }`, keyed by solar system id, where `security` is the band the system
is in — `hiSec`, `lowSec` or `nullSec`, the same three names the rig security maps and the system
tables already use. The band is read from the game's own security status, rounded to the figure the
game rounds it to, so a system at 0.45 is high security and one at 0.44 is low; anything at or below
0.0 is null, which is every wormhole system.

Only the two system ranges a job can run in are published — New Eden, `30000000`–`30999999`, and
wormhole space, `31000000`–`31999999`, from EVE's published id ranges.
Abyssal deadspace, the void systems and the internal test range hold no structures, so a job could
never run there, and are left out of the file entirely rather than carrying a band. A system id
outside every published range is not a place a picker can offer, whether or not it exists.

## Reading it

`useSolarSystems()` returns the whole table in one entry — a system's name and band never change and
the set is complete, so a caller reads the map and indexes it rather than asking for one id at a
time. `useSolarSystemName(id)` is the reader for a surface that only wants the name, falling back to
`UNKNOWN_SYSTEM_LABEL` for an id the table carries no entry for — the same fallback a system still
loading reads as, and what a setup naming a system the file no longer carries reads as too.

The hook is named for what it returns rather than for what most of its callers want: `useSolarSystems`
hands back a table of systems, not a table of names.

## Where every file lives

| Path | Holds |
|------|-------|
| `Hooks/useSolarSystems.js` | `useSolarSystems`, `useSolarSystemName`, `UNKNOWN_SYSTEM_LABEL` |
| `Functions/Helper/getCachedData.js` | `getSolarSystems`, the read beneath the hook |

## Topic-only detail

What a job setup's own security band is settled to once a system is chosen, and the function that
looks a band's matching system type up, are
[../industry-facilities/bonuses.md](../industry-facilities/bonuses.md) § Choosing a system settles
the band — this file owns the per-system table, not what a setup does with it.
