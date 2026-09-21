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
region, the one place it names, an NPC station's `raceID` and `ownerID`, a citadel's `brokerFee`,
whether it is the default, and whether an organisation has shared it with its members — and none of
the nine fields a place a job runs in carries. Which sort of
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

**The schema version deliberately did not move.** `schemamaint` selects documents below the current
version and skips any the upgrader did not raise, so a current moved ahead of a step that reaches it
would leave every settings document below current for ever. An empty lane needs no bump: a document
written before this stage decodes with no markets, which is what it has. Stage B raises both
versions in the same step that moves the rows.

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

*Empty.*

## Stage C — The panel

*Empty.*

## Stage D — Telling a reader a market cannot be read

*Empty.*

## Missing live SoT found on the way

*Empty.* Live documentation this project finds wrong or absent is written here first and folded in on
promotion, per [`../documentation-rules.md`](../documentation-rules.md) § Hard rule.
