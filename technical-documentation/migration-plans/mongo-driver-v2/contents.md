# MongoDB Go driver v1 → v2

## Owns

In-flight plan, inventory, smoke notes, and behaviour overlays for the `services/` MongoDB Go driver cutover and Stage B **access layer** work. **Not live SoT** until promoted.

## Does not own

- Live backend/stack Mongo operator docs → promote after go-ahead
- Deployment Tool Mongo ensure (mongosh) — out of scope for this project

## Task map

| I need to… | Read |
|------------|------|
| Handoff / pickup order | [start-here.md](./start-here.md) |
| Full Phase 1 / Stage A/B plan and done-when | [plan.md](./plan.md) |
| Import surface / API breaks status (keep aligned each step) | [inventory.md](./inventory.md) |
| Version check (mongo v2 + OTel) | [versions.md](./versions.md) |
| In-flight behaviour overlay / missing-SoT drafts | [overlay.md](./overlay.md) |
| Stage A live smoke results | [smoke-notes.md](./smoke-notes.md) |
| Stage B access layer plan (Store / Bulk / writers) | [stage-b-access-layer.md](./stage-b-access-layer.md) |
| Stage B rebuild rules (parity before swap) | [rebuild-rules.md](./rebuild-rules.md) |
| Stage B full move waves (`core/mongo` → `shared/mongo`) | [stage-b-full-move.md](./stage-b-full-move.md) |
| Stage B write benefit map (multi-coll candidates) | [stage-b-map.md](./stage-b-map.md) |
| New Mongo package (rebuild) | `services/shared/mongo` |
| Legacy Mongo package (until retired) | `services/shared/core/mongo` |
| Re-run live smoke harness | `services/cmd/mongo_driver_v2_smoke` (see smoke-notes) |
| Pull Mongo samples for parity | `services/cmd/mongo_parity_sample` → `.tmp/mongo-parity` (gitignored) |
