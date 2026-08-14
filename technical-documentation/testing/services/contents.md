# Services tests

## Owns (SoT)

How Go tests under [`services/`](../../../services/) are run, plus per-service qualitative test depth (not coverage-%). Module root: one `go.mod`.

## Does not own

- Feature behaviour under test → [backend/contents.md](../../backend/contents.md) (and per-service topics)
- Deployment Tool tests → [deployment-tool CLI testing](../../deployment/deployment-tool/cli/testing.md)
- Cross-cutting layers map → [../overview.md](../overview.md)

## Depth labels

| Label | Meaning |
|-------|---------|
| **Tested** | `*_test.go` present; rows say what those tests assert |
| **Thin** | Some tests, but large adjacent surface untested |
| **Little / none** | No (or negligible) package tests for that area |

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Full module | From `services/`: `go test ./…` | No Docker for the default unit suite |
| CI | [`.github/workflows/test.yml`](../../../.github/workflows/test.yml) job `services` | Selected when `services/**` changes (or manual dispatch) — [overview](../overview.md) § CI test suite |
| One service tree | e.g. `go test ./core/...` | Prefer while iterating a service |
| Package-scoped | e.g. `go test ./ws-router/` | Tightest loop |
| Shared harness / soak libs | `go test ./testing/...` | [../harness.md](../harness.md) — not per-service product depth |

```bash
go test ./...
```

## Task map

| I need to… | Read |
|------------|------|
| api test depth | [api.md](./api.md) |
| core test depth | [core.md](./core.md) |
| websocket test depth | [websocket.md](./websocket.md) |
| worker test depth | [worker.md](./worker.md) |
| ws-router test depth | [ws-router.md](./ws-router.md) |
| capacity-controller test depth | [capacity-controller.md](./capacity-controller.md) |
| shared libraries test depth | [shared.md](./shared.md) |

Depth labels are qualitative (package presence + `Test*` names), not coverage reports. Re-skim the owning service file when adding large suites. CI suite → [overview](../overview.md) § CI test suite.
