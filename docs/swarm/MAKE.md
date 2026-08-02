# Make / scripts — retired

> **Operators:** use **[`eip`](../../DEPLOYMENT.md)** — bootstrap → `eip init` → `eip up`. Day-2: `eip secrets` / `eip sync` / `eip update` / `eip logs` / `eip shutdown` / `eip rebuild`.

The root **Makefile** and Make script trees (`scripts/{bootstrap,swarm,lib,ops,test}/`) are **gone**. Remaining host scripts:

| Path | Role |
|------|------|
| `eip-bootstrap.sh` / `.ps1` | Public install (download host binary) |
| `scripts/admintool/build-host.*` | Build repo-root `eip` / `eip.exe` |

## Former Make → eip

| Was | Use |
|-----|-----|
| `make up` | **`eip up`** |
| `make dev` | **`eip dev`** |
| `make rebuild` / `dev-release` / `release` | **`eip rebuild`** / **`eip update`** |
| `make swarm-sync` | **`eip sync`** |
| `make swarm-secrets-sync` | **`eip secrets`** |
| `make logs` / `cli` / `shutdown` / `status` | **`eip logs`** / **`cli`** / **`shutdown`** / TUI status |
| `make update-files` | **`eip update`** |
| `make advertise` / `app-version-ops` / `ws-placement-ops` / `stack-rm` / `update-data` | Not mirrored — **`eip update`** / **`rebuild`** / **`shutdown`**; WS ops → **#18** |

Do **not** reintroduce Make as an operator surface. Dual-path notes: [ENGINEERING.md](../admintool/ENGINEERING.md#dual-path-eip-vs-make). Roadmap context: [ROADMAP.md](./ROADMAP.md).

## Related

- [DEPLOYMENT.md](../../DEPLOYMENT.md) — public install
- [APP_TRAIN.md](./APP_TRAIN.md) — app-train (prefer `eip update` / `rebuild`)
- [ENV.md](./ENV.md) — secrets vs operator YAML
- [WS_ROUTER.md](./WS_ROUTER.md) / [WEBSOCKET.md](./WEBSOCKET.md) — placement / drain
