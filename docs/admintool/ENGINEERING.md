# admintool — engineering conventions

Entry point for host `eip` docs. Do **not** add `admintool/README.md` or `docs/admintool/README.md` — use this file and the siblings in `docs/admintool/`.

## Docker access (Moby SDK first)

- **Prefer the Moby Go SDK** (`github.com/moby/moby/client` and `github.com/moby/moby/api`) for all Engine/Swarm work. Secrets and configs, including service config rolls, use the SDK.
- **Client SoT:** always `internal/docker.NewAPIClient` (not raw `FromEnv` alone). Flow: `ResolveDockerEndpoint` (DOCKER_HOST → Docker CLI context Host → `""`) → `WithHost` or `FromEnv` → Ping/Info. The SDK does not read Docker contexts; Desktop’s `desktop-linux` → `dockerDesktopLinuxEngine` (etc.) needs that layer. Do **not** inspect OS services / WSL / Hyper-V.
- **Naming:** Engine SDK handle = `apiClient` (`*client.Client` from Moby). Never call it `cli`. `internal/dockercli` = shelling the `docker` binary. `eip` Cobra verbs = host CLI. Unrelated: `eip.config.yaml`’s `cli:` block (env backup path).
- **Diagnostics:** `ResolveDockerEndpoint` / `EngineProbe.Host` for `eip doctor`. Local only for now; context TLS for remote Engines is out of scope.
- Shared probes/verbs live in [`admintool/internal/docker`](../../admintool/internal/docker/) — extend that package; do not open raw HTTP to the Engine API from CLI or TUI.
- **TUI** must not talk to Docker in-process. It runs child `eip <verb>` commands; those verbs use the SDK.
- **docker binary exceptions:** `docker stack deploy` (`internal/dockercli`), `docker buildx bake` (`internal/images` raw exec). Stack expand uses `compose-spec/compose-go` in-process (`internal/stack`) — no `docker compose` CLI. `github.com/docker/cli` remains only for registry-auth config parsing in `internal/images/registry_auth.go`.
- **If the SDK has no API for what you need:** you may use the Engine HTTP API, but **stop and flag it** before implementing — call out why the SDK is insufficient.
- Do not invent a parallel “curl the socket” path when `client.Client` already covers the call.

## Lists & data

- CLI verbs: SoT in `internal/catalog`. Home TUI menu: SoT in `tui/ops` (plain-language titles; maps to catalog ids via `Args`).
- Document fields: `kit/templates/env.EnvFields` and `yamldefaults.ConfigFields` — no parallel UI key lists.
- Dataplane ensure steps: SoT in `dataplane.ServiceEnsures` (Ready = all; repair = subset by short). Do not hardcode mongo/seaweedfs ensure lists elsewhere.
- See [VARIABLES.md](./VARIABLES.md).

### Operator verbs by stack Health

| Situation | Verb |
|-----------|------|
| Swarm inactive / nothing deployed (Health off) | **Start** → `eip up` |
| Stack present, unhealthy (Health amber/red) | **Repair** → `eip repair` |
| Healthy (Health green) | **Update** → `eip update` |

TUI menu gating implements this when Docker is green (`tui/ops.Allowed`). Details: [TUI.md](./TUI.md).

## Helpers first

- Shared behaviour → helper in `tui/ui`, `tui/theme`, `tui/exec`, `tui/screens/home/{nav,docs,pickers}`, or `internal/…`.
- Do not copy-paste panel render, list sizing, child CLI runs, or env/config emit.
- If you need the same call twice, extract a function before merging.

## Go language & stdlib

Part of normal admintool engineering (not a separate optional pass).

- **Language version only** in `go.mod` / `tools/go.mod` (`go 1.26.5`). **Never** add a `toolchain` directive — CI/local install Go; do not force toolchain downloads via go.mod.
- **Check, then upgrade only if it helps:** when writing or editing code, check against current stable idioms at the module `go` version. Prefer the modern form when clearer, shorter, safer, or it deletes a hand-rolled helper. If it does not help, **leave the code alone** (no fashion churn / mass rewrites).
- Prefer when helpful: `slices` / `maps` / `cmp` (`Sort`, `Sorted(maps.Keys)`, `Contains`, `Compact`, `Copy`, …), `min`/`max`, `errors.Is(err, fs.ErrNotExist)`, `errors.AsType`, `strings.Cut` / `CutPrefix` / `SplitSeq`, `errgroup` for parallel work that returns errors, no pre-1.22 `e := e` loop captures, `any` over `interface{}`.
- CLI long work: `process.TimeoutSignalContext` or `SignalContext` + `MapDoneError` — not bare `context.WithTimeout(context.Background(), …)`.
- Skip experimental / no-fit APIs (`runtime/secret`, simd, slog redesign of EIPMSG). Keep Moby / compose-go / Cobra API shapes.

## Folder structure

Keep `admintool/` tidy and update [TUI.md](./TUI.md) when you add/move packages:

```text
admintool/
  internal/catalog/              # CLI verb SoT + services.go (expected Swarm services)
  internal/kit/                  # Home, product, envfile, writable, Channel/KitBranch,
                                 # SelfUpdate, UpdateStacks, pathlink, relaunch, obs/
  internal/kit/templates/        # WriteMissing* facade + CheckOperatorDocs
  internal/kit/templates/env/    # EnvFields / emit / autogen / backup / CheckUsable
  internal/kit/templates/yamldefaults/  # DefaultConfig + ConfigFields (Go SoT; no loose YAML)
  internal/config/               # Load/Validate/WriteYAML/SyncEnv/Sync (live YAML)
  internal/stack/                # stack YAML SoT + compose-go expand/inject
  internal/swarm/                # SyncSecrets / SyncConfigs / ApplyConfigs (Moby Secret*/Config*)
  internal/deploy/               # Inspect, Source, Run (up/dev), Rematerialize, Rebuild
  internal/engine/               # Swarm init + eip-core overlay + volumes (Moby)
  internal/dockercli/            # docker binary: stack deploy (+ Verbose/LookPath)
  internal/images/               # pull (ImagePull) | bake (buildx CLI) + ImageInspect/Tag
  internal/dataplane/            # Ready = ServiceEnsures registry; ensure_*.go; task/
  internal/ops/                  # restart / shutdown / logs / repair (Moby SDK)
  internal/status/               # status signal + report
  internal/msg/                  # EIPMSG + chip.* helpers
  internal/process/              # FromTUI, ChildEnv, HoldOnError, TimeoutSignalContext, EnsureTUIConsoleSize
  internal/docker/               # Moby Engine API SoT (NewAPIClient → apiClient)
  internal/docker/enginetest/    # httptest Engine stand-in for SDK unit tests
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

**Make is retired** (root Makefile + `scripts/{bootstrap,swarm,lib,ops,test}/` deleted). Host ops are **`eip` only**. Keep **`scripts/admintool/`** (build-host) + repo-root **eip-bootstrap**. Verb map: [MAKE.md](../swarm/MAKE.md). Do not add `eip release` / advertise / `update-data` mirrors.

| Path | Role |
|------|------|
| **`eip`** | up/dev (Go recipe + Ready), sync, secrets, rebuild, status/logs/restart/shutdown/repair, init, ensure-*, mongo keyfile tools, `update`, TUI |

`eip init` is **not** Public bootstrap (bootstrap only places the binary). Init fetches missing `docker-stack*.yml` from the baked kit branch, then writes missing operator docs (+ optional ensure if data tasks are already up). See [VARIABLES.md](./VARIABLES.md) § Project home.

## Deploy (`eip up` / `eip dev`)

Go recipe is the preferred bring-up. Same path every time: expand → two-pass **`docker stack deploy`** (via `dockercli.StackDeploy`) → `dataplane.Ready`. Moby SDK covers Swarm/network/volumes/secrets/configs/inspect; stack apply stays on the CLI until an SDK path exists (not planned soon).

| Piece | Role |
|-------|------|
| `kit.Require` | Fail if kit files missing (create docs via `eip init` / TUI Setup) |
| `kit` | `Home`, product strings, envfile helpers, writable, `obs/`, `SelfUpdate` |
| `templates` | `WriteMissingEnv` / `WriteMissingConfig`, `CheckOperatorDocs` |
| `config` | Load/Validate + SyncEnvMap for expand; `Sync` for day-2 capacity/Traefik/Grafana/config apply |
| `engine.Ready` | Swarm init, attachable `eip-core` overlay, volumes |
| `images` | Live: parallel `ImagePull` + progress (`pane.progress`). Dev: bake → `:bake`, promote `TAG_*` on digest change |
| `swarm` | Versioned secrets/configs via Moby Secret*/Config*; inject hashed externals at expand |
| `config.Sync` | Day-2 capacity / Traefik / Grafana / config mounts via Moby ServiceUpdate (not `docker service update` CLI) |
| `stack` | Membership SoT + Expand/Inject via compose-go (no `docker compose` CLI). Obs `configs.*.file` stubs rewritten in memory; relative binds absoluteized against project home. |
| Two-pass deploy | Data (no prune) → `dataplane.Ready` → data+app (`--prune`). Ready (including index builds) before app deploy. |
| `dataplane.Ready` | Concurrent `RunAllEnsures` from `ServiceEnsures` registry. Fail → “run `eip init` / `eip ensure-s3` / `eip ensure-mongo`”. No short timeout — cancel via interrupt. |
| `dataplane/task` | Shared Swarm-task poller via Moby `ContainerList` (not `docker ps`). Timeouts caller-owned. |
| `dataplane.EnsureS3` | Caller SoT → `s3.Ensure`. Used by Ready, `eip ensure-s3`, `eip init` (when seaweedfs up). |
| `dataplane.EnsureMongo` | Caller SoT → `mongo.Ensure`. Used by Ready, `eip ensure-mongo`, `eip init` (when mongo up). |
| `s3.Ensure` | Fail-closed `.env` gate (`S3_*` must be set), weed bucket list/create `static-data` / `static-data-test`, Check. |
| `mongo.Ensure` | Host-side mongosh: keyfile / RS / users / preimages / indexes (`IndexSpecs`). Stack CMD is auth-first `mongod`. |
| `mongo.RestoreKeyfileFromContainer` | Live task → `./mongo-keyfile` + `.bak`. CLI: `eip restore-mongo-keyfile` |
| `mongo.Rekey` | Stack down → temp mongod → promote keyfile. CLI: `eip rekey-mongo -y` |
| `Inspect` / `Source` | `eip.deploy.source` (`live` / `dev` / `mixed` / `unknown`) |
| `Rematerialize` | Full stack redeploy; no bake / engine init / Ready; used by `eip secrets` |
| `Rebuild` | Bake + rematerialize; used by `eip rebuild` |
| `ops` | `eip restart` / `shutdown` / `logs` / `repair` via Moby SDK |

### CLI verbs (behaviour)

- **`eip up`**: live pulls; two-pass + Ready. If the stack was already healthy before bring-up, skips `dataplane.Ready` (step: “Stack already healthy — skipping ensure”).
- **`eip dev`**: bake + merge `docker-stack.dev.yml`; same two-pass + Ready (same healthy skip).
- **`eip sync`**: targeted Moby `ServiceUpdate` from `eip.config.yaml`; `--dry-run` / `-n`. Membership = stack YAML labels (`eip.capacity.sync`, `eip.config.sync`).
- **`eip secrets`**: hashed secrets from `.env` (Moby Secret*), then Rematerialize. Default `--live`; `--dev` when stack was `eip dev`.
- **`eip rebuild`**: bake + rematerialize (dev). No Ready. After index SoT changes without full up/dev, run **`eip ensure-mongo`**.
- **`eip update`**: day-2 refresh — **binary first** (GitHub Releases tag `cli` / baked channel), then stack YAML from the baked kit git branch tip, then **pull live images** and **digest-reconcile** (force-update services whose running digest drifted; includes obs when enabled). Flags: `--binary-only`, `--stacks-only`, `--images-only`. After binary install: TUI relaunches with `EIP_UPDATE_RESUME` then runs update again; CLI re-execs `eip update`. Embedded kit ships inside the binary. Does **not** overwrite on-disk `.env` / `eip.config.yaml` / keyfiles. Cold start remains **`eip up`**. Replaces retired `make update-files`.
- **`eip restart` / `logs` / `shutdown`**: Moby SDK; TUI Restart/Logs use pickers; Logs follow → new logview console.
- **`eip repair`**: day-2 heal for an already-deployed unhealthy stack (TUI **Repair** when Health is amber/red). Rematerialize if expected services are missing; runs dataplane `ServiceEnsures` registry entries only for bad service shorts (task must be running); force-update other bad present services. No pull/bake/`dataplane.Ready`/cold start. Healthy stack → use `eip update`; nothing deployed → `eip up`. Flag: `--dry-run` / `-n`.
- **`eip init`**: write-missing `docker-stack*.yml` (from baked `KitBranch`), then `.env` / `eip.config.yaml` (Autogen resolved; never `auto-generate-me`; EVE SSO blank). `CheckOperatorDocs` then optional EnsureS3/EnsureMongo if tasks up. Does **not** apply to a running stack.
- **`eip ensure-s3` / `ensure-mongo`**: CLI-only ensure without full deploy.
- **`eip restore-mongo-keyfile` / `rekey-mongo`**: CLI-only keyfile recovery / rekey.

### Operator documents & TUI

- **Docs gate:** `templates.CheckOperatorDocs` before ensure probes on `eip init` and at start of `EnsureS3` / `EnsureMongo` / `Ready`. Presence/format only — not password strength (until rolling exists). Rejects empty required keys, sentinel, legacy EVE placeholders.
- **Path writability:** `kit.EnsureFileWritable` / `EnsureDirWritable` before EmitEnv and `config.WriteYAML`. TUI live-checks backup stem via `Check*` (no mkdir).
- **TUI menu:** plain-language in `tui/ops`. Setup while docs or `docker-stack*.yml` missing (`SetupNeeded` / `StacksMissing`). When Docker is green: **Start** if Health off, **Repair** if amber/red, **Update** when healthy (Start/Repair hidden). More = Command / Secrets / Settings / Logs (Command = host `eip` verbs + core `cli` / bare tasks; same as footer `:`); children return to More. No Apply secrets/settings rows — Persist auto-applies.
- **TUI Setup:** env first → Use defaults or Advanced (`ConfigFields`).
- **TUI Secrets / Settings:** Persist; stack up → child secrets+sync or sync only.
- **ConfigField registry:** `yamldefaults.ConfigFields`; Validate/WriteYAML in `internal/config`.

### Swarm roll order

SoT in stack YAML: app `start-first` (`x-app-deploy`); data/obs `stop-first` (`x-data-deploy` / `x-obs-deploy`); socket proxies `stop-first` (`x-proxy-deploy`). Honored by up/dev/rebuild/rematerialize.

Requires `docker` on PATH for the remaining binary exceptions (`docker stack deploy`, `docker buildx bake`). Engine/Swarm CRUD uses the Moby SDK (daemon socket); stack YAML expand uses compose-go in-process.

## Child CLI ↔ TUI messaging

- Process SoT: `internal/process` (`EIP_FROM_TUI=1` via `FromTUI` / `ChildEnv`; `HoldOnError`; `TimeoutSignalContext` / `SignalContext` for Ctrl+C; `EnsureTUIConsoleSize`).
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
- Public CLI: Actions → **admintool** → Run workflow (`bump` patch/minor/major). Resolves live `cli-v*` (or first ship `1.0.0`), builds `eip-{os}-{arch}` + `SHA256SUMS`, uploads pin `cli-v*` + floating `cli`. See [PRERELEASE.md](./PRERELEASE.md) § Public ships.
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
| **Unit (pure)** | Diffs, naming, YAML registries, menu gating — no Engine | `config/*_test`, `swarm/*_test`, `kit/templates/**`, `tui/**` |
| **Unit (Engine fake)** | SDK call sites via httptest stand-in | [`internal/docker/enginetest`](../../admintool/internal/docker/enginetest/) + `config/engine_apply_test.go` |
| **Unit (endpoint)** | `ResolveDockerEndpoint` with fake `DOCKER_CONFIG` trees | `admintool/internal/docker/endpoint_test.go` |
| **Integration (Swarm)** | Real Linux Engine: secret/config ensure + prune | `swarm/integration_test.go` (`//go:build integration`) |
| **CI unit** | `go test ./…` + `go build` on Ubuntu / Windows / macOS | [`.github/workflows/admintool.yml`](../../.github/workflows/admintool.yml) job `test` |
| **CI integration** | Ubuntu only: `swarm init` then `go test -tags=integration` | same workflow, job `integration` |
| **Soak (manual)** | Live daemon: `eip doctor`, `sync`, `secrets`, pull/restart/logs | local only |

**Why pure unit tests miss Engine bugs:** default `go test ./…` never talks to Docker. Control-flow around `errdefs.IsNotFound` vs daemon errors needs `enginetest`; real Swarm object CRUD needs `-tags=integration` (CI Ubuntu job). Prefer the fake for classification/wiring; do **not** unit-test create races or HTTP client timeouts. Expand `enginetest` handlers when you add SDK call-site coverage.

Local integration (optional): Docker + Swarm active, then from `admintool/`:

`go test ./internal/swarm/ -tags=integration -count=1`
