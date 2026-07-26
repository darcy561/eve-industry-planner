# admintool — engineering conventions

## Docker access (SDK first)

- **Prefer the Docker Go SDK** (`github.com/docker/docker/client`) for all Engine/Swarm work.
- **Client SoT:** always `internal/docker.NewClient` (not raw `FromEnv` alone). Flow: `ResolveDockerEndpoint` (DOCKER_HOST → CLI context Host → `""`) → `WithHost` or `FromEnv` → Ping/Info. The SDK does not read Docker contexts; Desktop’s `desktop-linux` → `dockerDesktopLinuxEngine` (etc.) needs that layer. Do **not** inspect OS services / WSL / Hyper-V.
- **Diagnostics:** `ResolveDockerEndpoint` / `EngineProbe.Host` for `eip doctor`. Local only for now; context TLS for remote Engines is out of scope.
- Shared probes/verbs live in [`admintool/internal/docker`](../../admintool/internal/docker/) — extend that package; do not open raw HTTP to the Engine API from CLI or TUI.
- **TUI** must not talk to Docker in-process (console lifetime). It runs child `eip <verb>` commands; those verbs use the SDK.
- **If the SDK has no API for what you need:** you may use the Engine HTTP API, but **stop and flag it** before implementing — call out why the SDK is insufficient and whether a cleaner SDK-shaped wrapper exists.
- Do not invent a parallel “curl the socket” path when `client.Client` already covers the call.

## Lists & data

- Build menus and pickers **dynamically** from a SoT (`internal/catalog`, config files, Docker probes).
- No hard-coded duplicate string tables across files. See [VARIABLES.md](./VARIABLES.md).

## Helpers first

- Shared behaviour → helper in `tui/ui`, `tui/theme`, `tui/exec`, or `internal/…`.
- Do not copy-paste panel render, list sizing, child CLI runs, or env read/write.
- If you need the same call twice, extract a function before merging.

## Folder structure

Keep `admintool/` tidy and update [TUI.md](./TUI.md) package map when you add/move packages:

```text
admintool/
  internal/catalog/       # CLI verb SoT + services.go (expected Swarm services / fragments)
  internal/kit/           # Require + Home + product strings + envfile + templates/ + obs/ + SelfUpdate
  internal/stack/         # stack YAML SoT + compose expand/inject (SyncEnv map; no eipconfig import)
  internal/swarm/         # Name + SyncSecrets/SecretsOverlay + SyncConfigs/ApplyConfigs/…
  internal/eipconfig/     # Load/Validate/SyncEnv + Sync (capacity/Traefik/Grafana/config apply)
  internal/deploy/        # Inspect, Source, Run (up/dev), Rematerialize, Rebuild
  internal/engine/        # Swarm init + eip-core overlay + volumes (SDK)
  internal/dockercli/     # docker CLI wrappers (stack deploy, compose config)
  internal/images/        # pull live | bake (embedded docker-bake.hcl via stdin)
  internal/dataplane/     # Ready gate; mongo.Ensure (RS/users/preimages); s3/; bootstrap/ (legacy bash embed)
  internal/ops/           # eip restart / shutdown / logs (SDK; stack namespace labels)
  internal/status/        # status signal + report + WriteReport + outfmt geometry
  internal/msg/           # EIPMSG envelope + pane emit/parse + chip.* helpers
  internal/process/       # OS process helpers (FromTUI, ChildEnv, HoldOnError, Interactive)
  internal/docker/        # Docker Go SDK SoT (Probe, StackSnapshot, …)
  internal/yamlutil/      # shared YAML helpers
  cmd/commands/           # thin Cobra verbs (wire helpers; no Engine logic)
  tui/
    theme/ ui/ brand/ exec/ ops/ status/
    output/<verb>/        # per-command OUTPUT formatters (lipgloss)
    screens/<flow>/       # one folder per full-screen flow
```

## Deploy (`eip up` / `eip dev`)

Go recipe replaces `stack-deploy.sh` / Make for bring-up. Stack **apply** uses the Docker CLI (`dockercli.StackDeploy`); Engine SDK covers Swarm/network/volumes.

| Piece | Role |
|-------|------|
| `kit.Require` | Fail if kit files missing (no create — that is `eip init` later) |
| `kit` (also) | `Home`, product strings, envfile helpers, `WriteMissing*`, `ReadObs` / `obs/`, `SelfUpdate` |
| `eipconfig` | Load/Validate + SyncEnvMap for expand; `Sync` for day-2 capacity/Traefik/Grafana/config apply |
| `engine.Ready` | Swarm init, attachable `eip-core` overlay, volumes |
| `images` | Live: pull. Dev: `buildx bake -f -` (embedded HCL) → `:bake`, promote `TAG_*` when digest differs from live Swarm image |
| `swarm` | Versioned secrets/configs (`SyncSecrets` / `SyncConfigs` / `ApplyConfigs`); inject hashed externals at expand |
| `stack` | Stack YAML membership SoT + `Expand`/`Inject*` (callers pass `SyncEnv` map; package does not import eipconfig) |
| Two-pass deploy | Data (no prune) → `dataplane.Ready` → data+app (`--prune`) |
| `dataplane.Ready` | `s3.CheckAppBuckets` + `mongo.Ensure` (RS, users, preimage collections); fail → “run `eip init` / `eip ensure-mongo`” |
| `mongo.Ensure` | Idempotent host-side mongosh ensure; keyfile: keep / restore from `mongo-keyfile.bak` / generate only if no data volume; stack CMD is auth-first `mongod`. CLI: `eip ensure-mongo` |
| `mongo.RestoreKeyfileFromContainer` | Copy live key from running task (`/tmp` prefer) → `./mongo-keyfile` + `.bak`. CLI: `eip restore-mongo-keyfile` |
| `mongo.Rekey` | Stack down: temp mongod on data volume with candidate keyFile → verify `MONGO_ROOT_*` → promote to `./mongo-keyfile` + `.bak`. CLI: `eip rekey-mongo -y` |
| `dataplane/bootstrap` | Embedded legacy `mongo-setup.sh` (emergency/manual only; not used as Swarm CMD) |
| `Inspect` / `Source` | Status reads `eip.deploy.source` (`live` / `dev` / `mixed` / `unknown`) |
| `Rematerialize` | Full stack redeploy (data+app+obs); no bake / engine init / dataplane.Ready; used by `eip secrets` |
| `Rebuild` | Bake (digest promote) + full-stack rematerialize; used by `eip rebuild` |
| `ops` | `eip restart` / `eip shutdown` / `eip logs` via SDK |

- **`eip up`**: live pulls; stack files data + app.
- **`eip dev`**: bake + merge `docker-stack.dev.yml`; same two-pass + Ready.
- **`eip sync`**: targeted `docker service update` from `eip.config.yaml` + `stack` membership; `--dry-run` / `-n`. Membership = stack YAML labels (`eip.capacity.sync`, `eip.config.sync`), not live Swarm labels.
- **`eip secrets`**: sync hashed secrets from `.env`, then `Rematerialize` so mounts refresh. Default `--live`; use `--dev` when the stack was brought up with `eip dev` (TAG_* from running service images). Source is explicit (`--live` / `--dev`).
- **`eip rebuild`**: bake all `docker-stack.dev.yml` roles, promote `TAG_*` only when digests change, rematerialize full stack data+app+obs (dev). Unchanged image specs → no Swarm roll. Optional `--no-cache`. Does not re-run engine init or dataplane.Ready. Prefer this (or rematerialize after `eip secrets`) for day-2 version/image ships — there is **no** `eip release` verb.
- **`eip update`**: replace the host `eip` binary from GitHub Releases (bundled obs/templates/bake HCL ship with it). Does **not** rematerialize; run **`eip sync`** afterward to apply config hash diffs from the new binary. Restart CLI/TUI to run the new binary.
- **Swarm roll order** is SoT in stack YAML: app `start-first` (`docker-stack.yml` `x-app-deploy`); data/obs `stop-first` (`x-data-deploy` / `x-obs-deploy`); socket proxies `stop-first` (`x-proxy-deploy`). `eip up` / `dev` / `rebuild` / rematerialize all honor those orders.
- **`eip restart [service|all]`**: SDK `ServiceUpdate` force-roll; membership via `com.docker.stack.namespace`. `-y` skips confirm (TUI auto-confirms).
- **`eip logs [service|all]`**: SDK `ServiceLogs` (default `--tail=100`). TUI: LOG TYPE → LOG SOURCE; dump → OUTPUT pane; follow (`-f --ui`) → new console with thin logview (mini logo + service name + scrolling body). Follow is one service only.
- **`eip shutdown`**: SDK remove all stack services + stack networks, wait gone, then remove leftover Compose project containers/networks (`kit.ComposeProjectName`). Keeps volumes and external `eip-core`. `-y` skips confirm.
- Requires `docker` on PATH (stack deploy / compose config / bake).
- **`eip init`**: write missing `.env` / `eip.config.yaml` from embed; if mongo task is up, run `mongo.Ensure`. Guided TUI later.
- **`eip ensure-mongo`**: CLI-only — run `mongo.Ensure` without stack deploy / bake / S3.
- **`eip restore-mongo-keyfile`**: CLI-only — copy live keyfile from running mongo task to host (+ `.bak`); prefer `/tmp` over bind mount.
- **`eip rekey-mongo`**: CLI-only — stack must be down; temp mongod with candidate keyFile; verify `MONGO_ROOT_*`; promote to host keyfile (+ `.bak`).
- **Project home:** `internal/kit.Home()` = cwd. Kit files live there.

## Child CLI ↔ TUI messaging

- Process SoT: `internal/process` (`EIP_FROM_TUI=1` via `FromTUI` / `ChildEnv`; `HoldOnError` for desktop-launched failures).
- **Project home:** `internal/kit.Home()` = process cwd only. All on-disk kit paths (stack YAML, `.env`, …) are relative to that folder — not a git repo. Public setup and local repo-root runs use the same rule.
- Protocol: `EIPMSG` JSONL on **stdout** (`internal/msg`). Chip helpers live in the same package. Gate with `msg.Enabled()`. **stderr** = errors → OUTPUT pane. Non-protocol stdout discarded under TUI; CLI uses `status.FormatPlain`.
- Chip types (`chip.docker` / `chip.health` / `chip.stack`) → `ApplyEvent` → `Snapshot` (`Event.Kind` == envelope type). Probe: docker + health only; `chip.stack` → StatusMsg from user verbs only.
- Pane types (`pane.text` / `pane.status`) via `msg` → `tui/pane` buffer + `tui/output/<verb>` formatters. Probe must never emit pane types.
- Combined probe SoT: `internal/docker.Probe` (Ping → Info → stack health when swarm active). `eip doctor` / `eip probe` emit chip.docker + chip.health under TUI.
- Background refresh: TUI polls `eip probe` every 3s (keeps polling while `commandRunning`); chips only under TUI.
- OUTPUT viewport keeps scroll history across commands; follows latest by default; PgUp pauses follow (`pane.Buffer.Follow`).
- See [TUI.md](./TUI.md) and [VARIABLES.md](./VARIABLES.md) (process flags vs `.env`, prefix rules).

- New full-screen flows → `tui/screens/<name>/` (not loose files under `tui/`).
- No empty `doc.go` files for notes — docs live under `docs/admintool/`.
- After moves, delete dead files; do not leave duplicate old paths.

## Build

- `.\scripts\admintool\build-host.ps1` (or `.sh`) only — installs repo-root `eip.exe` / `eip` (no `dist/` package).
- Tag `v*` CI publishes `eip-{os}-{arch}` + `SHA256SUMS` for `eip update`.
- If the install target is **locked**: script **ALERTs**, force-stops running `eip` processes, waits briefly, retries. If still locked → fail with instructions.
- **Never** write an alternate binary name when locked.

## Embedded kit (binary SoT)

| Asset | Package | Operator disk |
|-------|---------|----------------|
| Observability YAML/JSON | `admintool/internal/kit/obs/` | Not required — Swarm config mounts |
| `docker-bake.hcl` | `admintool/internal/images/` | Not required; bake reads stdin |
| env / config examples | `admintool/internal/kit/templates/` | `eip init` writes when missing |

Stack YAML may still list `file: ./observability/…` as logical paths (discovery). Bytes come from the binary; Grafana/Loki/Alloy/Prometheus configs use `eip.config.sync` Swarm mounts.

## Testing

Contract for Docker discovery: **resolve the CLI endpoint, then Ping/Info** — not OS services.

| Layer | What | Where |
|-------|------|--------|
| **Unit** | `ResolveDockerEndpoint` with fake `DOCKER_CONFIG` trees (no daemon) | `admintool/internal/docker/endpoint_test.go` |
| **CI** | `go test ./…` + `go build` on Ubuntu / Windows / macOS | [`.github/workflows/admintool.yml`](../../.github/workflows/admintool.yml) |
| **Local** | From `admintool/`: `go test ./...` then build-host; smoke `eip doctor` when Docker is up | — |

Live Engine connect is manual / optional later (Desktop up/down, context switch). CI does **not** require Docker on the runner.
