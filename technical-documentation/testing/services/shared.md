# shared — tests

Live SoT for test depth under [`services/shared`](../../../services/shared). Behaviour → [shared/contents.md](../../backend/shared/contents.md); identity / secrets → [stack.md](../../stack/stack.md), [secrets.md](../../stack/secrets.md). Module entrypoints → [contents.md](./contents.md).

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Tree | From `services/`: `go test ./shared/...` | No Docker |
| Document locks | `go test ./shared/core/documentlock/` | Large focused suite |
| Lease / identity | `go test ./shared/core/redis/lease/ ./shared/core/instanceid/` | Common control-plane helpers |

```bash
go test ./shared/...
```

## Coverage map

**Depth:** Strong for document locks, archiveimport normalize, models, crypto/keyrings, Redis lease, orchestration probes. Object store, SDE store, most Mongo get/put, and lifecycle runners are largely untested.

### Tested

| Area | What the tests cover |
|------|----------------------|
| `core/documentlock` | Atomic acquire/release/handover/extend races; Redis lock roundtrip, waitlist, promote; status batch; cascade pipeline/predicate/membership; lease rebind; event payloads |
| `archiveimport` (normalize) | Firestore→job normalization (legacy/modern shapes, materials, groups, export samples) |
| `models` | Job JSON/BSON parity & unknown-field policy; refresh-token encrypt/reencrypt; group-template validation; flexible JSON scalars |
| `core/crypto` + `keyrings` | AES-GCM roundtrip/rotate/AAD; refresh-token keyring legacy parsing |
| `core/redis/lease` | Single-leader, takeover, lost-lease cancel, reacquire on fn error |
| `orchestrationprobes` | Health/ready handlers; bus ping role parse/start |
| `telemetry` | Trace sample rate, service version, deployment env, OTLP endpoint normalize; NATS log-context inject/extract |
| `core/nats` | Respond envelope; consumer keep policy; JetStream subject-set equality; message log-context enrichment |
| `logs` | Request ID/account identity; operation context; debug steps; access-log / handler detail; OTLP JSON export |
| Other focused | `instanceid` replica priority/sanitize; `swarmsecret` env-over-file; Mongo/Redis URL API fallback; advertised app version via Redis; dependency unavailable-error detection; small firebaseadmin / evesso / mongo put-groups helpers |

### Thin

- `core/nats` connection/setup beyond helpers above
- `core/config` — mostly service-cred URL fallback; other loaders untested
- `firebaseadmin` / `core/evesso` — one negative / formatter test each
- `core/mongo/put` — groups diff helper only

### Little / none

- `core/objectstore/`, `core/sde/`
- Most `core/mongo/` connect + get/put
- `migration/firestoremig/`, `lifecycle/`
- `stackservices/connect`, `wsplacement` (keys package has no tests)
- Main `appconfig` loader beyond advertised Redis helper

## Topic-only detail

- Depth labels → [contents.md](./contents.md) § Depth labels.
- Shared changes often affect multiple services — run the touched shared package plus the consuming service’s suite.
