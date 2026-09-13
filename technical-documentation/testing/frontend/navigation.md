# Navigation and routing — tests

Live SoT for test depth across the SPA's route declarations, the root guard, route loaders, and the
screens a reader is left looking at. Behaviour → [frontend/navigation/spa.md](../../frontend/navigation/spa.md).
Module entrypoints → [contents.md](./contents.md).

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Whole suite | From `frontend/`: `npm test -- --run` | Vitest; no browser, no stack |
| Route declarations | `npx vitest run src/utils/routeAccess.test.js` | The fail-closed sweep over the generated tree |
| Routing end to end | `npx vitest run src/routes` | Guard, loaders, screens, the full login-and-deep-link journey |
| Coverage | `npm run coverage` | `vitest run --coverage` |

One harness, [`frontend/src/tests/routerHarness.jsx`](../../../frontend/src/tests/routerHarness.jsx),
backs every routing test. It builds a router over the app's **real** route tree rather than one
invented for the test, so a link naming a route the app does not have, or a guard called with a
context no router would produce, fails there instead of passing silently.

| Use | Call | What it covers |
|-----|------|-----------------|
| A component holding links or navigating | `renderWithRouter(ui)` | `to` resolves against the real tree; the returned router says where a click went |
| A route being entered | `enterRoute(url)` | matching, the root guard, the route's loader — and where the reader ends up |
| The screen a reader is left looking at | `renderRoute(url)` | the app's own router options, rendered: its pending screen, its not-found page |

## Coverage map

**Depth:** Strong on the audience declarations, the root guard's three steps, both route loaders, and
the pending and not-found screens. The whole path from a stored session through a deep link is covered
end to end. No browser-level end-to-end exists.

### Tested

| Area | What the tests cover |
|------|----------------------|
| `utils/routeAccess.js` | Every declared audience read correctly; a route declaring nothing fails the sweep; a literal segment (`/group/new`) matched ahead of a param; `canVisitRoute` for each audience and for a path with no route |
| `routes/routes.e2e.test.js` | Walks the app to a URL through the real guard and loaders and asserts where the reader arrived, whether the match is a not-found, what was fetched, and which group the store holds afterwards. Covers a failed resume reaching `/auth` from a public route carrying the page it left, and a reader with no session at all still getting the public page |
| `routes/routeScreens.e2e.test.jsx` | Which screen a reader is left looking at, rendered under the app's own router options with `src/App` mocked to an `Outlet` (the root route's own component reaches for websockets and queries unrelated to routing) |
| `routes/loginJourney.e2e.test.js` | End to end: a signed-out reader holding a stored session opens a deep link to a job inside a group. Only the network the login talks to and the browser storage saying a session can be rebuilt are stood in for; the guard, the resume, the login's own step reporting and both route loaders are the real ones. Asserts one sign-in, all four login steps completing before either loader runs, the job and then the group's other jobs fetched, the search the link carried surviving, and the router settling on the job |
| `Functions/Auth/plannerSessionRedirect.test.js` | Each of the three reauth vocabularies pinned to the outcome it produces, and that a recoverable failure (`session_missing`, a recoverable `EsiCredentialError`, a bare network error) classifies as no demand rather than a terminal one |

Three mutations pin the harness against the failure modes the route tree invented for a test could
not catch: declaring a private route `public` fails the walk to it, pointing a link at a route the app
does not have fails the component test that renders it, and removing `defaultNotFoundComponent` fails
the screen tests.

### Thin

- `routeScreens.e2e.test.jsx` reaches a route's pending screen rather than the page itself, because a
  route's page is a lazy chunk jsdom does not resolve. That is the ceiling for a rendered screen test,
  not a gap — the page components themselves are covered where they live.

### Little / none

- Browser-level end to end: there is no Playwright or equivalent, so nothing drives a real click
  through EVE's own SSO pages and back.

## Topic-only detail

- Depth labels → [contents.md](./contents.md) § Depth labels.
- `routes.e2e.test.js` calls neither `beforeLoad` nor a `loader` directly — a route entered through
  `enterRoute` runs the same guard and loader the router itself would run, against the app's real
  route tree.
- `enterRoute` renders nothing, so no page component is pulled in; it covers the routing layer alone.
