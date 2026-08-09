# #19 — Operator YAML: `eip sync` apply + controller policy schema

**Roadmap:** [../roadmap.md](../roadmap.md) `#19`  
**Consume locks:** [../18-capacity-controller/policy-yaml.md](../18-capacity-controller/policy-yaml.md) · [config-mount.md](../18-capacity-controller/config-mount.md)  
**Status (mirror):** **done** 2026-08-09 — sync apply + Load + Swarm config mount / Observe merge + live config docs promote; armed Apply under #18  
**Live SoT:** [config.md](../../../stack/config.md). Controller policy keys: pack + `services/capacity-controller/config`.
**Code:** [`services/capacity-controller/config`](../../../../services/capacity-controller/config/)

## What changed

_`eip sync` apply path (landed):_ Ephemeral SyncEnvMap; Moby `ServiceUpdate` for capacity-sync services; obs fragment merge on rematerialize (#34). Soft divert env from YAML is live.

_Phase B:_ DT materializes Swarm config **`eip_config_yaml`** from project-home `eip.config.yaml` (AppStackFile / SyncConfigs / InjectExternalConfigs); controller mounts `/etc/eip/eip.config.yaml` and reloads; Observe merges managed/min/max into RoleState.

## How this part works after the change

Operators edit project-home `eip.config.yaml` and run **`eip sync`**. Secrets stay in `.env` → **`eip secrets`**. Controller reads the Swarm-mounted copy for Evaluate.

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
| `eip_config_yaml` | Full `eip.config.yaml` → capacity-controller mount |

### Controller policy schema (validated; #18 consumes — pack locked)

See [policy-yaml.md](../18-capacity-controller/policy-yaml.md). Mount: [config-mount.md](../18-capacity-controller/config-mount.md).

## Still open

1. Apply behaviour remains #18 (managed gate; WS unmanaged until soak)

## Missing live SoT discovered mid-work

None for the sync-applied path — [config.md](../../../stack/config.md) already documents sync→`WS_TARGET_CLIENTS`. Controller mount notes stay in pack until promote.

## Notes / decisions

- Soft divert via `target_clients` is sync/#8 behaviour — not controller work.
- This ticket owns the **schema home**; #18 owns **reading** the policy keys at runtime (`capacity-controller/config` mirrors shape).
