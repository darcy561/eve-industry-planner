# SPA delivery — plan

**Status:** Phase 1 done. Stage A written ahead of the project as direct fixes and **uncommitted**
(see § Already written). Stages B–E open.
**Code in scope:** [`frontend/Dockerfile`](../../../frontend/Dockerfile),
[`frontend/vite.config.js`](../../../frontend/vite.config.js),
[`frontend/deployment/`](../../../frontend/deployment/) (retired by Stage D), a new
`services/spa-server/`, and the `frontend` target in
[`deployment-tool/internal/images/docker-bake.hcl`](../../../deployment-tool/internal/images/docker-bake.hcl).
**Live SoT (until promote):** [stack/](../../stack/contents.md),
[frontend/](../../frontend/contents.md), [backend/](../../backend/contents.md)

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
Go surfaces in scope: `go fix -diff` run over `shared/logs`, `shared/httpmiddleware`,
`shared/compression` and `shared/appconfig` — clean, no suggestions. Re-run on
`services/spa-server` and any shared package this project edits, before and after each Go slice.
Live SoT will not be edited until this project is complete and promotion is approved.

## Why this project exists

The frontend container is 242 MB of which 125 MB is a Node binary serving 4 MB of static files, and
the 364-line server beside it hand-rolls HTTP behaviour that the `services/` module already owns in
shared packages. That is the container half.

The other half is that none of this reaches the reader the way it was meant to. Cloudflare fronts the
site and was revalidating every content-hashed asset **hourly**, because the server's versioned-asset
test looked for hex in filenames that Vite writes in base64url and so matched none of them. The shell
is not edge-cached at all. `env.js` — regenerated per container start, carrying the EVE client id and
callback URL — *is* edge-cached, for an hour.

The two halves are one project because the fixes land in the same places. Cache tiering, precompressed
assets and release-safe asset retention are all decisions the serving process makes, and deciding them
twice — once in `server.js` now, once in Go later — is the thing to avoid.

Raw data: [measurements/image.md](./measurements/image.md),
[measurements/edge-cache.md](./measurements/edge-cache.md),
[measurements/compression.md](./measurements/compression.md).

## Already written

Two fixes were written before this project was opened, as direct responses to what the measurements
found. They sit in the working tree and **are not committed** — this checkout is worked by more than
one session at a time, so until they are in history they are one stray `checkout` or sweeping stage
away from not existing. They are recorded here because this project owns their surfaces from now on,
not because they are outstanding work.

- **The image lost 72 MB.** The runtime stage creates its user before copying, so the recursive
  `chown` no longer rewrites the whole of `dist` into a second layer; and `build.sourcemap` is
  `"hidden"` with the maps deleted after the Sentry upload, so 24.7 MB of source maps stop shipping
  and stop being served publicly. 314 MB → 242 MB reported.
- **Versioned assets are cached as versioned.** `cacheControlFor` in
  [`frontend/deployment/server.js`](../../../frontend/deployment/server.js) replaced an inline
  if/else chain and a regex that had never matched a real filename, covered by
  `server.test.js` beside it.

The second is live-visible only after the change is committed, built and deployed; the probe in
[measurements/edge-cache.md](./measurements/edge-cache.md) shows the state still running in
production.

## Stages

### Stage B — Release safety

The shell is served to browsers with `max-age=3600`, so for an hour after a deployment a reader can
be running the previous shell and asking for chunk names the new container does not have. The server
correctly 404s an extensioned path rather than serving HTML in its place, and with `autoCodeSplitting`
across 162 chunks that surfaces as a lazy route failing mid-session. Nothing in the SPA catches it:
no `vite:preloadError` listener, no `ChunkLoadError` handling, no router `errorComponent`.

This stage makes a deployment safe regardless of what any cache did, rather than depending on every
layer behaving. Long edge caching of old assets mitigates it — an old chunk stays retrievable — but
mitigation that depends on a cache hit is not the same as handling.

### Stage C — Cache tiers and the CDN headers

Adopt the browser/edge split the API already uses, so the frontend can say "hold this at the edge,
let the browser recheck" instead of one number governing both: `Cache-Control` plus
`CDN-Cache-Control` and `Cloudflare-CDN-Cache-Control`, as `staticdata/endpoints.go` and
`v1endpoints/user/citadelNames.go` do.

The concrete outcome is `env.js` on a short browser TTL and uncached at the edge, and hashed assets
immutable in both tiers.

**The shell needs a decision that is not a code change.** Caching `/` requires a Cloudflare Cache
Rule, which lives in the dashboard, not this repository. It is worth having only with either a short
edge TTL or a purge step on release — and a purge step means a Cloudflare API token, which is new
secret surface in the Deployment Tool's `EnvFields`. Open question below.

### Stage D — Precompress at build, and the Go server

These are one stage because the second is only worth writing once the first has removed the reason
the current server is complicated.

Write `.br` and `.gz` beside each asset during the build and serve the pre-made file, at quality 11
rather than the quality 6 the server can afford per request. Readers get ~9 % fewer bytes and the
serving process stops spending 36 ms per response on work it repeats for every reader of the same
chunk.

Then replace the Node runtime with a Go static server at `services/spa-server`, on `alpine` like every
other service. The SPA does not move: it stays under `frontend/` with its own rules. Only the server
moves, and it has to — `services/` is a single Go module and code outside it cannot import
`shared/logs`, `shared/httpmiddleware` or `shared/compression` without a second module, which would
forfeit the reason for going.

`frontend/deployment/` is deleted by this stage.

### Stage E — Stack citizenship

What the Go server makes possible, once it exists.

[maintenance-mode.md](../../backend/maintenance-mode.md) describes a stack-wide flag under which the
API refuses traffic and "the SPA shows a banner" — but the SPA reaches that banner by booting,
completing a login flow that builds ESI data, and collecting 503s. The container serving it knows
nothing. `appconfig.MaintenanceWatcher` is the NATS-based, no-Redis consumer shape already proven on
`ws-router`, which is a service in exactly this position.

Also in this stage: the runtime config templated into `index.html` instead of fetched as a separate
blocking `env.js` request, which removes the round trip and deletes the staleness problem rather than
shortening it; and `*log-env` / `*otel-env` on the service so the frontend stops being a blind spot
in Tempo.

## What this project does not do

**This is a delivery layer, not a backend for the frontend.** No application logic follows the server
into `services/`. Location-name resolution stays client-side because ESI resolves ids in bulk and
structure names need a character token; planners stay private and undiscoverable; public ESI data is
already fetched server-side by the API and stays there. Server-side rendering is not on this list —
with EVE SSO and per-user data it is a rewrite, not a door this opens.

Bundle size is also out of scope. Nothing here changes what Vite emits, only how it is delivered.

## Naming

The deployed service stays `frontend` — image name, Traefik router, `EIP_FRONTEND_REPLICAS` and
operator habit all say so, and renaming ripples through stack YAML and CI for nothing.

The directory is `services/spa-server` rather than `services/frontend`: two things called "frontend"
in one repository is a daily ambiguity, and `ws-router` is precedent for naming a service for its job.
The cost is that the bake target's tag no longer matches its directory, which is one literal line,
since targets already write tags out rather than deriving them.

That target also keeps `context = "."` where every other Go target uses `context = "./services"`. This
image is the one that spans both halves of the repository — a Node builder stage for the SPA, a Go
stage for the binary — and that is inherent rather than a smell.

## Wire compatibility

| Change | Shape |
|--------|-------|
| Cache-Control / CDN-Cache-Control values | Additive. Headers only; no client reads them as contract. |
| Precompressed assets | Additive. Content negotiation already governs it; a client that sends no `Accept-Encoding` gets the raw file as now. |
| Go server replacing Node | Migrate-required within the image only. The served surface — paths, SPA fallback, `/health.json`, CORS — must be preserved exactly; Traefik's healthcheck path and the Swarm healthcheck both depend on it. |
| `env.js` inlined into the shell (Stage E) | **Breaking for the SPA.** `window.env` must exist before the app reads it; the removal of `/env.js` and the inlining land together or not at all. |
| `services/spa-server` in the module | No wire surface. Imports `shared/` only; imports no other service, per the module's standing rule. |

## Done when

- The image is a Go binary plus `dist` on alpine, and `frontend/deployment/` is gone.
- Assets are precompressed at build time and served without per-request compression.
- Hashed assets are immutable in both cache tiers; `env.js` is not edge-cached.
- A deployment cannot strand a reader on a shell whose chunks have gone.
- The service carries `*log-env` and `*otel-env` and answers maintenance mode.
- Live SoT promoted and this folder deleted.

## Open questions

- **Does the shell get a Cloudflare Cache Rule?** Origin HTML load is currently unmeasured, so the
  benefit is unquantified. Needs either a short edge TTL or a release-time purge; the purge needs a
  Cloudflare API token in `EnvFields`, which is new secret surface for a benefit nobody has sized yet.
- **Does asset retention across releases belong in the server?** Keeping the previous release's `dist`
  alongside the current one makes a stale shell safe without depending on an edge hit. It is the
  strongest form of Stage B and the most work; Stage B's SPA-side recovery may be enough on its own.
- **Which shared logging shape fits a static server?** Per-request logging at the volume a static
  server sees may want sampling rather than the per-request line `shared/httpmiddleware` gives an API.
