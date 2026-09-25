# Account and job pricing defaults (`services/shared/models`, `services/shared/documentschema`)

Live SoT for the stored shape of an account's and a job's pricing defaults — what fields exist, what
an unfilled one looks like on the wire, and what the schema upgrader fills in. What resolves against
this shape client-side, and the ladder it sits at the bottom of, is
[frontend/pricing/defaults.md](../../frontend/pricing/defaults.md).

## The stored shape

`PricingChoice` — `Market string`, `OrderType string`, in `services/shared/models/accountDocuments.go`
— is the shape of an answer at every rung that gives one: `market` names which market, `orderType`
names which side of the order book, as ESI names that axis. Both fields are `omitempty`, and **an
empty field is not a choice**: an unfilled pair is sent as `{}` rather than as a pair of empty
strings, so a consumer must read either shape as "not answered."

`PricingSide` embeds a `PricingChoice` and adds `Groups map[string]GroupPricing` (keyed by market
group id) and, on the selling side only in practice, `Exit`. `PricingDefaults` is one `PricingSide`
each for `Buying` and `Selling`, and is what `ApplicationSettings.DefaultPricing` carries.

**The selling side names an exit route rather than an order type.** `Exit` is one of
`ExitRouteListed` / `ExitRouteImmediate`. A route answers two questions an order type alone cannot —
which side of the book a figure comes from, and whether a broker fee is charged — so the selling side
is not left free to store an order type that could disagree with the route sitting beside it.

`GroupPricing` — `Market`, `OrderType`, `Exit` — is what one market group is priced against, beneath a
side. It is a separate type from `PricingChoice` rather than reused, because a group answers the same
question its side does: a buying-side group names an order type, a selling-side group names a route.

`JobPricing` — `Buying`, `Selling PricingChoice` — is a job's own override, on
`Job.Build.LocalPricing *JobPricing` (`services/shared/models/job.go`). It carries no `Groups` table:
market groups are an account-level rung beneath a job's own choice, so a job carrying one would be
answering a question it does not own. The pointer is what lets a job that has chosen nothing omit the
whole field rather than writing an empty pair onto every job; `JSON` carries no `omitempty` on either
side of the pair inside it, because `omitempty` does nothing for a struct field — an empty side still
needs writing as `{}`, and the pointer is what omits the field entirely.

`MaterialPriceOverride` — `MarketDisplay`, `OrderDisplay`, on `JobLayout`'s per-material override map
— is the ladder's top rung, and names its two fields independently of `PricingChoice`'s `Market` /
`OrderType`. The SPA writes them as literal string keys, so renaming either would be a `jobs` document
migration for a rename with no behaviour behind it — they are left as they are on purpose.

`JobLayout` carries a job's own display choices only — `ESIJobTab`, `SetupToEdit`,
`ResourceDisplayType`. Where each side of a job is priced is not among them; that is
`Build.LocalPricing`.

## Seeding an account's defaults

`Upgrader.ApplicationSettings` (`services/shared/documentschema/documentschema.go`) runs on every
read and fills whichever side has no market yet:

- The buying side's market and order type are assigned from `DefaultPricingDefaults()` (Jita, sell
  orders) as a pair, so a group table it may already carry is left alone — assigning the whole side
  would take that with it.
- The selling side's **market only** is filled the same way; its order type is never written directly,
  because the selling side's order type follows from its route rather than being a second, possibly
  disagreeing, answer to the same question.
- The selling side's **route** is filled separately, from `exitRouteFor(existing OrderType)` — `buy`
  or `buyP95` becomes `ExitRouteImmediate`, everything else becomes `ExitRouteListed`. A side may
  already name a market and still have no route, so the two are tested and filled independently rather
  than as one condition.

**The seed is gated on an empty market, never on the schema version.** An unversioned document is
stamped with the current schema version earlier in the same function, so a version test would never
fire for exactly the rows that still need filling — the empty `Market` field is the signal instead.

`DefaultPricingDefaults()` is also what a brand-new `ApplicationSettings` document starts from:
`{Buying: {Market: "jita", OrderType: "sell"}, Selling: {Market: "jita", Exit: "listed"}}`.

## Wire compatibility

**Additive, no schema bump.** `DefaultPricing` is a plain (non-pointer) struct field, so it is always
present on the wire; an account with nothing chosen answers
`{"buying":{},"selling":{}}` — the key present, both sides empty — rather than a missing key, because
Go serialises a non-pointer struct field whether or not Mongo held one. A consumer that read that as
an answer would overwrite the account's real default with emptiness on the next save; the upgrader
fills it before anything downstream sees it.

**Removing a field a model declares is breaking for the deploy window, not additive.**
`UnmarshalRequest` decodes a request body with unknown members refused (see
[jsoncodec.md](./jsoncodec.md) § Strict vs lenient), which applies to every model in `services/`, not
only these. So a client still uploading a field a model no longer declares has its save refused
outright rather than silently ignored, for as long as that client's code is older than the deploy that
dropped the field. A save that fails outright is preferable to one that is silently dropped, but it
means the SPA must stop sending a field before the server stops declaring it, and a tab left open
across that deploy cannot save a job until it reloads. A field removed from `ApplicationSettings`
rather than from a job is not breaking in the same way: an old session simply reads a pair that has
stopped moving, which is stale rather than refused, because the server never overwrites a side a
client has already filled.

## Where every file lives

| Path | Holds |
|------|-------|
| `shared/models/accountDocuments.go` | `PricingChoice`, `PricingSide`, `GroupPricing`, `PricingDefaults`, `JobPricing`, `ExitRouteListed` / `ExitRouteImmediate`, `DefaultPricingDefaults`, `ApplicationSettings.DefaultPricing` |
| `shared/models/job.go` | `Build.LocalPricing`, `MaterialPriceOverride`, `JobLayout` |
| `shared/documentschema/documentschema.go` | `Upgrader.ApplicationSettings`, `exitRouteFor` |

## Topic-only detail

Which market and order type a client resolves for a side, the ladder, and the market group walk that
reads `Groups` → [frontend/pricing/defaults.md](../../frontend/pricing/defaults.md).
