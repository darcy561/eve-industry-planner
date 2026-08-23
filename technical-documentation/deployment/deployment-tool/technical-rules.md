# Technical rules (deployment / deployment-tool)

Applies to the [`deployment-tool/`](../../../deployment-tool/) Go module. On overlap with the project master [`../../technical-rules.md`](../../technical-rules.md), **this file wins**; otherwise the master applies — including § Engineering practices (Go idioms and `go fix`, helper reuse, one SoT, concurrency, testing) and § Docker — Moby first (SDK-first, `apiClient` naming, `docker` CLI as emergency only). Those are not restated here.

Module tightenings this file owns:

## Docker access

- **TUI must not talk to Docker in-process** — child `eip <verb>` only ([tui.md](./tui/tui.md), [cli/messaging.md](./cli/messaging.md)).
- When the Moby SDK has **no API** for what you need, the Engine HTTP API is permitted, but **stop and flag it before implementing** and say why the SDK is insufficient. Master already requires flagging any new CLI or raw Engine HTTP path; this adds the justification.

## Layout

- New full-screen TUI flows → `tui/screens/<name>/`.
- **No empty `doc.go` files for notes** — module documentation lives under `technical-documentation/deployment/deployment-tool/`.
- After package moves, delete dead files; keep one path per package.

## Where the area detail lives

Package map, Docker client wiring, embedded kit, and host binary → [`cli/engineering.md`](./cli/engineering.md) (a map of current behaviour, not rules). Verbs → [`cli/verbs.md`](./cli/verbs.md). Registries → [`cli/variables.md`](./cli/variables.md). TUI UX → [`tui/contents.md`](./tui/contents.md). Tests → [`cli/testing.md`](./cli/testing.md).
