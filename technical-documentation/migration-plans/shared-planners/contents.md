# Shared planners

## Owns

The planner as a first-class thing a user works in, and the ownership model underneath it.

- The **owner block** (`{kind, id}`) that replaces per-scope fields on stored documents, and the backfill that puts it there.
- The **planner document** and its **membership rows** — invites, join methods, and how a roster is kept current.
- **Membership providers**: how a planner's roster is decided, whether from rows we own (`invite`), from the account itself (`self`), or from ESI (`esi-corporation`, `esi-alliance`).
- The **grants ceiling** as a list of owner keys, and how a removed member loses access.
- The **active planner** on the client, and the owner parameter on every scoped read.
- **Realtime consistency under more than one writer** — the ordering token, the owner-scoped baseline, and what `session_resume` may assert. Absorbed from the retired websocket-realtime project.
- **What the document lock is namespaced by** — the Redis key, the waitlist, the viewer set and the fan-out subject moving off the calling account and onto the owner key, so two members of one planner contend for one lock.
- The rule that a document's owner is **decided when it is created**, never inferred from correlated fields.

## Does not own

- Statistics aggregation, the rebuild queue, the delta path, and the archived-jobs read/restore surfaces → [archived-jobs-stats/plan.md](../accounts-page/archived-jobs-stats/plan.md). Those are already owner-shaped; this project supplies the owners and retires that plan's Stage C ownership question.
- Entity refs (`corp_…`, `alliance_…`), the `shared/crypto/entityid` cipher, and the boundaries that convert refs to ids → [entity-id-encryption/plan.md](../entity-id-encryption/plan.md). Corporation and alliance planner ids **are** those refs; this project consumes them and mints none.
- Websocket hosted tenants and placement → [changestream-tenant-scale/contents.md](../changestream-tenant-scale/contents.md). This project adds owner kinds to routing keys that already exist.
- Collection rename mechanics → [collection-naming/contents.md](../collection-naming/contents.md). This project declares renames; that project owns how a rename is applied.
- How a document write is shaped — whole-document versus field-scoped, and whether two writers editing different fields both keep their edit → [document-write-granularity/contents.md](../document-write-granularity/contents.md). Found here at Stage G and split out because it has no planner premise: it changes how the whole application writes. **That project depends on Stage G's decisions and lists them as assumptions; when Stage G moves, update it in the same pass.**
- How **broad** the document lock is — the group lease standing in for every job in it, the all-or-nothing batch refusal, and whether the lock becomes advisory → [document-write-granularity/contents.md](../document-write-granularity/contents.md) § Stage D. This project owns making the lock *work* between two members (Stage H); that project owns whether it needs to be that wide, which has no planner premise and rests on the version check landing first.
- Live SPA and backend behaviour → [frontend/contents.md](../../frontend/contents.md), [backend/contents.md](../../backend/contents.md), promoted only when this project closes.

## Task map

| I need to… | Read |
|------------|------|
| Understand the goal and why this is one primitive rather than four scopes | [plan.md](./plan.md) § Goal, § One planner, four membership providers |
| See what already exists and what has to be built | [plan.md](./plan.md) § Starting position |
| Know what identifies a planner and why the ids were chosen that way | [plan.md](./plan.md) § The owner key is the identity |
| Understand how a stranger with a link or an id is kept out | [plan.md](./plan.md) § Identity is not a credential |
| Attach a permission model to planners later | [plan.md](./plan.md) § Permissions are separate work, and must be pluggable |
| Understand how in-game access lists differ from corp membership | [plan.md](./plan.md) § Access lists differ from the other ESI providers |
| See how someone gets into a planner | [plan.md](./plan.md) § Every planner is private |
| Know what happens the moment a member is removed | [plan.md](./plan.md) § Losing access |
| See what a browser subscribes to, and what switches when a planner does | [plan.md](./plan.md) § What a connection subscribes to |
| Understand why a client no longer requests its own scopes | [plan.md](./plan.md) § Why the client no longer asks for scopes |
| Find what each surface owes — documents, routing, API, SPA | [plan.md](./plan.md) § What each surface owes |
| See which collections exist and which family a document belongs to | [plan.md](./plan.md) § Collection layout |
| Know whether one collection per type will scale | [plan.md](./plan.md) § Collection size |
| Add a feature that only some planners have | [plan.md](./plan.md) § Features differ; nothing branches on kind |
| Know which settings the planner owns and which stay personal | [plan.md](./plan.md) § Settings split between the planner and the account |
| Understand why recalculation must keep a job's structure and character | [plan.md](./plan.md) § Recalculation must preserve a job's own build context |
| See how the close cascade is gated, and where a refusal goes | [plan.md](./plan.md) § The persist gate is narrower than the cascade, and the server is what closes the gap |
| Know how a job's owner is decided | [plan.md](./plan.md) § Ownership is decided at creation |
| Know which schema versions change and what each upgrade step does | [plan.md](./plan.md) § Schema versioning |
| See the document shapes and why each field exists | [plan.md](./plan.md) § Data models |
| See the stages and their order | [plan.md](./plan.md) §§ Stage A – Stage F |
| Pick up the planner and membership work slice by slice | [plan.md](./plan.md) § Stage C §§ C1–C4 |
| Pick up what a second member breaks, slice by slice | [plan.md](./plan.md) § Stage D §§ D1–D3 |
| Know how the live data migration runs | [plan.md](./plan.md) § Live data, and the cutover window |
| Know where the grants list is filled from, and when that changes | [plan.md](./plan.md) § Grants, § Stage B |
| Find the planner types that exist but are wired to nothing | [plan.md](./plan.md) § Data models |
| Check what is additive and what breaks | [plan.md](./plan.md) § Wire compatibility |
| See what other projects must change before they close | [plan.md](./plan.md) § What the other projects owe |
| Check what has landed | [plan.md](./plan.md) § Stage status |
| Understand why the realtime cursor and baseline sync do not survive a second writer | [plan.md](./plan.md) § Stage G |
| Find what the retired websocket-realtime project left behind | [plan.md](./plan.md) § Stage G — Absorbed from the retired websocket-realtime project |
| Understand why two members take two different locks on one job | [plan.md](./plan.md) § Stage H |
| Know what happens to same-account force-release once the lock is planner-wide | [plan.md](./plan.md) § Stage H |
| Decide where the websocket's grant ceiling is read from | [plan.md](./plan.md) § Stage I |
| Know how a document states its owner today | [overlay.md](./overlay.md) § Stage A — The owner block cutover |
| Know what the pricing-defaults backfill will actually find | [measurements/pricing-defaults-backfill.md](./measurements/pricing-defaults-backfill.md) |
| See how a part works while the project is in flight | [overlay.md](./overlay.md) |
