# doc.update subjects

**Roadmap:** #20 — Selective fan-out  
**Landed:** [`services/core/changestream/watcher.go`](../../../../services/core/changestream/watcher.go) → `doc.update.{tenantString}.{collection}.{docID}`  
**Tenant keys:** [`services/shared/wsplacement/tenant.go`](../../../../services/shared/wsplacement/tenant.go) (`TenantStringFromRouting`)

## Where / how (before → landed)

**Before:** publish `doc.update.{collection}.{docID}`; tenant in payload only; WS firehose `doc.update.>`. **Landed:** tenant token in subject; WS filters `doc.update.{tenantString}.>` per hosted tenant; in-process indexes still gate delivery.

## Correctness need

JetStream can filter only by **subject**. Selective pull requires a tenant token in the subject. Payload-only tenant cannot drive `FilterSubjects`.

## Trade-offs

- Subject redesign touches core publisher + any tests/tools that assert subject shape.
- Cutover must not leave new filters matching zero messages (old subjects) or old firehose filters missing new subjects.
- Shard-hash subjects (`doc.update.shard.N.>`) reduce filter churn but lose precise per-tenant skip — rejected as default; keep as escape if UpdateConsumer churn proves painful later.

## Outcome

**Locked.**

- **Shape:** `doc.update.{tenantString}.{collection}.{docID}`
- **`tenantString`:** same encoding as placement / hosted view — `account:{id}` / `corporation:{id}` / `alliance:{id}` (one subject token; colon allowed).
- **Publisher:** core resolves tenant at publish from change / Mongo meta (same authority as outbound routing fields today).
- **Precedence:** `accountID` → else `corporationID` → else `allianceID` (same as websocket dispatch). Missing all → no publish (no legacy subject, no catch-all token).
- **Stream bind:** remains `doc.update.>` (covers new hierarchy).
- **WS filter pattern per hosted tenant:** `doc.update.{tenantString}.>`
- **Cutover:** done — see [implement-watcher-cutover.md](./implement-watcher-cutover.md). WS parse prefers payload `collection` / `docID`.
