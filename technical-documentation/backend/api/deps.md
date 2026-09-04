# API handler deps (`apideps`)

Live SoT for how the API process wires backing connections into HTTP handlers. Package: [`services/api/apideps`](../../../services/api/apideps). Registration: [`services/api/apiServer.go`](../../../services/api/apiServer.go).

Mongo handle behaviour → [mongo.md](../shared/mongo.md). Auth/session contracts → [auth/](./auth/overview.md). Document locks → [document-lock/](./document-lock/overview.md).

## Defaults

| Piece | Default | Change |
|-------|---------|--------|
| Deps fields | Mongo, Redis, NATS, JetStream | `services/api/apideps/deps.go` |
| Build | `apideps.FromClients(clients)` once at composition root | `apiServer.go` |
| Handler packages | `*.New(deps)` → methods on `Handlers` embedding `*apideps.Deps` | `services/api/v1endpoints/**` |
| Lock packages | `deps.LockDeps()` → `documentlock.Deps` | same |
| Mongo-only tests | `apideps.New(mongo)` | tests / helpers |

Object store is opened for the API process at connect time but is **not** on `apideps.Deps`; static-data / SDE cache open their own backend. Middleware, rate-limit store, and SDE warmer still use `clients` at the composition root only.

## Wiring

```text
Connect → clients
               │
               ├─ middleware / rate limit / SDE warmer (composition root)
               │
               └─ deps := apideps.FromClients(clients)
                    ├─ v1endpoints.New(deps)
                    ├─ user / sso / groups / jobdocuments / …
                    └─ documentlocks.New(deps) → LockDeps()
```

Handlers are methods: no Mongo/Redis/`deps` parameters on the HTTP function signature. Access fields as `h.Mongo`, `h.Redis`, etc.

## Routes outside this bag

| Surface | Wiring |
|---------|--------|
| `/api/static-data/…` | Package `staticdata` (SDE cache / object store) |
| `/healthy` `/health` `/ready` | Orchestration probes in `app.go` (ready: SDE warm + Mongo Ping) |

## Topic-only detail

- Prefer `FromClients` in the running API process; use `New(mongo)` only for mongo-only test wiring.
- Do not thread `*stackservices.Clients` into handler packages.
