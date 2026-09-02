# Deployment Tool — bring-up (`eip up` / `eip dev`)

Live SoT for the Go deploy recipe: expand → two-pass stack deploy → `dataplane.Ready`. Verb catalogue → [verbs.md](./verbs.md). Stack topology → [stack.md](../../../stack/stack.md). Networks → [network.md](../../../stack/network.md). Secrets / operator YAML → [secrets.md](../../../stack/secrets.md) / [config.md](../../../stack/config.md).

## Recipe

Same path every time for **`eip up`** (live pull) and **`eip dev`** (bake + `docker-stack.dev.yml`):

1. Expand fragments (compose-go in-process) with SyncEnvMap + secrets/configs inject  
2. Two-pass **`docker stack deploy`** via `dockercli.StackDeploy`  
3. `dataplane.Ready` (unless stack already healthy)

Moby SDK covers Swarm / network / volumes / secrets / configs / inspect. Stack apply uses the `docker` binary (`stack deploy`). Expand uses compose-go — not a separate Compose runtime.

Requires `docker` on PATH for `docker stack deploy` and (dev) `docker buildx bake`.

## Package roles

| Piece | Role |
|-------|------|
| `kit.Require` | Fail if kit files missing (create docs via `eip init` / TUI Setup) |
| `kit` | `Home`, product strings, envfile helpers, writable, `obs/`, `SelfUpdate` |
| `templates` | `WriteMissingEnv` / `WriteMissingConfig`, `CheckOperatorDocs` |
| `config` | Load/Validate + SyncEnvMap for expand |
| `engine.Ready` | Swarm init, attachable `eip-core` overlay, volumes. Does **not** change cluster-wide orchestration settings (e.g. `task-history-limit`). |
| `images` | Live: parallel `ImagePull` + progress (`pane.progress`). Dev: bake → `:bake`, promote `TAG_*` on digest change; writes `.eip-local-build.env` for `docker-stack.dev.yml` expand |
| `swarm` | Versioned secrets/configs via Moby Secret*/Config*; inject hashed externals at expand |
| `stack` | Membership SoT + Expand/Inject. Obs `configs.*.file` stubs rewritten in memory; relative binds absoluteized against project home. |
| Two-pass deploy | Data (no prune) → `dataplane.Ready` → data+app (`--prune`). Ready (including index builds) before app deploy. |
| `dataplane.Ready` | Concurrent `RunAllEnsures` from `ServiceEnsures` registry. Fail → “run `eip init` / `eip ensure-s3` / `eip ensure-mongo`”. No short timeout — cancel via interrupt. |
| `dataplane/task` | Shared Swarm-task poller via Moby `ContainerList`. Timeouts caller-owned. |
| `dataplane.EnsureS3` | Caller SoT → `s3.Ensure`. Used by Ready, `eip ensure-s3`, `eip init` (when seaweedfs up). |
| `dataplane.EnsureMongo` | Caller SoT → `mongo.Ensure`. Used by Ready, `eip ensure-mongo`, `eip init` (when mongo up). |
| `s3.Ensure` | Fail-closed `.env` gate (`S3_*` must be set), weed bucket list/create `static-data` / `static-data-test`, Check. |
| `mongo.Ensure` | Host-side mongosh: keyfile / RS / users / renames / preimages / indexes (`IndexSpecs`). Renames are gated by the structural version in `shared_deploy_state`, so a settled database costs one read instead of an exec per entry. Stack CMD is auth-first `mongod`. |
| `mongo.RestoreKeyfileFromContainer` | Live task → `./mongo-keyfile` + `.bak`. CLI: `eip restore-mongo-keyfile` |
| `mongo.Rekey` | Stack down → temp mongod → promote keyfile. CLI: `eip rekey-mongo -y` |
| `Inspect` / `Source` | `eip.deploy.source` (`live` / `dev` / `mixed` / `unknown`) |
| `Rematerialise` | Full stack redeploy; no bake / engine init / Ready — used by `eip secrets` and other day-2 paths |
| `Rebuild` | Bake + rematerialise — [verbs.md](./verbs.md) |

## Operator document gates

- **Docs gate:** `templates.CheckOperatorDocs` before ensure probes on `eip init` and at start of `EnsureS3` / `EnsureMongo` / `Ready`. Requires usable `.env` / config (required keys set to real values). Strength / charset rules apply when generating or rolling secrets, not as a separate ensure gate.
- **Path writability:** `kit.EnsureFileWritable` / `EnsureDirWritable` before EmitEnv and `config.WriteYAML`. TUI live-checks backup stem via `Check*` (no mkdir).

Registries → [variables.md](./variables.md). Persist UX → [builders.md](../tui/builders.md).

## Swarm roll order

SoT in stack YAML: app `start-first` (`x-app-deploy`); data/obs `stop-first` (`x-data-deploy` / `x-obs-deploy`); socket proxies `stop-first` (`x-proxy-deploy`). Honoured by up/dev/rebuild/rematerialise.
