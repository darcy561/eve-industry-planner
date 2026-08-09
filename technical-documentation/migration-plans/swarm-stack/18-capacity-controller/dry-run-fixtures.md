# Dry-run fixtures (#27)

**Roadmap:** #27  
**Phase:** A

## Where / how (today)

Golden `policy.Evaluate` table tests + recording `testing/capacity_controller/clusterfake` / executor managed-gate tests. Management playbook sim: `TestManagementSim_websocketEvacuatePlaybook` (cordon→drain→scale on Fake). Operator dry-run via `ctl plan` / **`eip capacity plan`**. Affinity soak (#26) and core failover (#28) remain separate. Live testing map: [testing/services/capacity-controller.md](../../../testing/services/capacity-controller.md).

## Correctness need

Prove cluster-shape decisions without mutating Swarm. Recording cluster must show Apply only when Managed.

## Trade-offs

WS fixtures may still plan while WS unmanaged — documents future Apply without flipping managed.

## Outcome

**Locked.**

Golden `policy.Evaluate` table tests (at least):

1. Worker depth high (`P > C*R`), managed, below max, stabilization met → scale desired+1  
2. Worker depth high, at max → hold  
3. Worker depth high, `managed: false` → hold  
4. Worker `P == 0`, above min, active rule + stabilization met → scale desired-1  
5. Inside cooldown → hold even if pressure high  
6. WS two backends @ 90% of target with reserve 0.2 → plan scale to 3 (**Apply skipped while unmanaged**)  
7. WS three backends @ 30%, one draining empty → plan scale to 2  
8. Unknown queue depth → hold + Summary mentions missing signal  

Recording cluster: when Managed, Apply log equals plan Actions; when unmanaged, Apply skipped.

**Phase A:** golden cases 1–8 + managed Apply tests landed under `services/capacity-controller/`.  
**Phase D:** Fake management evacuate playbook sim landed (`executor/management_sim_test.go`).
