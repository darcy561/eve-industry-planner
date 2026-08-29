# Filter mutate (interest updates)

**Roadmap:** #20 — Selective fan-out  
**Landed:** [`UpdateConsumerFilterSubjects`](../../../../services/shared/core/nats/filter_subjects.go); fan-out durables start inert and reconcile from `HostedTenants` ([`fanout_filters.go`](../../../../services/websocket/server/fanout_filters.go)). Singular `FilterSubject` callers still recreate-on-mismatch in [`GetOrCreateConsumer`](../../../../services/shared/core/nats/jetstream.go).

## Where / how (before → landed)

**Before:** static firehose `FilterSubject`; interest only in-process. **Landed:** debounced `FilterSubjects` updates from local `HostedTenants` on connect / disconnect / org scope.

## Correctness need

- Durable **name** stays per `container.ID()` (#2).
- Interest = **FilterSubjects** list derived from local hosted set (+ lock account mapping per [subjects-doc-lock](./subjects-doc-lock.md)).
- Updates must not recreate the durable on every join (loses consumer state / hammers NATS).

## Trade-offs

- Debounce reduces UpdateConsumer storms during reconnect; lengthens miss window slightly ([empty-and-miss](./empty-and-miss.md)).
- Shared helper without HostedTenants keeps worker/scheduler static-filter callers simple.

## Outcome

**Locked.**

### Shared helper (`shared/core/nats`) — landed

- `UpdateConsumerFilterSubjects`: normalise, no-op if equal, `UpdateConsumer` with **FilterSubjects**.
- **Not** HostedTenants-aware — reusable.
- Fan-out path: `FilterSubjects` drift → in-place update (not delete/recreate). Worker/scheduler keep static singular `FilterSubject` (recreate-on-mismatch).
- Empty hosted set → inert subjects (`DocUpdateFilterInert` / `DocLockFilterInert`) — never empty `FilterSubjects`.

### Websocket controller — landed

- Hosted-set change (connect / disconnect / org scope) → debounced reconcile (~100ms).
- Map `HostedTenants()` → update + lock filter lists; update both durables.
- In-process delivery indexes remain the correctness fence; JetStream filter is **cost control**.
