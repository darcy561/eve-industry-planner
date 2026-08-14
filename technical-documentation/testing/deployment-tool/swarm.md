# swarm — tests

Live SoT for test depth under [`deployment-tool/internal/swarm`](../../../deployment-tool/internal/swarm). Behaviour → [secrets.md](../../stack/secrets.md), [CLI testing](../../deployment/deployment-tool/cli/testing.md) (integration). Module map → [contents.md](./contents.md).

## Entrypoints

```bash
# from deployment-tool/
go test ./internal/swarm/
go test ./internal/swarm/ -tags=integration -count=1   # needs Docker + Swarm
```

## Coverage map

**Depth:** Planning/discovery and naming well covered in unit tests. Real secret/config ensure+prune is **integration-only**.

### Tested (unit)

| Area | What the tests cover |
|------|----------------------|
| Naming | Swarm object naming conventions |
| Discovery | Secret/config discovery from stack files |
| Env / payload | Env validation; secret payload collection; by-service grouping |
| Config rolls | Config roll decisions; superseded names |

### Tested (integration, `//go:build integration`)

| Area | What the tests cover |
|------|----------------------|
| Ensure + prune | Secret/config ensure idempotent + prune |
| Inspect missing | Missing secret inspect behaviour |

### Thin

- `apply.go` orchestration — exercised via integration, little/no unit coverage of apply sequencing

### Little / none

- — (unit planning solid; apply path needs Swarm)

## Topic-only detail

- Default `go test ./…` never runs integration tags. CI Ubuntu job → [CLI testing](../../deployment/deployment-tool/cli/testing.md).
