# Job Settings tab (`Components/Settings/Standard Layout/Job Settings`)

Live SoT for the Job Settings tab's market group pricing table. The rest of the tab — the default
asset location, the default market character, custom system indexes and custom extras — is not
documented here.

## Market group pricing

`MarketGroupPricing` (`marketGroupPricing.jsx`) is an `AppShellPanel` listing, per side, every market
group the account prices differently from its side-wide default — see
[../pricing/defaults.md](../pricing/defaults.md) § Market group defaults for how a group default is
walked and applied. The two sides are listed apart because that is how they are stored: a group can
never answer the side it was not set on.

Each row (`GroupRow`) states where a group sits — its name, and the path above it, because "Minerals"
alone does not say whether it is the one a reader meant — and what it prices against: a market and,
per side, either an order type or an exit route, matching the controls `PricedAgainst` offers for the
account-wide default. A group the published tree no longer carries is still shown, by id, because a
reader has to see an entry to clear it. Clearing every field on a row is how it is removed — there is
no separate delete, because the store treats an entry naming nothing as no entry at all.

**Adding a group** opens `MarketGroupPicker`, a dialogue offering both a drill and a search: a reader
who knows a group's name types it, one who does not knows only what it sits under. Any level is
choosable, including a container — a default set on a group covers everything beneath it, so pricing
"Minerals" once covers every mineral without a reader ever having to reach a leaf. The list is
virtualised, and the dialogue's body is mounted only while it is open, because the search walks the
whole tree (a few thousand groups) to build itself. A group starts on the side's own default when
added, so choosing one reads as "this one is different" and the reader then states how it differs on
the row itself.

`MarketGroupIcon` draws a group's picture, borrowed from one of its own items since a market group's
own icon names a file inside the game client that nothing here can serve; a branch with no items of
its own falls through to a glyph.

## Where every file lives

| Path | Holds |
|------|-------|
| `Job Settings/marketGroupPricing.jsx` | `MarketGroupPricing`, `GroupRow`, `SideSection` |
| `Job Settings/marketGroupPicker.jsx` | `MarketGroupPicker`, the drill-and-search dialogue body |
| `Styled Components/Avatar/MarketGroupIcon.jsx` | The group picture, and its glyph fallback |
| `Hooks/Static/useMarketGroups.js` | `useMarketGroupTree`, `useMarketGroupChildren`, `useAncestorPath` |

## Topic-only detail

The walk that resolves a group default, the stored shape it reads, and which rung it sits between →
[../pricing/defaults.md](../pricing/defaults.md) § Market group defaults.
