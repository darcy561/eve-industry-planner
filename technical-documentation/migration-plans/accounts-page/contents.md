# Accounts page

## Owns

The Accounts page as the place an account is managed from — its layout, the sections
on it, and the two surfaces it grows.

- **The page on the app-shell design**, and the retirement of the `appearance`
  fork that made one component render two unrelated layouts.
- **The linked-character section**: how a character is presented, and the action
  slot each one carries for operations on that character's ESI credentials.
- **Per-collection ESI data status**: what the page shows about each collection a
  character holds — whether it is present, how old it is, and why it is missing —
  and the shape the data behind it has to arrive in.
- **The shared-planner section**: what an account can see about the planners it
  reaches, and the management surface that section is drawn to receive.
- Which of the above is **drawn but not wired**, so a later reader can tell a
  designed-ahead control from a broken one.

## Does not own

- **The app-shell design itself** →
  [frontend/components/contents.md](../../frontend/components/contents.md). What a
  panel, a card or a chosen state looks like is settled there; this project builds
  the page out of those pieces and adds an atom only where a second screen needs one.
- **Converting other screens** onto the shared surface. This one converts the
  Accounts page because it is redesigning it; the Settings tabs, the first-login
  page shell and everything else convert when the design reaches them.
- **Planners, membership, invites and the owner block** →
  [shared-planners/plan.md](../shared-planners/plan.md). That project owns what a
  planner *is*, who is in one and what grants access. This project owns only how
  an account sees them on this page, and it consumes the planners listing rather
  than adding to it.
- **The ESI prefetch itself** — the collection table, its phases, the rate-limit
  budget and the scheduler. This project owns what is *displayed* about a
  collection's state; it does not change how one is fetched.
- **Token refresh and cache invalidation mechanics.** The action slot calls what
  already exists; where an action has nothing behind it, this project records the
  gap rather than building the mechanism.
- **Live SPA behaviour** → [frontend/contents.md](../../frontend/contents.md),
  promoted only when this project closes.

## Task map

| I need to… | Read |
|------------|------|
| Understand what is wrong with the page today and why a redesign rather than a conversion | [plan.md](./plan.md) § Why this is its own project |
| See what the page is made of now, and what each piece carries of its own | [plan.md](./plan.md) § Starting position |
| Know which shared atoms this project uses and which it added | [plan.md](./plan.md) § What this project takes from the component layer |
| See the page's layout and the sections on it | [plan.md](./plan.md) § The page |
| Understand how a linked character is presented | [plan.md](./plan.md) § The character row |
| Add an action to a character's menu | [plan.md](./plan.md) § The action slot |
| Know what the ESI status section shows and what it needs behind it | [plan.md](./plan.md) § ESI data status |
| Find what the status section needs that does not exist yet | [plan.md](./plan.md) § What the status section is waiting on |
| See what the shared-planner section shows today | [plan.md](./plan.md) § Shared planner access |
| Tell a designed-ahead control from a wired one | [plan.md](./plan.md) § Drawn, not wired |
| See the stages and their order | [plan.md](./plan.md) §§ Stage A – Stage E |
| Check what has landed | [plan.md](./plan.md) § Stage status |
| Know how a part of the page works while the project is in flight | [overlay.md](./overlay.md) |
