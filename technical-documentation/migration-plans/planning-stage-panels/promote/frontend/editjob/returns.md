# Returns (`Edit Job Components/Planning/Standard Layout/Returns`)

Live SoT for what a build returns by each way out of it. `ReturnsPanel` renders it and
`contributionPanel.jsx` replaces it where the output is committed to a parent job. Both draw from
`useJobEconomics.js`, shared with [cost-breakdown.md](./cost-breakdown.md); the broker fee and sales
tax figures the rate block states are [selling-charges.md](./selling-charges.md)'s.

## The headline and the routes

The panel leads with one route's net return, per-unit, margin and return-on-outlay figures on their
own inset surface — the route the account says its output leaves by,
`applicationSettings.defaultPricing.selling.exit`, which `useJobSellingContext` returns as `exitRoute`
and which defaults to listing. A player who sells into buy orders is led with that route, with no broker
fee in it, rather than with a listing's margin. Both exit routes are then stated at equal weight: listing a sell order, priced at the hub
sell price less fee and tax, and selling into buy orders, priced at the hub buy price less tax only.
Both are struck from the market as it stands now — the app does not model undercutting, order-book
position, or how long a listing sits. Each route names the price it was struck from and what comes
off it.

Break-even is stated with its **headroom** above today's price, rather than as a bare number: the
figure that matters is not the break-even price itself but how much room the market currently gives
above it. Net, per-unit, margin and return-on-outlay all carry their sign in colour only — the panel
states the relationships and no verdict.

The previous-build range and the ledger behind a disclosure are context rather than the headline; the
range bar is the same component [cost-breakdown.md](./cost-breakdown.md) uses.

## The sale location and its rates

The rate block renders inside Returns, naming the location, the character its rates are quoted for,
and the working behind the fee — see [selling-charges.md](./selling-charges.md). At an NPC station it
shows every subtraction, since they come from the player's own character and seeing them is what
makes the figure checkable; at a citadel it is one line and a sentence that Broker Relations does not
apply there, since the absence of working is itself the information. Where the location is a citadel,
the block says it is priced on that citadel's own orders.

The sale location and seller are **selects**, rendered here and writing to `build.saleLocationID` and
`build.sellerCharacter`. Clearing
either returns the job to the account's defaults. What that plan is for, and how it resolves for a
reader on a shared planner, is [selling-charges.md](./selling-charges.md)'s.

## Jobs with parent jobs

Output committed to a parent job is never priced as a sale — quoting a sale price for output that is
never listed would invite a reading of profit that does not exist. A job whose whole output is
committed shows **Contribution** in place of Returns: what that output costs the parents above it,
against the cost of buying the same amount at market instead — the same two figures the parent's own
Δ column compares, seen from the child's side.

A job with a **surplus** — producing more than its parents currently need — shows sale figures scoped
to the surplus only, with broker fee and sales tax charged on the surplus alone. The commitment is
allocated once across every job feeding a parent's requirement, so two children each overproducing do
not both report the same surplus.

## Layout

Stacked with its sibling panels, so it sets `AppShellPanel`'s `paperSx={{ height: "auto" }}` — see
[../technical-rules.md](../technical-rules.md) § Stacked panels.
