# Planning stage panels — overlay

How the Planning stage works **while this project is in flight**. Live docs remain the truth wherever
this file is silent; where it speaks, it wins for the in-flight work.

Each stage fills its section as it lands — what changed, and how that part works now. A section with
nothing under it means the stage has not landed and live behaviour is unchanged.

## Settings — sale locations and their rates

*Stage A. Landed — no visible behaviour change.*

The broker fee rates are now `brokerFeeRates` in `defaultValues.jsx` — base, the Broker Relations,
faction and corporation coefficients, and the ISK floor — with the skill type ids beside them as
`marketSkillIDs`. The rate functions read both and hold no literal of their own, so the Selling stage
and the Planning stage work from one source. The fee produced is unchanged.

The sales tax rates are named too, as `salesTaxRates`, with Accounting's type id beside Broker
Relations'. Nothing reads them yet — no sales tax is calculated anywhere — but the figures are in the
tree so Stage B does not have to source them. Accounting reduces the base multiplicatively, unlike the
broker fee's subtracted coefficients.

Live behaviour otherwise stands: `ApplicationSettings` and `planner.Settings` carry one
`defaultCitadelBrokersFee` covering every citadel, and no sales tax is charged in any figure the app
shows.

The other half is a reading surface with no consumers yet. `Functions/MarketOrders/saleLocations.js`
answers which citadels can be sold from and normalises a hub or a citadel into one shape carrying its
name, the station whose prices apply, and its broker fee — `null` at a hub, where the rate derives from
the seller. It returns two placeholder citadels: nothing is stored, and no screen reads it yet.

**Storing saved citadels left this project.** The `CustomStructures` lane and everything around it went
to the custom-structure work; see the plan's § Handed to the custom-structure work.

## Estimating what it costs to sell

*Stage B. Landed — no visible behaviour change.*

`Functions/MarketOrders/sellingRates.js` answers what a sale costs. Each charge has a **working** —
`brokerFeeWorking` and `salesTaxWorking`, which give the rate along with what it is made of — and an
**amount**, `brokerFeeAmount` and `salesTaxAmount`. The fee branches on the sale location, derived from
Broker Relations and standings at a station and taken as given at a citadel, while the tax takes no
location at all, since it has no station or structure component. Signed out, both fall back to the base
rate with no reduction.

`calcSellingCharges` is a call to those functions plus the location branch a real order needs, so the
Selling stage and the Planning stage work from one formula. It answers with **both** charges, because
both are worked out from the same character at the same moment and an order is linked once. The fee it
produces is unchanged.

The two charges are not the same kind of figure. A broker fee has to be calculated and stored: listing
several orders at once bills them in one journal entry, so no per-order figure exists to read. Sales
tax does have a real source — EVE charges it on the sale and the transaction carries what was actually
taken — so the figure stored on the fee row is an **estimate**, standing only until the order sells.
It is shown as *Estimated Tax On Unsold Orders*, apart from the charged totals, and it never reaches
what a job cost: `totalTransactionFees` is the charged figure, and counting both would take the same
sale twice.

### Both stages gather the figures the same way

`sellingRates` reads skills and standings through cached accessors that never start a fetch, so
something has to subscribe first. `Hooks/React Query/Character/useSellingRateInputs.js` is that
something for both stages: Planning subscribes for its one seller, and the Selling stage for every
character holding an order on the job.

Subscribing is not enough for a figure that gets stored. The orders offered for linking come from every
character on the account, including ones no panel has asked about, and both charges are worked out once
at link time and written to the job. `calcSellingCharges` therefore calls `ensureSellingRateInputs`
first, which fetches the two reads only if they are absent — for every order, not only a station's: a
structure sets its own broker fee, but the tax comes from the seller's Accounting wherever the sale
happens.

## The skill catalogue

*Stage C. Landed.*

`bpSkills.json` carries Accounting (16622) alongside Broker Relations and the industry skills, so a
character's Accounting level resolves through `getSkills` like any other. Nothing reads it yet — no
sales tax is calculated — but a skill absent from this file reads as untrained rather than as missing,
which is why it goes in before the figure that depends on it.

## The pricing order type

*Stage D. Landed — no visible behaviour change.*

Live behaviour stands on screen: hub and listing are still set in the material sources popover, reached
from the market panel's kebab menu, and the resolved pair still prints as caption text on each row.

What has landed is the replacement, unmounted. `Styled Components/Select/pricingOrderType.jsx` is a header
control that offers the four modes each with its own total and how far that sits from the mode in
effect, so a percentile stops reading as jargon. `Functions/MarketData/materialPricing.js` computes
those totals — honouring a row's own override on every candidate, since an override outranks the panel
default — and answers whether a row is an estimate, part paid, or paid in full.

It is unmounted because the headers it belongs in are Stage E and F's panels. Mounting it in today's
market panel would put it on the old `ContentPanel` shell, in a panel those stages delete.

## The material list

*Stage E. Landed.*

The material list renders **once** on the stage. `Materials And Sourcing/` is the panel that draws it,
and both Raw Resources and the market panel's copy of the list are gone.

Every row states its own sourcing rather than leaving it to be worked out from four columns. A **plan
chip** says whether the material is bought, built by a child job, or already paid for; a **Source**
column names the hub and which of the server's four price modes the figure came from, and says *Price
Entry* where the figure is a real purchase rather than an estimate; a **Δ** column states what building
the row would save or cost against buying it. A row whose figure is a market price can be overridden in
place, and an override outranks the panel's order type for that row only.

On a buildable row the plan chip **is** the decision: it carries the buy-or-build control and its undo,
so a costed list is settled from the list itself. The drawer below is for reading what building a
material would take, not for reaching the control that decides it. A row also states that it opens —
a chevron, which is a button, so the drawer is reachable by keyboard and not only by knowing that the
row is clickable.

The child-job comparison is an **inline drawer** opening under its own row. A build it could not cost
says so rather than drawing an empty comparison, which would read as a material that costs nothing to
make. Opening a row costs it, and that cost is **recorded against the row** rather than held inside the
drawer — the same place the summary strip's bulk costing puts its jobs. A row costed either way is
confirmed against the one job, and opening a row already costed re-reads it rather than building a
second job for the same material. Deciding a row drops what it was costed with, whichever way it was
decided: the guess described a job that has since either become a real child job or been taken back
out, so a row returned to Buy is offered for costing again rather than keeping a price for a job that
no longer exists.

The sourcing offer states a saving on **what is still to source**: a material already part-bought can
only move the units nobody has bought yet, and the offer has to be a figure accepting it can deliver.

`useMaterialsSourcing` builds the rows, one walk per material, and every panel on the stage that needs
a per-material figure reads them rather than recomputing.

The panel header carries the **pricing order type** and the **hub** together, since both decide what a row's
buy figure is, and reports the age of the stalest price behind the total.

## What a child job actually covers

*Stage M. Landed.*

A material's child jobs are costed for **what they actually produce**, not for the whole requirement
each. A material built by two child jobs is costed once between them, where each was previously charged
for all of it.

Where the jobs no longer cover the requirement, what happens to the difference depends on what is going
to happen to the job:

- **Not committed yet** — committing resizes it to the requirement, so the requirement is costed at the
  job's own rate and nothing is flagged. `finaliseCreatedChildJobs` performs the resize, so the figure
  the player accepted is the one they get. Two cases are exempt: several jobs producing one item divide
  the requirement between them, and a job the group already runs may be feeding something else.
- **Committed, with automatic recalculation on** — the parent's close resizes it, so the requirement is
  costed at the job's rate and **stated as an assumption**.
- **Committed, with automatic recalculation off** — nothing will resize it, so the covered part is
  costed at the job's rate and the shortfall is **bought at market**.

The **row** carries a shortfall tag beside its plan chip — how many it is short, with the jobs behind it
named in the tooltip — and takes the accent stripe that marks a row wanting a second look. The drawer
states the shortfall in full as a warning naming the figures and which way it was costed. Cost
Breakdown carries it in the bands: a bought shortfall lands in *Materials bought at market* and says so,
and a build line covering more than its jobs produce says it assumes a resize on close.

## Cost and return figures

*Stage F. Landed.*

The side-by-side pricing models are gone. **One model is in effect at a time**, named in the Cost
Breakdown header, so every figure beneath it has one meaning; the header's toggle switches between
pricing each material as the plan says and pricing everything at market, and it is display-only —
nothing about the model is written to the job.

**Cost Breakdown** opens with cost per unit, then a stacked proportion bar, then the components that
make it up, split into what it costs to **build** and what it costs to **sell**.

Looking at a segment of the bar — by pointer or by keyboard — marks the row stating the same part in
words and lets the rest of the bar recede, because on a build with six components the colour dot alone
asks a reader to match two small squares by eye.

The **extras are a line each, as they were recorded**, named by their description with the category
beside it. A player writes down a courier contract and a set of copies because they are separate costs,
and anything that adds them back together undoes the record they kept. How many a build carries is up
to the player, so their colours are **shades of the one extras colour** rather than entries in a list —
derived, so there is a shade for however many there turn out to be, and every one of them still reads
as an extra.

The build band counts **invention** alongside materials, child builds, install and extras, and records
it: an item that is invented — a T2 or T3 one, which its meta group says — carries an invention editor
beside the extras one, shaped like it rather than like the card the Purchasing stage draws. Both write
the same rows on the job, so what is recorded on either stage is what the other shows.

Reading the meta group was broken for every job. `Job` took it from `metaLevel` or `metaGroup`, while a
job is built from the SDE recipe, which names it `metaGroupID` — so every job had none, and the
Purchasing stage's invention card never appeared for any item outside a hardcoded exception list.
Stored jobs keep the null they were saved with until they are rebuilt.

Counting invention matches what `job.buildCost` totals and what the archive stores per build — without it a T2 job reads as
cheaper than its own history says every previous one was. The selling band is new behaviour: **broker
fee and sales tax now appear in a Planning figure**, each stating its rate and where it is paid — the fee saying it and the
tax not made the tax read as a charge from somewhere else.

Beneath the table, this build's cost per unit is placed against the range of previous builds of the
same item. The caption above the bar says what is being compared and across how many builds; the ends
say which is the cheapest and which the dearest, rather than carrying bare numbers; and hovering the
bar describes the whole comparison in a sentence.

The **cost-over-time chart is Build History's alone**. Both panels read the same query, and drawing it
twice on one stage gave a reader two places to look at one set of figures.

Nothing is charged for a listing that is never made. The broker fee's 100 ISK floor applies to a real
order, so it is not quoted where there is nothing to list — a job whose whole output is owed to a
parent, or an item the market has no price for, where the floor would be the only figure in the
estimate.

**Returns** answers what the build returns by each route out — sell orders and an immediate buy-order
sale — each naming the price it was struck from and what comes off it. Break-even carries the headroom
above today's price. Net, per-unit, margin and return-on-outlay all carry their sign in colour.

Both panels draw from **one** hook, `useJobEconomics`, because a cost stated on one and subtracted on
the other has to be the same number.

The stage states figures and **no verdict**. Nothing on it grades a plan as good or bad.

## Costing a build before committing

*Stage G. Landed.*

A buildable material can be costed **without committing to building it**. The row shows what a child
job would cost as an offer; taking the offer switches the row to Build and creates the job, and there
is an undo. Speculative jobs live in their own store slice and are not linked to the job being edited,
so a row that has been costed still reads as Buy until the player says otherwise. A group's jobs seed
their own rows on open.

## Jobs with parent jobs

*Stage H. Landed.*

Output owed to a parent job is **never priced as a sale**. A job whose whole output is committed shows
a **Contribution** panel in place of Returns, stating what that output costs the parents above it; a
job with a surplus prices only the surplus, and its broker fee and sales tax are charged on the
surplus alone. The commitment is allocated once across every contributor to a parent's requirement, so
two children each overproducing do not both report the same surplus.

## The Skills panel

*Stage I. Landed.*

The pass/fail list is gone. Skills are shown in three groups — what the job **requires**, what
**shortens** it, and what the **sale** costs — with level pips per row, a group header stating how much
of the requirement is met, and an impact row saying what a shortfall actually blocks.

The pips are the control. Clicking one asks what that level would be worth; clicking the level already
trained puts the question back. The panel re-derives the dependent figures — job time, broker fee,
sales tax — and shows the superseded figure struck through beside the one replacing it. A level being
tried is drawn in the primary colour, not success, because it is not a state the character is in.

**Nothing is persisted.** The tried levels live in the panel's own state and reach no store, no
document and no other panel.

The seller and the sale location come from `Hooks/Planner/useJobSellingContext.js`, which Cost
Breakdown and Returns read too — the three panels quote one character and one location or they
contradict each other about what a sale costs.

The selling group is read from the **seller's** skills rather than the build setup's character. Broker
Relations is still listed at a citadel and marked as not applying to the fee there, since the rate is
the structure owner's. Signed out, the panel states the requirements rather than failing them.

## Mobile

*Stage J. Landed.*

The mobile layout mounts **the same panels as the standard layout**. Raw Resources and the totals panel
are deleted from it.

The materials table becomes **cards** below `sm`; nothing else changes shape. Figures **shorten** rather
than wrap, with the full value on tap. The pricing-order type picker opens as a **bottom sheet** — four
full-width rows, each stating what that order type does to the total. The child-job drawer stays an inline
collapse, since it already opens under its own row.

## A default market character

*Stage K. Landed.*

Application settings carry `DefaultMarketCharacter` — the character whose market skills and standings
every rate on the Planning stage is quoted for. It is chosen on Job Settings, beside the reprocessing
default and behaving the same way.

It is **nil until chosen**. `Functions/MarketOrders/sellerCharacter.js` is the single accessor: it
returns the chosen character, or stands in with the account's main and reports `isDefault: true` so a
rate block can say it is guessing rather than quoting.

Live behaviour otherwise stands: the field is additive and absent on every stored account until a
player sets one.

## Where a job sells from

*Stage N. Landed.*

The **Selling from** list separates **citadels** from **NPC stations**. The two are not
interchangeable: a citadel charges the rate its owner set, and an NPC station charges one derived from
the seller's own skill and standings, so which kind a location is decides how the fee beneath it was
worked out.

The account's default is the **menu item it resolves to**, marked, rather than an entry of its own. As
a separate entry the same location appeared twice, and choosing it from the list pinned the job to it;
choosing the marked item now writes nothing, so a job that never departed from the default moves with
it when the default changes.

A named **NPC station is honoured as the choice it is**. `resolveSaleLocation` matched a named id only
against saved citadels, so a station fell through to whichever hub the materials were priced against.

An NPC station's **faction standing now resolves**. A station reports the race that built it — Jita 4-4
is `race_id: 1` — while the standing that reduces its broker fee is held against that race's faction,
Caldari State, 500001. The lookup matched the race id against the standing list and never found
anything, so every seller was quoted as having no faction standing at any NPC station.
`Hooks/React Query/World/raceFactions.js` fetches `/universe/races/`, whose `alliance_id` field carries
the faction id, and the match now also requires the standing's `from_type`, since a faction and an NPC
corporation can hold the same id in different categories.

**A figure the app read is stated as the figure it read, named.** A standing of
zero shows as `0.00 with Caldari Navy` rather than as an absence, and the
reduction it did not earn shows as `0.00%` rather than a dash — the row is
reporting what was established, and an empty cell beside a named entity reads as
a gap in the working instead of the answer. The entity is named because a
standing of nothing is the same sentence whichever empire owns the station, so
without it a right answer and a lookup pointed at the wrong entity are
indistinguishable. A standing below zero raises the fee and is shown with a plus.

**A figure that could not be read is no longer reported as a zero.** `getStandings` and `getSkills`
turned every failure — a 403, a 5xx, a network error, an incomplete character — into an empty
collection, which React Query cached as a successful result; the block then stated "no standing with
them" and "untrained" as fact. Both now throw, and answer a 403 with `data: null`. The fee terms and
the sales tax working carry an `unknown` flag, and the block says **could not be read**.

The cache accessors return an empty collection both while loading and after an error, so the collection
cannot be inspected to tell those apart from a genuine empty — `isLoading` and `isError` are what
distinguish them.

## A per-job selling override

*Stage L. Landed.*

A job can name a **seller** and a **sale location** of its own, held in `JobSale.Plan` as
`SellerCharacter` and `SaleLocationID`. Both are nil on a job that uses the account's defaults, and
clearing either returns the job to them. The pickers are on the Returns rate block, and the sale
location in the Returns header is now a **select** rather than the stated label it was before this
stage gave the choice somewhere to be written.

It does **not** go on the setup. A setup describes how a job is built; who sells the output is a
separate decision about where the build goes afterwards.

These are **planning inputs only**. Nothing downstream depends on them: when the job reaches the
Selling stage, the authority is the real ESI market order, which carries its own character and its own
figures. On a shared planner each member reads the job through their **own** characters — a seller
named by another member's account cannot have its fee worked out, so `resolveSellerCharacter` falls
back to the reader's own and says so.

Both fields are additive, so no schema bump.

## Missing live SoT found during this project

Anything discovered that live documentation should have carried but does not, drafted here in the
shape it will take when promoted. Empty until something is found.
