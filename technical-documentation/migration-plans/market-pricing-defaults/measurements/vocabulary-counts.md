# What the SPA actually calls a market and a basis

Measured to settle Stage N's direction, which the plan deferred to a survey of the whole SPA rather
than of this project's own modules.

**A snapshot at commit `df63b500e`, before any of Stage N's renaming.** Re-running these counts after
a slice has landed will not reproduce them, and should not: each slice moves occurrences out of one
row of this table and into another. Anyone checking these numbers has to check out that commit first.

Counted over `frontend/src/**/*.{js,jsx}` with whole-word matches, production and test files
separated because a name entrenched only in fixtures is a different problem from one entrenched in
the code.

| Name | Production | Test | Production files |
|------|-----------:|-----:|-----------------:|
| `market` | 462 | 362 | 130 |
| `basis` | 134 | 169 | 23 |
| `marketSelect` | 54 | 34 | 14 |
| `listingSelect` | 50 | 28 | 12 |
| `marketLocation` | 46 | 2 | 20 |
| `marketListing` | 36 | 0 | 14 |
| `marketDisplay` | 34 | 16 | 17 |
| `orderDisplay` | 32 | 13 | 17 |
| `orderType` | 1 | 0 | 1 |
| `priceHub` | 8 | 3 | 2 |

## What the counts say

**`market` and `basis` already dominate, and they are the stored names.** Between them they carry
more of the SPA than all four of the legacy layers combined, and they are what `PricingChoice` calls
its two fields on the Go side. Stage N is therefore not a choice between four equals — it is three
older layers collapsing onto a vocabulary that already exists, already has the most code behind it,
and already crosses the wire.

The bare-word counts are not a count of the pricing vocabulary. Whole-word matching excludes the
compounds — `market` does not catch `marketData` or `marketOrders` — but it does catch prose: every
JSDoc line and comment saying "market" or "basis" is in there alongside the identifiers. Treat them as
evidence about which word a reader of this tree already meets, not as a population of variables.

**`orderType` is already gone.** Its one remaining occurrence is `Classes/job.js` reading
`itemJson?.layout?.orderType`, the legacy stored field the `Job` constructor seeds a pre-split job
from. It retires with Stage A step 7 and needs nothing from Stage N.

**`marketListing` is wider than the Reprocessing reducer.** The plan recorded it as that reducer's own
state; it is also the name of a Select component and a prop threaded through Price Entry, the row
pricing override, the purchasing panel, first login and Settings. Fourteen production files, not one.

**`marketLocation` is the most scattered and the least tested** — 46 production occurrences across 20
files against 2 in tests, the widest ratio in the table. A rename there is the one least likely to be
caught by the suite, and the one most in need of reading rather than replacing.
