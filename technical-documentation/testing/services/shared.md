# shared — tests

Live SoT for test depth under [`services/shared`](../../../services/shared). Behaviour → [shared/contents.md](../../backend/shared/contents.md), [mongo.md](../../backend/shared/mongo.md); identity / secrets → [stack.md](../../stack/stack.md), [secrets.md](../../stack/secrets.md). Module entrypoints → [contents.md](./contents.md).

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Tree | From `services/`: `go test ./shared/...` | No Docker |
| Document locks | `go test ./shared/core/documentlock/` | Large focused suite |
| Lease / identity | `go test ./shared/core/redis/lease/ ./shared/container/ ./shared/wsplacement/` | Common control-plane helpers |
| Messaging | `go test ./shared/nats/` | Live tests start a server in-process via `testing/natsfake`; nothing to run |
| Live Mongo (opt-in) | `EIP_MONGO_PARITY_LIVE=1 go test ./shared/mongo/ -run Live -count=1` | Needs stack `MONGO_*`; skips otherwise |

```bash
go test ./shared/...
EIP_MONGO_PARITY_LIVE=1 go test ./shared/mongo/ -run Live -count=1
```

## Coverage map

**Depth:** Strong for document locks, archiveimport normalise, models, crypto/keyrings, Redis lease, orchestration probes. Object store, SDE store, connect/monitor loops, and lifecycle runners are largely untested. Opt-in live Mongo covers Docs put/get parity under `shared/mongo`.

### Tested

| Area | What the tests cover |
|------|----------------------|
| `core/documentlock` | Atomic acquire/release/handover/extend races; Redis lock roundtrip, waitlist, promote; status batch; cascade pipeline/predicate/membership; lease rebind; event payloads |
| `archiveimport` (normalise) | Firestore→job normalisation (legacy/modern shapes, materials, groups, export samples) |
| `models` | Job JSON/BSON parity & unknown-field policy; refresh-token encrypt/reencrypt; group-template validation; flexible JSON scalars |
| `core/crypto` + `keyrings` | AES-GCM roundtrip/rotate/AAD; refresh-token keyring legacy parsing |
| `core/redis/lease` | Single-leader, takeover, lost-lease cancel, reacquire on fn error |
| `orchestrationprobes` | Health/ready handlers; bus ping role parse/start |
| `telemetry` | Trace sample rate, service version, deployment env, OTLP endpoint normalise; NATS log-context inject/extract |
| `nats` (unit) | Retry attempts, backoff and the error classifier, including that a cancelled context ends a wait rather than sleeping it out; envelope trace and log-context enrichment; subject builders and tenant filters; consumer keep policy; task registry — every task registered under its own name, every subject ending in its task name, every task having a publish helper |
| `nats` (live, embedded server) | Stream and durable reconcile; the three cleanup layers; bounded consume concurrency and that stop waits for in-flight handlers; the three handler outcomes (ack, terminate, redeliver) asserted from what the server still holds; batched publish and `Wait`; schedules — fire, replace-by-id, cancel, and read-back of the server's own fire time |
| `logs` | Request ID/account identity; operation context; debug steps; access-log / handler detail; OTLP JSON export |
| `mongo` (unit) | `IsRetryableMongoError` classifier (cancel / no-docs / disconnected / string fallback); groups membership-diff helper |
| `mongo` (live, opt-in) | `TestLive_*` put/get/schema/load-filter/doc-shape parity against stack Mongo |
| `mongo/writers` | Arg-validation / nil-bulk unit tests; exercised on live paths via group-templates / build-stats consumers |
| Other focused | `container` ID; `wsplacement` tenant keys / routing precedence; `swarmsecret` env-over-file; Mongo/Redis URL API fallback; process `APP_VERSION` helpers; dependency unavailable-error detection; small firebaseadmin / evesso helpers |

### Thin

- `nats` connect and reconnect: the retry loop and its options are not exercised against a server that goes away and returns
- `nats` core topics: publish and subscribe helpers are covered by their callers rather than directly, and the health census gather has no test of its own
- `core/config` — mostly service-cred URL fallback; other loaders untested
- `firebaseadmin` / `core/evesso` — one negative / formatter test each
- `mongo` connect / monitor loops and most raw `Collection()` escape hatches

### Little / none

- `core/objectstore/`, `core/sde/`
- `migration/firestoremig/`, `lifecycle/`
- `stackservices/connect` (no package tests); `wsplacement` keys untested (`tenant` key helpers have unit tests)
- Main `appconfig` loader beyond process-version helpers

## Topic-only detail

- Depth labels → [contents.md](./contents.md) § Depth labels.
- Shared changes often affect multiple services — run the touched shared package plus the consuming service’s suite.
- Live Mongo tests skip unless `EIP_MONGO_PARITY_LIVE=1`; they do not run in default CI unit jobs.
