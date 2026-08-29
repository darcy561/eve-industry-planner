# Technical rules (frontend)

Applies to the SPA / frontend tree. On overlap with the project master [`../technical-rules.md`](../technical-rules.md), **this file wins**; otherwise the master applies.

## What already applies (from the master)

From root **Engineering practices — shared** (not Go-only):

- **One SoT** for shared facts — gather/build in the SPA from the owning SoT; no parallel hard-coded lists (public env knobs, product strings, theme tokens, etc.).
- **Modern platform idioms** — current React / JavaScript practices as used in-repo; prefer newer patterns over legacy ones when both work; explain options + pros/cons when choosing.
- Reusable helpers/modules; no legacy wrappers after a refactor; no one-file-per-folder sprawl.
- Dependencies kept current as we touch an area; check freshness/deprecation before new packages.
- Testing as we build; no secrets in client bundles or logs; API/wire compat flagged in planning.

## React 19 idioms

The SPA runs **React 19**. It was built across 18 and 19, so both generations of idiom are still
present. New and edited code uses the React 19 way; React 18 patterns are migrated **as files are
touched** rather than in a separate sweep, so the tree converges without a large untested change.

When editing a component, prefer the 19 idiom over its 18 equivalent, and modernise the surrounding
patterns in the file you are already working in. Do not open a project-wide migration unless asked
for one.

| Prefer | Over |
|--------|------|
| `ref` as an ordinary prop, and ref cleanup functions | `forwardRef` wrappers |
| `use()` for reading a promise or context in render | a `useEffect` that sets state from a promise |
| `useActionState` / `useOptimistic` / `<form action>` | hand-rolled pending, error and rollback state |
| `useDeferredValue` and `useTransition` for expensive updates | debounce timers guarding a render |
| Document metadata rendered directly in a component | side-effect writes to `document.title` and friends |
| Context read with `use()`, and `<Context>` as the provider | `useContext()` and `<Context.Provider>` |
| The compiler-friendly shape: derive during render | `useEffect` that only mirrors props into state |

**`useEffect` is the pattern most worth questioning.** Most of its uses in this tree predate the
alternatives: an effect that only derives a value from props or state should compute during render,
and one that only fetches should belong to React Query, which the SPA already uses everywhere.
Effects are for synchronising with something outside React — a subscription, a websocket, an
observer, a timer.

**Do not rewrite working code for its own sake.** The rule applies to code being written or edited
for another reason. A 19 idiom that would change behaviour, or that no test covers, is worth
flagging before taking it.

## Frontend-specific bar (TBD)

Design-system / visual / SPA-only conventions (component libraries, routing, styling) will be written
here when we have them. Until then, follow the shared master — do not invent a second undocumented
global frontend standard.
