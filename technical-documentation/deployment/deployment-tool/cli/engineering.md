# Deployment Tool — engineering conventions

Contributor SoT for the [`deployment-tool/`](../../../../deployment-tool/) Go module: Docker access, package layout, helpers, kit. Bring-up → [deploy.md](./deploy.md). Verbs → [verbs.md](./verbs.md). Registries → [variables.md](./variables.md). EIPMSG → [messaging.md](./messaging.md).

## Docker access (Moby SDK first)

- **Prefer the Moby Go SDK** (`github.com/moby/moby/client` and `github.com/moby/moby/api`) for all Engine/Swarm work. Secrets and configs, including service config rolls, use the SDK.
- **Client SoT:** always `internal/docker.NewAPIClient` (not raw `FromEnv` alone). Flow: `ResolveDockerEndpoint` (DOCKER_HOST → Docker CLI context Host → `""`) → `WithHost` or `FromEnv` → Ping/Info. The SDK does not read Docker contexts; Desktop’s `desktop-linux` → `dockerDesktopLinuxEngine` (etc.) needs that layer. Do **not** inspect OS services / WSL / Hyper-V.
- **Naming:** Engine SDK handle = `apiClient` (`*client.Client` from Moby). Never call it `cli`. `internal/dockercli` = shelling the `docker` binary. Cobra verbs = host CLI. Unrelated: `eip.config.yaml`’s `cli:` block (env backup path).
- **Diagnostics:** `ResolveDockerEndpoint` / `EngineProbe.Host` for `eip doctor`. Local only for now; context TLS for remote Engines is out of scope.
- Shared probes/verbs live in [`deployment-tool/internal/docker`](../../../../deployment-tool/internal/docker/) — extend that package; do not open raw HTTP to the Engine API from CLI or TUI.
- **TUI** must not talk to Docker in-process — child `eip <verb>` only ([tui.md](../tui/tui.md), [messaging.md](./messaging.md)).
- **docker binary exceptions:** `docker stack deploy` (`internal/dockercli`), `docker buildx bake` (`internal/images` raw exec). Stack expand uses `compose-spec/compose-go` in-process (`internal/stack`). `github.com/docker/cli` remains only for registry-auth config parsing in `internal/images/registry_auth.go`.
- **If the SDK has no API for what you need:** you may use the Engine HTTP API, but **stop and flag it** before implementing — call out why the SDK is insufficient.
- Do not invent a parallel “curl the socket” path when `client.Client` already covers the call.

## Helpers first

- Shared behaviour → helper in `tui/ui`, `tui/theme`, `tui/exec`, `tui/screens/home/{nav,docs,pickers}`, or `internal/…`.
- Do not copy-paste panel render, list sizing, child CLI runs, or env/config emit.
- If you need the same call twice, extract a function before merging.

## Go language & stdlib

- **Language version only** in `go.mod` / `tools/go.mod` (`go 1.26.5`). **Never** add a `toolchain` directive — CI/local install Go; do not force toolchain downloads via go.mod.
- **Check, then upgrade only if it helps:** when writing or editing code, check against current stable idioms at the module `go` version. Prefer the modern form when clearer, shorter, safer, or it deletes a hand-rolled helper. If it does not help, **leave the code alone** (no fashion churn / mass rewrites).
- Prefer when helpful: `slices` / `maps` / `cmp` (`Sort`, `Sorted(maps.Keys)`, `Contains`, `Compact`, `Copy`, …), `min`/`max`, `errors.Is(err, fs.ErrNotExist)`, `errors.AsType`, `strings.Cut` / `CutPrefix` / `SplitSeq`, `errgroup` for parallel work that returns errors, no pre-1.22 `e := e` loop captures, `any` over `interface{}`.
- CLI long work: `process.TimeoutSignalContext` or `SignalContext` + `MapDoneError` — not bare `context.WithTimeout(context.Background(), …)`.
- Skip experimental / no-fit APIs (`runtime/secret`, simd, slog redesign of EIPMSG). Keep Moby / compose-go / Cobra API shapes.

## Folder structure

Keep `deployment-tool/` tidy and update [tui.md](../tui/tui.md) § TUI package map when you add/move TUI packages:

```text
deployment-tool/
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

Import direction for documents: `kit` ← `config` ← `templates/{env,yamldefaults}`. `config` must not import templates. Registry detail → [variables.md](./variables.md).

- New full-screen flows → `tui/screens/<name>/`.
- No empty `doc.go` files for notes — docs live under `technical-documentation/deployment/deployment-tool/`.
- After moves, delete dead files; keep one path per package.

## Operator surface

Host ops are the **Deployment Tool** only (CLI / TUI). Keep **`scripts/deployment-tool/`** (build-host) + repo-root **eip-bootstrap**. Operator verbs stay in `internal/catalog` — do not invent parallel ship/release host commands outside that catalog and the TUI menu map ([verbs.md](./verbs.md)).

| Path | Role |
|------|------|
| **`eip`** | CLI binary + TUI entry; verbs in catalog |

## Embedded kit (binary SoT)

| Asset | Package | Operator disk |
|-------|---------|----------------|
| Observability YAML/JSON | `deployment-tool/internal/kit/obs/` | Not required — Swarm config mounts |
| `docker-bake.hcl` | `deployment-tool/internal/images/` | Not required; bake reads stdin |
| `.env` defaults | `deployment-tool/internal/kit/templates/env` | `eip init` / WriteMissing / TUI Persist |
| `eip.config.yaml` defaults | `deployment-tool/internal/kit/templates/yamldefaults` | `eip init` / WriteMissing / TUI Persist |

Stack YAML may list `file: ./observability/…` as logical paths. Bytes come from the binary; Grafana/Loki/Alloy/Prometheus use `eip.config.sync` Swarm mounts.

## Build

- `./scripts/deployment-tool/build-host.sh` or `.\scripts\deployment-tool\build-host.ps1` — repo-root `eip` / `eip.exe` (no `dist/`).
- Locked install target → ALERT, stop running `eip`, retry. **Never** write an alternate binary name.
- Public / prerelease CI ships → [public.md](../../github-actions/public.md) / [prerelease.md](../../github-actions/prerelease.md). Channels → [release-channels.md](./release-channels.md).
