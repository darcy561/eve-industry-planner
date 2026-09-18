# Login collection prefetch (`frontend/src/Functions/EveESI/prefetch`)

Live SoT for how every ESI collection the app holds is fetched at login: the declared table of
scope and phase per collection, the scheduler that expands it into work for an account, the shared
queue both login entry points feed, and the request budget it holds to. Package:
[`frontend/src/Functions/EveESI/prefetch`](../../../frontend/src/Functions/EveESI/prefetch).

Login itself — tokens, sessions, the private-request path — is
[frontend/auth/spa.md](../auth/spa.md); this topic only covers what login *triggers*. The row shapes
these collections carry once fetched are [row-collections.md](./row-collections.md),
[assets.md](./assets.md) and [blueprints.md](./blueprints.md). The member walk behind every
corporation-scoped fetch is [blueprints.md](./blueprints.md) § Corporation blueprints as a single
access point — every corporation and corporation-division row in the table below reads through it.

## The collection table

`collections.js` carries one row per ESI collection the app holds — sixteen of them — naming its
scope, its phase, the ESI rate-limit bucket it spends from, and its query factory. Nothing else
enumerates the collections.

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

`prefetchCollections(queryClient, characterHashes, shouldLog)` is the single entry point for login.
It walks the two prefetched phases in order, and the drain (`drain()`) holds at most **eight**
collections in flight — a bound on collections, not on characters, and not yet on raw ESI requests,
since a `corporation-division` collection is itself several requests. Before firing an item it checks
that item's ESI rate-limit bucket and defers a spent one to the back of its phase rather than firing
into a refusal (`isBucketExhausted`); when everything left in a pass is deferred, the phase stops and
those consumers fall back to fetching on mount. Each query's own `enabled` gate — a logged-out session,
a Tranquility outage — is honoured rather than overridden, so an outage does not fire the whole table
at an offline server.

**The Tranquility status is awaited before anything is planned**, through
`ensureQueryData(tranquilityServerStatusQueryOptions())`. Every collection query disables itself
until `isTranquilityOnlineFromCache()` is true, and that status is fetched from `App.jsx` at app
start — in parallel with login rather than before it. Planning on an unanswered status builds a
table of disabled queries, drops all of them and reports success having fetched nothing, which is
indistinguishable from a prefetch that ran: the collections simply arrive later, when a page mounts
a consumer. An offline cluster, or a status that cannot be had, means no prefetch at all and those
same on-mount fetches.
