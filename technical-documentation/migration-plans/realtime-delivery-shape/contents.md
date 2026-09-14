# Realtime delivery shape

## Owns

What a message **looks like inside the websocket service**, and how one walk delivers every one of
them.

- The **one internal shape** every inbound path converts to — family, subtype, audience, target,
  document, source and frame — so a message is described the same way whichever subject it arrived on.
- The **adapters** at each subscription, which are where a `doc.update` payload, a `doc.lock` payload
  and an audience message each become that shape.
- The **family-keyed table** that says how a family is delivered: which gates apply beyond the
  audience, and what a family absent from it costs.
- The **one delivery walk** that replaces the six fan-out functions, and bringing the audience path
  onto the outcome the other paths already report.
- **Where the frame is built** — each adapter produces what its family's browser handler already
  reads, and delivery never opens it; that is the seam where those shapes could later converge.
- Bringing every family the service delivers **into the vocabulary and the corpus**, because a table
  keyed by family cannot route one only a single side knows. That is `document_lock`, and the corpus
  covers messages addressed to an audience rather than every string that can appear in a `type`
  field — the replies and lifecycle signals written to one socket address nobody.

## Does not own

- **Which audience a message is addressed to, and the subject it travels** →
  [realtime-message-routing/contents.md](../realtime-message-routing/contents.md). That project
  decided that the family must never be what picks the recipients; this one keeps that line by making
  `audience` a field the type does not determine. The `members` audience and the ceiling index behind
  it are still owed there.
- **Transports.** Every subject keeps the delivery guarantee and the filter it has: documents stay on
  JetStream with per-tenant filter subjects, locks stay durable, audience messages stay core NATS.
  This project changes nothing on the wire — a filter is how the service subscribes, not what the
  message is once it is in the process.
- **The document lock's key and its fan-out subject** →
  [shared-planners/plan.md](../shared-planners/plan.md) § Stage H. This project converts the lock
  payload it receives; it does not decide what that subject is called or how it is keyed.
- **Per-tenant JetStream filters and the hosted-tenant set they are built from** →
  [changestream-tenant-scale/contents.md](../changestream-tenant-scale/contents.md).
- **How broad the document lock is, and whether a refused write reaches the user** →
  [document-write-granularity/contents.md](../document-write-granularity/contents.md).
- **The baseline sync path** — the `sync` package, its coordinator and queue, and the frames it
  formats → [shared-planners/plan.md](../shared-planners/plan.md) § Stage G, which absorbs what
  survived the retired websocket-realtime project. This project established that neither half was ever
  built here and left it standing rather than removing an account-shaped precedent before its
  replacement is designed — see [plan.md](./plan.md) § The sync path belongs to shared planners.
- **Live backend and SPA behaviour** → [backend/contents.md](../../backend/contents.md),
  [frontend/contents.md](../../frontend/contents.md), promoted only when this project closes.

## Task map

| I need to… | Read |
|------------|------|
| Understand the goal and what surfaced it | [plan.md](./plan.md) § Goal |
| See what arrives today and in how many shapes | [plan.md](./plan.md) § Starting position |
| See the shape everything converts to | [plan.md](./plan.md) § The internal shape |
| Know why the type does not choose the audience | [plan.md](./plan.md) § The type selects policy, never recipients |
| Understand what the per-type table holds | [plan.md](./plan.md) § The table |
| Know why nothing on the wire changes | [plan.md](./plan.md) § The transport is not the shape |
| Know why the browser sees no change | [plan.md](./plan.md) § The adapter builds the frame |
| See how a lock, a document or an announcement is addressed today | [overlay.md](./overlay.md) §§ Stage A – Stage C |
| See what has to be decided rather than assumed | [plan.md](./plan.md) § Open questions |
| Find out why the sync frames are not removed here | [plan.md](./plan.md) § The sync path belongs to shared planners |
| Pick up the work slice by slice | [plan.md](./plan.md) §§ Stage A – Stage D |
| Check what is additive and what breaks | [plan.md](./plan.md) § Wire compatibility |
| Check what has landed | [plan.md](./plan.md) § Stage status |
| See how a part works while the project is in flight | [overlay.md](./overlay.md) |
| Read what would replace live SoT on promote | [promote/README.md](./promote/README.md) |
