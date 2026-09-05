# Observability consolidation

## Owns

Plan and stage notes for collapsing the observability stack onto **one collector and one backend**:
Grafana Alloy as the single point everything enters, and a single-node store that holds metrics,
logs and traces together and serves its own dashboards.

Covers the four collection paths that bypassed Alloy, the backend evaluation and its decision
gate, the dashboard rebuild, the trace pipeline that is currently discarded, and the cutover.

## Does not own

- What the ESI limiter emits and why → [backend/shared/esi.md](../../backend/shared/esi.md) § What it reports
- Swarm fragment membership and day-2 rolls → [stack/stack.md](../../stack/stack.md)
- Deployment Tool verbs and the embedded kit → [deployment/deployment-tool/contents.md](../../deployment/deployment-tool/contents.md)
- Application instrumentation (what a service records) → each service's live topic

## Task map

| I need to… | Read |
|------------|------|
| Pick this work up on another machine, or after a break | [handoff.md](./handoff.md) |
| Understand the change in one sentence, and why it is not one change | [plan.md](./plan.md) § The shape of the change |
| See how a Go service logs, and what happens with the layer off | [plan.md](./plan.md) § How a Go service actually logs |
| See every producer and where its telemetry goes today | [plan.md](./plan.md) § What runs today |
| See the target shape | [plan.md](./plan.md) § One collector, one backend |
| Know what was settled and is no longer up for debate | [plan.md](./plan.md) § Decisions taken |
| Know what the off-mode has to do and how the level floor moves | [plan.md](./plan.md) § Stage A — logging holds with the layer off |
| Know which backends were considered and why one was chosen | [plan.md](./plan.md) § Choosing the backend |
| Find the facts this plan rests on, and how they were checked | [plan.md](./plan.md) § Verified facts |
| Know what the query checkpoint has to prove | [plan.md](./plan.md) § Stage E — the query gate |
| See how the exporters and scrape targets fold into the collector | [plan.md](./plan.md) § Stage B — every metrics target moves onto Alloy |
| Understand what happens to traces, and what Sentry keeps | [plan.md](./plan.md) § Stage F — traces stop being discarded |
| Make the spans worth querying once tracing is on | [plan.md](./plan.md) § Stage G — the spans say what a trace needs |
| Know what an operator has to act on | [plan.md](./plan.md) § Wire compatibility |
| Roll back | [plan.md](./plan.md) § Cutover and rollback |
| Check what has landed | [plan.md](./plan.md) § Stage status |
| Find the shared-scaffolding cleanup for instruments | [plan.md](./plan.md) § Stage C — the application tier all speaks OTLP |
| Know why the dashboards are rebuilds rather than ports | [plan.md](./plan.md) § Stage H — the dashboards |
| See how a part behaves after a landed stage | [overlay.md](./overlay.md) |
