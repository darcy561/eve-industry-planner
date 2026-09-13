# Getting the files to the browser (`frontend/src/Functions/Helper/getCachedData.js`)

Live SoT for how a static data file reaches the SPA and how it is kept current:
[`frontend/src/Functions/Helper/getCachedData.js`](../../../frontend/src/Functions/Helper/getCachedData.js),
driven by
[`frontend/src/Hooks/App/useFetchStaticDataFiles.js`](../../../frontend/src/Hooks/App/useFetchStaticDataFiles.js).

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
Since static data only changes when a new build is published, an unchanged build is nothing to do, and
walking every entry on a timer for the life of the page was work with no result.

When the build *has* moved, everything held against the one it replaced is dropped:

- the parsed payloads, cleared inside `refreshStaticDataCache`
- the `["static"]` query entries, invalidated by `useFetchStaticDataFiles`
- the synchronous owners' primed copies, through `resetMarketGroupData`, `resetReprocessing` and
  `resetRecipes`

`changed` is the contract between the two modules: the hook keys all of that off the one boolean the
refresh returns. Stale entries are pruned from the Cache API in the same pass, and any file the cache
is missing is downloaded — nothing is parsed while doing it, because a file is parsed when something
asks for its contents.

The check runs on mount and every **30 minutes** after. Metadata itself is held for **5 minutes**, so
several reads in quick succession do not each ask for it, and concurrent callers share one request; a
read that already has metadata never goes to the network for it.

## What a reader should expect to survive

A file the browser has cached is served without a download, so the app works offline once primed and
across a reload. Where the Cache API cannot be opened at all — Firefox Mobile under strict privacy
answers `caches.open` with a `SecurityError` — the failure is soft: static data loads over the network
instead, every time, rather than the app refusing to start.

Caches from superseded versions of this scheme are deleted on the first refresh of a session, so a
browser carrying an old one does not hold both.
