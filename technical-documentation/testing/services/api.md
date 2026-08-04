# api — tests

Live SoT for test depth under [`services/api`](../../../services/api). Behaviour → [api/contents.md](../../backend/api/contents.md). Module entrypoints → [contents.md](./contents.md).

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Service tree | From `services/`: `go test ./api/...` | No Docker; live Mongo tests skip unless gated |
| Package-scoped | e.g. `go test ./api/helper/auth/` | Tightest loop |
| Live Mongo (opt-in) | `EIP_MONGO_PARITY_LIVE=1 go test ./api/helper/ -run Live -count=1` | Needs stack Mongo env (`MONGO_*`); same gate as `shared/mongo` parity |

```bash
go test ./api/...
EIP_MONGO_PARITY_LIVE=1 go test ./api/helper/ -run Live -count=1
```

## Coverage map

**Depth:** Strong around auth/session helpers and some middleware. Most HTTP handlers and app wiring are untested. Opt-in live Mongo covers the main account Docs call paths handlers will wrap later.

### Tested

| Area | What the tests cover |
|------|----------------------|
| `helper/auth` | Session / refresh-token lifecycle (resolve, persist, rotate, reauth deadlines, CAS, orphan cleanup, ESI OAuth storage labels, tenant-affinity key format) |
| `middleware` | Auth failure detail, optional-account binding, request logging, rate-limiter 503 / Retry-After, unregistered-route wrapping |
| `helper/sdecache` | SDE cache warm / rewarm, readiness gating, signal-driven rewarm |
| `helper` (root) | Endpoint error mapping (context cancel / Redis / Mongo → non-500) |
| `helper` (live Mongo, opt-in) | `ResolveUserDocumentsForLogin`; user/settings upsert+reload; watchlist put/get; job/group put/get/list/delete (`DeleteManyAfterStampingMeta`); group membership deltas — same Docs APIs handlers use after auth/lock (scratch `eip-api-live-account`) |
| `v1endpoints` | Session bootstrap/rotate JSON shapes; ESI OAuth storage field presence |
| `v1endpoints/sso` | `IsSSOGrantClientError` classification only |
| `tests` | `/ready` vs `/healthy` probe contract (SDE warm gate) |

### Thin

- Middleware: no tests for compression, maintenance, request timeout / start-time helpers
- Root `helper`: error-response logging + opt-in live login/job/group flows; guards / lock HTTP still untested
- `v1endpoints`: type/JSON tests only — not full HTTP handler behaviour (no auth cookie / Redis lock-gate harness yet)

### Little / none

- App wiring: `main.go`, `app.go`, `apiServer.go`
- Almost all HTTP handlers end-to-end (`authenticate`, `refresh`, `logout`, blueprints, market, corporations, jobs/groups/watchlist/document-locks/…, SSO exchange handlers)
- `staticdata/`, `migration/`, `migrationendpoints/`, `helper/cloudstoredesi/`, `helper/sso/` (JWKS/JWT)

## Topic-only detail

- Depth labels → [contents.md](./contents.md) § Depth labels.
- Prefer package-scoped runs under `api/helper/auth` when iterating session work.
- Live Mongo tests skip unless `EIP_MONGO_PARITY_LIVE=1`; they do not run in default CI unit jobs.
