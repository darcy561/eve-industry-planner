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
