# Deployment Tool — testing

Live SoT for how the Deployment Tool is tested. Conventions → [engineering.md](./engineering.md).

Contract for Docker discovery: **resolve the CLI endpoint, then Ping/Info** — not OS services.

| Layer | What | Where |
|-------|------|--------|
| **Unit (pure)** | Diffs, naming, YAML registries, menu gating — no Engine | `config/*_test`, `swarm/*_test`, `kit/templates/**`, `tui/**` |
| **Unit (Engine fake)** | SDK call sites via httptest stand-in | [`internal/docker/enginetest`](../../../../deployment-tool/internal/docker/enginetest/) + `config/engine_apply_test.go` |
| **Unit (endpoint)** | `ResolveDockerEndpoint` with fake `DOCKER_CONFIG` trees | `deployment-tool/internal/docker/endpoint_test.go` |
| **Integration (Swarm)** | Real Linux Engine: secret/config ensure + prune | `swarm/integration_test.go` (`//go:build integration`) |
| **CI unit** | `go test ./…` + `go build` on Ubuntu / Windows / macOS | [`.github/workflows/deployment-tool.yml`](../../../../.github/workflows/deployment-tool.yml) job `test` |
| **CI integration** | Ubuntu only: `swarm init` then `go test -tags=integration` | same workflow, job `integration` |
| **Soak (manual)** | Live daemon: `eip doctor`, `sync`, `secrets`, pull/restart/logs | local only |

Default `go test ./…` never talks to Docker. Control-flow around `errdefs.IsNotFound` vs daemon errors needs `enginetest`; real Swarm object CRUD needs `-tags=integration` (CI Ubuntu job). Prefer the fake for classification/wiring; do **not** unit-test create races or HTTP client timeouts. Expand `enginetest` handlers when you add SDK call-site coverage.

Local integration (optional): Docker + Swarm active, then from `deployment-tool/`:

```bash
go test ./internal/swarm/ -tags=integration -count=1
```
