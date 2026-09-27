# Building stage panels — overlay

How the Building stage works **while this project is in flight**. Live docs remain the truth wherever
this file is silent; where it speaks, it wins for the in-flight work.

Each stage fills its section as it lands — what changed, and how that part works now. A section with
nothing under it means the stage has not landed and live behaviour is unchanged.

## Drawing a run

*Stage A. Landed.*

**One component draws a run, and one function says what a row is.** `industryRunCard.jsx` takes a row
and draws it; `industryRunList.jsx` holds the grid and decides what pressing a row means;
`runRows.js` builds the rows — `availableRunRows` from what ESI is offering, `linkedRunRows` from what
the job holds. The two differ only where their sources do: which field names the place, which names
the character, and whether there is an install cost to show. `availableJobs.jsx` and `linkedJobs.jsx`
are the two lists' containers and nothing else.

**One status vocabulary.** A run waiting to be collected reads `Ready for Delivery` in `info`; a run
still going is `Active` in `warning`, a collected one `Delivered` in `success`, and a stopped one
`Cancelled` in `error`. `Ready for Delivery` and `Delivered` were the two the tabs had disagreed
about, each using the other's colour for them; `Active` and `Cancelled` they had always drawn the
same way.

**A run says what it is through the selectors.** `Edit Job Hooks/linkedRunSelectors.js` answers for a
row whether or not it is a class instance, and it takes the moment from its caller, so a panel that
ticks a clock cannot have its bar and its words disagree. `LinkedESIJob` no longer carries its own
copies of those answers; the group job cards and both lists read the selectors, as does every reader
that used to ask the job class.

**Characters resolve once for the panel.** Each list subscribes to the account's characters and
resolves a run's owner while building its rows, rather than reading the store imperatively inside a
card `map`. An offered run whose installer the account cannot name is left out of the rows, and the
controls beside the list — whether *Link All* is offered, and whether it is refused for want of a slot
— count those same rows against the slots still free.

**Linking and unlinking happen when the card is pressed.** The row is then held on screen for the
length of its fade, and takes no further press while it goes. A reader who presses a card and closes
the job immediately keeps the change.

## Grouping a list

*Stage B. Not landed.*

## Progress and the schedule

*Stage C. Not landed.*

## Setups, slots and matching a run to one

*Stage D. Not landed.*

## What the game is offering

*Stage E. Not landed.*

## Narrowing the offers by owner

*Stage F. Not landed.*

## Which clock a timestamp is in

*Stage G. Not landed.*

## Mobile

*Stage H. Not landed.*
