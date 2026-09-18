# Frontend — Accounts page

## Owns (SoT)

The Accounts page — `/_protected/accounts`,
[`Components/Accounts`](../../../frontend/src/Components/Accounts) — as the place an account is
managed from: its layout and sections, the linked-character roster and what a reader can do to a
character from it, the corporations section, and how an account sees the planners it can work in.

## Does not own

- The app-shell atoms the page is built from — `SectionPanel`, `EntityRow`, `ActionMenu`, the card
  and figure atoms → [frontend/components/contents.md](../components/contents.md)
- Login, tokens, sessions, acquiring an ESI access token, and credential health →
  [frontend/auth/spa.md](../auth/spa.md)
- What login prefetches, and what the application holds of a collection for a character or
  corporation → [frontend/esi-collections/prefetch.md](../esi-collections/prefetch.md)
- What a planner *is*, who is in one and what grants access, and the server-side invite and
  membership mechanics — this page consumes the planners listing and shows what it can, and does not
  itself own the planner model
- Test depth → [../../testing/frontend/contents.md](../../testing/frontend/contents.md)

## Task map

| I need to… | Read |
|------------|------|
| See the page's layout and its sections | [page.md](./page.md) |
| Change the account band, token storage, or the community citadel names section | [page.md](./page.md) |
| Change how a linked character is presented, or add an action to its menu | [characters.md](./characters.md) |
| Change what the credential-health chip shows, or how a character is linked again | [characters.md](./characters.md) § Credentials and the action menu |
| Change what the per-collection ESI status list shows | [characters.md](./characters.md) § ESI data status |
| Change the corporations section | [page.md](./page.md) § Corporations |
| Change what the shared-planner section shows, or its drawn-but-inert controls | [planners.md](./planners.md) |
