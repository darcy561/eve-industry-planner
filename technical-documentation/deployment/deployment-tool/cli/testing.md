# Deployment Tool — testing

Live SoT for **how** the Deployment Tool is tested (entrypoints, CI, `enginetest` conventions). Module: [`deployment-tool/`](../../../../deployment-tool/). Conventions → [engineering.md](./engineering.md).

**Qualitative depth by package** (Tested / Thin / Little) → [testing/deployment-tool/contents.md](../../../testing/deployment-tool/contents.md). Cross-cutting map → [testing/contents.md](../../../testing/contents.md).

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Unit (default) | From `deployment-tool/`: `go test ./…` | Never talks to Docker |
| Swarm integration | `go test ./internal/swarm/ -tags=integration -count=1` | Needs Docker + active Swarm |
| CI (path-filtered) | [`.github/workflows/test.yml`](../../../../.github/workflows/test.yml) | Unit + Swarm integration when `deployment-tool/**` changes on **Public** / **Development**; manual on other branches — [testing overview](../../../testing/overview.md) § CI test suite |
| Public CLI ship | [`.github/workflows/deployment-tool.yml`](../../../../.github/workflows/deployment-tool.yml) | Manual dispatch; requires green `test.yml` on Public tip, then Ubuntu unit + Swarm, then upload `cli-v*` / `cli` |
| Soak (manual) | Live daemon | `eip doctor`, `sync`, `secrets`, pull / restart / logs — local only |

```bash
go test ./internal/swarm/ -tags=integration -count=1
```

## Coverage map

| Layer | What | Where |
|-------|------|--------|
| **Unit (pure)** | Diffs, naming, YAML registries, menu gating — no Engine | Depth → [testing/deployment-tool](../../../testing/deployment-tool/contents.md) |
| **Unit (Engine fake)** | SDK call sites via httptest stand-in | [`internal/docker/enginetest`](../../../../deployment-tool/internal/docker/enginetest/) — depth → [docker.md](../../../testing/deployment-tool/docker.md) |
| **Unit (timed loops)** | Poll / wait loops on simulated time, Engine fake in-bubble | `synctest.Test` — see § Time-dependent loops |
| **Unit (endpoint)** | `ResolveDockerEndpoint` with fake `DOCKER_CONFIG` trees | `internal/docker/endpoint_test.go` |
| **Integration (Swarm)** | Real Linux Engine: secret/config ensure + prune | `swarm/integration_test.go` (`//go:build integration`) — [swarm.md](../../../testing/deployment-tool/swarm.md) |

## Time-dependent loops

Poll and wait loops (`resolveCapacityContainer`, `waitForEnsureTasks`) are tested with [`testing/synctest`](https://pkg.go.dev/testing/synctest) so their wait budgets are **simulated, not waited out** — a 2-minute timeout asserts in microseconds.

- Wrap the body in `synctest.Test(t, func(t *testing.T) { … })` and use `t.Context()`.
- Inside a bubble, `time.Now()` / `time.Since` measure **simulated** time, so assert exact elapsed values to pin poll cadence.
- `enginetest` is usable inside a bubble because it is backed by `httptest.NewTestServer` (in-memory). A conventional `httptest.NewServer` does **real** network I/O and **deadlocks** a bubble — never introduce one in a `synctest` test.
- Give a loop an injectable budget/registry (as `waitForEnsureTasksIn` does) rather than reading a package global, so the test supplies its own.

## Topic-only detail

- Docker discovery contract: **resolve the CLI endpoint, then Ping/Info** — not OS services.
- Control-flow around `errdefs.IsNotFound` vs daemon errors needs `enginetest`; real Swarm object CRUD needs `-tags=integration`.
- Prefer the fake for classification/wiring; do **not** unit-test create races or HTTP client timeouts.
- Expand `enginetest` handlers when you add SDK call-site coverage.
- Manual suite runs (any branch) → Actions → **test** → Run workflow. CLI publish → Actions → **deployment-tool** → Run workflow.
