# Getting the files to the browser (`frontend/src/Functions/Helper/getCachedData.js`)

Live SoT for how a static data file reaches the SPA and how it is kept current:
[`frontend/src/Functions/Helper/getCachedData.js`](../../../frontend/src/Functions/Helper/getCachedData.js),
driven by
[`frontend/src/Functions/Static/staticDataSync.js`](../../../frontend/src/Functions/Static/staticDataSync.js).

What each file holds and who reads it belongs to the owner topics —
[items.md](./items.md), [reprocessing.md](./reprocessing.md), [recipes.md](./recipes.md). Which files
the server publishes is `staticDataFileDefs` in
[`services/shared/core/sde/files.go`](../../../services/shared/core/sde/files.go), answered by
`CACHED_DATA_FILES` in the SPA; a key naming a file the server does not serve throws on first use.

## Three layers, each holding something different

| Layer | Holds | Lives for |
|---|---|---|
| Cache API (`static-data-cache-v2`) | the downloaded bytes | across reloads, until the build moves |
| A parsed-payload map keyed by versioned URL | the parsed object, shared by every caller | the page |
| React Query, under `["static", <key>]` | the read's loading and error state | the page |

The middle layer is why a file is parsed once rather than once per caller, and why it is keyed by the
*versioned* URL: a new build cannot be served the parse of the file it replaced. Beside those sit the
synchronous owners described in [staticFile.md](./staticFile.md), which hold their own shaped view for
callers that cannot await.

## The build is what decides whether there is work

`/api/static-data/meta` reports a `build_version` for the whole SDE build and a versioned URL per
file. `refreshStaticDataCache` fetches that metadata, compares the build against the one already
cached, and **returns immediately when it has not moved** — no cache walk, no downloads, no parses.
Since static data only changes when a new build is published, an unchanged build is nothing to do.

When the build *has* moved, everything held against the one it replaced is dropped:

- the parsed payloads, cleared inside `refreshStaticDataCache`
- the `["static"]` query entries, invalidated by `staticDataSync`
- the synchronous owners' primed copies, through `resetMarketGroupData`, `resetReprocessing` and
  `resetRecipes`

`changed` is the contract between the two modules: the sync keys all of that off the one boolean the
refresh returns. Stale entries are pruned from the Cache API in the same pass, and any file the cache
is missing is downloaded — nothing is parsed while doing it, because a file is parsed when something
asks for its contents.

## Nothing runs on a timer

The check runs **once, when the page loads**. There is no interval: the files change when a new build
is published and at no other time, so a client has nothing to discover by asking again on a schedule.
The server says when there is something to do instead, three ways:

| The client learns from | When |
|---|---|
| the load-time check | every page load, including a reload |
| a `staticData` websocket message | a build ships while the session is open |
| `visibilitychange` / `online` | a tab that was asleep or offline is back |

The websocket message names the build, so a client already holding it does nothing. What it is
compared against is `heldStaticDataBuildVersion()` — the build whose files are in *this page's*
cache. `app-config`'s `sde_build_version` answers only until the first refresh: it reports the build
the **server** held when it was last fetched, so a client that has acted on one announcement would
compare every later one against the build it loaded with and download the same files again.

A client that does not hold the build **waits a random moment inside a 30-second window** before
downloading — every connected client is told at the same instant, and without the spread they would
all ask for the same files together. The wait is free: what the client holds stays readable and correct until the new files
arrive.

The wake check has a **five-minute floor**, so alt-tabbing costs nothing, and it is the backstop for
the case the socket cannot cover — a throttled background tab is exactly the one that missed the
announcement.

`startStaticDataSync` is called from
[`frontend/src/index.jsx`](../../../frontend/src/index.jsx) rather than from a component, so the
listeners and the first load belong to the page rather than to a mounted tree. Metadata itself is
held for **5 minutes**, so several reads in quick succession do not each ask for it, and concurrent
callers share one request.

## What a reader should expect to survive

A file the browser has cached is served without a download, so the app works offline once primed and
across a reload. Where the Cache API cannot be opened at all — Firefox Mobile under strict privacy
answers `caches.open` with a `SecurityError` — the failure is soft: static data loads over the network
instead, every time, rather than the app refusing to start.

Caches from superseded versions of this scheme are deleted on the first refresh of a session, so a
browser carrying an old one does not hold both.
