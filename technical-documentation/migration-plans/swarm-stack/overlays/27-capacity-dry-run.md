# #27 — Capacity controller dry-run / simulation

**Roadmap:** [../roadmap.md](../roadmap.md) `#27`  
**Pack:** [../18-capacity-controller/dry-run-fixtures.md](../18-capacity-controller/dry-run-fixtures.md) · [worker-thresholds.md](../18-capacity-controller/worker-thresholds.md)  
**Status (mirror):** **done** 2026-08-09 — Evaluate/Fake fixtures + managed-gate Apply + `eip capacity plan` + #29 management sim  
**Code:** `go test ./capacity-controller/...` (from `services/`)  
**Live testing map:** [testing/services/capacity-controller.md](../../../testing/services/capacity-controller.md)

## What changed

- Pack fixtures locked (Phase 0).
- Phase A: eight Evaluate table tests + executor managed-gate Apply against Fake.
- Phase B: Swarm binary; Apply gated by managed only (no arm env).
- Phase C: ctl/`eip capacity` **status|plan** (and cordon/drain/evacuate when armed).
- Phase D: Fake cordon→drain→scale management sim; testing topic promoted.

## How this part works after the change

`policy.Evaluate` is pure; `executor.Apply` skips unmanaged roles. Fake appends Apply records for assertions. Operator dry-run via ctl/`eip capacity plan`.

## Still open

_none for dry-run path — pin/move sims track #21_

## Missing live SoT discovered mid-work

_Promoted — [testing/services/capacity-controller.md](../../../testing/services/capacity-controller.md)._

## Notes / decisions

- Fixtures + Fake + per-role managed kill-switch remain available.
- WS Evaluate may emit scale/cordon/drain plans while unmanaged; Apply still skipped.
