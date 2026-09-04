# Observability consolidation

## Owns

Plan and stage notes for collapsing the observability stack onto **one collector and one backend**:
Grafana Alloy as the single point everything enters, and a single-node store that holds metrics,
logs and traces together and serves its own dashboards.

Covers the embedded-exporter collapse, the backend evaluation and its decision gate, the dashboard
rebuild, the trace pipeline that is currently discarded, and the parallel-run cutover.

## Does not own

- What the ESI limiter emits and why → [esi-rate-limiting/contents.md](../esi-rate-limiting/contents.md)
- Swarm fragment membership and day-2 rolls → [stack/stack.md](../../stack/stack.md)
- Deployment Tool verbs and the embedded kit → [deployment/deployment-tool/contents.md](../../deployment/deployment-tool/contents.md)
- Application instrumentation (what a service records) → each service's live topic

## Task map

| I need to… | Read |
|------------|------|
| Understand what runs today and why it is being changed | [plan.md](./plan.md) § What runs today |
| See the target shape | [plan.md](./plan.md) § One collector, one backend |
| Know which backends were considered and why one was chosen | [plan.md](./plan.md) § Choosing the backend |
| Find the facts this plan rests on, and how they were checked | [plan.md](./plan.md) § Verified facts |
| Know what would send us back to a different backend | [plan.md](./plan.md) § Stage B — the decision gate |
| See how the exporters fold into the collector | [plan.md](./plan.md) § Stage C — exporters become components |
| Understand what happens to traces | [plan.md](./plan.md) § Stage D — traces stop being discarded |
| Know what breaks when the backend changes | [plan.md](./plan.md) § Wire compatibility |
| Roll back | [plan.md](./plan.md) § Cutover and rollback |
| Check what has landed | [plan.md](./plan.md) § Stage status |
| See how a part behaves after a landed stage | [overlay.md](./overlay.md) |
