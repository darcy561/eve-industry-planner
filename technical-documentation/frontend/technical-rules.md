# Technical rules (frontend)

Applies to the SPA / frontend tree. On overlap with the project master [`../technical-rules.md`](../technical-rules.md), **this file wins**; otherwise the master applies.

## What already applies (from the master)

From root **Engineering practices — shared** (not Go-only):

- **One SoT** for shared facts — gather/build in the SPA from the owning SoT; no parallel hard-coded lists (public env knobs, product strings, theme tokens, etc.).
- **Modern platform idioms** — current React / JavaScript practices as used in-repo; prefer newer patterns over legacy ones when both work; explain options + pros/cons when choosing.
- Reusable helpers/modules; no legacy wrappers after a refactor; no one-file-per-folder sprawl.
- Dependencies kept current as we touch an area; check freshness/deprecation before new packages.
- Testing as we build; no secrets in client bundles or logs; API/wire compat flagged in planning.

## Frontend-specific bar (TBD)

Design-system / visual / SPA-only conventions (component libraries, routing, state, styling) will be written here when we have them. Until then, follow the shared master — do not invent a second undocumented global frontend standard.
