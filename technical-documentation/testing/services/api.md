# api — tests

Live SoT for test depth under [`services/api`](../../../services/api). Behaviour → [api/contents.md](../../backend/api/contents.md). Module entrypoints → [contents.md](./contents.md).

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Service tree | From `services/`: `go test ./api/...` | No Docker |
| Package-scoped | e.g. `go test ./api/helper/auth/` | Tightest loop |

```bash
go test ./api/...
```

## Coverage map

**Depth:** Strong around auth/session helpers and some middleware. Most HTTP handlers and app wiring are untested.

### Tested

| Area | What the tests cover |
|------|----------------------|
| `helper/auth` | Session / refresh-token lifecycle (resolve, persist, rotate, reauth deadlines, CAS, orphan cleanup, ESI OAuth storage labels, tenant-affinity key format) |
| `middleware` | Auth failure detail, optional-account binding, request logging, rate-limiter 503 / Retry-After, unregistered-route wrapping |
| `helper/sdecache` | SDE cache warm / rewarm, readiness gating, signal-driven rewarm |
| `helper` (root) | Endpoint error mapping (context cancel / Redis / Mongo → non-500) |
| `v1endpoints` | Session bootstrap/rotate JSON shapes; ESI OAuth storage field presence |
| `v1endpoints/sso` | `IsSSOGrantClientError` classification only |
| `tests` | `/ready` vs `/healthy` probe contract (SDE warm gate) |

### Thin

- Middleware: no tests for compression, maintenance, request timeout / start-time helpers
- Root `helper`: only error-response logging tested; guards / lock HTTP / login resolve helpers untested
- `v1endpoints`: type/JSON tests only — not handler behaviour

### Little / none

- App wiring: `main.go`, `app.go`, `apiServer.go`
- Almost all HTTP handlers (`authenticate`, `refresh`, `logout`, blueprints, market, corporations, jobs/groups/watchlist/document-locks/…, SSO exchange handlers)
- `staticdata/`, `migration/`, `migrationendpoints/`, `helper/cloudstoredesi/`, `helper/sso/` (JWKS/JWT)

## Topic-only detail

- Depth labels → [contents.md](./contents.md) § Depth labels.
- Prefer package-scoped runs under `api/helper/auth` when iterating session work.
