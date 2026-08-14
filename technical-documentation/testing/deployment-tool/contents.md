# Deployment Tool tests

## Owns (SoT)

Qualitative test depth for the [`deployment-tool/`](../../../deployment-tool/) Go module (not coverage-%). How to run unit / Swarm integration / CI → [CLI testing](../../deployment/deployment-tool/cli/testing.md).

## Does not own

- Run commands, CI jobs, `enginetest` conventions → [CLI testing](../../deployment/deployment-tool/cli/testing.md)
- Verb / bring-up behaviour → [deployment-tool CLI contents](../../deployment/deployment-tool/cli/contents.md)
- Cross-cutting layers map → [../overview.md](../overview.md)
- Services module tests → [../services/contents.md](../services/contents.md)

## Depth labels

| Label | Meaning |
|-------|---------|
| **Tested** | `*_test.go` present; rows say what those tests assert |
| **Thin** | Some tests, but large adjacent surface untested |
| **Little / none** | No (or negligible) package tests for that area |

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Unit (default) | From `deployment-tool/`: `go test ./…` | Never talks to Docker |
| Swarm integration | `go test ./internal/swarm/ -tags=integration -count=1` | Needs Docker + Swarm |
| Package-scoped | e.g. `go test ./internal/config/` | Prefer while iterating |

Detail (CI / soak / enginetest rules) → [CLI testing](../../deployment/deployment-tool/cli/testing.md).

## Task map

| I need to… | Read |
|------------|------|
| config / sync apply depth | [config.md](./config.md) |
| stack expand / stackfile depth | [stack.md](./stack.md) |
| swarm secrets/configs depth | [swarm.md](./swarm.md) |
| deploy / engine depth | [deploy.md](./deploy.md) |
| docker client / enginetest depth | [docker.md](./docker.md) |
| images bake / pull / reconcile depth | [images.md](./images.md) |
| dataplane Ensure* depth | [dataplane.md](./dataplane.md) |
| kit / templates / env depth | [kit.md](./kit.md) |
| ops / status / msg / process depth | [ops.md](./ops.md) |
| TUI depth | [tui.md](./tui.md) |
| CLI command registration depth | [cmd.md](./cmd.md) |
