# Deployment Tool — CLI verbs

Live SoT for host verb behaviour and TUI menu ↔ CLI mapping. Verb ids: [`internal/catalog`](../../../../deployment-tool/internal/catalog/verbs.go). Menu titles / gating: [`tui/ops`](../../../../deployment-tool/tui/ops/menu.go) — UX detail → [home.md](../tui/home.md). Bring-up recipe → [deploy.md](./deploy.md). Channels → [release-channels.md](./release-channels.md).

## TUI menu ↔ CLI

### Main / More → child CLI

| TUI surface | Row | Runs |
|-------------|-----|------|
| Main | **Setup** (when docs/stacks missing) | TUI builder (writes `.env` / `eip.config.yaml` / missing stacks). Does **not** start the stack. Headless file gen = typed / Command → `eip init` |
| Main | **Status** | `eip status` |
| Main | **Start** | `eip up` (Health off only when Docker green) |
| Main | **Repair** | `eip repair` (Health amber/red when Docker green) |
| Main | **Dev** | `eip dev` |
| Main | **Restart** | picker → `eip restart …` |
| Main | **Rebuild** | `eip rebuild` |
| Main | **Stop** | `eip shutdown` |
| Main | **Update** | `eip update` |
| More | **← Back** | navigation only |
| More | **Command** / Main `:` | typed host verbs + core `eip cli …` (same session) |
| More | **Secrets** | TUI `.env` builder → Persist; if stack healthy may auto-queue child `eip secrets` (+ `eip sync`) |
| More | **Settings** | TUI `eip.config.yaml` builder → Persist; may auto-queue child `eip sync` |
| More | **Logs** | picker → `eip logs` (follow opens logview) |

No dedicated menu rows for **Apply secrets/settings** — Persist auto-queues; use Command / CLI for a manual run.

### CLI-only (no dedicated menu row)

| CLI verb | Notes |
|----------|--------|
| `eip doctor` | Public health check. TUI background poller uses alias **`eip probe`** (chips only; never a menu row). |
| `eip add-path` | Optional PATH symlink; not on menus. |
| `eip init` | Headless write-missing; guided path is **Setup**. Reachable via Command / `:`. |
| `eip secrets` / `eip sync` | Persist auto-queues when appropriate; Command / CLI for manual. |
| `eip cli` | Core tasks / shell. TUI: Command / `:` only (interactive core shell stays terminal-only). |
| `eip ensure-mongo` / `eip ensure-s3` | Ensure without full deploy. |
| `eip restore-mongo-keyfile` / `eip rekey-mongo` | Keyfile recovery / rekey. |

## Verb behaviour

- **`eip up`**: live pulls; two-pass + Ready ([deploy.md](./deploy.md)). If the stack was already healthy before bring-up, skips `dataplane.Ready` (step: “Stack already healthy — skipping ensure”).
- **`eip dev`**: bake + merge `docker-stack.dev.yml`; same two-pass + Ready (same healthy skip).
- **`eip sync`**: targeted Moby `ServiceUpdate` from `eip.config.yaml` (capacity, Traefik ports/paths/proxy, Grafana Path / Base URL / Access, labeled network membership); `--dry-run` / `-n`. Stack labels include `eip.capacity.sync`, `eip.config.sync`, and network attach/detach labels. Effect → [config.md](../../../stack/config.md), [network.md](../../../stack/network.md). TUI: Persist / Command — not a Main row.
- **`eip secrets`**: hashed secrets from `.env` (Moby Secret*), then Rematerialize. Default `--live`; `--dev` when stack was `eip dev`. Attach → [secrets.md](../../../stack/secrets.md). TUI: Persist after Secrets / Command — not a Main row.
- **`eip rebuild`**: bake + rematerialize (dev). No Ready. After index SoT changes without full up/dev, run **`eip ensure-mongo`**.
- **`eip update`**: day-2 refresh — **binary first** (GitHub Releases tag `cli` / baked channel), then stack YAML from the baked kit git branch tip, then **pull live images** and **digest-reconcile** (force-update services whose running digest drifted). Live refs = app + data (+ obs when enabled) from kit fragments. Flags: `--binary-only`, `--stacks-only`, `--images-only`. After binary install: TUI relaunches with `EIP_UPDATE_RESUME` then runs update again; CLI re-execs `eip update`. Embedded kit ships inside the binary. Does **not** overwrite on-disk `.env` / `eip.config.yaml` / keyfiles. Cold start remains **`eip up`**.
- **`eip restart` / `logs` / `shutdown`**: Moby SDK; TUI Restart/Logs use pickers; Logs follow → new logview console.
- **`eip repair`**: day-2 heal for an already-deployed unhealthy stack (TUI **Repair** when Health is amber/red). Rematerialize if expected services are missing; runs dataplane `ServiceEnsures` registry entries only for bad service shorts (task must be running); force-update other bad present services. No pull/bake/`dataplane.Ready`/cold start. Healthy stack → use `eip update`; nothing deployed → `eip up`. Flag: `--dry-run` / `-n`.
- **`eip status`**: expected vs live Swarm stack (TUI **Status**).
- **`eip init`**: write-missing `docker-stack*.yml` (from baked `KitBranch`), then `.env` / `eip.config.yaml` (Autogen secrets resolved; EVE SSO left blank for the operator). `CheckOperatorDocs` then optional EnsureS3/EnsureMongo if tasks up. Does **not** apply to a running stack. TUI guided path = **Setup**. Not Public bootstrap (bootstrap only places the binary).
- **`eip doctor`** (alias **`probe`**): Engine ping + health rollup. CLI-facing name `doctor`; TUI poller uses `probe`.
- **`eip cli`**: core tasks / shell — TUI via Command / `:` only.
- **`eip add-path`**: optional PATH symlink — CLI-only.
- **`eip ensure-s3` / `ensure-mongo`**: CLI-only ensure without full deploy.
- **`eip restore-mongo-keyfile` / `rekey-mongo`**: CLI-only keyfile recovery / rekey.

## Day-2 images

App services share one **`APP_VERSION`** (`.env` SoT) in the **app fragment** ([`docker-stack.yml`](../../../../docker-stack.yml)): api, websocket, worker, ws-router, core, frontend. Traefik is upstream (rare). Data pins live in [`docker-stack.data.yml`](../../../../docker-stack.data.yml); obs pins in [`docker-stack.obs.yml`](../../../../docker-stack.obs.yml) when the addon is on.

| Path | Use |
|------|-----|
| **`eip update`** | Public — binary → kit stack YAML → pull `LiveImageRefs` (app + data + obs when on) → digest-reconcile |
| **`eip rebuild`** | Local bake + rematerialize **app** fragment (no Ready; does not bake data/obs) |

Bump a data (or obs) image by changing the pin in the kit fragment and shipping; the next **`eip update`** pulls and reconciles it. Data services use Swarm `stop-first` / named volumes from the fragment.

Day-2 image ship on a healthy install uses **`eip update`** / **`eip rebuild`**. Swarm owns replica replacement from stack `update_config`.

**Version surfaces:** bake / task `APP_VERSION`; FE `GET /api/v1/app-config` snackbar; WS `connected.app_version`. Mid-roll placement behaviour → [ws-router.md](../../../backend/ws-router/ws-router.md).
