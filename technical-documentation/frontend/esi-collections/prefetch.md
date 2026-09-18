# Login collection prefetch (`frontend/src/Functions/EveESI/prefetch`)

Live SoT for how every ESI collection the app holds is fetched at login: the declared table of
scope and phase per collection, the scheduler that expands it into work for an account, the shared
queue both login entry points feed, the request budget it holds to, and what the application knows
of a collection's state for one character. Package:
[`frontend/src/Functions/EveESI/prefetch`](../../../frontend/src/Functions/EveESI/prefetch).

Login itself — tokens, sessions, the private-request path — is
[frontend/auth/spa.md](../auth/spa.md); this topic only covers what login *triggers*. The row shapes
these collections carry once fetched are [row-collections.md](./row-collections.md),
[assets.md](./assets.md) and [blueprints.md](./blueprints.md). The member walk behind every
corporation-scoped fetch is [blueprints.md](./blueprints.md) § Corporation blueprints as a single
access point — every corporation and corporation-division row in the table below reads through it.
Where the Accounts page shows this per character → [accounts/characters.md](../accounts/characters.md).

## The collection table

`collections.js` carries one row per ESI collection the app holds — sixteen of them — naming its
scope, its phase, the OAuth scope ESI requires of the token (`esiScope`), the ESI rate-limit bucket
it spends from, and its query factory. Nothing else enumerates the collections.

| Scope | Meaning |
|-------|---------|
| `character` | fetched once per linked character |
| `corporation` | fetched once per corporation — one member's token serves every member |
| `corporation-division` | fetched once per corporation *and* wallet division, because ESI grants wallet access one division at a time |

| Phase | Meaning |
|-------|---------|
| `first-paint` | the planner and the recipe search cannot render without it — skills, blueprints, industry jobs, both character- and corporation-scoped |
| `deferred` | read only on the accounting surfaces, so it may trail — standings, market orders, historic market orders, journal, transactions |
| `on-demand` | never prefetched; fetched when a consumer mounts — both asset collections. Assets are the largest thing the app fetches and only a handful of surfaces read them, so this row is where that choice is recorded rather than left as an absence from the table |

`esiScope` is read from the published ESI specification for the endpoint, not from `EVE_SCOPE` — the
scope the application asks EVE SSO for at sign-in. A token keeps only the scopes it was issued with,
so `esiScope` is what decides, per character, whether a collection can be served at all: a character
linked before a scope was added to `EVE_SCOPE` cannot serve the collections that need it, however
healthy its credentials otherwise are.

## The scheduler

`scheduler.js`'s `planPrefetch(characterHashes, phase)` expands the table into the work an account
actually needs: a `character` row becomes one item per character, a `corporation` row one item per
distinct corporation among those characters, and a `corporation-division` row one item per
corporation *and* division rather than once per member. An `on-demand` row plans nothing.

A single shared queue serves both login entry points — the session-apply step, which warms the main
character, and the post-login account sync, which warms the linked characters it has just built —
rather than one queue each; two independent queues would each carry their own phase order and budget,
letting one caller's deferred work race the other's first-paint work. Work is claimed by query key as
it is queued (`claimed`, keyed by `JSON.stringify(query.queryKey)`), so two callers reaching for the
same corporation schedule it once.

`prefetchCollections(queryClient, characterHashes, shouldLog)` is the single entry point for login,
and for warming a character's collections again once its credentials work — see
[accounts/characters.md](../accounts/characters.md) § Linking a character again. It walks the two
prefetched phases in order, and the drain (`drain()`) holds at most **eight** collections in flight —
a bound on collections, not on characters, and not yet on raw ESI requests, since a
`corporation-division` collection is itself several requests. Before firing an item it checks that
item's ESI rate-limit bucket and defers a spent one to the back of its phase rather than firing into
a refusal (`isBucketExhausted`); when everything left in a pass is deferred, the phase stops and those
consumers fall back to fetching on mount. Each query's own `enabled` gate — a logged-out session, a
Tranquility outage — is honoured rather than overridden, so an outage does not fire the whole table
at an offline server.

**The Tranquility status is awaited before anything is planned**, through
`ensureQueryData(tranquilityServerStatusQueryOptions())`. Every collection query disables itself
until `isTranquilityOnlineFromCache()` is true, and that status is fetched from `App.jsx` at app
start — in parallel with login rather than before it. Planning on an unanswered status builds a
table of disabled queries, drops all of them and reports success having fetched nothing, which is
indistinguishable from a prefetch that ran: the collections simply arrive later, when a page mounts
a consumer. An offline cluster, or a status that cannot be had, means no prefetch at all and those
same on-mount fetches.

## Collection status

`collectionStatus.js` answers, for one character and one collection, what the application currently
holds and how old it is. It is the single function a display reads rather than the React Query cache
directly, so a durable per-character record can eventually replace the source without changing what
reads it.

```js
collectionStatus(queryClient, collection, { characterHash, corporationId, accessToken }, now)
// => { state, at }
```

| State (`COLLECTION_STATE`) | Means |
|------|-------|
| `fresh` | held, and recent enough to trust — judged against the collection's own query `staleTime`, so nothing here carries a second opinion about how old is too old |
| `stale` | held, but older than that |
| `on-demand` | not fetched at login by design (`PHASE.ON_DEMAND`); absence is correct rather than a fault |
| `missing` | prefetched, but nothing has arrived — login may still be running, or its fetch failed |
| `unavailable` | the token was never granted the `esiScope` this collection needs |
| `failed` | the last fetch threw. Deliberately not folded into `unavailable`: the underlying queries raise a plain error alike for a spent rate-limit bucket and for an ESI refusal, so the reason cannot be recovered here, and reporting no access for a character who has it sends a reader to re-authorise for nothing |

A `corporation-division` collection is granted a division at a time, so its state is the **worst**
across all seven divisions (`unavailable` > `failed` > `missing` > `on-demand` > `stale` > `fresh`),
and its age is the oldest of what is held. `characterCollectionStatuses` and
`corporationCollectionStatuses` answer the table's character-scoped and corporation-scoped rows
respectively — the split a display draws on two lists follows this split, not a second one of its
own. A corporation's collections are asked for **once per corporation**, because that is how they
are fetched: the whole list comes back to any member holding the role. Corporation **assets** are
the one corporation-scoped exception carried under `characterCollectionStatuses` instead — ESI
limits that list to what the asking character can see, so it is fetched per character and means
something different for each of them.

### What this is waiting on

React Query's `dataUpdatedAt` is what `collectionStatus` reads today, which answers freshness only
for a collection fetched **in this session** — nothing for one that has not been requested, or for a
session that has just started. A durable per-character, per-collection fetch record would replace
this without changing `collectionStatus`'s signature or anything reading it; nothing durable exists
yet, so an age this function reports covers this browsing session only.
