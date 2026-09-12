# api — tests

Live SoT for test depth under [`services/api`](../../../services/api). Behaviour → [api/contents.md](../../backend/api/contents.md). Module entrypoints → [contents.md](./contents.md).

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Service tree | From `services/`: `go test ./api/...` | No Docker; live Mongo and live Redis tests skip unless gated |
| Package-scoped | e.g. `go test ./api/helper/auth/` | Tightest loop |
| Live Mongo (opt-in) | `EIP_MONGO_PARITY_LIVE=1 go test ./api/helper/ -run Live -count=1` | Needs stack Mongo env (`MONGO_*`); same gate as `shared/mongo` parity |
| Live Mongo, login handover (opt-in) | `EIP_MONGO_PARITY_LIVE=1 go test ./api/v1endpoints/ -run TestLive_ -count=1` | Runs a real login through the API, then reads the session back the way the websocket, the API's own middleware, and the core's maintenance sweep each do |
| Live Redis (opt-in) | `EIP_REDIS_PARITY_LIVE=1 EIP_REDIS_PARITY_ADDR=… go test ./v1endpoints/ -run 'RefreshToken\|Rotat' -count=1` | **A throwaway Redis, never the stack's** — the harness clears `refresh_token:*`, which would sign out every live planner session |
| Live Mongo, cloud ESI (opt-in) | `bash scripts/testing/live-mongo.sh ./api/helper/cloudstoredesi` | Runs in a container on the stack network — [harness.md](../harness.md) § Live Mongo |
| Session response surface | `go test ./api/v1endpoints/ -run TestTheSessionResponseSurface` | Regenerate with `EIP_UPDATE_SESSION_SURFACE=1 go test ./api/v1endpoints/ -run TestTheSessionResponseSurfaceIsCurrent` |

```bash
go test ./api/...
EIP_MONGO_PARITY_LIVE=1 go test ./api/helper/ -run Live -count=1
```

The live Redis suite wants a server of its own:

```bash
docker run --rm -d --name eip_redis_test -p 6380:6379 redis:8
cd services/api && EIP_REDIS_PARITY_LIVE=1 EIP_REDIS_PARITY_ADDR=127.0.0.1:6380 \
  go test ./v1endpoints/ -run 'RefreshToken|Rotat' -count=1
docker rm -f eip_redis_test
```

## Coverage map

**Depth:** Strong around the browser auth flow and some middleware. Most HTTP handlers and app wiring are untested. Opt-in live Mongo covers the main account Docs call paths handlers use after auth/lock, the cloud ESI refresh, and — separately — a login's session read back by every other service's own path; opt-in live Redis covers the rotate handler end to end. Planner session and refresh-token lifecycle tests live with the package that owns them now — `services/shared/plannersession` — not here; see [shared.md](./shared.md).

### Tested

| Area | What the tests cover |
|------|----------------------|
| `helper/auth` | Browser auth flow: refresh-cookie rotation and its logging, ESI OAuth storage cookie labels, tenant-affinity key format, EVE SSO token validation and error messages |
| `middleware` | Auth failure detail, optional-account binding, request logging, rate-limiter 503 / Retry-After, unregistered-route wrapping |
| `helper/sdecache` | SDE cache warm / rewarm, readiness gating, signal-driven rewarm |
| `helper` (root) | Endpoint error mapping (context cancel / Redis / Mongo → non-500) |
| `helper` (live Mongo, opt-in) | `ResolveUserDocumentsForLogin`; user/settings upsert+reload; watchlist put/get; job/group put/get/list/delete (`DeleteManyAfterStampingMeta`); group membership deltas — same Docs APIs handlers use after auth/lock (scratch `eip-api-live-account`) |
| `helper/cloudstoredesi` | Which rows a request resolves to, including a hash asked for twice resolving once — a second exchange would spend the refresh token the first rotated. Live Mongo: several characters on one account refreshing concurrently keep every rotated token, an unlinked character is reported against itself rather than failing the batch, and an empty hash list refreshes every stored row |
| `v1endpoints` | Session bootstrap/rotate JSON shapes; ESI OAuth storage field presence |
| `v1endpoints` (live Mongo, opt-in) | A real login's session is readable by the websocket's upgrade extraction, the API's own auth middleware, and resolves grants reaching the account's own membership row; the core's maintenance sweep runs over the same keyspace afterwards and leaves the session intact; the refresh token the login handed back names that same session, account and character in the store |
| `v1endpoints` (live Redis, opt-in) | `RotateHandler` against a real Redis and a real signed SSO token: presenting a rotated-away refresh token answers `401 {"code":"session_revoked"}`; its replacement still rotates; a token that was never issued, and a session past the 7-day reauth deadline, answer terminally too |
| `v1endpoints/user` | Batch access-token request validation — empty list, oversized list — answered before anything reaches Mongo |
| `v1endpoints/sso` | `IsSSOGrantClientError` classification only |
| `v1endpoints` — session response surface | Every JSON path the login, bootstrap and rotate response types can emit, derived by reflection and committed to `testing/fixtures/session-responses/surface.json`; a second test asserts the fields the SPA is known to read (`session_id`, `refresh_token`, `reauth_required_at` on both shapes, plus `esi_oauth_storage`, `first_login`, `main_character_hash` on bootstrap) are still on it |
| `tests` | `/ready` vs `/healthy` probe contract — mux isolates **SDE warm** gating; production `app.startProbes` also **Pings Mongo** (not asserted in this isolated mux) |

### Thin

- Middleware: no tests for compression, maintenance, request timeout / start-time helpers
- Root `helper`: error-response logging + opt-in live login/job/group flows; guards / lock HTTP still untested
- `v1endpoints`: bootstrap and logout handlers have no HTTP-level tests; rotate is covered only under the live Redis gate

### Little / none

- App wiring: `main.go`, `app.go`, `apiServer.go`
- Almost all HTTP handlers end-to-end (`authenticate`, `logout`, blueprints, market, corporations, jobs/groups/watchlist/document-locks/…, SSO exchange handlers)
- `staticdata/`, `migration/`, `migrationendpoints/`, `helper/sso/` (JWKS/JWT)

## Topic-only detail

- Depth labels → [contents.md](./contents.md) § Depth labels.
- Prefer package-scoped runs under `api/helper/auth` when iterating the browser auth flow; prefer `services/shared/plannersession` (and its `request` / `maintenance` subpackages) when iterating session state — see [shared.md](./shared.md).
- Live Mongo and live Redis tests skip unless their gate is set; they do not run in default CI unit jobs.
- The rotate suite's response body is asserted from both ends: [testing/frontend/auth.md](../frontend/auth.md) pins that the SPA acts on `code: session_revoked`, this one pins that the API produces it. Change one side alone and the other fails.
- **The session response surface is a second such pair, checked by a committed fixture rather than a duplicated assertion.** `testing/fixtures/session-responses/surface.json` is derived from the Go response types by reflection and read back by both `TestTheSurfaceCarriesWhatTheClientReads` here and the SPA's `Functions/Auth/sessionResponse.parity.test.js` — the same committed-fixture shape `testing/fixtures/model-parity/instance-keys.json` uses ([harness.md](../harness.md) § Model parity). A response type gaining or losing a field has to move the fixture in the same commit, or this test fails.
- The live login handover test is distinct from `testing/sessionhandover`, which hand-writes a session on the API's behalf to test the other services' reads in isolation, and from `live_session_lifecycle_test.go`, which stops at the login response body. This one runs the real handler and hands what it wrote to each reader in turn, so a shape only one of them understands fails here rather than in production.
- Production API ready = SDE cache warm **and** Mongo Ping (`services/api/app.go`). Package `api/tests` keeps the SDE-only mux so warm/not-warm behaviour stays deterministic without a live Mongo.
- Handler wiring behaviour → [deps.md](../../backend/api/deps.md); Mongo package → [mongo.md](../../backend/shared/mongo.md).
