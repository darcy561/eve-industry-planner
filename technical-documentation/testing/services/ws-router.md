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

**Depth:** Placement / eligibility / ready-probe logic is well covered. HTTP reverse-proxy and process bootstrap are not.

### Tested

| Area | What the tests cover |
|------|----------------------|
| Slot eligibility | Drop cordoned/full slots; fallback when all skipped; merge cordon+full |
| Placement | Prefer newest semver (incl. missing versions); pick lower load; semver compare |
| Backends | Probe ready status codes; filter probe-ready backends |
| Misc | Parse Docker host; format/truncate; slot ID from Swarm task (ignore template) |

### Little / none

- Upstream proxy wiring (`proxy.go` request path)
- App / server bootstrap (`main` / app wiring)

## Topic-only detail

- Depth labels → [contents.md](./contents.md) § Depth labels.
- Placement tests are the main automated gate for Redis cordon/full/prefer-newest changes.
