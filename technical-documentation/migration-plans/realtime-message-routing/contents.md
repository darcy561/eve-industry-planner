# Realtime message routing

## Owns

How a realtime message says **who receives it**, separately from what it means.

- The **audience** dimension — `everyone`, `subscribers`, `members` — and where it travels on the
  wire, so a message names its recipients rather than being routed by its family name.
- The **one delivery path** every non-document family arrives through, replacing the per-family
  subscriber files that each know their own fan-out rule.
- The **ceiling index** — the connection index built from `Client.Ceiling`, which answers "who is
  entitled to this owner" beside the existing index that answers "who is subscribed to it".
- **Reaching a member who is not in the planner**, which is what the `members` audience is for: a
  corporation or alliance planner telling its members something while each of them is working
  somewhere else.
- Retiring the **downward-match delivery checks**, which test a scope shape the owner system no
  longer produces.

## Does not own

- **Where the grants ceiling is read from, and how a revocation reaches a live connection** →
  [shared-planners/plan.md](../shared-planners/plan.md) § Stage I and § Losing access. This project
  consumes the ceiling and indexes it; it does not decide whether the ceiling stays a stored
  snapshot, and it mints no revocation mechanism of its own. **Stage I's answer sets how stale a
  `members` audience can be — see [plan.md](./plan.md) § What this project is waiting on.**
- **The owner model itself** — owner keys, membership rows, membership providers, the active-planner
  message → [shared-planners/contents.md](../shared-planners/contents.md). This project routes on
  owners that project defines.
- **The `type` / `subtype` vocabulary** and what each family means to a browser. Those are live SoT
  in [`shared/nats/client_messages.go`](../../../services/shared/nats/client_messages.go),
  [`messageKinds.js`](../../../frontend/src/WebSocket/messageKinds.js) and the corpus they are both
  checked against. Audience is a separate dimension and does not enter them.
- **The document lock's delivery** — its key, its fan-out subject `doc.lock.{accountID}` and the
  corporation and alliance selectivity that waits on them →
  [shared-planners/plan.md](../shared-planners/plan.md) § Stage H. How broad the lock is, and whether
  it gates a write at all → [document-write-granularity](../document-write-granularity/contents.md).
  What the editing layers may assume about it →
  [job-document-drafts](../job-document-drafts/plan.md) § The lock is the isolation, and it stays.
  `document_lock` is a fifth wire family with an audience this project could express, and moving it is
  not this project's to propose: Stage H owns that subject. See [plan.md](./plan.md) § Starting
  position for what it is.
- **Websocket placement and selective fan-out** →
  [swarm-stack #20](../swarm-stack/overlays/20-selective-fanout.md) and live
  [backend/websocket/websocket.md](../../backend/websocket/websocket.md).
- **Hosted tenants and the JetStream filter subjects built from them** →
  [changestream-tenant-scale/contents.md](../changestream-tenant-scale/contents.md). This project
  states why the ceiling index stays out of `HostedTenants()`; it changes neither it nor the filters.
- **Live backend and SPA behaviour** → [backend/contents.md](../../backend/contents.md),
  [frontend/contents.md](../../frontend/contents.md), promoted only when this project closes.

## Task map

| I need to… | Read |
|------------|------|
| Understand the goal and what surfaced it | [plan.md](./plan.md) § Goal |
| See how a message is routed today, and what is hard-coded | [plan.md](./plan.md) § Starting position |
| Understand why `type` cannot carry the audience | [plan.md](./plan.md) § Meaning and audience are two questions |
| Know why the audience is a subject segment rather than an envelope field | [plan.md](./plan.md) § The audience travels in the subject |
| See the audiences and what each reads | [plan.md](./plan.md) § The audiences |
| Understand the difference between subscribed and entitled | [plan.md](./plan.md) § Subscribed is not entitled |
| Know why the member list is not derived at publish time | [plan.md](./plan.md) § Why the publisher does not derive the member list |
| Know why the ceiling index stays out of hosted tenants | [plan.md](./plan.md) § The ceiling index is not a hosted tenant |
| See what this project needs from shared planners before it can finish | [plan.md](./plan.md) § What this project is waiting on |
| Find the scope checks that test a shape that no longer exists | [plan.md](./plan.md) § Stage A |
| Pick up the work slice by slice | [plan.md](./plan.md) §§ Stage A – Stage D |
| Check what is additive and what breaks | [plan.md](./plan.md) § Wire compatibility |
| Know what the SPA does with a message about a planner it is not in | [plan.md](./plan.md) § Open questions |
| Find out who owns the document lock's delivery | § Does not own, above |
| Check what has landed | [plan.md](./plan.md) § Stage status |
| See how a part works while the project is in flight | [overlay.md](./overlay.md) |
