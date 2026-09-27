# What Cloudflare does with the static data files

Probed 2026-09-24 against `https://www.eveindustryplanner.com`, build `3539543_v1`, plus a read-only
pass over the zone configuration through the Cloudflare API.

This extends [spa-delivery/measurements/edge-cache.md](../../spa-delivery/measurements/edge-cache.md),
which probed the shell, the hashed assets and `env.js` but not these endpoints.

The zone was reconfigured later the same day and these files are now cached — see
[§ The zone as it now stands](#the-zone-as-it-now-stands). Everything above that section records the
state that prompted the change, and is kept because the reasoning is what the later sections rest on.

## Every file was a miss

| Resource | `cache-control` from origin | `cf-cache-status` | Brotli bytes |
|---|---|---|---|
| `/api/static-data/meta` | `public, max-age=600, stale-while-revalidate=60` | DYNAMIC | 1.3 KB |
| `recipeList.json?v=…` | `public, max-age=2592000, immutable` | **DYNAMIC** | 226 KB |
| `fullItemList.json?v=…` | same | **DYNAMIC** | 192 KB |
| `searchIndex.json?v=…` | same | **DYNAMIC** | 45 KB |
| `reprocessingData.json?v=…` | same | **DYNAMIC** | 6 KB |
| `inventionModifiers.json?v=…` | same | **DYNAMIC** | 0.4 KB |

Every file also sends `CDN-Cache-Control: public, s-maxage=2592000, immutable` and
`Cloudflare-CDN-Cache-Control` alongside, and all of it is ignored. Typical TTFB was 0.14–0.36 s, so
the path is not slow; it is simply never cached.

## Zone configuration, as it was

| Setting | Value | Note |
|---|---|---|
| Plan | Free, proxied, `full` | |
| `cache_level` | **`basic`** | Cloudflare's documented default is `aggressive` |
| `tiered_caching` | **on** | not editable on this plan |
| `tiered_cache_smart_topology_enable` | **on** | |
| `brotli` | on | |
| `browser_cache_ttl` | **1 second** | set deliberately 2026-01-06, not a default — see the note below |
| Page Rules | none | |
| Cache Rules (`http_request_cache_settings`) | **no ruleset exists** | Free allows 10 |
| Cache Response Rules | none | Free allows 10 |
| Cache Reserve, cache variants | unavailable on Free | |

### Read this one from its own endpoint

`GET /zones/{id}/settings` reports `browser_cache_ttl` as `value: null`. `GET
/zones/{id}/settings/browser_cache_ttl` reports `value: 1`, with the same `modified_on`. The
per-setting endpoint is the truthful one; the aggregate list is not, for this field. Behaviour
confirms it: `/sw.js` 404s come back `cache-control: max-age=1` although the frontend origin sends no
`Cache-Control` on that path.

The value matters less than it first appears. Cloudflare overrides the origin's browser-facing
expiration only when the origin sends nothing, or sends a value **lower** than the Browser Cache TTL
setting — "Cloudflare respects whichever value is higher". At 1 second, the static-data files'
`max-age=2592000` wins and is passed through untouched, which the live probe above confirms. So this
setting does not threaten a long browser cache on these files; it only stamps `max-age=1` onto
responses that arrive with no header of their own. "Respect existing headers" is `0`, and setting it
there would stop that insertion.

## Two independent causes

**`cache_level` is `basic`.** From Cloudflare's own API specification: "The **basic** setting will cache
most static resources (i.e., css, images, and JavaScript). The **simplified** setting will ignore the
query string when delivering a cached resource. The **aggressive** setting will cache all static
resources, **including ones with a query string**" — with `aggressive` as the default. Every
static-data URL carries `?v=<build>`, so under `basic` none of them can be served from cache. This also
means any other query-string URL on the zone is uncached, and it is why the hashed assets do HIT: Vite
puts the hash in the filename.

**`.json` is not in the default cacheable extension list.** `/health.json`, served by the frontend
origin with no query string and `public, max-age=3600`, is **DYNAMIC**. `/favicon.ico` on the same
origin is a **HIT** aged 55 days. So which service serves a file does not decide this, and no origin
header fixes it: per Cloudflare's documentation, Cache Rules are the only mechanism that decides cache
eligibility.

Both have to be addressed. A Cache Rule marking the path eligible covers both; restoring `cache_level`
covers neither on its own.

## `Vary` is not a blocker, but it becomes a hazard

Production returns `vary: Accept-Encoding,Origin` on these files. The `Origin` comes from Traefik's
`cors` middleware — `addVaryHeader=true`, attached to the whole `api` router in `docker-stack.yml` —
while the repo's handler sets only `Accept-Encoding`.

This does **not** prevent caching: "By default, Cloudflare does not consider vary values in caching
decisions", except for `accept-encoding` and the image-variants feature; only `Vary: *` forces a bypass.
The consequence runs the other way. Because the `Vary: Origin` is ignored, once these responses are
cacheable the edge can serve a response whose `Access-Control-Allow-Origin` was computed for whichever
reader missed first. With more than one entry in `EIP_ALLOWED_ORIGINS` that is a CORS mismatch waiting
at the edge, and the clean answer is that public immutable files should not sit behind credentialed
CORS.

## The redirects drop the query string

Both rules in the zone's `http_request_dynamic_redirect` ruleset — apex→www and HTTP→HTTPS, both from
Cloudflare's templates — carry `preserve_query_string: false`. So
`https://eveindustryplanner.com/api/static-data/recipeList.json?v=3539543_v1` lands on the **bare** path,
which the API serves `max-age=2592000, immutable`. Today that is contained: the SPA uses relative URLs,
and nothing is edge cached. With a Cache Rule in place it becomes a thirty-day edge entry for a URL
whose content changes every build.

## What has to be true first

1. The bare, un-versioned path stops being served `immutable` — or, better, files are content-addressed
   so the claim is true rather than asserted.
2. These routes come off the credentialed CORS middleware.
3. `/meta` serves the `no-cache` the repo already sets; production is on `max-age=600`, which caps how
   fast a client can notice a new build.

The rule that landed does not wait on any of them. It requires the version parameter to be present, so
the bare path stays uncached and (1) is held off rather than met; (2) and (3) remain open and are
unaffected by it.

## The zone as it now stands

Changed 2026-09-24 in the dashboard, then read back and probed. The configuration is not held in this
repository — this section records what the zone does, so a later re-measurement starts from the right
baseline.

| Setting | Was | Now |
|---|---|---|
| `cache_level` | `basic` | **`aggressive`** (Standard) |
| `browser_cache_ttl` | 1 second | **0** — respect existing headers |
| Cache Rules | no ruleset existed | **one rule**, enabled |

The one rule:

```
description  Static data — cache versioned builds
expression   starts_with(http.request.uri.path, "/api/static-data/")
               and http.request.uri.query contains "v="
action       set_cache_settings
             cache: true
             edge_ttl.mode:    bypass_by_default
             browser_ttl.mode: respect_origin
```

Probed immediately afterwards: `recipeList`, `fullItemList`, `reprocessingData` and
`inventionModifiers` each went MISS then **HIT** on the versioned URL, while the bare path stayed
**DYNAMIC**. `/meta` is untouched, because it is fetched without a query string.

That last one is a coincidence rather than a guarantee, and it was measured rather than reasoned about.
`GET /api/static-data/meta?v=probe` returned `cf-cache-status: MISS` on the first request and `HIT` with
`age: 0` on the second, both carrying the origin's own `public, max-age=600, stale-while-revalidate=60`;
the bare path returned `DYNAMIC` on the same pass.

So the expression matches on the path prefix plus the presence of `v=`, and `/meta` escapes it only
because `fetchStaticMeta` asks for the bare URL. Adding a cache-buster to that fetch would make the
endpoint that announces new builds the one thing holding a stale answer for ten minutes at a time. An
explicit `and http.request.uri.path ne "/api/static-data/meta"` clause closes it by construction, and is
worth folding in the next time the rule is edited rather than as a change of its own.

### The version parameter is a guard, not just a cache key

`http.request.uri.query contains "v="` is there because of § The redirects drop the query string. The
bare path is reachable, the API serves it `immutable`, and a rule matching on path alone would have
turned that assertion into a thirty-day edge entry at every PoP. Requiring the parameter keeps the
un-versioned URL going to origin, where being wrong costs a request rather than a build.

It can be dropped once the bare path stops claiming `immutable` — which is (1) above, and which Stage B
delivers by content-addressing the files. Until then, removing it re-opens the hazard.

### `edge_ttl` is `bypass_by_default`, and that is deliberate

`respect_origin` uses `Cache-Control` when present and falls back to Cloudflare's default behaviour
when it is not. `bypass_by_default` uses `Cache-Control` when present and **bypasses** when it is not.
These files always send it, so the two are identical here; they diverge only if a static-data file ever
ships without a `Cache-Control`, and there bypassing beats guessing.

It also covers the error path, which the mode's name does not suggest: a 404 on a versioned URL sends
no `Cache-Control`, so it bypasses rather than being cached.

### One value is dangerous and is worth naming

`cache_level` passed through `simplified` on the way to `aggressive`. `simplified` **ignores the query
string when delivering a cached resource**, which for a `?v=<build>` scheme means every build collapses
onto one entry and the first version cached wins. Nothing was eligible for cache during that window, so
nothing was served wrong, but `simplified` is the one setting on this zone that would silently defeat
the version contract this project is built on.

## Why the payoff is larger than the byte count suggests

A cold reader transfers ~470 KB for the whole table, which is modest. But it comes from origin every
time, and Tiered Cache with Smart Topology is already on — so once these files are eligible, origin
sees roughly one fetch per build per upper tier instead of one per reader per PoP. That is also what
makes the API's per-request work (a full copy of the file, a full JSON validation, then compression)
stop mattering at reader scale.

## Production is behind `Public`, and `Public` is behind the working branches

Recorded because it affects any re-measurement. Production runs the **`Public`** branch; there is no
`main` branch in this repository, so a check against one silently answers nothing.

`Public` carries the `?v=` versioning at `staticdata/endpoints.go` and the
`max-age=2592000, immutable` triplet, which is what makes the applied rule safe against deployed code
rather than against a branch. What it does not carry is the `no-cache` on `/meta`: production
advertises **five** file keys where `staticDataFileDefs` has seven — `MARKET_GROUPS` and
`SOLAR_SYSTEMS` are not deployed — and returns `max-age=600` where the working branch sets
`no-cache`.
