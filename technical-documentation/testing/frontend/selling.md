# Returns and selling test depth

What is covered for the Planning stage's Returns panel — the two ways out of a build, the broker fee
and sales tax taken off each, and the sale location the reader chooses.

## Where the depth is

| Covered | By |
|---|---|
| The panel itself — which route it leads with, both routes stated whichever leads, break-even per unit, headroom above it, and the working behind each figure | [`returnsPanel.test.jsx`](<../../../frontend/src/Components/Edit%20Job/Edit%20Job%20Components/Planning/Standard%20Layout/Returns/returnsPanel.test.jsx>) |
| Each route's own figures, margin and return on outlay, and saying nothing rather than a zero where a ratio has no answer | [`exitRoutes.test.jsx`](<../../../frontend/src/Components/Edit%20Job/Edit%20Job%20Components/Planning/Standard%20Layout/Returns/exitRoutes.test.jsx>) |
| The subtractions at a sale location — standings, a negative standing adding to the fee, an untrained or unreadable Accounting, and who is being quoted | [`saleLocationRates.test.jsx`](<../../../frontend/src/Components/Edit%20Job/Edit%20Job%20Components/Planning/Standard%20Layout/Returns/saleLocationRates.test.jsx>) |
| Choosing where a job sells — every saved citadel and hub offered, citadels kept apart from NPC stations, the account default as the option that writes nothing, and the way back onto it | [`saleLocationRates.test.jsx`](<../../../frontend/src/Components/Edit%20Job/Edit%20Job%20Components/Planning/Standard%20Layout/Returns/saleLocationRates.test.jsx>) |
| A citadel quoting one line and saying why there is no working, against a station showing every subtraction | [`saleLocationRates.test.jsx`](<../../../frontend/src/Components/Edit%20Job/Edit%20Job%20Components/Planning/Standard%20Layout/Returns/saleLocationRates.test.jsx>) |
| A standing or skill that could not be read saying so, rather than being folded into "untrained" or "no standing" | [`saleLocationRates.test.jsx`](<../../../frontend/src/Components/Edit%20Job/Edit%20Job%20Components/Planning/Standard%20Layout/Returns/saleLocationRates.test.jsx>) |
| An item with no market orders where it is being sold — why, no net return rather than a total loss, the headroom dropped, and the side that does hold orders still priced | [`returnsPanel.test.jsx`](<../../../frontend/src/Components/Edit%20Job/Edit%20Job%20Components/Planning/Standard%20Layout/Returns/returnsPanel.test.jsx>) |
| What a parent gets from this job building its output rather than buying it, and the spare output when it makes more than is owed | [`contributionPanel.test.jsx`](<../../../frontend/src/Components/Edit%20Job/Edit%20Job%20Components/Planning/Standard%20Layout/Returns/contributionPanel.test.jsx>) |
| What the job makes and what one unit is worth, leaving the hub to be named by the sale location block | [`outputHeader.test.jsx`](<../../../frontend/src/Components/Edit%20Job/Edit%20Job%20Components/Planning/Standard%20Layout/Returns/outputHeader.test.jsx>) |
| A station's broker fee end to end, from the ESI reads to the figure on screen | [`stationStandings.integration.test.jsx`](<../../../frontend/src/Components/Edit%20Job/Edit%20Job%20Components/Planning/Standard%20Layout/Returns/stationStandings.integration.test.jsx>) |

The behaviour itself is the Planning stage's; the market side of where a figure is priced from is
[frontend/pricing/defaults.md](../../frontend/pricing/defaults.md), and which character a fee is
quoted for belongs to the seller, not the build setup.

## Why one of these is an integration test

Every panel test above fakes one of the layers beneath it — the cached accessors, the rate hooks, or
the queries. **Standings have been reported wrong twice for reasons no test at that level could
see**: once a lookup keyed on the wrong id, and once a subscription that started for the wrong
character. Both sat underneath the faked layer, so every unit test on the path still passed.

`stationStandings.integration.test.jsx` is the answer to that. It fakes the ESI fetch and the token
behind it, and seeds the users store as its fixture input; everything between that and the screen is
real — the query layer, the enable gate and the rate arithmetic — so a figure on screen has been
through all of what decides it. A new fault in that path is worth an assertion here rather than
another mock one level up.

## What is not covered

Pending states are asserted for the shape they hold rather than for how long they hold it, so a rate
that never settles reads the same as one still on its way.
