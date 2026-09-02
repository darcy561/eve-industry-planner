# Shared planners

## Owns

The planner as a first-class thing a user works in, and the ownership model underneath it.

- The **owner block** (`{kind, id}`) that replaces per-scope fields on stored documents, and the backfill that puts it there.
- The **planner document** and its **membership rows** — invites, join methods, and how a roster is kept current.
- **Membership providers**: how a planner's roster is decided, whether from rows we own (`invite`), from the account itself (`self`), or from ESI (`esi-corporation`, `esi-alliance`).
- The **grants ceiling** as a list of owner keys, and how a removed member loses access.
- The **active planner** on the client, and the owner parameter on every scoped read.
- The rule that a document's owner is **decided when it is created**, never inferred from correlated fields.

## Does not own

- Statistics aggregation, the rebuild queue, the delta path, and the archived-jobs read/restore surfaces → [archived-jobs-stats/plan.md](../archived-jobs-stats/plan.md). Those are already owner-shaped; this project supplies the owners and retires that plan's Stage C ownership question.
- Entity refs (`corp_…`, `alliance_…`), the `shared/crypto/entityid` cipher, and the boundaries that convert refs to ids → [entity-id-encryption/plan.md](../entity-id-encryption/plan.md). Corporation and alliance planner ids **are** those refs; this project consumes them and mints none.
- Websocket transport, session resume, hosted tenants and placement → [websocket-realtime/contents.md](../websocket-realtime/contents.md) and [changestream-tenant-scale/contents.md](../changestream-tenant-scale/contents.md). This project adds owner kinds to routing keys that already exist.
- Collection rename mechanics → [collection-naming/contents.md](../collection-naming/contents.md). This project declares renames; that project owns how a rename is applied.
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
| Find what each surface owes — documents, routing, API, SPA | [plan.md](./plan.md) § What each surface owes |
| See which collections exist and which family a document belongs to | [plan.md](./plan.md) § Collection layout |
| Know whether one collection per type will scale | [plan.md](./plan.md) § Collection size |
| Add a feature that only some planners have | [plan.md](./plan.md) § Features differ; nothing branches on kind |
| Know which settings stay personal and which the planner must own | [plan.md](./plan.md) § Settings stay with the account |
| Understand why recalculation must keep a job's structure and character | [plan.md](./plan.md) § Recalculation must preserve a job's own build context |
| See why document locks do not cover the close cascade | [plan.md](./plan.md) § The persist gate must cover the whole cascade |
| Know how a job's owner is decided | [plan.md](./plan.md) § Ownership is decided at creation |
| Know which schema versions change and what each upgrade step does | [plan.md](./plan.md) § Schema versioning |
| See the document shapes and why each field exists | [plan.md](./plan.md) § Data models |
| See the stages and their order | [plan.md](./plan.md) §§ Stage A – Stage I |
| Migrate live data without a flag day | [plan.md](./plan.md) § Live data, and why this is expand/contract |
| Check what is additive and what breaks | [plan.md](./plan.md) § Wire compatibility |
| See what other projects must change before they close | [plan.md](./plan.md) § What the other projects owe |
| Check what has landed | [plan.md](./plan.md) § Stage status |
| See how a part works while the project is in flight | [overlay.md](./overlay.md) |
