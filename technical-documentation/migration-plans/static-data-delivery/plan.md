# Static data delivery — plan

**Status:** Phase 1 done (this folder). Stage D partial — the Cache Rule is applied and probed;
Stages A, B, C and E open, none started.
**Code in scope:** [`services/worker/tasks/sde/publish/`](../../../services/worker/tasks/sde/publish/),
[`services/worker/tasks/sde/update/conversionStage.go`](../../../services/worker/tasks/sde/update/conversionStage.go)
and `persistStage.go` for what they write,
[`services/shared/core/sde/`](../../../services/shared/core/sde/),
[`services/api/staticdata/`](../../../services/api/staticdata/),
[`services/api/helper/sdecache/`](../../../services/api/helper/sdecache/),
[`frontend/src/Functions/Helper/getCachedData.js`](../../../frontend/src/Functions/Helper/getCachedData.js),
[`frontend/src/Functions/Static/`](../../../frontend/src/Functions/Static/),
[`frontend/src/Functions/Job Build/getItemRecipes.js`](../../../frontend/src/Functions/Job%20Build/getItemRecipes.js),
and the `cors` middleware attachment in [`docker-stack.yml`](../../../docker-stack.yml).
**Live SoT (until promote):** [frontend/static-data/](../../frontend/static-data/contents.md),
[backend/](../../backend/contents.md), [stack/](../../stack/contents.md)

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
Go surfaces in scope: `go fix -diff` run 2026-09-24 over `worker/tasks/sde/publish`,
`worker/tasks/sde/update`, `shared/core/sde`, `api/staticdata` and `api/helper/sdecache` — **empty diff
on all five**, no modernisations owed before this work. Re-run on the packages each slice edits, before
and after.
Live SoT will not be edited until this project is complete and promotion is approved.

## Why this project exists

Three separate things are wrong with the path between a converted build and a value read during a
render, and they are one project because they are the same mechanism seen from different ends.

**Nothing is cached at the edge.** Probed on the live zone, every static-data file answers
`cf-cache-status: DYNAMIC`. The endpoint sets `CDN-Cache-Control: public, s-maxage=2592000, immutable`
and it is ignored, for two independent reasons: the zone's `cache_level` is `basic` rather than
Cloudflare's default `aggressive`, so no URL carrying a query string is served from cache — and every
static-data URL is `?v=<build>` — and `.json` is not in the default cacheable extension list, which
`/health.json` (DYNAMIC) against `/favicon.ico` (HIT, 55 days) demonstrates on the frontend's own
origin. So every reader of every build pulls the whole table from origin, and the origin repeats its
per-request work for each of them. Tiered Cache and Smart Topology are already on, so the fix
compounds. Raw data: [measurements/cloudflare.md](./measurements/cloudflare.md).

**The version is a label, not the content.** `PublishLive` copies the live tree to a labelled archive,
overwrites `live_data/` from a staging prefix, then writes `version.json` last. Between those steps
`/meta` reports the old build against the new files, and a failure part-way through leaves `live_data/`
mixed with no recovery path. The `versioned_url` a client caches is the same object path with a `?v=`
query, served `immutable` for thirty days — including the bare path with no query at all, which the
zone's apex→www and HTTP→HTTPS redirects produce because both carry
`preserve_query_string: false`. Content-addressing removes the whole class.

**The SPA downloads everything at boot, and the largest file serves one call site.** `recipeList.json`
is 10.1 MB published and is read by `buildJob.js` alone, a handful of ids at a time, when a reader
creates a job — for which a batching API endpoint and a Mongo collection keyed by `itemID` already
exist and are already wired as the fallback. Existing jobs do not need it at all, because a job
document stores the recipe snapshot it was built from. Meanwhile `fullItemList.json` costs 2.5 MB of
heap for 1.3 MB of content because each of its 19,537 entries repeats the id that is already its key.
Raw data: [measurements/payloads.md](./measurements/payloads.md).

## Stages

### Stage A — The bytes, once

Two changes to published output, taken together so clients re-download once rather than twice, and
taken before Stage B so the content hashes have their final format as a baseline.

- Write the payloads compact. `addJSONFile` uses `MarshalIndent`; nothing reads these by eye and
  `recipeList.json` is 10.13 MB indented against 4.85 MB compact. `version.json` and the manifest stay
  indented — they are read by people.
- Flatten `fullItemList` entries so an entry does not repeat its own key, and carries a bare value
  where that is all it has.

### Stage B — Content-addressed objects and one manifest

The keystone. Each output is written under a key derived from the hash of its bytes; `version.json`
becomes a manifest naming the build and, per file key, that file's hash and object key. Publishing is
then "write the new objects, then write one manifest", which is atomic by construction.

What this removes rather than fixes: the staging prefix, `promoteStaging`, the archive copy,
`ResolveArchiveVersionName`, `NextBuildVersionName`, `PrunePreviousVersions` and the
`previous_versions/` layout. Rollback becomes writing an older manifest. Retention becomes object
lifecycle. `replaceCurrentOnly` — a parameter on three functions, discarded with `_ =` in the last of them —
disappears with the machinery it was steering, which is why
[static-data-build](../static-data-build/plan.md) § Stage D waits for this rather than repairing it.

It also gives the build project the comparison it needs: a converted file whose hash matches the live
manifest is not republished, which is what catches the localisation-only builds the changes feed cannot
decide.

### Stage C — Stop paying per reader for immutable bytes

- Validate each file once when the process cache warms, not on every request. `serveStaticDataFile`
  currently unmarshals the whole body into a `jsontext.Value` per request purely to check it parses.
- Hold a precomputed brotli and gzip form beside the bytes, keyed by hash, and serve those instead of
  buffering and compressing per request in the middleware.
- Serve the shared slice rather than `ReadLiveFile`'s per-caller copy of the whole file.
- `/meta` gets the `no-cache` the repo already sets; production is serving `max-age=600`, which caps
  how fast a client can notice a build.

Ordered after Stage B because a compressed form keyed by content hash cannot be served stale, and
because the cache only needs to re-warm the files whose hash moved.

### Stage D — The edge (partial)

**The Cache Rule is applied.** It matches the static-data path **and** requires the version parameter
to be present, which is what let it land before Stage B rather than after: the un-versioned path keeps
going to origin, so the `immutable` the API asserts on it is never held at an edge. `/meta` is excluded
by having no query string rather than by a written exclusion. Rule text, the settings that changed
alongside it, and the HIT/DYNAMIC probes are in
[measurements/cloudflare.md](./measurements/cloudflare.md) § The zone as it now stands.

Still open:

- Take these routes off the credentialed CORS middleware. Cloudflare ignores `Vary` by default except
  `accept-encoding`, so a cached response can carry an `Access-Control-Allow-Origin` computed for
  whichever reader missed first. This is now live rather than hypothetical, because the responses are
  cached.
- Drop the version-parameter guard once Stage B makes the URLs content-addressed and the bare path
  stops claiming `immutable`. Removing it earlier re-opens the hazard it exists for.

The Cache Rule itself is dashboard configuration and is not held here. What this project owns is the
decision, its prerequisites and the measurement that justifies it.

### Stage E — What the SPA actually loads

Three tiers, matching the three ways these files are read. The owner layer is not touched: `staticFile`,
`prime`/`read`/`view`/`reset`, the name-keyed maps and "null means not arrived" all stay as they are.

- **Boot** — the item identity file only. Everything that draws an item needs it immediately.
- **Primed by the surface that needs it** — the search index when the picker or fit parser opens, the
  reprocessing file on that page, market groups on the first priced surface, solar systems and
  invention modifiers on demand. `cacheAllStaticData` stops pulling these at page load; `prime` fetches
  on first read, which the owner shape already supports.
- **Per item** — recipes become a React Query entry per item id with one batching loader beneath, a
  synchronous read and an imperative reader, which is the shape the location-name cache already
  establishes. `getItemRecipes` becomes that loader instead of a fallback. The round trip that made
  this a file in the first place is removed by prefetching on selection, not by shipping all 4,234
  recipes.

`refreshStaticDataCache` currently reduces a build to one `changed` boolean and `staticDataSync` uses it
to drop all three synchronous owners together. With the manifest, that becomes a set of changed file
keys, so a build that moves one file drops one owner.

## What this project does not do

It does not change whether a build runs or what the run costs — that is
[static-data-build](../static-data-build/contents.md). It does not change the figures the conversion
computes. It does not touch the shell, the hashed assets or the Go static server, which are
[spa-delivery](../spa-delivery/contents.md); that project's open question about a Cache Rule for the
shell is unchanged by this one, and stays there.

It does not move location-name resolution, and it does not make the SPA's static reads asynchronous at
the call sites that cannot await.

## Wire compatibility

| Change | Shape |
|--------|-------|
| Compact JSON output, flattened item entries (Stage A) | **Breaking** for `FULL_ITEM_LIST`'s reader shape; contained to one owner pair, but the generator and the SPA move together. Compaction alone is additive. Every cached copy misses once. |
| Content-addressed object keys (Stage B) | No client surface — clients read `versioned_url` from `/meta` and never construct a key. |
| `version.json` becomes a manifest (Stage B) | **Migrate-required** for anything reading root `version.json`: the `eip cli` SDE verbs, the rollback path and `RequiredLiveReady`. |
| `previous_versions/` retired (Stage B) | **Breaking** for the operator rollback verb, which is re-expressed as "write an older manifest". |
| `/meta` gains per-file versions (Stage E) | **Additive.** `versioned_url` is already opaque to the SPA, so changing what is inside `?v=` needs no client change. |
| Precompressed forms, warm-time validation (Stage C) | **Additive.** Response bytes and headers unchanged. |
| `/meta` cache headers to `no-cache` (Stage C) | Additive; already the repo's intent and not yet deployed. |
| Static-data routes off the CORS middleware (Stage D) | **Additive for the SPA** (same-origin), potentially breaking for any third-party reader of these public files. Unmeasured — see open questions. |
| Recipes fetched per id (Stage E) | No wire change: `POST /api/v1/blueprints` already returns the shape the file carries. Client behaviour changes; offline job creation regresses. |

## Done when

- A published build is a set of content-addressed objects and one manifest, and no publish can leave a
  half-written live tree.
- The static-data files are served from Cloudflare's cache, verified by `cf-cache-status`.
- The API validates and compresses each file once per build, not once per request.
- A build that changes one file causes clients to re-download one file.
- The SPA's cold start downloads the identity file, and nothing else until a surface asks.
- Live SoT promoted and this folder deleted.

## Open questions

- **Does offline job creation have to keep working?** Live docs state the app works offline once
  primed. Stage E's per-item recipes break that for an item never fetched before. Persisting fetched
  recipes in IndexedDB narrows it to "an item you have never built, while offline"; sharding the recipe
  table into buckets instead keeps offline whole at the cost of a bucketing scheme that must stay
  stable across builds. This decision gates Stage E's shape and should be made before it starts.
- ~~**Should `cache_level` be restored to `aggressive` zone-wide?**~~ **Answered: it was**, on
  2026-09-24. The zone-wide effect is the one the question anticipated — query-string URLs on already
  eligible types are now cacheable, which reaches the hashed assets as well as these files. What it
  does not reach is `.json` eligibility, so it was never a substitute for the rule. Watch for any other
  query-string endpoint that was relying on `basic` to stay uncached.
- **Does anything outside the SPA read these files?** Taking the routes off the CORS middleware, and
  content-addressing the keys, both assume not. The access logs would answer it; nobody has looked.
- **Where does the manifest leave the `eip cli` SDE verbs?** `sde_version`, `sde_lock` and the rollback
  verb all read the current layout. They need re-expressing against a manifest, and that is operator
  surface, so it needs naming in the Deployment Tool's own docs at promote.
- **Is one project or two right for the boundary with the build side?** The content hash is produced
  during a build and exists for delivery. It is placed here because the published shape is a delivery
  contract, but the seam is worth revisiting if it forces the two projects to land slices in lockstep.
