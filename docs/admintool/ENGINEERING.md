# admintool — engineering conventions

## Docker access (SDK first)

- **Prefer the Docker Go SDK** (`github.com/docker/docker/client`) for all Engine/Swarm work.
- **Client SoT:** always `internal/docker.NewClient` (not raw `FromEnv` alone). Flow: `ResolveDockerEndpoint` (DOCKER_HOST → CLI context Host → `""`) → `WithHost` or `FromEnv` → Ping/Info. The SDK does not read Docker contexts; Desktop’s `desktop-linux` → `dockerDesktopLinuxEngine` (etc.) needs that layer. Do **not** inspect OS services / WSL / Hyper-V.
- **Diagnostics:** `ResolveDockerEndpoint` / `EngineProbe.Host` for `eip doctor`. Local only for now; context TLS for remote Engines is out of scope.
- Shared probes/verbs live in [`admintool/internal/docker`](../../admintool/internal/docker/) — extend that package; do not open raw HTTP to the Engine API from CLI or TUI.
- **TUI** must not talk to Docker in-process. It runs child `eip <verb>` commands; those verbs use the SDK.
- **If the SDK has no API for what you need:** you may use the Engine HTTP API, but **stop and flag it** before implementing — call out why the SDK is insufficient.
- Do not invent a parallel “curl the socket” path when `client.Client` already covers the call.

## Lists & data

- CLI verbs: SoT in `internal/catalog`. Home TUI menu: SoT in `tui/ops` (plain-language titles; maps to catalog ids via `Args`).
- Document fields: `kit/templates/env.EnvFields` and `yamldefaults.ConfigFields` — no parallel UI key lists.
- See [VARIABLES.md](./VARIABLES.md).

## Helpers first

- Shared behaviour → helper in `tui/ui`, `tui/theme`, `tui/exec`, `tui/screens/home/{nav,docs,pickers}`, or `internal/…`.
- Do not copy-paste panel render, list sizing, child CLI runs, or env/config emit.
- If you need the same call twice, extract a function before merging.

## Folder structure

Keep `admintool/` tidy and update [TUI.md](./TUI.md) when you add/move packages:

```text
admintool/
  internal/catalog/              # CLI verb SoT + services.go (expected Swarm services)
  internal/kit/                  # Home, product strings, envfile, writable, SelfUpdate, obs/
  internal/kit/templates/        # WriteMissing* facade + CheckOperatorDocs
  internal/kit/templates/env/    # EnvFields / emit / autogen / backup / CheckUsable
  internal/kit/templates/yamldefaults/  # DefaultConfig + ConfigFields
  internal/config/               # Load/Validate/WriteYAML/SyncEnv/Sync (live YAML)
  internal/stack/                # stack YAML SoT + compose expand/inject
  internal/swarm/                # SyncSecrets / SyncConfigs / ApplyConfigs
  internal/deploy/               # Inspect, Source, Run (up/dev), Rematerialize, Rebuild
  internal/engine/               # Swarm init + eip-core overlay + volumes
  internal/dockercli/            # docker CLI wrappers (stack deploy, compose config)
  internal/images/               # pull live | bake (embedded docker-bake.hcl)
  internal/dataplane/            # Ready = EnsureS3 ‖ EnsureMongo; ensure_*.go; task/
  internal/ops/                  # restart / shutdown / logs (SDK)
  internal/status/               # status signal + report
  internal/msg/                  # EIPMSG + chip.* helpers
  internal/process/              # FromTUI, ChildEnv, HoldOnError
  internal/docker/               # Docker Go SDK SoT
  internal/yamlutil/             # shared YAML helpers
  cmd/commands/                  # thin Cobra verbs
  tui/
    theme/ ui/ brand/ exec/ ops/ status/ builder/ pane/
    output/<verb>/
    screens/home/                # nav.go, docs.go, pickers.go, model.go
    screens/init/                # EnvSections / ConfigSections + Persist*
    screens/logview/
```

Import direction for documents: `kit` ← `config` ← `templates/{env,yamldefaults}`. `config` must not import templates.

## Dual path (eip vs Make)

| Path | Role |
|------|------|
| **`eip` (preferred)** | up/dev (Go recipe + Ready), sync, secrets, rebuild, status/logs/restart/shutdown, init, ensure-*, mongo keyfile tools, `update-binary`, TUI |
| **Make / `scripts/` (legacy only)** | Public chicken-egg (`download-setup-scripts` / `update-files`) until an eip installer exists. Leftover Make verbs are **not** admintool features — do not add `eip release` / advertise / `update-data` mirrors. |

**Retired as operator concepts (Make leftovers only — use eip instead):**

| Legacy Make | Use instead |
|-------------|-------------|
| `make release` / `dev-release` / `advertise` | **`eip up`** (live) or **`eip dev`** / **`eip rebuild`** (local). Image pins live in stack YAML + `.env` tags; Swarm roll order is in compose deploy config. No Redis “advertise” verb in eip. |
| `make update-data SERVICE=` | **`eip up`** / **`eip rebuild`** (and rematerialize via secrets). Data images are pinned in `docker-stack.*.yml`; redeploy only moves what changed. |
| `scripts/swarm/stack-deploy.sh` | **`eip up`** / **`eip dev`**. Under the hood Go still calls **`docker stack deploy`** (CLI) because the Engine SDK has no first-class stack-deploy API; that is intentional short-term, not “bash is SoT”. |

`eip init` is **not** Public bootstrap — it only writes missing operator docs (+ optional ensure if data tasks are already up). See [VARIABLES.md](./VARIABLES.md) § Project home.

## Deploy (`eip up` / `eip dev`)

Go recipe is the preferred bring-up. Same path every time: expand → two-pass **`docker stack deploy`** (via `dockercli.StackDeploy`) → `dataplane.Ready`. Engine SDK covers Swarm/network/volumes/inspect; stack apply stays on the CLI until an SDK path exists (not planned soon).

| Piece | Role |
|-------|------|
| `kit.Require` | Fail if kit files missing (create docs via `eip init` / TUI Setup) |
| `kit` | `Home`, product strings, envfile helpers, writable, `obs/`, `SelfUpdate` |
| `templates` | `WriteMissingEnv` / `WriteMissingConfig`, `CheckOperatorDocs` |
| `config` | Load/Validate + SyncEnvMap for expand; `Sync` for day-2 capacity/Traefik/Grafana/config apply |
| `engine.Ready` | Swarm init, attachable `eip-core` overlay, volumes |
| `images` | Live: pull. Dev: `buildx bake -f -` (embedded HCL) → `:bake`, promote `TAG_*` when digest differs |
| `swarm` | Versioned secrets/configs; inject hashed externals at expand |
| `stack` | Membership SoT + Expand/Inject. Obs `configs.*.file` stubs rewritten **in memory** for `docker compose -f -`. Relative binds absoluteized against project home. |
| Two-pass deploy | Data (no prune) → `dataplane.Ready` → data+app (`--prune`). Ready (including index builds) before app deploy. |
| `dataplane.Ready` | Concurrent `EnsureS3` ‖ `EnsureMongo` (`errgroup`). Fail → “run `eip init` / `eip ensure-s3` / `eip ensure-mongo`”. No short timeout — cancel via interrupt. |
| `dataplane/task` | Shared Swarm-task poller. Timeouts caller-owned. |
| `dataplane.EnsureS3` | Caller SoT → `s3.Ensure`. Used by Ready, `eip ensure-s3`, `eip init` (when seaweedfs up). |
| `dataplane.EnsureMongo` | Caller SoT → `mongo.Ensure`. Used by Ready, `eip ensure-mongo`, `eip init` (when mongo up). |
| `s3.Ensure` | Fail-closed `.env` gate (`S3_*` must be set), weed bucket list/create `static-data` / `static-data-test`, Check. |
| `mongo.Ensure` | Host-side mongosh: keyfile / RS / users / preimages / indexes (`IndexSpecs`). Stack CMD is auth-first `mongod`. |
| `mongo.RestoreKeyfileFromContainer` | Live task → `./mongo-keyfile` + `.bak`. CLI: `eip restore-mongo-keyfile` |
| `mongo.Rekey` | Stack down → temp mongod → promote keyfile. CLI: `eip rekey-mongo -y` |
| `Inspect` / `Source` | `eip.deploy.source` (`live` / `dev` / `mixed` / `unknown`) |
| `Rematerialize` | Full stack redeploy; no bake / engine init / Ready; used by `eip secrets` |
| `Rebuild` | Bake + rematerialize; used by `eip rebuild` |
| `ops` | `eip restart` / `shutdown` / `logs` via SDK |

### CLI verbs (behaviour)

- **`eip up`**: live pulls; two-pass + Ready.
- **`eip dev`**: bake + merge `docker-stack.dev.yml`; same two-pass + Ready.
- **`eip sync`**: targeted `docker service update` from `eip.config.yaml`; `--dry-run` / `-n`. Membership = stack YAML labels (`eip.capacity.sync`, `eip.config.sync`).
- **`eip secrets`**: hashed secrets from `.env`, then Rematerialize. Default `--live`; `--dev` when stack was `eip dev`.
- **`eip rebuild`**: bake + rematerialize (dev). No Ready. After index SoT changes without full up/dev, run **`eip ensure-mongo`**.
- **`eip update-binary`**: replace host **eip binary** from GitHub Releases (when published). Embedded kit (TUI assets, obs templates, bake HCL, env/config defaults) ships inside the binary. Does **not** overwrite on-disk `.env` / `eip.config.yaml` / stack YAML / keyfiles. Restart process, then **`eip sync`** if bundled Swarm configs changed. Not Public chicken-egg (`make update-files`).
- **`eip restart` / `logs` / `shutdown`**: SDK; TUI Restart/Logs use pickers; Logs follow → new logview console.
- **`eip init`**: write-missing `.env` / `eip.config.yaml` (Autogen resolved; never `auto-generate-me`; EVE SSO blank). `CheckOperatorDocs` then optional EnsureS3/EnsureMongo if tasks up. Does **not** apply to a running stack.
- **`eip ensure-s3` / `ensure-mongo`**: CLI-only ensure without full deploy.
- **`eip restore-mongo-keyfile` / `rekey-mongo`**: CLI-only keyfile recovery / rekey.

### Operator documents & TUI

- **Docs gate:** `templates.CheckOperatorDocs` before ensure probes on `eip init` and at start of `EnsureS3` / `EnsureMongo` / `Ready`. Presence/format only — not password strength (until rolling exists). Rejects empty required keys, sentinel, legacy EVE placeholders.
- **Path writability:** `kit.EnsureFileWritable` / `EnsureDirWritable` before EmitEnv and `config.WriteYAML`. TUI live-checks backup stem via `Check*` (no mkdir).
- **TUI menu:** plain-language in `tui/ops`. Setup while docs missing. More = Secrets / Settings / Logs / Command; children return to More. No Apply secrets/settings rows — Persist auto-applies.
- **TUI Setup:** env first → Use defaults or Advanced (`ConfigFields`).
- **TUI Secrets / Settings:** Persist; stack up → child secrets+sync or sync only.
- **ConfigField registry:** `yamldefaults.ConfigFields`; Validate/WriteYAML in `internal/config`.

### Swarm roll order

SoT in stack YAML: app `start-first` (`x-app-deploy`); data/obs `stop-first` (`x-data-deploy` / `x-obs-deploy`); socket proxies `stop-first` (`x-proxy-deploy`). Honored by up/dev/rebuild/rematerialize.

Requires `docker` on PATH (`docker stack deploy`, `docker compose config`, bake).

## Child CLI ↔ TUI messaging

- Process SoT: `internal/process` (`EIP_FROM_TUI=1` via `FromTUI` / `ChildEnv`; `HoldOnError` for desktop-launched failures).
- Protocol: `EIPMSG` JSONL on **stdout** (`internal/msg`). Gate with `msg.Enabled()`. **stderr** = errors → OUTPUT. Non-protocol stdout discarded under TUI; CLI uses `status.FormatPlain`.
- Chip types → `ApplyEvent` → `Snapshot`. Probe: docker + health + app; `chip.stack` → StatusMsg from user verbs only.
- Pane types via `msg` → `tui/pane` + `tui/output/<verb>`. Probe never emits pane types.
- Combined probe SoT: `internal/docker.Probe`. Background: TUI polls `eip probe` every 3s.
- OUTPUT follows latest by default; PgUp pauses follow (`pane.Buffer.Follow`).
- See [TUI.md](./TUI.md) and [MESSAGING.md](./MESSAGING.md).

- New full-screen flows → `tui/screens/<name>/`.
- No empty `doc.go` files for notes — docs live under `docs/admintool/`.
- After moves, delete dead files; do not leave duplicate old paths (`eipconfig`, `proj`, flat `kit/envfields.go`, etc.).

## Build

- `./scripts/admintool/build-host.sh` or `.\scripts\admintool\build-host.ps1` — repo-root `eip` / `eip.exe` (no `dist/`).
- Tag `v*` CI publishes `eip-{os}-{arch}` + `SHA256SUMS` for `eip update-binary` (when that pipeline is live on the Public release channel).
- Locked install target → ALERT, stop running `eip`, retry. **Never** write an alternate binary name.
- **Prerelease:** [PRERELEASE.md](./PRERELEASE.md) — `Development` owns floating `:prerelease`; other staging branches get `prerelease-<slug>` only; Public stays on `X.Y.Z` / `:latest`.

## Embedded kit (binary SoT)

| Asset | Package | Operator disk |
|-------|---------|----------------|
| Observability YAML/JSON | `admintool/internal/kit/obs/` | Not required — Swarm config mounts |
| `docker-bake.hcl` | `admintool/internal/images/` | Not required; bake reads stdin |
| `.env` defaults | `admintool/internal/kit/templates/env` | `eip init` / WriteMissing / TUI Persist |
| `eip.config.yaml` defaults | `admintool/internal/kit/templates/yamldefaults` | `eip init` / WriteMissing / TUI Persist |

Stack YAML may list `file: ./observability/…` as logical paths. Bytes come from the binary; Grafana/Loki/Alloy/Prometheus use `eip.config.sync` Swarm mounts.

## Testing

Contract for Docker discovery: **resolve the CLI endpoint, then Ping/Info** — not OS services.

| Layer | What | Where |
|-------|------|--------|
| **Unit** | `ResolveDockerEndpoint` with fake `DOCKER_CONFIG` trees | `admintool/internal/docker/endpoint_test.go` |
| **Unit** | Env/config registries, CheckOperatorDocs, menu gating, Persist | `kit/templates/**`, `tui/ops`, `tui/screens/**` |
| **CI** | `go test ./…` + `go build` on Ubuntu / Windows / macOS | [`.github/workflows/admintool.yml`](../../.github/workflows/admintool.yml) |
| **Local** | From `admintool/`: `go test ./...` then build-host; smoke `eip doctor` when Docker is up | — |

Live Engine connect is manual. CI does **not** require Docker on the runner.
