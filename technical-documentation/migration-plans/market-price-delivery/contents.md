# Market price delivery

## Owns

How a market price reaches the SPA and how it is kept current: what is asked for, what comes back,
where it is held, and what decides that it has gone stale — for every kind of market the planner can
price against, not only the four the server holds.

- **The unit of a price.** One type at one source, carrying the four bases, replacing a per-type blob
  that answers for every hub at once whether or not the caller wanted them.
- **The source registry.** The server publishes the four default hubs and their clocks; the SPA holds
  one registry that admits reader-saved sources beside them, and stops keeping a second
  hand-maintained copy of the four.
- **The query.** A request that names the sources and the types it wants, and a response carrying only
  those, with the per-type Redis loop in the handler replaced by a pipelined read.
- **The freshness rule.** A book refreshes as a whole, so the source's own clock — not a per-type age
  guess in the browser — decides what has to be asked for again.
- **Custom market locations.** The stored list of markets a reader has added and the surface for
  adding one, and keeping each of them current on its own ESI expiry rather than on demand.
- **Fetching and deriving a reader-saved source in the browser.** Custom NPC stations by per-type
  region query; custom citadels — which is how a private market is reached, with the reader's own
  token — by authenticated whole-book walk. Both produce the same row shape the server produces.
- **Where market data lives in the browser.** One price cache in two tiers: the four hubs' rows held
  for the session with nothing beneath them, and every reader-saved source — public station and
  private citadel alike — read through IndexedDB so it survives a reload.

**Not live SoT** until this project is complete and promotion is approved.

Named for the **work**, not a git branch. **Project close** = plan tracks done + live-SoT **promote**
(go-ahead).

## Does not own

- **How the server builds the books.** The hourly region walk, the ETag and page cache, the station
  filter and the percentile trim are current behaviour and are not being changed →
  [backend/](../../backend/contents.md).
- **Which market source and basis a figure is priced against.** The resolution ladder, the account's
  buying and selling defaults, and defaults keyed to an item's market group belong to
  [market-pricing-defaults/contents.md](../market-pricing-defaults/contents.md). That project decides
  what to ask for; this one decides how the asking works.
- **What the four bases mean.** `buy`, `sell`, `buyP95` and `sellP05` and the figures behind them
  stay as they are.
- **The Market Data and Price History dialogues**, which read region order books and history from ESI
  in the browser. Left as they are by decision; the note on why this is still worth revisiting is in
  [plan.md](./plan.md) § Left out on purpose.
- **Everything else `CustomStructures` holds** — the manufacturing, reaction, reprocessing and
  invention lanes and their surfaces. This project takes the sale lane only, which is where a market
  a reader adds already lives — a selling point and a market source are one saved row. It inherits
  the shape worked out at
  [planning-stage-panels/plan.md](../planning-stage-panels/plan.md) § Handed to the custom-structure
  work rather than redeciding it.
- **What a sale location charges.** Broker fees, sales tax and the rate block belong to
  [planning-stage-panels/contents.md](../planning-stage-panels/contents.md); this project prices a
  market, it does not price selling from one.
- Live SPA and backend behaviour → [frontend/](../../frontend/contents.md),
  [backend/](../../backend/contents.md) (promote targets).

## Task map

| I need to… | Read |
|------------|------|
| Goals, stages, done-when, open decisions | [plan.md](./plan.md) |
| Understand what the current design costs | [plan.md](./plan.md) § What the present design costs |
| Find every file a price passes through today | [plan.md](./plan.md) § The pipeline prices travel today |
| Know which markets the server serves and which the browser does | [plan.md](./plan.md) § What a market source is |
| Know where a price is read from, and why it is a query cache rather than the store | [plan.md](./plan.md) § Where a price is read from |
| Know what keeps a reader-saved market current and what one request covers | [plan.md](./plan.md) § Keeping a reader-saved source current |
| Know how a private market is reached, and why it is not its own kind of source | [plan.md](./plan.md) § What a market source is |
| Understand why a citadel and an NPC station are not one problem | [plan.md](./plan.md) § The two custom kinds are not one problem |
| See the price row and the query that returns it | [plan.md](./plan.md) § The unit of a price |
| Understand why the source's clock replaces the age guess | [plan.md](./plan.md) § Freshness belongs to the source |
| Know which storage tier a piece of market data belongs in | [plan.md](./plan.md) § Two tiers of storage |
| Know what is additive, what breaks the wire, and what needs a new ESI scope | [plan.md](./plan.md) § Wire compatibility |
| Find every surface holding a second copy of the hub list | [plan.md](./plan.md) § Stage A |
| Know why callers used to pass a price table alongside the store, and what removed it | [plan.md](./plan.md) § It retires the alternative price table |
| Know where a price comes from today, now the store is gone | [overlay.md](./overlay.md) § B2, § B4 |
| Know what decides that a price has gone stale | [overlay.md](./overlay.md) § C1, § C3 |
| Know how a moved book reaches a surface someone is already looking at | [overlay.md](./overlay.md) § C5 |
| Know what paces the refresh cycle, and why no component owns it | [overlay.md](./overlay.md) § C2 |
| Know what is genuinely left in Stages D and E, and why they go together | [plan.md](./plan.md) § What Stage D and E actually need |
| Know how prices survive a reload, and why it is not the query persister | [plan.md](./plan.md) § How the persistent tier is stored |
| Landed behaviour notes (fill as work lands) | [overlay.md](./overlay.md) |
| The measurements this design was argued from | [measurements.md](./measurements.md) |
