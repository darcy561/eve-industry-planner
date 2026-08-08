# ws-router — tests

Live SoT for test depth under [`services/ws-router`](../../../services/ws-router). Behaviour → [ws-router.md](../../backend/ws-router/ws-router.md). Module entrypoints → [contents.md](./contents.md).

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Package | From `services/`: `go test ./ws-router/` | Single main package |

```bash
go test ./ws-router/
```

## Coverage map

**Depth:** Placement / eligibility / ready-probe / status-reconcile logic is well covered. HTTP reverse-proxy and process bootstrap are not.

### Tested

| Area | What the tests cover |
|------|----------------------|
| Backend eligibility | Drop full/draining backends; fallback when all skipped; soft not a hard skip |
| Placement | Prefer newest semver; place hit/miss; reassign off full/draining; lowest live clients on miss; sticky fallback |
| Placement store | NATS `PlacementState` apply; `GET /placement` reconcile keyed by discovery container id |
| Backends | Probe ready status codes; filter probe-ready backends |
| Misc | Parse Docker host; format/truncate; container id from Swarm task |

### Little / none

- Upstream proxy wiring (`proxy.go` request path beyond resolve)
- App / server bootstrap (`main` / app wiring)

## Topic-only detail

- Depth labels → [contents.md](./contents.md) § Depth labels.
- Placement tests are the main automated gate for NATS soft/full/draining + prefer-newest changes.
