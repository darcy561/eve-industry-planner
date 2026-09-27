# What Cloudflare is actually doing

Probed 2026-09-15 against `https://www.eveindustryplanner.com` (the apex 301s to `www`).
`server: cloudflare` on every response, so the zone is proxied.

| Resource | `cache-control` from origin | `cf-cache-status` | `age` |
|----------|-----------------------------|-------------------|-------|
| `/` | `public, max-age=3600, stale-while-revalidate=86400` | **DYNAMIC** | — |
| `/assets/index-jqgY9eWE.js` | `public, max-age=3600, stale-while-revalidate=86400` | HIT | 3278 s |
| `/assets/JobDependencyTreeFlow-DLioOiRN.css` | same | HIT | 3062 s |
| `/env.js` | same | UPDATING | 5158 s |
| `/favicon.ico` | `public, max-age=31536000, immutable` | HIT | **4 093 425 s (47 days)** |

Three separate things are visible here.

## The hourly revalidation was real and running

The main chunk sat at `age: 3278` against a 3600-second TTL — five minutes from going back to origin
for a file whose content cannot change, and doing so once an hour per edge location for every asset.

The favicon row is the control. It is the only resource already carrying `immutable`, and it had been
held for 47 days. That is what every hashed asset looks like once the browser-cache tier is correct.

## The shell is not cached at all

`DYNAMIC` means Cloudflare never considered `/` cacheable. HTML is not in its default extension list
and nothing overrides that, so every page load from every visitor reaches origin for the shell.

No origin header changes this on its own — caching HTML requires a Cache Rule in the Cloudflare
dashboard, which is configuration this repository does not hold.

## `env.js` is held at the edge, and it is the one file that must not be

It is generated at container start and carries `EVE_CLIENT_ID`, `EVE_CALLBACK_URL` and the scope
list. It measured `age: 5158`. Nothing is wrong today only because those values have not changed;
the first rotation of a client id or callback URL leaves a share of readers on the old config for up
to an hour, and the symptom presents as broken EVE login rather than as a cache problem.

## The pattern the API already uses and the frontend does not

`services/api` splits the browser tier from the edge tier by setting three headers —
`Cache-Control`, `CDN-Cache-Control` and `Cloudflare-CDN-Cache-Control`. `staticdata/endpoints.go`
sends all three; `v1endpoints/user/citadelNames.go` uses the split deliberately, giving the browser
seven days and Cloudflare thirty.

The frontend static server sends only `Cache-Control`, so its two tiers are locked to one number and
it cannot say "hold this forever at the edge, but let the browser recheck."

## Re-probed 2026-09-24

Same host, same deployed build — the main chunk is still `index-jqgY9eWE.js`, so nothing about the
frontend has shipped between the two probes. The zone changed underneath it: `cache_level` is now
`aggressive`, `browser_cache_ttl` is now `0`, and one Cache Rule exists, scoped to the static-data
path and not to anything this project owns. Rule text →
[static-data-delivery/measurements/cloudflare.md](../../static-data-delivery/measurements/cloudflare.md)
§ The zone as it now stands.

| Resource | `cf-cache-status` | Unchanged since 2026-09-15? |
|---|---|---|
| `/` | DYNAMIC | yes |
| `/assets/index-jqgY9eWE.js` | HIT on `max-age=3600` | yes — still revalidating hourly |
| `/env.js` | HIT | yes |
| `/favicon.ico` | HIT | yes |

`browser_cache_ttl` moving to `0` did change one thing: `/sw.js` 404s no longer come back
`cache-control: max-age=1`. The frontend origin sends no `Cache-Control` on its 404 path, so the zone
had been inserting one. Those 404s are themselves worth a look — 187 a day for a service worker
`dist` does not contain.

### The shell cannot be revalidated cheaply, because it has no validator

The deployed server sends no `ETag` and no `Last-Modified`, and it has no `If-None-Match` handling: a
conditional request against `/` returns a full `200`, not a `304`. So the 1,654 daily shell requests
each ship the whole ~6.3 KB document, including to readers already holding those exact bytes.

This is the measurement that resolves the Cache Rule question in [plan.md](../plan.md) § Open
questions. A validator plus `no-cache` collects the same bytes as edge caching would, without a Cache
Rule and without anything that assumes Cloudflare is in front — which matters because EIP is a public
tool and is not opinionated about where it deploys.

### `hasHash` is why the hourly revalidation survives

The deployed branch is `Public`, and its server tests the filename with `/[a-f0-9]{8,}/i` — eight or
more consecutive **hex** characters. Vite's base64url hashes contain characters outside that set, so
`index-jqgY9eWE.js` fails the test and falls through to the one-hour branch, while `favicon.ico` gets
`immutable` from a separate extension check. That is the regex named in [plan.md](../plan.md) §
Already landed as never having matched a real filename; `cacheControlFor` replaces it and is not yet
deployed.
