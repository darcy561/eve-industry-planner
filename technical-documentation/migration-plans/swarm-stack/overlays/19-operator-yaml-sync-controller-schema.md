# #19 — Operator YAML: `eip sync` apply + controller policy schema

**Roadmap:** [../roadmap.md](../roadmap.md) `#19`  
**Status (mirror):** partial — sync apply **landed**; controller policy keys open until #18  
**Live SoT (sync-applied path):** [config.md](../../../stack/config.md). Controller policy keys stay here until #18 consumes them.

## What changed

_`eip sync` apply path (landed):_ Ephemeral SyncEnvMap (no durable `.eip-sync.env`); Moby `ServiceUpdate` for capacity-sync services; obs fragment merge on rematerialize (#34). Soft divert env from YAML is live.

## How this part works after the change

Operators edit project-home `eip.config.yaml` (schema from `yamldefaults.DefaultConfig` / `ConfigFields`) and run **`eip sync`**. Secrets stay in `.env` → **`eip secrets`**.

### Applied today (`eip sync` / expand)

| YAML | Effect |
|------|--------|
| `services.*.min` | `deploy.replicas` + `eip.capacity.min` |
| `services.*.max` | Label `eip.capacity.max` only (no automatic scale) |
| `services.worker.concurrency` | `WORKER_ASYNQ_CONCURRENCY` |
| `services.websocket.client_cutoff` | `WS_CLIENT_CUTOFF` (hard full) |
| `services.websocket.target_clients` | `WS_TARGET_CLIENTS` (soft divert) |
| `ports.*` / `paths.*` / `proxy.*` | Traefik publish / labels / trust |
| `addons.observability.*` | Fragment merge on rematerialize; grafana knobs via sync when running |
| File configs labeled `eip.config.sync=1` | Hash-diff Swarm configs |

### Controller policy schema (validated; #18 consumes)

| YAML | Intended consumer |
|------|-------------------|
| `scale_timing.*` | Controller pacing |
| `services.*.capacity_controller_managed` | Per-role kill switch |
| `services.websocket.reserve_capacity` | Scale-up headroom policy |
| `services.websocket.drain_timeout` | Evacuate wait (not process stop grace) |
| Automatic use of `services.*.max` | Live scale ceiling once #18 armed |

## Still open

1. #18 consume path for controller policy keys above
2. Optional dry-run policy print (#27) reading the same YAML
3. Controller file mount only if needed beyond project-home YAML

## Missing live SoT discovered mid-work

None for the sync-applied path — [config.md](../../../stack/config.md) already documents sync→`WS_TARGET_CLIENTS`.

## Notes / decisions

- Soft divert via `target_clients` is sync/#8 behaviour — not controller work.
- This ticket owns the **schema home**; #18 owns **reading** the policy keys at runtime.
