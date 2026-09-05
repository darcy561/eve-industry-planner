# Observability consolidation

## Owns

Plan and stage notes for collapsing the observability stack onto **one collector**: Grafana Alloy as
the single point everything enters, with Prometheus, Loki and Grafana kept as the store behind it.

Covers the four collection paths that bypassed Alloy, the backend evaluation that measured a
single-store alternative and rejected it, the dashboard defects, and the trace pipeline that is
currently discarded.

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
| See the target shape | [plan.md](./plan.md) § One collector |
| Know what was settled and is no longer up for debate | [plan.md](./plan.md) § Decisions taken |
| Know what the off-mode has to do and how the level floor moves | [plan.md](./plan.md) § Stage A — logging holds with the layer off |
| Know which backends were measured and why the stack kept Grafana | [plan.md](./plan.md) § Choosing the backend |
| Find the facts this plan rests on, and how they were checked | [plan.md](./plan.md) § Verified facts |
| See how the exporters and scrape targets fold into the collector | [plan.md](./plan.md) § Stage B — every metrics target moves onto Alloy |
| Understand what happens to traces, and what Sentry keeps | [plan.md](./plan.md) § Stage F — traces stop being discarded |
| Know why the dashboards are fixes rather than rebuilds | [plan.md](./plan.md) § Stage H — fix the dashboards |
| Make the spans worth querying once tracing is on | [plan.md](./plan.md) § Stage G — the spans say what a trace needs |
| Know what an operator has to act on | [plan.md](./plan.md) § Wire compatibility |
| Roll back | [plan.md](./plan.md) § Rollback |
| Check what has landed | [plan.md](./plan.md) § Stage status |
| Find the shared-scaffolding cleanup for instruments | [plan.md](./plan.md) § Stage C — the application tier all speaks OTLP |
| See how a part behaves after a landed stage | [overlay.md](./overlay.md) |
