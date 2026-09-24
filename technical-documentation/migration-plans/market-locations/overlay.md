# Market locations — behaviour overlay

What changed and how each part works after the change. Read live documentation first, then lay this
on top: where the two disagree about work this project has landed, this wins until promotion folds it
into live SoT.

**Stage A has landed; nothing reads the lane yet.** [plan.md](./plan.md) § Stage A — the settled
shape carries the reasoning and the composition rule Stage B builds; § Open decisions carries the one
question still open, which Stage C needs. The sections below fill as work lands, one per stage, and
each says what a reader or an operator can now do that they could not before.

## Stage A — The stored shape

**A market can be stored as a market.** `models.MarketLocation` carries what a market has — a name, a
region, the one place it names, an NPC station's `raceID` and `ownerID`, a citadel's `brokerFee`, and
whether an organisation has shared it with its members — and none of the nine fields a place a job
runs in carries. Not which market a job prices at: that is the account's own setting, and a flag here
could only ever answer it for one side. Which sort of
market a row is follows from the place: a station id or a structure id, never both, and no stored
kind that could disagree with it.

`marketLocations` is a lane on both settings documents — `models.ApplicationSettings` and
`planner.Settings` — so every owner that can hold settings can hold markets, including the planners
owned by a corporation or an alliance. An owner with none stores `[]`, and `null` stays reserved for
what is genuinely absent.

**A release step writes that empty lane, rather than the schema upgrader repairing it on each read.**
`seedMarketLocationLane` runs in the prepare-release window over both settings collections, selecting
documents whose lane is not already an array — which is a document that never had the field and one
left holding `null` alike, so it is safe to run again. That selector is what makes it survive the steps
that write a settings document whole — the schema maintenance and the pricing seed both do, where a
step writing only its own field does not. The lane has no `omitempty`, so a whole-document write of
one not yet seeded stores `null`, and this catches that as readily as the missing field. It sits
after both for the same reason, which `TestTheMarketLaneSeedRunsAfterEveryWholeSettingsWrite` holds. A new account gets its lane from `DefaultApplicationSettings`.

**The schema version deliberately did not move**, and does not move in Stage B either. `schemamaint`
selects documents below the current version and skips any the upgrader did not raise, so a current
moved ahead of a step that reaches it would leave every settings document below current for ever. An
empty lane needs no bump in any case: a document written before this stage decodes with no markets,
which is what it has.

**The SPA carries the lane without using it.** The settings endpoint replaces the whole document with
what it is sent, and `toPersistPayload()` builds that from a fixed list of fields — so a client that
did not carry the lane would not leave it alone, it would drop it, taking every market the reader had
saved with it on the next save of any setting at all. The store holds it, takes it from the server
when offered, keeps what it holds when the answer does not mention it or is not a list, and sends it
back untouched.

**One market type, not two.** The server had a second `MarketLocation` — `esicore`'s, the four
trading hubs it prices — with the same four leading fields and a 32-bit region id against this one's
64. They are the same thing to everything downstream: a region to walk and a station to filter orders
to. `models.MarketLocation` is now both, `models.DefaultMarketLocations` holds the hubs beside it,
`shared/core/esi/locations.go` is gone, and the region id is 64 bits everywhere with the narrowing
stated at each boundary where Redis and ESI want 32. The committed hub fixture the SPA checks its own
list against is byte-identical apart from the line naming where it came from.

**Nothing reads the lane.** Every reader still reads `customStructures`; it is written and unfed
until Stage B fills it and switches them over in one change.

## Stage B — The move

**A saved market is stored as a market.** The schema upgrader lifts every row whose kind is market
out of `customStructures` onto the `marketLocations` lane as a settings document is read — tested by
the data rather than by the version, so it reaches a document whatever version it claims. Both
loaders run the upgrader, so this is true of every read.

`moveMarketsToTheirOwnLane` writes it down, `$set`ting the two lanes on each document that still
holds a market among its structures. **A step rather than a schema bump**, because this release is
not moving the settings schema: a bump would have handed both collections whole to schema
maintenance, rewritten every document without the field-scoped care a live stack wants, and made two
other projects' release steps redundant on the way past. A transform that moves the version needs no
step; one that does not, needs one.

**Every reader that asked for a market now asks the lane.** On the server, `MarketStationIDs` became
`MarketLocations.StationIDs` and `marketsources.Register` takes the lane, so the markets this server
is told to price are read from where they now live. In the SPA, `allMarketSources()` composes its
saved sources from `applicationSettings.marketLocations`, and `saleLocations` finds a market by id
rather than through the custom-structure lookups a market can no longer be found by.

**This had to happen in the same change as the move, and the reason is worth keeping.** A reader left
on the old lane does not fail — it finds nothing, and goes on working with no markets at all. That
happened twice while this was being written, once on each side, and neither was caught by a test
failing: the server quietly stopped registering saved stations to be priced, and the SPA quietly
offered hubs only. Both were found by reading, not by running.

**What a market row carries across.** Its id above all — a job setup naming a market keeps working,
and the device keeps the prices it holds under that id — plus its name, region, place, an NPC
station's race and owner, and a citadel's broker rate. A market naming no place is left among
the structures: it cannot be priced, and moving it would take it out of the one screen a reader might
still see and fix it on.

**A market an organisation shares reaches its members.** The composed set is read from
`GET /api/v1/user/market-locations`, seeded from the field a sign-in already carried, and read again
whenever a settings document moves — the account's own or any planner's. The registry offers it, and
the account's own lane answers only until it arrives, so a reader part-way through signing in sees
the markets they saved rather than none.

It is held in the query cache beside the price rows, read synchronously the way those are, and
**deliberately not in the settings store**: `applicationSettings` is the document the SPA sends back
on save, so a union sitting beside it is one refactor away from being written into the account's own
lane and copying another owner's markets there permanently.

A push is a signal to read again rather than data to merge. The update carries one owner's document,
and folding it in here would need the rule that collapses two rows naming one place a second time, in
a second language.

**A surface redraws when the set changes.** `useMarketSources` subscribes — to the cache entry the
composed set lives in, and to the reader's own lane — so a market an organisation shares appears
where markets are offered without the reader doing anything. It subscribes rather than fetches:
asking here would ask before a reader is signed in, and would be a second thing deciding when the set
is read. Subscribed through the cache rather than `useQuery`, because a market surface should not
need a query provider standing over it — a good many are rendered in tests without one.

**An account the server says has none is an answer**, and is honoured. Only an unread set falls back
to the account's own lane; falling back on an empty one would offer markets the server did not
compose.

**It is held for the session, deliberately.** Nothing observes the entry — it is read synchronously,
the way a price row is — so the cache counts it unobserved from the moment it lands and would collect
it on the default few minutes. A reader would then fall back to their own account's markets and
quietly lose everything their organisation shares, with nothing said and nothing to re-read it until
some owner's settings happened to change. Here the cache's default is exactly wrong: a price row is
*meant* to age out, and this is not.

**One place asks which set to read.** `marketsToOffer()` answers with the composed set, or the
account's own until it arrives, and the registry and `saleLocations` both go through it. Two copies
of that fallback would eventually disagree about which of them a market a reader inherited belongs
to — and a job priced against one would resolve on one path and not the other.

## Stage C — The panel

**A market can say when it was last read, and that is not one question.** `lastReadMoment` answers it
per market kind: a market the reader reads themselves was read on *this device*, at a moment held
beside its prices there, so another of their machines has its own answer and one they have never
opened here has none; a market this server prices states one clock, the same for every reader.

What a panel shows is therefore "when these figures were current **for you**" rather than a property
of the market. Two members of a corporation can see different answers for the same shared market,
because one of them can dock there and the other cannot.

A market refused on every attempt carries a turn but no read, and says nothing rather than claiming
it was read at the epoch.

**A server-priced market carries its clock, rather than the browser inferring one.**
`marketsources.StampPricedAt` fills `PricedAt` from the moment the server last walked the region the
market sits in, on every path that hands markets to a client — the sign-in bootstrap, the composed
set, and the account's own settings. Not stored: it is not a fact about the market but about how
recently the server has read the region, which moves without the market changing.

It is read this way because the alternative was a browser inferring it from having asked for a price.
That clock is a side effect of an answer, held in memory, so it was empty on every fresh load — a
panel told a reader that nothing had ever been priced at a market this server had been walking for
weeks. Where both are held the newer wins: the market's own clock is as old as the last time the set
was read, and a price answered since then has walked past it.

**An absent moment means two different things, so the answer says which.** On a market the reader
reads themselves, absent means this device has not read it. On one this server prices, absent means
the region has not been walked yet — which a market saved a moment ago has not, because saving one
asks for it to be walked and the walk follows rather than arriving with the save. So the panel says
it is waiting for its first prices, which is a different claim from nobody having asked: a reader who
has priced a job against it has asked, and got zeroes back.

A citadel carries no clock of this kind at all. Its orders are read with a character's token on the
device that reads them, so the server's own clocks say nothing about it.

**A reader manages their markets where markets are.** A Market Locations tab lists every market they
may price against — their own and the ones an organisation shares — as a table, with the settings for
one opening beneath its own row. The row is drawn only while it is open, so a closed one holds
neither the fields a reader was part-way through typing into nor a subscription to the store.

What the editor offers is the name, a citadel's broker rate, and — on an organisation's row — whether
its members are given it. **The place is not among them**: a market somewhere else is a different
market, and the prices held for it, the character that reads it and its turn on the refresh rotation
all hang off its id.

**One rate answers for the citadels that are not on the list.** A market a reader saved carries its
own broker rate, so the account-wide figure is left with a single job: charging a market order that
was linked from somebody else's structure, which the reader may never price against and has no reason
to save. It sits beneath the list, named for what it now does — a name reading "citadel broker fee"
would claim every citadel, and every citadel on the list answers for itself.

**Where a job is priced is the account's, not a market's.** Both sides — the market materials are
bought at and the one output is sold at, each with the figure read there — sit at the top of the tab,
above the list they pick from. A reader buys in one place and lists in another as a matter of course,
so a single flag on one saved market could only ever have answered half of it. The figure travels with
the market because they are one choice: buying at the bid in Jita is a different answer from buying at
the ask there, and a reader who had to give half of it on another tab would routinely give only half.

Both start at the trading hub, and saving a market changes neither: adding one is not choosing to
price against it. A choice naming a market that is no longer saved — removed, or an organisation
stopped sharing it — resolves back to the hub, which the select shows rather than an empty box, so it
reads as the hub taking over rather than as a setting that has broken.

**A market is added as a market.** `newMarketLocation` mints the stored row, so one place decides
what a market carries: the id in the shape saved ones already have, the region, and the place in the
field that says which sort it is — never both, because a row holding both is a market of neither
sort. A station carries what its broker fee is derived from and no rate of its own; a citadel carries
the rate and nothing derived.

The region and a station's fee inputs are derived as the place is chosen, not when something first
tries to price there: a market saved without a region is offered in every picker and prices nothing,
by which time the reader who could have picked another has long since moved on. **A citadel's answer
arrives in two parts** — its system is read with a character's token as its name is, and the region
follows from the system — so deriving them is a query keyed on both rather than a handler that would
run once with whatever had arrived by the moment of the click. A citadel every character was refused
at has a name from the community store and no system: the form says it cannot be saved rather than
waiting for an answer that is not coming.

**The custom-structures form no longer saves a market.** The kind is not offered, `Classes/structure`
carries no market fields and no market setters, and the card that described one is gone. The value
stays in `structureKinds` because the server still means it by a stored `jobType` and the parity
fixture holds the two together — what went is the SPA's ability to create one, not its knowledge of
what an old row is.

**An organisation's markets are edited where the reader's own are.** `planner.SettingsUpdate` carries
the lane, so the endpoint that saves a planner's settings can express a change to its markets, and
the panel offers the same controls on an inherited row as on a saved one — plus the one that only an
organisation's market has: whether it reaches the members.

**Which document an edit lands on is decided in one place.** `marketWriter` takes the owner a row
came from and answers with the edits for it: the reader's own go through `applicationSettings`, an
organisation's through `plannerSettings` for that owner. That is also where the permission check goes
when there is a roles model to check against — every control already asks it rather than deciding for
itself.

**A market is saved at once, and the composed set is read again when the save lands.** Every surface
reads the set the server composed, and `marketsToOffer` prefers it wherever there is one — so a
market written only to the store is offered nowhere at all, however correctly it was stored. A change
records itself with `marketLocationsChanged`, and `refreshMarketLocationsAfterWrite` reads the set
again from whichever save carried the change: the account's settings save, or the planner's. Recorded
rather than read straight away, because a read issued before the write lands fetches the set as it
was and holds that instead.

The save is scheduled **and then flushed**, rather than left on the two-second debounce a settings
edit normally rides. A reader who has just added a market would otherwise be looking at a panel it is
missing from until the timer fired. Both steps are needed and the order matters: a flush writes
whatever is already waiting, so flushing without scheduling first sends nothing at all — which loses
the change rather than hurrying it.

A row an organisation shared is editable **once that organisation's settings have been read**. The
composed row is what a panel shows; a write needs the owner's own lane to apply a change to, so the
panel reads the settings of every owner that appears in it, through `usePlannerSettingsForOwners` —
planners the reader is not working in, which is the case the active-planner query scope could not
express.

Those settings land *after* the rows have been summarised, so whether a row can be changed is decided
as the panel draws rather than carried on the row. One fixed when the summary was taken would say no
for the life of the mount and only come right if the reader left the tab and came back.

**What a change does to a lane is decided once.** `marketWriter` holds the three transforms — save,
change, forget — and both stores apply them. Each store exposes one
action taking a transform rather than one action per edit, so a market behaves the same whoever saved
it and the rule cannot drift between the two documents.

**A planner's settings save is field-scoped, and now has more than one field to scope.** The store
records *which* settings a session edited rather than that it edited something, and the save sends
those. Two members editing one planner each send what they changed, so a member who moved a market
does not carry their copy of another member's categories back over it. The debounced flush saves
whatever is outstanding for an owner rather than one named field.

**A saved market lane is checked before it is stored.** `models.MarketLocations.Validate` is the rule
— an id, a name within a length limit, a region, exactly one place, no duplicate ids, no more markets
than the lane allows, and a broker fee only on a citadel, capped at a hundred per cent — and it sits
on the type both settings documents
embed rather than on either update, because a row saved through either reaches the same pricing
machinery. Both the account's settings save and the planner's apply it. It does not ask whether the
place exists: that is an ESI question, answered when the reader chose it, and asking it again would
make saving any setting depend on ESI being up.

The SPA holds a reader to the fee ceiling at the field, because a refused save reaches them as
nothing at all — both save paths log the failure and keep the edit, so a figure typed past the
ceiling simply never sticks. The two copies of the ceiling are held together by
`testing/fixtures/market-limits/limits.json`, written from the Go constant and read by a SPA parity
test, on the pattern the trading-hub list already uses.

**A market an organisation shares is registered for pricing.** Sign-in registers the composed set
rather than the account's own lane — it already composed the union for the bootstrap in the same
request, and registering the narrower one left an inherited NPC station offered to a reader and never
walked. A planner's settings save registers what that planner shares, so a market an organisation has
just offered is already being walked by the time a member's job wants a figure; the shared ones only,
because one kept internal to the planner reaches no member and would be a region walked for nobody.

## Stage D — Telling a reader a market cannot be read

### D1 — the read keeps what it settled on

A market the reader reads for themselves can fail for reasons only they can fix, and until now the
failure was thrown away: the rotation caught the error, read one flag off it to decide whether to put
the market's turn back, and dropped the rest. Nothing downstream could tell a market nobody on the
account can dock at from one the device has simply not got to yet, because both end the same way —
no prices, and a panel that can only say nobody has read it.

**The reason is kept beside the market's freshness**, in `priceStore`, because it is the same fact:
how the last turn went. A read that lands prices stamps `read` over whatever was there, so a market
the reader has just regained access to stops claiming they cannot see it; a deferral that names
nothing leaves the last answer alone, because a caller putting a turn back for its own reasons has
established nothing new.

`marketReadOutcome.js` owns the vocabulary and the one function that decides it. Four outcomes:

| Outcome | What it means | Whose problem |
|---------|---------------|---------------|
| `read` | Prices arrived | — |
| `refused` | Every character the account has was told no | The reader's: no character can dock there |
| `unaskable` | Nothing could be asked — no character holds the scope, or there are none | The reader's: authorise or link one |
| `failed` | ESI was down, refused for rate, or a token could not be had | Not the reader's; the next turn may answer |

**It is decided from the flags the error already carries**, never its message — `permanent` for a
refusal, `needsReauthorisation` for a character that was never granted the scope — so the walk in
`askEachCharacter` can reword itself without changing what a panel says. Anything unmarked reads as
`failed`, which is the safe direction: a market called unreachable on a bad connection sends a reader
off to fix something that is not broken.

`readerCanAct` is what separates the two the panel will speak up about from the two it stays quiet
on, and it is also what the rotation now uses to decide whose turn to put back — which widens the old
behaviour by one case. Being refused already waited its turn out; having nobody to ask with now does
too, because that is equally an answer about the account rather than a failure to reach ESI, and
re-walking it on every probe costs a refusal per character at five times the charge of a hit.

**Nothing is shown yet.** D1 stops at the record; D2 carries it onto the row through
`summariseMarket`, and D3 is what the row says and what it offers.

### D2 — the row carries it

`lastReadMoment` already answered two questions wearing one name — when a market was last read, and
whose clock that moment is on. It now answers a third from the same record, because how the read went
is the same fact as when it happened, and a panel reading them from two places could show a moment
that disagreed with the reason beside it.

A market the server prices answers `undefined` and always will. Its failures belong to the server and
are the same for every reader, so there is nothing here a reader could act on — the field is not
"unknown" for those markets, it is "not a question this market has".

`summariseMarket` puts it on the summary and `marketRow` carries it onto the row. **Neither puts it
into words.** `marketRows.js` is the one place a market is worded, so that is where it will be said —
but what a reader is told, and what they are offered to do about it, is the decision § Open decisions
leaves to D3, and wording it here would settle that by accident.

### D3 — the row says it

**Two of the four outcomes are spoken, and the other two are not.** `readProblem` in `marketRows.js`
words `refused` and `unaskable` and answers nothing for the rest. A read that failed is ESI's problem
or the app's and the next turn may answer, so putting it on screen would send a reader off to fix
something that is not broken; a market nothing has read yet is not a fault at all, and already had a
sentence of its own.

| Outcome | What the row says | What the tooltip adds |
|---------|-------------------|-----------------------|
| `refused` | No character can dock here | Every character was refused; link or authorise one that can dock there |
| `unaskable` | No character can be asked | No character is authorised to read orders inside player structures |

The explanation says **what to do**, never a restatement of the label: the label is already on screen,
and a tooltip that repeats it is worth nothing. Both end on when the fix takes effect — the next
refresh — because otherwise a reader who links a character has no idea whether to wait or to have
expected the figures at once.

**It goes in the "Last read" cell, because it is the answer to that column's question.** A market
that was readable and is not any more keeps its moment *and* carries the chip: the figures on screen
are still the ones from that moment, and dropping the date would hide how old the prices a job is
being costed against have become. Where there is no moment at all the cell reads "No prices" rather
than "Not read on this device", which would be true and useless — it is not that this device has not
got to it, it is that it cannot.

The chip is `StatusChip` at `WARN` and the sentence is an `ExplainerTooltip`, both of which the table
already uses — the broker fee dash explains itself the same way.

**The explanation had to be reachable without a mouse**, because it is the only place the fix is
described. A `Chip` with no click handler renders a plain `div` and takes no focus, and the tooltip's
wrapper was a bare `<span>`, so a reader tabbing through the table went straight past the warning and
never saw what to do about it. `ExplainerTooltip` gained an opt-in `focusable`, which puts the
wrapper in the tab order; MUI then labels it with the title, so the sentence reaches assistive
technology whether or not the visual tooltip opens — which holds for a **string** title, the shape
MUI labels unconditionally, and not for a `ReactNode` one, which is only announced once the tooltip
has opened. `jsx-a11y/no-noninteractive-tabindex` is disabled on that one line with the reason on it:
the span is not a control and does not pretend to be one. Opt-in rather than the default because a tab stop
on every explained control in the app would be a long walk through a page — take it where the tooltip
carries something the reader cannot get any other way. Two older sites have the same unreachable
shape, the shortfall chip and the Planning stage's "Paid" chip; neither is this project's to change,
and both can adopt the flag.

`readProblem` asks `readerCanAct` which outcomes are worth wording rather than listing them a second
time, so the set is decided once beside the outcomes themselves and this only supplies the words.

### D4 — the row's sentence has somewhere to go

Saying "link a character that can dock there" and leaving the reader to find where is half an answer.
`useLinkCharacter` is the other half and already existed — the Accounts surfaces call it to add or
re-authorise a character, and that same act is what fixes this — so `MarketsNotAnswering` calls it
rather than growing a second way in.

**One offer for the whole list, not one per row.** Linking is an act on the account rather than on a
market: the character it adds may answer for every market in the list at once, so a button per row
would be the same button drawn several times, each claiming to fix one thing. The rows still carry
the diagnosis one at a time, because *that* is per-market — a reader with two unreadable markets may
be refused at one and unable to ask about the other.

It counts what is affected rather than naming them, since the names are in the table immediately
above, and it is **absent entirely when nothing is wrong** rather than present and saying so: a panel
that keeps a space for bad news makes a reader read it on every visit.

**Stage D is complete.** The read keeps what it settled on, the row carries it, the row says it, and
the sentence has somewhere to go.

## Missing live SoT found on the way

*Empty.* Live documentation this project finds wrong or absent is written here first and folded in on
promotion, per [`../documentation-rules.md`](../documentation-rules.md) § Hard rule.

## A sale is priced at the place it happens

`saleLocationFromCitadel` costed every citadel against the trading hub, from when nothing could read
a structure's market. [market-price-delivery](../market-price-delivery/plan.md) § Start here named
the change as a decision rather than a consequence, because it moves figures a reader has been
looking at; the decision was taken, and a citadel is now priced on its own orders.

**The `pricedAtID` / `pricedAtName` pair went with it.** A station always priced at itself and a
citadel now does too, so the pair could only ever repeat `id` and `name` — a field that can only hold
a copy of another is a second place for them to disagree. Callers read the sale location's own id and
name, and `feeStationID` stays, because *that* is genuinely a different place: the NPC station whose
owner's standings set the rate.

The Returns block used to read "Prices from Jita; the fee is this citadel's own". There is no second
market to name now, so it says what is true instead — priced on this citadel's own orders, at the
rate its owner set.

**A citadel whose market cannot be read carries no figures rather than somebody else's.** That is the
point: zeroes are visibly wrong, where a hub's prices under a citadel's name were invisibly wrong.
§ Stage D is what turns that silence into a sentence.
