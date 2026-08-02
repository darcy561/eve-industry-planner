# docker / enginetest — tests

Live SoT for test depth under [`deployment-tool/internal/docker`](../../../deployment-tool/internal/docker) (incl. `enginetest/`) and [`internal/dockercli`](../../../deployment-tool/internal/dockercli). Conventions → [CLI testing](../../deployment/deployment-tool/cli/testing.md), [engineering.md](../../deployment/deployment-tool/cli/engineering.md). Module map → [contents.md](./contents.md).

## Entrypoints

```bash
# from deployment-tool/
go test ./internal/docker/...
```

## Coverage map

**Depth:** Endpoint resolution, health rollup helpers, and `enginetest` classification are covered. Most live SDK call sites (`client`, `service_update`, logs, teardown) are untested by design in default CI. **`dockercli` has no tests.**

### Tested

| Area | What the tests cover |
|------|----------------------|
| Endpoint | `ResolveDockerEndpoint` from context / `DOCKER_HOST` / config JSON (many edge cases) |
| Health / status helpers | Health rollup; no-stack summary; friendly ports; replica detail |
| Logs / version helpers | Service log line formatting; deployed app version from env/image; running image digest |
| `enginetest` | Fake Engine httptest — service inspect 404 vs error classification (used by config apply tests too) |

### Thin

- `stack.go`, `client.go`, `probe.go`, `service_update`, `service_logs`, `labels`, `stack_teardown` — most live SDK paths

### Little / none

- Real daemon interactions in default unit suite (by design)
- Entire `internal/dockercli`

## Topic-only detail

- Expand `enginetest` handlers when adding SDK call-site coverage. Do not unit-test create races or HTTP client timeouts. Depth labels → [contents.md](./contents.md).
