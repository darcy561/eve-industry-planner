# Static data delivery — review

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
This review edits nothing outside the project folder and does not move any status in `plan.md`;
it records what the code bears out so the plan can be corrected deliberately.

Verified against the working tree on 2026-10-05 (HEAD 051f79cf9 plus uncommitted changes).

## Summary

The project replaces a mutated `live_data/` tree and its labelled snapshots with content-addressed
objects and one manifest, moves validation and compression off the per-request path, gets the files
held at an edge cache, and stops the SPA downloading a 10 MB recipe table it reads a handful of ids
from. The plan says Stage D is partial and Stages A, B, C and E are open; the code bears that out,
with one refinement: Stage C's `/meta` `no-cache` is already in the working tree (and on this branch's
history) but not on `Public`, so one of Stage C's four items is landed-but-undeployed.

Two things most need attention. The manifest's migrate-required list in the plan names three readers
of `version.json`; the code has ten, including the API's cache warmer and the version lock. And Stage D
and the project's done-when are written against Cloudflare specifically — a Cache Rule, zone settings,
`cf-cache-status` — while EIP is self-hostable and the repository must not assume a provider; that
needs restating as a decision rather than a stage.

## Verified status

| Stage / slice | Plan says | Code bears out | Evidence | Verdict |
|---|---|---|---|---|
| Phase 1 | done | Folder, plan, overlay scaffold (Stage D section written), two measurement files, section row | this folder; `../contents.md` row 42 | confirmed |
| A — compact JSON | open | `addJSONFile` writes every output through `jsoncodec.MarshalIndent`; `MarshalIndent`'s own doc comment calls the choice a payload decision not taken there | `update/conversionStage.go`, `services/shared/jsoncodec/jsoncodec.go` | confirmed |
| A — flattened `fullItemList` entries | open | `FullItem` carries `TypeID json:"type_id"` and `GenerateFullItemListOutput` writes it under a key that is the same id. The entry also now carries `category_id`, `group_id`, `faction_id`, `market_group_id` (industry-bonuses work), so "a bare value where that is all it has" would rarely apply | `conversion/types.go`, `conversion/output_full_item_list.go` | confirmed open; target shape needs restating |
| B — content-addressed objects, one manifest | open | `PublishLive` stages under `.live_data.tmp.<nanos>/`, archives `live_data/` to `previous_versions/<label>/`, overwrites `live_data/`, writes `version.json` last; `VersionJSON` is the version record; `PrunePreviousVersions`, `RollbackLive`, `ResolveArchiveVersionName`, `NextBuildVersionName` all present | `publish/publish.go`, `services/shared/core/sde/files.go`, `store.go` | confirmed |
| B — `replaceCurrentOnly` | removed with the machinery | `promoteStaging` opens `_ = replaceCurrentOnly` | `publish/publish.go` | confirmed open |
| C — validate once at warm | open | `serveStaticDataFile` unmarshals the body into a `jsontext.Value` on every request | `services/api/staticdata/endpoints.go` | confirmed |
| C — precomputed brotli/gzip | open | Compression is `middleware.CompressionConstructor`, per request, brotli level 4/6 from `shared/compression`; `S3Backend.Put` hard-codes `ContentType: "application/json"` and the `Backend` interface has no metadata parameter | `services/api/middleware/compression.go`, `services/shared/core/objectstore/s3.go`, `backend.go` | confirmed |
| C — serve the shared slice | open | `ReadLiveFile` copies the cached bytes per call (`out := make([]byte, len(data)); copy(out, data)`) | `services/api/helper/sdecache/cache.go` | confirmed |
| C — `/meta` `no-cache` | open, "not yet deployed" | Working tree sets `Cache-Control: no-cache` plus the two CDN headers; `Public` still sets `public, max-age=600, stale-while-revalidate=60` | `services/api/staticdata/endpoints.go`; `git show Public:services/api/staticdata/endpoints.go` | understated: code landed, deployment pending |
| D — Cache Rule applied | partial, done | Dashboard configuration; not held in the repository. The measurement records the rule text and HIT probes | `measurements/cloudflare.md` § The zone as it now stands | unverifiable from code |
| D — routes off credentialed CORS | open | `cors` middleware with `accessControlAllowCredentials=true` and `addVaryHeader=true` is attached to the whole `api` and `api-secure` routers | `docker-stack.yml` lines 256–266 | confirmed |
| D — drop the `v=` guard | waits on B | `serveStaticDataFile` sets `public, max-age=2592000, immutable` whether or not the request carries `?v=`; `MetaHandler` emits `VersionedURL = URL + "?v=" + BuildVersion` | `services/api/staticdata/endpoints.go` | confirmed |
| E — boot loads the identity file only | open | `startStaticDataSync()` runs from `index.jsx`; `refreshStaticDataCache` → `cacheAllStaticData(meta)` downloads every `file_keys` entry serially on a changed build | `frontend/src/index.jsx`, `Functions/Static/staticDataSync.js`, `Functions/Helper/getCachedData.js` | confirmed |
| E — recipes per item | open | `Functions/Static/recipes.js` holds the whole file as a `Map`; `getItemRecipes` reads it first and falls back to `fetchBlueprints`; `useCachedData` still exposes a `RECIPE_LIST` reader though no component uses it | `Functions/Static/recipes.js`, `Functions/Job Build/getItemRecipes.js`, `Hooks/App/useCachedData.js` | confirmed |
| E — `changed` becomes a set of keys | open | `refreshStaticDataCache` returns one `changed` boolean; `staticDataSync` resets all four owners on it | `Functions/Helper/getCachedData.js`, `Functions/Static/staticDataSync.js` | confirmed |
| `go fix -diff` empty on five packages | done 2026-09-24 | Not re-run here | — | unverifiable |

### Discrepancies

- **`/meta` `no-cache` is landed, not open.** Stage C lists it as work and the wire table says "not
  yet deployed". The working tree and this branch carry it; only `Public` lacks it. It is a deployment
  fact, not a code item, and belongs in the overlay's Stage C section as "landed, ships with the next
  release".
- **The manifest's migrate-required list is short.** The plan names "the `eip cli` SDE verbs, the
  rollback path and `RequiredLiveReady`". Readers of root `version.json` or the `previous_versions/`
  layout in the code: `sdecache.warmLiveCache` (keys the API process cache on `version.Version`),
  `staticdata.MetaHandler`, `startup.EnsureLiveSDEExists`, `update.readCurrentVersion` (the version
  check's "current build"), `update.ApplySDEVersion` and `RebuildCurrentSDEVersion`,
  `cli.RunSdeVersion` / `RunSdeVersionHistory`, `rollback.RollbackSDEVersion`, `publish.*`, and
  `sdecore.VersionLock` whose `Version` field holds the `<build>_v<n>` label. All of them move in
  Stage B.
- **`fullItemList`'s target shape is stale.** When the plan was written an entry was
  `{type_id, name}`; it is now `{type_id, name, category_id, group_id, faction_id, market_group_id}`
  with `omitzero` on the four ids. "Drop the repeated key" still holds — nothing in the SPA reads an
  item record's `type_id` (every `.type_id` read in `frontend/src` is an ESI market-order field) — but
  "a bare value where that is all it has" would make the map polymorphic for readers such as
  `itemNameFrom` that do `records?.[typeID]?.name`.
- **Stage D is provider-specific in a self-hostable product.** The stage, the overlay and the
  done-when ("served from Cloudflare's cache, verified by `cf-cache-status`") assume one CDN. The code
  already carries a `Cloudflare-CDN-Cache-Control` header beside the standard `CDN-Cache-Control`.
  See Decision 4.
- **The recipe-table question is held in two projects.**
  [spa-delivery](../spa-delivery/plan.md) § Open questions asks "Should the SDE static-data table stop
  being written indented?" with its own measurement; this project's Stage A answers it. One should
  point at the other.
- **Working-tree edits in scope are another project's.** `conversionStage.go`, `recipeListDiffStage.go`
  and `conversion/` are modified for reprocessing-rebuild § Stage B (the reprocessing file is
  `{ items, materialVolumes }`). They change what one file contains, which this plan says is not its
  concern; they do not touch how it is published or served.

## What each remaining step changes

### Stage A — The bytes, once

**Today.**

```go
// services/worker/tasks/sde/update/conversionStage.go
func addJSONFile(out map[string][]byte, basePath string, v any) error {
    jsonData, err := jsoncodec.MarshalIndent(v)
```

```json
// fullItemList.json entry today (key repeats type_id)
"34": { "type_id": 34, "name": "Tritanium", "category_id": 4, "group_id": 18, "market_group_id": 1857 }
```

**After.**

```go
jsonData, err := jsoncodec.Marshal(v)   // compact; version.json and the manifest keep MarshalIndent
```

```json
"34": { "name": "Tritanium", "category_id": 4, "group_id": 18, "market_group_id": 1857 }
```

The plan's "bare value" variant is not recommended (Decision 5). `FullItem.TypeID` is deleted.

**Work.**
1. `addJSONFile` uses `jsoncodec.Marshal`; `sdecore.WriteVersionJSON` stays indented.
2. Delete `FullItem.TypeID`; update `GenerateFullItemListOutput`, `output_full_item_list_test.go`
   and `verify_output_test.go`.
3. SPA: confirm no reader of an item record's `type_id` (none found); `Hooks/Static/useItems.js` and
   `Functions/Static/items.js` are unchanged.
4. Re-measure `measurements/payloads.md` § Parse and heap on the new shape.
5. Overlay § The published bytes.

**Wire.** Breaking for `FULL_ITEM_LIST` in the narrow sense that a field disappears; no SPA reader
uses it, so no client change. Compaction is additive. Every cached copy misses once on the release's
forced rebuild (`prepareRelease` already runs `rebuildCurrentSDEVersion`; no new step).

### Stage B — Content-addressed objects and one manifest

**Today.** Keys are `live_data/<file>` and `previous_versions/<build>_v<n>/<file>`; the version record is:

```json
// version.json
{
  "version": "3539543_v1",
  "build_number": 3539543,
  "release_date": "2026-09-23",
  "key": "sde",
  "download_url": "https://developers.eveonline.com/static-data/tranquility/eve-online-static-data-3539543-jsonl.zip",
  "downloaded_at": "…", "generated_at": "…", "source": "EVE Online Static Data"
}
```

and `/api/static-data/meta` derives `versioned_url` from it as `/api/static-data/<file>?v=3539543_v1`.

**After.** The plan fixes the idea, not the shape. One reading consistent with it:

```json
// manifest.json (replaces version.json at the root; indented, read by people)
{
  "build_number": 3539543,
  "release_date": "2026-09-23",
  "generated_at": "…",
  "files": {
    "RECIPE_LIST":    { "name": "recipeList.json",   "sha256": "9f2c…", "key": "objects/9f2c….json", "size": 4849131 },
    "FULL_ITEM_LIST": { "name": "fullItemList.json", "sha256": "41aa…", "key": "objects/41aa….json", "size": 1298728 }
  }
}
```

Objects are written under `objects/<sha256>.json` (immutable by construction, so an existing key is
not rewritten); the manifest is written last and is the only mutable object. `/meta` becomes a
projection of it, and `versioned_url` carries the file's own hash:

```json
// /api/static-data/meta after — additive: the SPA treats versioned_url as opaque
"file_keys": { "RECIPE_LIST": { "url": "/api/static-data/recipeList.json",
                                "versioned_url": "/api/static-data/recipeList.json?v=9f2c…", "size": 4849131 } }
```

Rollback is "write an earlier manifest"; retention is the set of hashes any retained manifest still
names (see Decision 3 on whether that is bucket lifecycle or a worker prune).

**Work.**
1. `services/shared/core/sde`: a `Manifest` type with read/write, `ObjectKey(hash)`, and a
   `RequiredLiveReady` that checks every object the manifest names exists and is non-empty.
2. `publish.PublishLive` becomes: hash each file, `Put` the missing objects, write the manifest.
   Delete `promoteStaging`, `liveDataExists`, `writeArchiveVersion`, `ResolveArchiveVersionName`,
   `NextBuildVersionName`, `NextUnknownVersionName`, `IsBuildVersionLabel`, `PrunePreviousVersions`,
   `GetLatestPreviousVersion` and `renamePrefix`; `RollbackLive` writes the previous manifest.
3. Return per-file "changed" to the build side (`PublishResult.ChangedKeys`) so
   [static-data-build](../static-data-build/plan.md) § Stage D can gate the Mongo sync and the recipe
   diff on it, and localisation-only builds publish nothing.
4. Move every reader listed under Discrepancies onto the manifest: `sdecache.warmLiveCache` keys on
   the manifest's hashes per file (so a one-file build re-warms one file); `MetaHandler`;
   `EnsureLiveSDEExists`; `readCurrentVersion`; `ApplySDEVersion`; `RebuildCurrentSDEVersion`;
   `RunSdeVersion` / `RunSdeVersionHistory`; `RollbackSDEVersion`; `VersionLock.Version` (the
   `<build>_v<n>` label no longer exists — lock by `build_number` or by manifest hash).
5. Retained history: keep the last N manifests under `manifests/<generated_at>.json` so rollback has
   something to write and `sdeVersionHistory` has something to list.
6. The `?v=` value changes from the build label to a hash; the Cloudflare guard still matches
   (Decision 4 decides whether that guard is a project concern at all).
7. `prepareRelease` step: convert the stored `version.json` + `live_data/` into a first manifest and
   objects, and drop `previous_versions/`. Without it the first post-release warm finds no manifest
   and `EnsureLiveSDEExists` triggers a full build — acceptable as the fallback, but the step makes
   the cutover immediate and keeps rollback history.
8. Tests: `publish_test.go` (`TestPublishLive_S3_firstThenArchive`) and the
   `checkUpdates_integration_test.go` helpers (`seedPreviousVersion`, `expectBuildVersionLabel`) are
   written against labels and `previous_versions/` and are rewritten here.
9. Overlay § The manifest and what a version is.

**Wire.** Migrate-required for every `version.json` reader (same release, same stack, so additive on
the wire between services only once all are deployed together — EIP ships breaking stored-shape
changes as a hard cutover). `/meta` is additive for the SPA. Breaking for the operator verbs
`sdeVersion`, `sdeVersionHistory`, `unlockSdeVersion` and rollback in what they print and mean.

### Stage C — Stop paying per reader for immutable bytes

**Today.**

```go
// services/api/staticdata/endpoints.go — per request
data, err := sdecache.ReadLiveFile(ctx, fileName)     // copies the cached slice
var raw jsontext.Value
if err := jsoncodec.Unmarshal(data, &raw); err != nil { … }   // full parse, result discarded
w.Write(data)                                         // then middleware brotli/gzip-compresses it
```

**After.** `warmLiveCache` validates each object once as it is read, and holds three forms keyed by
hash:

```go
// services/api/helper/sdecache — the shape the plan implies
type cachedFile struct {
    Hash   string
    Raw    []byte
    Gzip   []byte
    Brotli []byte
}
```

`serveStaticDataFile` picks the form from `Accept-Encoding`, sets `Content-Encoding`, `ETag: "<hash>"`
and `Content-Length`, and writes the shared slice. The compression middleware must skip responses that
already carry `Content-Encoding`.

**Work.**
1. Validate at warm, fail the warm (and log which object) on invalid JSON.
2. Precompress at warm with the levels in `shared/compression`, or at publish time into
   `objects/<hash>.json.br` / `.gz` (then `objectstore.Backend` needs a `Put` that can set
   content type and encoding — today `S3Backend.Put` hard-codes `application/json`). Recommend warm-time
   in the API: no interface change, and the worker stays free of HTTP concerns.
3. Replace `ReadLiveFile`'s copy with a read of the shared slice.
4. Serve `ETag` from the hash and answer `If-None-Match` with 304.
5. Teach `middleware.CompressionConstructor` to pass through pre-encoded responses.
6. Overlay § The serve path, including the `no-cache` on `/meta` that is already in code.

**Wire.** Additive. Response bytes identical; `ETag` and `Content-Encoding` are new headers.

### Stage D — The edge

Partial per the overlay. What is still code-side:

**Today.** `docker-stack.yml` attaches one `cors` middleware (credentialed, `addVaryHeader=true`) to
the whole `api` router, so `/api/static-data/*` answers `Vary: Accept-Encoding,Origin` and an
`Access-Control-Allow-Origin` computed for the first reader an edge cache saw.

**After.** Either a second Traefik router matching the `/api/static-data/` path prefix with no CORS
middleware (public files need none same-origin) or a non-credentialed, wildcard CORS middleware on
that prefix (if Decision 2 finds third-party readers). The `?v=` guard and the Cache Rule are
dashboard state — see Decision 4 for whether the project owns them.

**Work.**
1. Stack: the static-data router/middleware split above; `eip sync` applies it.
2. Decision 2 before choosing between "no CORS" and "open CORS".
3. Overlay § The edge: restate in provider-neutral terms once Decision 4 is taken.

**Wire.** Additive for the SPA; potentially breaking for an unknown third-party reader.

### Stage E — What the SPA actually loads

**Today.**

```js
// frontend/src/Functions/Helper/getCachedData.js
async function cacheAllStaticData(meta) {
  for (const fileKey of Object.keys(meta?.file_keys || {})) {   // every key, serially, at boot
    …await fetchAndCacheByURL(cache, cacheURL);
```

```js
// frontend/src/Functions/Static/recipes.js — whole file as a Map, primed by getItemRecipes
const recipes = staticFile(getRecipeListFromCache, (list) => new Map(list.map((r) => [String(r?.itemID), r])));
```

**After.** `cacheAllStaticData` downloads `FULL_ITEM_LIST` only; every other owner's `prime` fetches
on first read (the `staticFile` shape already does this). Recipes follow the `useLocationNames`
precedent — one React Query entry per id, one batching loader beneath, a synchronous read and an
imperative reader:

```js
// after — shape by analogy with Hooks/EveEsi/useLocationNames.js; names are not fixed by the plan
export function useRecipes(itemIDs)          // React Query entries ["recipe", id], one batched POST /api/v1/blueprints
export function recipeFor(itemID)            // synchronous read of a held entry, undefined before it arrives
export async function fetchRecipes(itemIDs)  // imperative, what getItemRecipes becomes
```

`refreshStaticDataCache` returns `{ changedKeys: Set<string> }` from the manifest's per-file hashes and
`staticDataSync` resets only the owners whose key moved.

**Work.**
1. Narrow the boot set; prime `MARKET_GROUPS` and `INDUSTRY_BONUSES` where `staticDataSync` already
   primes them (first priced surface / job figures), the rest on demand.
2. The recipe cache per Decision 1; retire `CACHED_DATA_FILES.RECIPE_LIST`, `getRecipeListFromCache`,
   the `useCachedData` reader and `recipes.js`'s whole-file `staticFile` — or keep the file as a
   bucketed set if Decision 1 goes that way. `files.go`'s parity test
   (`TestSPAAndServerAgreeOnTheStaticDataKeys`) forces the server's `staticDataFileDefs` to move with it.
3. `changedKeys` from the manifest; per-owner reset.
4. Live docs to fold at promote: `frontend/static-data/delivery.md`, `recipes.md`.
5. Overlay § What the SPA loads, and when.

**Wire.** No wire change for recipes (`POST /api/v1/blueprints { idArray }` exists). Client behaviour
changes: offline creation of a job for a never-fetched item regresses unless Decision 1 chooses buckets
or IndexedDB persistence.

## Decisions needed

### 1. Does offline job creation have to keep working?

**Question.** Are recipes fetched per id from the API, persisted per id in IndexedDB after the first
fetch, or shipped as stable buckets of the table?

**Why it is James's call.** The plan's own open question, and it gates Stage E's shape and
[reprocessing-rebuild](../reprocessing-rebuild/plan.md) § Stage M (module and scrap outputs, "a large
table read a few ids at a time"). Live docs state the app works offline once primed; per-id fetching
breaks that for an item never built before. The memory note that module reprocessing data is too large
to ship to the SPA points the same way as per-id, but offline is a product promise.

**Options.**
- *Per id, in memory for the session* — simplest; the location-names precedent; offline job creation
  of an unseen item fails with a clear message.
- *Per id, persisted in IndexedDB* — narrows the regression to "an item you have never built, while
  offline"; adds a storage-backed cache the repository has otherwise avoided for session-scoped
  resolutions.
- *Buckets* (e.g. by `itemID` modulo N, or by market group) — keeps offline whole; needs a bucketing
  scheme stable across builds and a manifest entry per bucket, and makes Stage M's module table the
  same shape.

**Recommendation.** Per id in memory, with the hook and the imperative reader; revisit persistence
only if offline job creation is reported missed. Say so in `recipes.md` at promote.

**Blocked until decided.** Stage E items 2–3; reprocessing-rebuild M3–M5.

### 2. Does anything outside the SPA read these files?

**Question.** Can the static-data routes leave the credentialed CORS middleware and the keys be
content-addressed without breaking a reader nobody has counted?

**Why it is James's call.** Only the access logs answer it, and they are the operator's. Both
Stage B and Stage D assume "no".

**Options.** Read a week of Traefik access logs for `/api/static-data/` requests with an `Origin` or
`Referer` off the SPA's host; or decide the files are the SPA's and accept the risk.

**Recommendation.** Look once; then Stage D's split is "no CORS" if the answer is none, "open
non-credentialed CORS on the prefix" if not.

**Blocked until decided.** Stage D item 1.

### 3. Where rollback, history and retention live once the manifest exists

**Question.** Is retention of previous builds a worker-side prune of old manifests and unreferenced
objects, or the object store's lifecycle rules?

**Why it is James's call.** The plan says "retention becomes object lifecycle". Lifecycle rules are
bucket configuration outside the repository and differ by store (MinIO ILM, AWS S3 lifecycle, others);
EIP is self-hostable and the stack's `ensure-s3` creates buckets but holds no lifecycle policy. The
operator verbs `sdeVersion`, `sdeVersionHistory`, `unlockSdeVersion`, `applySdeVersion`,
`forceSdeRebuild` and rollback all need a shape to print and act on.

**Options.**
- *Worker prune* — keep the last N manifests under a prefix, delete objects no retained manifest
  names; rollback writes manifest N-1 to the root. One code path, works on any S3-compatible store.
- *Lifecycle rules* — no code, but configuration the Deployment Tool would have to own
  (`ensure-s3`) to stay self-hostable, and unreferenced-object detection is not what lifecycle does.

**Recommendation.** Worker prune, N = `sdecore.MaxPreviousVersions` (5) as today; `sdeVersionHistory`
lists retained manifests.

**Blocked until decided.** Stage B items 2, 4, 5.

### 4. The edge is written against one provider

**Question.** Does this project own a Cloudflare Cache Rule and a `cf-cache-status` done-when, or does
it own standard cache headers and content-addressed URLs that any cache can hold, with the provider
rule as the operator's deployment note?

**Why it is James's call.** EIP is a public, self-hostable tool and the repository must not assume a
hosting provider or CDN. Stage D, the overlay and the done-when name Cloudflare; the code sends a
`Cloudflare-CDN-Cache-Control` header beside the standard `CDN-Cache-Control`; `measurements/cloudflare.md`
records a zone's dashboard state. The plan's own "Does not own" already excludes dashboard
configuration, which is the right instinct, but the stage and the done-when have not followed it.

**Options.**
- *Keep as written* — honest about the one live deployment; leaves a provider-specific stage in a
  self-hostable project's plan and a provider header in `services/api`.
- *Restate Stage D as "cacheable by any edge"* — content-addressed `versioned_url`, correct
  `Cache-Control`/`CDN-Cache-Control`, `ETag`, no credentialed CORS on public files, `/meta` `no-cache`;
  done-when is "the versioned URL is cacheable by an intermediary with default rules", verified by
  headers and by a probe through whichever edge the operator runs. The Cloudflare rule text moves to an
  operator note (deployment docs at promote), and `Cloudflare-CDN-Cache-Control` is either dropped or
  kept as a documented harmless duplicate.
- *Hold the provider rule in the Deployment Tool* — rejected already in spa-delivery (needs an API
  token in `EnvFields` for one provider).

**Recommendation.** The second option. Keep `measurements/cloudflare.md` as the measurement it is;
rewrite Stage D and the done-when provider-neutral; decide the header in the same breath.

**Blocked until decided.** Stage D's wording and overlay; the Stage C `ETag` item's justification.

### 5. The flattened item entry's shape

**Question.** Does `fullItemList` drop only `type_id`, or does an entry with a name alone become a
bare string?

**Why it is James's call.** The plan says both. Since it was written the entry gained four optional
ids, so the bare-string case would be rare and would make the map polymorphic for every reader that
does `records[id]?.name` (`itemNameFrom`, `useItemNames`).

**Options.** Drop `type_id` only (one shape; heap saving smaller than measured for the two-field
entry); or bare string where only the name exists (max saving; polymorphic readers).

**Recommendation.** Drop `type_id` only; re-measure.

**Blocked until decided.** Stage A item 2.

### 6. One project or two across the build/delivery seam

**Question.** Should the content hash and the per-file `changed` set move into one project with the
build side, now that build Stage D is blocked on delivery Stage B twice?

**Why it is James's call.** The plan's open question. The seam is clean on paper (what a run leaves
behind versus whether it runs) but Stage B here produces the hash the build project's gate, Mongo sync
and `replaceCurrentOnly` deletion all consume.

**Options.** Keep two folders and sequence delivery B before build D; or fold build Stage D into
delivery Stage B and let the build project close on A–C.

**Recommendation.** Keep two folders; land delivery Stage B as the next slice of either, and move
build Stage D's two blocked items into this project's Stage B work list (they are one change to the
same functions). The build plan then closes on A–C plus its unblocked diff-stage item.

**Blocked until decided.** Nothing is blocked by the decision itself; it decides which plan the work
is recorded in.

## Dependencies and order

**Waits on.** Decision 1 before Stage E; Decision 2 before Stage D's CORS split; Decision 3 before
Stage B's rollback and history. Stage C is ordered after Stage B by the plan (forms keyed by hash),
though items 1, 3 and 5 of Stage C do not need the manifest and could land earlier.

**Waited on by.** [static-data-build](../static-data-build/plan.md) § Stage D (Mongo sync gated on the
recipe hash; `replaceCurrentOnly` deleted with `promoteStaging`) and possibly its Stage A item 4
(cancellation reaching a publish that is not yet atomic). [reprocessing-rebuild](../reprocessing-rebuild/plan.md)
§ Stage M waits on Decision 1. [spa-delivery](../spa-delivery/plan.md)'s indentation question is
answered by Stage A here.

**Recommended next slice.** Stage A (compact output, drop `type_id`) — small, self-contained, and the
baseline the hashes need. Then Stage B with build Stage D's two items folded in, including the
`prepareRelease` conversion of the stored tree. Stage E only after Decision 1.
