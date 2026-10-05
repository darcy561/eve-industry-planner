# SPA delivery — review

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
This review edits nothing outside the project folder and does not move any status in `plan.md`;
it records what the code bears out so the plan can be corrected deliberately.

Verified against the working tree on 2026-10-05 (HEAD 051f79cf9 plus uncommitted changes). No file
in this project's code surface has uncommitted changes: `frontend/Dockerfile`,
`frontend/deployment/`, `frontend/vite.config.js`, `docker-stack*.yml`, `deployment-tool/` and
`.github/` are all clean.

## Summary

The project replaces a Node static server with a Go one, tiers the caches, moves compression to
build time, and makes a deployment safe for a reader holding the previous shell. Its statuses are
honest: Stage A is in the code and committed, and Stages B to E have no code at all. Nothing is
overstated.

What needs attention is that the plan's descriptions of the remaining stages no longer match the
code they will land in:

- Stage D names `shared/compression` as something the Go server imports. That package is three
  level constants. The compression middleware and the ETag helpers live inside the `api` service,
  which `services/spa-server` is forbidden to import.
- Stage B says nothing in the SPA handles a release. A version check with a Refresh action already
  exists and Stage B should extend it rather than build beside it. It also misses a second cause of
  the same failure that no cache setting touches: the frontend rolls out `start-first`.
- Stage C is ordered before the Go server and so would be written once in Node and again in Go,
  which is the duplication the plan says the project exists to avoid.
- Two of the four open questions are already settled elsewhere and one cross-project sentence is
  stale.

## Verified status

| Stage / slice | Plan says | Code bears out | Evidence | Verdict |
|---|---|---|---|---|
| Phase 1 | Done | Folder, `contents.md`, plan with rules block, overlay scaffold, three measurement files, row in the section task map | `spa-delivery/*`; `migration-plans/contents.md` line 40 | confirmed |
| Stage A, image | Landed, committed | User created before the copies, both copies `--chown`, maps deleted after build, `sourcemap: "hidden"` | `frontend/Dockerfile` runtime stage and `RUN npm run build && find dist -name '*.map' -delete`; `frontend/vite.config.js` `build.sourcemap`; commit `e23f7e0ab` | confirmed |
| Stage A, versioned assets | Landed, committed, not yet deployed | `cacheControlFor` anchors on `-<hash>.<ext>` with a base64url class; five-case test beside it | `frontend/deployment/server.js` `cacheControlFor`; `frontend/deployment/server.test.js`; same commit `e23f7e0ab` | confirmed |
| Stage B, release safety | Open | No `vite:preloadError` listener, no `ChunkLoadError` handling, no `defaultErrorComponent` | `frontend/src/appRouter.jsx` `appRouterOptions`; grep of `frontend/src` | confirmed, with an omission |
| Stage C, cache tiers | Open | Only `Cache-Control` is set; no `ETag`, no `Last-Modified`, no `If-None-Match` handling | `frontend/deployment/server.js` `createServer` | confirmed |
| Stage D, precompress and Go server | Open | `services/spa-server` does not exist; runtime stage is `node:24-alpine`; brotli quality 6 runs per response; nothing writes `.br` or `.gz` | `ls services`; `frontend/Dockerfile`; `server.js` `createBrotliCompress`; `vite.config.js` plugins | confirmed, with a wrong premise |
| Stage E, stack citizenship | Open | Frontend service carries only `*frontend-public-env` and `APP_VERSION`; `index.html` loads `/env.js` as a blocking script; no maintenance consumer | `docker-stack.yml` lines 488 to 534; `frontend/index.html`; `frontend/deployment/runtimeConfig.js` | confirmed, rationale partly stale |
| Open question, shell Cache Rule | Answered: no | Nothing in the Deployment Tool or the release path holds a Cloudflare token or purge step | grep of `deployment-tool/` and `.github/` for `cloudflare` returns nothing | confirmed |
| Open question, SDE indentation | Open | Already decided by another project | `static-data-delivery/plan.md` lines 65 to 67 | overstated as open |
| Open question, logging shape | Open | Largely answered by the shared middleware as it stands | `services/shared/httpmiddleware` tests `HealthSkipsAccessLog`, `BareSuccessEmitsNoAccessLog` | overstated as open |
| Open question, asset retention | Open | Nothing retains a previous `dist` | `frontend/Dockerfile` | confirmed |

### Discrepancies

- **Stage B omits the mechanism that already exists.** `frontend/src/Functions/App/appVersionCheck.js`
  compares the version `/api/v1/app-config` reports against the baked `__APP_VERSION__`.
  `useAppConfig` in `frontend/src/Hooks/App/useAppConfig.jsx` polls it every 30 minutes
  (`DEFAULT_APP_VERSION_CHECK_INTERVAL` in `global-config-app.js`), and the snackbar it raises has a
  Refresh action that calls `window.location.reload()` (`frontend/src/Components/snackbar.jsx`). The
  plan's "nothing in the SPA catches it" is true of a failed chunk and untrue of a release.
- **Stage B attributes the failure to the hour-long shell TTL alone.** `x-app-deploy` in
  `docker-stack.yml` sets `update_config.order: start-first` with `monitor: 30s`, so during every
  rollout an old and a new frontend task serve side by side behind Traefik. A reader given the new
  shell can have a chunk request routed to the old task and receive a 404 with every cache behaving
  perfectly. Stage C does not close this; only retention or SPA-side recovery does.
- **Stage D's shared imports do not exist in the shape the plan assumes.**
  `services/shared/compression/levels.go` holds `ResponseDefaultLevel`, `ResponseHighLevel`,
  `ResponseHighLevelBytes` and `FlateDefaultLevel` and nothing else. `CompressionConstructor` is in
  `services/api/middleware/compression.go`; `BuildJSONPayloadAndWeakETag` and `IfNoneMatchSatisfied`
  are in `services/api/helper/httpcache.go`. `testing/serviceboundaries` discovers services from the
  directory listing, so `spa-server` is bound by the no-service-imports rule from its first commit.
- **Stage D does not mention the Swarm healthcheck.** The frontend service's healthcheck in
  `docker-stack.yml` is `node -e "require('http').get(...)"`. An alpine image with no Node cannot run
  it. The plan's wire table says the Swarm healthcheck depends on `/health.json` being preserved,
  which is right about the path and silent about the command.
- **Stage E's account of maintenance is out of date.** The plan says the SPA reaches the banner "by
  booting, completing a login flow that builds ESI data, and collecting 503s".
  [`backend/maintenance-mode.md`](../../backend/maintenance-mode.md) § What the SPA does and
  `frontend/src/App.jsx` show the banner comes from `app-config`, which the API keeps reachable during
  a window, and from the `maintenance` websocket message. What remains true is narrower: the root
  route's `beforeLoad` in `frontend/src/routes/__root.jsx` awaits `resumeStoredSession` before `App`
  mounts, so a reader with a stored session meets one refused resume first.
- **The SDE indentation question has an owner and an answer.** `static-data-delivery/contents.md`
  lists "the shape of the files, indentation" under Owns, and its plan's Stage A says "Write the
  payloads compact". The question should leave this plan.
- **The comments in the landed code are over the two-line rule.** `cacheControlFor` carries a
  four-line JSDoc prose block, and `server.js`, `start.js` and `frontend/Dockerfile` carry in-body
  comments. Stage D deletes all of `frontend/deployment/`, so this matters only if Stage C edits
  `server.js` first.

## What each remaining step changes

Stage A is landed; see [overlay.md](./overlay.md) § The image and § Cache tiers.

### Stage B — Release safety

**Today.** A lazy route whose chunk is gone fails into TanStack Router's built-in error output,
because the router has no error component:

```js
export const appRouterOptions = {
  routeTree,
  defaultPreload: "intent",
  defaultPendingComponent: RoutePending,
  defaultNotFoundComponent: RouteNotFound,
  defaultPreloadStaleTime: 30_000,
  defaultPendingMs: 150,
  defaultPendingMinMs: 300,
};
```

`defaultPreload: "intent"` means the failed request is usually a hover, not a click, so the first
symptom is silent. Separately, the release signal already reaches the SPA and stops at a snackbar:

```js
export function considerRemoteAppVersion(remoteVersion)
export function isClientAppVersionOutdated()
```

**After.** The plan leaves the target shape unspecified beyond "a deployment cannot strand a reader".
The shape that fits the existing code is one recovery path that both a failed import and the version
check feed:

```js
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  recoverFromMissingChunk();
});

export const appRouterOptions = {
  ...,
  defaultErrorComponent: RouteFailed,
};
```

`recoverFromMissingChunk` forces one `refreshAppConfig(true)`, passes the answer to
`considerRemoteAppVersion`, and reloads once when the client is outdated, guarded by a
`sessionStorage` key in the way `appVersionCheck.js` already guards its notice. `RouteFailed` shows
the failure with a Refresh action for every case the automatic path declines.

**Work.**
1. Add the `vite:preloadError` listener at the entry point (`frontend/src/index.jsx`).
2. Add `RouteFailed` beside `RoutePending` and `RouteNotFound` and wire it as
   `defaultErrorComponent`.
3. Add the recovery function to `appVersionCheck.js`, reusing its storage helpers, with a
   once-per-version reload guard so a chunk that is genuinely absent cannot loop.
4. Decide what an unsaved edit does on an automatic reload (see Decisions).
5. Tests in the existing structure: a unit test for the guard, and a case in
   `frontend/src/routes/routeScreens.e2e.test.jsx` where a route's import rejects.
6. Write overlay § Release safety.

**Wire.** Additive. SPA only; no stored shape, no prepareRelease step.

### Stage C — Cache tiers and the CDN headers

**Today.** One header, one number for both tiers, and no validator:

```text
GET /                      Cache-Control: public, max-age=3600, stale-while-revalidate=86400
GET /env.js                Cache-Control: public, max-age=3600, stale-while-revalidate=86400
GET /assets/index-<hash>.js  Cache-Control: public, max-age=31536000, immutable
```

`stale-while-revalidate=86400` on the shell lets a browser show a day-old shell while it
revalidates, which is a longer exposure than the hour the plan quotes.

**After.** From [plan.md](./plan.md) § Stage C:

```text
GET /                      Cache-Control: no-cache
                           ETag: "<hash of the bytes>"
GET / (If-None-Match hit)  304 Not Modified
GET /env.js                Cache-Control: no-cache
                           CDN-Cache-Control: no-cache
                           ETag: "<hash of the bytes>"
GET /assets/index-<hash>.js  Cache-Control: public, max-age=31536000, immutable
                             CDN-Cache-Control: public, s-maxage=31536000, immutable
```

The plan does not give the edge value for hashed assets or say whether a 404 carries a
`Cache-Control`; the measurements note that the origin sends none on its 404 path.

**Work.**
1. Extend the one rule owner (`cacheControlFor` today) to return the header set rather than one
   string.
2. Compute an `ETag` per file once at start, since `dist` does not change while the process runs,
   except `env.js`, which is written at start and hashed after.
3. Honour `If-None-Match` with a 304.
4. Send `Vary: Accept-Encoding` on every compressible response, as the API does, so an edge never
   serves a brotli body to a client that did not ask for one.
5. Give 404s an explicit `Cache-Control: no-store`.
6. Tests for each tier, and a re-probe recorded in `measurements/edge-cache.md` after deploy.

**Wire.** Additive. Headers only.

### Stage D — Precompress at build, and the Go server

**Today.** A two-stage Node image; a 355-line `server.js` (the plan's 364 predates Stage A);
compression from source on every response:

```text
frontend/deployment/server.js         parseAcceptEncoding, getMimeType, cacheControlFor, createServer
frontend/deployment/start.js          generateRuntimeConfig, then createServer(dist, 80)
frontend/deployment/runtimeConfig.js  writes dist/env.js from five environment variables
frontend/deployment/utils.js          escapeJsString
```

```yaml
healthcheck:
  test: ["CMD", "node", "-e", "require('http').get('http://127.0.0.1:80/health.json', ...)"]
```

**After.** From [plan.md](./plan.md) § Stage D and § Naming:

```text
services/spa-server/           Go, imports shared/ only
frontend/Dockerfile            node builder (vite build, precompress) -> golang builder -> alpine
frontend/deployment/           deleted
dist/assets/index-<hash>.js
dist/assets/index-<hash>.js.br   brotli quality 11
dist/assets/index-<hash>.js.gz
```

```yaml
healthcheck:
  test: ["CMD", "wget", "-qO-", "http://127.0.0.1:80/health.json"]
```

The bake target keeps `context = "."` and its tag; CI's `Set build context and dockerfile` step in
`.github/workflows/publish-containers-public.yml` already passes `context=.` for the frontend, so
neither needs a change. The repo-root `.dockerignore` does not exclude `services/`.

**Work.**
1. Precompress in the build: a step after `vite build` writing `.br` and `.gz` for text assets. The
   plan does not say whether this is a Vite plugin or a script; a new dependency needs the currency
   check the technical rules require.
2. Write `services/spa-server`: static files, SPA fallback for extensionless paths, 404 for
   extensioned ones, `/health.json`, CORS preserved, precompressed-file negotiation, the Stage C
   header rule, `env.js` generation at start, signal-aware shutdown through `shared/lifecycle`.
3. Move what the server needs out of `services/api` into `shared/` first: at minimum
   `IfNoneMatchSatisfied`. A server that only ever serves pre-made files needs no
   `CompressionConstructor`, which removes the larger move.
4. Rewrite the runtime stage on `alpine` with `wget`, matching `services/ws-router/Dockerfile`.
5. Change the frontend healthcheck in `docker-stack.yml`.
6. Port `server.test.js` to Go and add tests for negotiation, fallback and the 404 rule.
7. `go fix -diff` on `services/spa-server` and any shared package edited.
8. Delete `frontend/deployment/`; write overlay § Precompression and the Go server.

**Wire.** Migrate-required within the image and the stack file. The healthcheck change is stack
YAML, so an operator on a new image with an old stack file has a container that never turns
healthy; the image and stack must move in the same `eip update`. No stored data, no prepareRelease
step.

### Stage E — Stack citizenship

**Today.**

```yaml
frontend:
  networks: [eip-public]
  environment:
    <<: *frontend-public-env
    APP_VERSION: ${APP_VERSION}
```

```html
<script src="/env.js"></script>
<script type="module" src="/src/index.jsx"></script>
```

The service is on `eip-public` only. It has no NATS connection, no log or telemetry environment.

**After.** From [plan.md](./plan.md) § Stage E. The plan names the environment anchors and the
watcher; the network line and `*nats-env` are inferred from how `ws-router` is wired in
`docker-stack.yml`, since a watcher needs NATS and the frontend is on `eip-public` alone:

```yaml
frontend:
  networks: [eip-core, eip-public]
  environment:
    <<: [*frontend-public-env, *nats-env, *log-env, *otel-env]
    APP_VERSION: ${APP_VERSION}
```

```html
<script>window.env = { ENVIRONMENT: "...", EVE_CLIENT_ID: "...", ... };</script>
<script type="module" src="/assets/index-<hash>.js"></script>
```

```go
maintenance := appconfig.NewMaintenanceWatcher(nats)
stop, err := maintenance.Start(ctx)
```

The plan does not say what the frontend service does while `maintenance.Enabled()` is true. That is
the stage's main gap (see Decisions).

**Work.**
1. Add `*log-env`, `*otel-env` and `telemetry.Init` as `services/ws-router/main.go` does.
2. Template `window.env` into the shell at start; remove the `/env.js` script tag and the file.
3. Give `vite` dev a source for `window.env`, since `frontend/public/env.js` is what dev serves
   today.
4. Recompute the shell `ETag` after templating, because the shell now differs per configuration.
5. If maintenance is adopted: join `eip-core`, add `*nats-env`, start the watcher before the HTTP
   server, and implement the chosen behaviour.
6. Update `frontend/src/utils/runtime-config.js`'s description of where `window.env` comes from.

**Wire.** Inlining is breaking for the SPA and lands whole, as the plan says. Joining `eip-core`
widens what an internet-facing container can reach and should be flagged at planning, per the
security defaults in the technical rules.

## Decisions needed

### Does Stage C land in the Node server, or only in the Go one?

**Question.** Is the cache-tier work written in `server.js` now and rewritten in Go, or folded into
Stage D?

**Why it is James's call.** It trades time-to-benefit against duplicated work, and the plan argues
both sides: its opening says deciding these "twice, once in `server.js` now, once in Go later, is
the thing to avoid", and its stage order does exactly that.

**Options.**
- *C in Node first.* The `env.js` edge-cache exposure and the shell's 1,654 daily full responses
  are fixed as soon as it deploys. Costs a second implementation and a comment clean-up of
  `server.js` that Stage D then deletes.
- *Fold C into D.* One implementation, in the language it stays in. The `env.js` exposure stays open
  until the Go server ships.
- *Minimal C now.* Only `env.js` to `no-cache` in both tiers, a two-line change to `cacheControlFor`
  and its test; validators and the rest wait for Go.

**Recommendation.** Minimal C now, the rest in D. `env.js` at the edge is the one item with a
failure mode that presents as broken EVE login.

**Blocked until decided.** The order of Stages C and D.

### Does the Go server send a Cloudflare-named header?

**Question.** Does `spa-server` send `Cloudflare-CDN-Cache-Control`, or only the standard
`CDN-Cache-Control`?

**Why it is James's call.** EIP is not opinionated about where it deploys, and the plan's own
answer to the Cache Rule question rests on that. The API already sends the Cloudflare header in
`staticdata/endpoints.go` and `citadelNames.go`, so either the new server matches the API or the two
disagree. The project's `contents.md` also describes its scope as "the headers that tell the browser
and Cloudflare what to keep".

**Options.**
- *Send both, as the API does.* Consistent; the extra header is inert elsewhere. It keeps a
  provider's name in code a self-hoster reads.
- *Send only `CDN-Cache-Control`.* Provider-neutral. Cloudflare honours it. The API is then the odd
  one out until it is changed.
- *One shared constant set in `shared/`* that both the API and `spa-server` build headers from, so
  the question is answered once.

**Recommendation.** The shared helper, sending `CDN-Cache-Control` only, with the API moved onto it
in the same slice. Reword the `contents.md` Owns line to "the edge" when the plan is next edited.

**Blocked until decided.** The header set in Stage C and the shared move in Stage D.

### What does the frontend service do during maintenance?

**Question.** When `MaintenanceWatcher.Enabled()` is true, what does `spa-server` serve?

**Why it is James's call.** The plan names the consumer type and not the behaviour, and the choices
differ in what a reader sees and in what the container is allowed to reach.

**Options.**
- *Template the flag into the shell* (`window.env.MAINTENANCE`), so the root route skips
  `resumeStoredSession` and goes straight to the banner. Small, and removes the one refused resume
  that is the real remaining cost. The flag in a `no-cache` shell is current on every load.
- *Serve a static maintenance page with a 503.* No JavaScript runs at all. Duplicates the banner
  the SPA already owns and loses the 20-second recovery poll in `MaintenanceMode.jsx`.
- *Do nothing.* The SPA already shows the banner from `app-config`. The frontend stays off
  `eip-core` and off NATS.

**Recommendation.** Do nothing unless the refused resume is shown to cause a visible problem; if it
is, template the flag. The plan's stated reason for this item has mostly been met by the SPA since
it was written, and joining `eip-core` is a real cost for an internet-facing container.

**Blocked until decided.** Whether Stage E touches networks and NATS at all.

### Does the server keep the previous release's assets?

**Question.** Is Stage B SPA-side recovery only, or does the image also carry the previous `dist`?

**Why it is James's call.** It is the plan's own open question, and the `start-first` rollout
changes its weight: recovery turns a failure into a reload, retention prevents the failure.

**Options.**
- *SPA recovery only.* Small. A reader mid-edit when a chunk fails is reloaded or shown an error;
  unsaved edits live only in the open editor.
- *Retention in the image.* The build copies the previous release's `assets/` in. Needs the
  previous image at build time, which the bake and CI paths do not have today.
- *Recovery now, retention only if recovery proves insufficient.*

**Recommendation.** Recovery now, never reloading automatically while an editor holds unsaved
changes; show the notice instead. Revisit retention with evidence.

**Blocked until decided.** The scope of Stage B and whether Stage D's Dockerfile needs a
previous-release input.

### Where do the shared HTTP helpers go?

**Question.** Which of the API's helpers move to `services/shared/`, and into which package?

**Why it is James's call.** It moves code out of a service and fixes a package name others will
import. `shared/compression` exists with a narrower meaning than the plan assumed, so the name
could mislead.

**Options.**
- *Move `IfNoneMatchSatisfied` and the cache-header builder into a new `shared/httpcache`*; leave
  `CompressionConstructor` in the API because a precompressed-file server does not need it.
- *Move the compression middleware too*, into `shared/compression`, making that package what the
  plan thought it was. More churn for no consumer.

**Recommendation.** The first. Fully move the API's callers in the same change; no forwarding
wrapper.

**Blocked until decided.** The first Go slice of Stage D.

### Close the two questions that are already answered

**Question.** Should the SDE indentation and logging-shape questions leave this plan?

**Why it is James's call.** They are listed as open, and striking them is a plan edit.

**Options.** Strike indentation with a pointer to static-data-delivery Stage A. For logging, either
adopt `RequestLoggingConstructor` as it is, since its tests show it emits no access line for a bare
success or a health probe, or keep the question open for sampling of failures.

**Recommendation.** Strike both; adopt the shared logger unchanged.

**Blocked until decided.** Nothing; this is tidying.

## Dependencies and order

**Waits on.** Nothing. No other project's work gates any stage here.

**Waited on by.** `static-data-delivery` cites this project for the shell, the hashed assets and
the Go server, and its measurements extend `measurements/edge-cache.md`, so this folder cannot be
deleted on promote until that link is gone. `static-data-delivery/plan.md` § What this project does
not do still says this project's Cache Rule question "is unchanged by this one, and stays there";
the question has since been answered here.

**Recommended order.**
1. Deploy what is already committed. Stage A's cache fix is not live; `Public` still runs the hex
   test, so hashed assets still revalidate hourly.
2. Minimal Stage C: `env.js` out of the edge cache.
3. Stage B SPA recovery, which also covers the `start-first` rollout.
4. Stage D with the rest of Stage C inside it, after the shared-helper decision.
5. Stage E: telemetry and inlined config; maintenance only if decided.

**Recommended next slice.** Step 2, then Stage B. Both are small, neither depends on the Go
server, and Stage B is the only stage that fixes something a reader can hit on every release.
