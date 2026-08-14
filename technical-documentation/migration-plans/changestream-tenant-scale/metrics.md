# Publisher metrics contract

**Plan:** [plan.md](./plan.md) Phase A  
**Status:** scaffold — fill exact metric names when Phase A lands  
**Not live SoT.**

## Purpose

Make **group lag** and **hot tenants** observable so Phase B queues can be validated and Phase D auto-detect has a stable signal surface.

## Labels (locked intent)

| Label | Values | Notes |
|-------|--------|-------|
| `group_id` | `account`, `planner`, … | Matches `CollectionGroup.ID` |
| `tenant` | `account:{id}` / `corporation:{id}` / `alliance:{id}` | Same encoding as `doc.update` / placement; omit or use `_none` only for intentional skips |

Prefer **low-cardinality** aggregates for scrape defaults; keep high-cardinality `tenant` on histograms/counters that ops deliberately query (or exemplar/log correlation) so Prometheus is not drowned when tenant count grows.

## Signals to expose

| Signal | Why |
|--------|-----|
| Events received / processed / published / skipped (per `group_id`, optionally per `tenant`) | Throughput + drop visibility |
| Publish latency (JetStream ack) | Separates Mongo cursor health from NATS |
| Queue depth / age per tenant (after Phase B) | Defines “busy tenant” |
| Cursor / loop lag proxy (time since last successful advance, or event `_clusterTime` skew if cheap) | Group-level stall |
| Resume token save failures | Handoff risk |
| Watch reconnects / invalid resume clears | Stability |

## Busy-tenant definition (for later auto-detect)

Document thresholds in code/config when Phase D is implemented. **Intent now:**

- A tenant is **busy** when its queue age or publish share dominates a `group_id` for a sustained window (hysteresis — see [auto-detect.md](./auto-detect.md)).
- Metrics alone must be enough for a human or controller to name `tenant` + `group_id` without reading changestream info logs.

## Still open

- Exact Prometheus metric names / help text (land with Phase A code)
- Grafana panel draft (optional; not a Phase A gate)
- Whether tenant-labelled series are always-on or sampled / top-K
