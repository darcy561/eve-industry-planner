# Deployment Tool — engineering conventions

Contributor map for the [`deployment-tool/`](../../../../deployment-tool/) Go module: how Docker access is wired, where each package lives, what the binary embeds, and how the host binary is built.

Engineering rules — Moby-first, Go idioms and `go fix`, operator-surface ownership, helper reuse — are **not** here: module rules → [`../technical-rules.md`](../technical-rules.md), shared bar → [`../../../technical-rules.md`](../../../technical-rules.md). Bring-up → [deploy.md](./deploy.md). Verbs → [verbs.md](./verbs.md). Registries → [variables.md](./variables.md). EIPMSG → [messaging.md](./messaging.md).

## Docker access

- **Client SoT:** `internal/docker.NewAPIClient` (not raw `FromEnv` alone). Flow: `ResolveDockerEndpoint` (DOCKER_HOST → Docker CLI context Host → `""`) → `WithHost` or `FromEnv` → Ping/Info. The SDK does not read Docker contexts; Desktop's `desktop-linux` → `dockerDesktopLinuxEngine` (etc.) needs that layer. OS services / WSL / Hyper-V are not inspected.
- **Naming:** Engine SDK handle = `apiClient` (`*client.Client` from Moby). `internal/dockercli` = shelling the `docker` binary. Cobra verbs = host CLI. Unrelated: `eip.config.yaml`'s `cli:` block (env backup path).
- **Diagnostics:** `ResolveDockerEndpoint` / `EngineProbe.Host` for `eip doctor`. Local only for now; context TLS for remote Engines is out of scope.
- **Shared probes/verbs** live in [`deployment-tool/internal/docker`](../../../../deployment-tool/internal/docker/).
- **Where the `docker` binary is still used today:** `docker stack deploy` (`internal/dockercli`) and `docker buildx bake` (`internal/images` raw exec). Stack expand runs in-process via `compose-spec/compose-go` (`internal/stack`). `github.com/docker/cli` remains only for registry-auth config parsing in `internal/images/registry_auth.go`.

## Package map

```text
deployment-tool/
  internal/catalog/              # CLI verb SoT + services.go (expected Swarm services)
  internal/kit/                  # Home, product, envfile, writable, Version/Channel/KitBranch,
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

Shared behaviour homes: `tui/ui`, `tui/theme`, `tui/exec`, `tui/screens/home/{nav,docs,pickers}`, and `internal/…`.

TUI package moves also update [tui.md](../tui/tui.md) § TUI package map.

## Embedded kit (binary SoT)

| Asset | Package | Operator disk |
|-------|---------|----------------|
| Observability YAML/JSON | `deployment-tool/internal/kit/obs/` | Not required — Swarm config mounts |
| `docker-bake.hcl` | `deployment-tool/internal/images/` | Not required; bake reads stdin |
| `.env` defaults | `deployment-tool/internal/kit/templates/env` | `eip init` / WriteMissing / TUI Persist |
| `eip.config.yaml` defaults | `deployment-tool/internal/kit/templates/yamldefaults` | `eip init` / WriteMissing / TUI Persist |

Stack YAML may list `file: ./observability/…` as logical paths. Bytes come from the binary; Grafana/Loki/Alloy/Prometheus use `eip.config.sync` Swarm mounts.

## Host binary

| Path | Role |
|------|------|
| **`eip`** / `eip.exe` | CLI binary + TUI entry; operator verbs come from `internal/catalog` |
| `scripts/deployment-tool/build-host.sh` / `.ps1` | Builds repo-root `eip` / `eip.exe` (no `dist/`) |
| repo-root `eip-bootstrap.sh` / `.ps1` | Operator bootstrap |

On a locked install target the build ALERTs and stops so the running `eip` can be closed and the build retried; it does not fall back to an alternate binary name.

Public / prerelease CI ships → [public.md](../../github-actions/public.md) / [prerelease.md](../../github-actions/prerelease.md). Channels → [release-channels.md](./release-channels.md).
