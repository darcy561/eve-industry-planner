# #29 — Management ops simulator (evacuate / move / cordon / roll)

**Roadmap:** [../roadmap.md](../roadmap.md) `#29`  
**Status (mirror):** **done** 2026-08-09 — Fake playbook sim + CI path; live armed drills documented; pin/move deferred with #21  
**Not live SoT.** On overlap with live docs, this overlay wins until promote (then history only).

## What changed

- **CI (no Swarm):** `TestManagementSim_websocketEvacuatePlaybook` — Fake cordon → drain → scale under Evaluate+Apply (`services/capacity-controller/executor/management_sim_test.go`). Fake updates backend draining/clients on Cordon/Drain/Uncordon.
- **Operator dry-run:** `eip capacity status|plan` against live Observe.
- **Live drills:** `eip capacity cordon|drain|evacuate|uncordon`; optional #26 soak clients for reconnect evidence.
- Pin/move tenant drills **not** in v1 (follow #21 remainders).

## How this part works after the change

| Drill | How | Swarm? |
|-------|-----|--------|
| Evacuate playbook shape | `go test ./capacity-controller/executor/ -run ManagementSim` | no |
| Policy golden + arm gate | `go test ./capacity-controller/...` | no |
| Inspect Plan | `eip capacity plan` | yes (read-only) |
| Planned cordon/drain | `eip capacity cordon\|drain <container_id>` (armed) | yes |
| Full evacuate | `eip capacity evacuate <container_id>` (armed) | yes |
| Reconnect soak | #26 `ws_soak` + planned drain | yes |

Promote testing map: [testing/services/capacity-controller.md](../../../testing/services/capacity-controller.md).

## Still open

- Pin / move tenant sim (with #21)
- Live soak flip of `services.websocket.capacity_controller_managed`

## Missing live SoT discovered mid-work

_None beyond the Phase D promote table on [18-capacity-controller.md](./18-capacity-controller.md)._

## Notes / decisions

- Host ops remain **`eip capacity` → Moby exec → ctl** (not host NATS).
- Optional in-mesh `capacity.command.*` still deferred.
- Product comments: current-behaviour only.
