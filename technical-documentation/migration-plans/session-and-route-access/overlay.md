# Session and route access — behaviour overlay

**Overlay SoT while this project is active.** Start from live documentation
([frontend/auth/spa.md](../../frontend/auth/spa.md) § Route guards and § Signing in,
[frontend/navigation/spa.md](../../frontend/navigation/spa.md)), lay this file on top, and where the
two overlap this file wins for the in-flight work. Where this file is silent, live docs are the truth.

Live documentation's § Route guards is superseded in full by § Guarding a route below. The two
defects recorded at [plan.md](./plan.md) § What promote has to fix are still outstanding.

## What a route declares

*Stage 1 — landed.*

Every route states its own audience in `staticData`, beside the component it describes:

```js
export const Route = createFileRoute("/group/$groupID")({
  staticData: { audience: "public" },
  component: GroupFrame,
});
```

`public` is usable signed out and rebuilds a stored session before rendering; `private` needs a
signed-in reader; `transient` — `/auth` and `/signout` — is never guarded and never a place a reader
is returned to. `resumeSession: false` is the one modifier, carried only by `/`, so the landing page
stays readable to a signed-in reader.

`utils/routeAccess.js` reads the declarations. It walks the generated route tree **on first use, not
at import**: the tree imports the route files and a route reaches back to it, so a module-scope read
finds the tree in its dead zone. It answers what a route declares and which route a path belongs to,
matching a literal ahead of a param so `/group/new` is itself rather than a group id.

A route that declares nothing is treated as private, and `routeAccess.test.js` fails if any route in
the generated tree declares nothing — so forgetting the field is caught rather than silently opening
a page.

`getRedirectPathAfterAuth` now reads that same walk instead of owning a second one. Its rule is
unchanged until Stage 4.

## How login progress is tracked

*Stage 2 — landed.*

`Functions/Auth/loginProgress.js` holds how far the current login has got — the completed steps, the
current step, an error, and the characters reported so far — outside React, written by the
`loginStepComplete` / `loginError` / `loginComplete` / `userDataUpdate` events that already existed.

It lives outside React because the bootstrap calls emit as soon as a login starts, which is before
anything displaying progress has mounted and before a guard could have subscribed. `useLoginState` is
now a reader of it through `useSyncExternalStore`, with the same shape its two callers already used,
so steps that report early are counted rather than lost.

`startLogin()` clears what the last login reached and arms a fresh `whenLoginComplete()`. It is
called when a reader arrives at `/auth`, and by the resume — a login beginning is the fact it
records, and starting again is how a retry after a failed login gets a clean slate. `isLoginRunning()`
reports the fact directly rather than inferring it from what has completed, because the first step is
a network round trip away from the start.

## Guarding a route

*Stage 3 — landed. Supersedes live § Route guards.*

There is one guard: the root route's `beforeLoad`, which sees the whole matched chain and each
match's `staticData`. It runs three things in order for every navigation:

1. **First login** — an account whose guided flow is incomplete goes to `/first-login`.
2. **Resume** — for a route that is not `transient` and has not opted out, a reader who is not signed
   in has a stored session rebuilt **in place**, awaited to completion.
3. **Require** — a reader with no session redirects to `/auth`, carrying `location.href` — the
   whole location, search and hash included. Two things trigger it: a `private` route, and a
   **resume that was attempted and failed**, whatever the route's audience.

That second trigger is why the resume reports which of three things happened rather than a plain
success flag. Rendering a public page signed out after a failed resume hides the loss: the reader
still believes they have a session, and their jobs are simply absent from a page that looks
finished. A reader who never had a session is the opposite case — nothing was lost, and the public
pages are built for them — so `"failed"` and `"no-session"` cannot be the same answer.

| `resumeStoredSession` returns | When | The guard |
|---|---|---|
| `"rebuilt"` | the login ran and its steps completed | renders |
| `"failed"` | credentials were there and the rebuild did not finish | `/auth`, any audience |
| `"no-session"` | this browser holds nothing to rebuild from | public renders signed out; private goes to `/auth` |

A reader the server wants signed in again never reaches that table: the reauth demand below has
already sent the tab to EVE.

`utils/authGuard.js` is gone, with `requireAuth` and `allowPublicAccess` and their seven call sites.
`_protected.jsx` is a layout that renders an `Outlet` and nothing else; the first-login check it
duplicated already lived on the root.

**A resume no longer navigates.** `Functions/Auth/resumeStoredSession.js` picks the mode — a stored
ESI refresh means `eveClientRefresh`, its absence means a cloud account resuming from the tab and
cookie — runs the login, and then waits on `whenLoginComplete()` rather than on `runAppLogin`, which
returns while the job and group data is still arriving. A terminal credential sends the tab to EVE,
because nothing a caller could do with it would help. `/auth` calls the same function rather than
holding its own copy of the mode choice.

**The theme moved above the router.** The root guard doing asynchronous work means the root match
pends, and the router renders a pending screen before the root route's component — and `App` is that
component, so a theme provided inside it did not exist yet. The whole UI flashed in light mode on
every start. `ThemeProvider` and `CssBaseline` now sit in `AppWrapper` above `RouterProvider`, which
is where they belong anyway: the theme is the reader's, not a route's.

`AppWrapper.test.jsx` mounts the wrapper and asks the pending screen which theme it can see, which is
the one thing that tells a theme above the router from a theme inside it: moving the provider back
into `App` makes it answer "light".

**What the reader looks at while that happens.** `Components/routePending.jsx` is the router's
pending component: login progress while a login is running, the route splash otherwise. Once a wait
is a login it stays one until the wait ends — the router's hold is over the screen, not over what is
inside it, so swapping to the splash the moment the last step landed took the steps off the reader
mid-read and made the hold look as though it had been ignored. The existing
pending timings are unchanged, so a fast resume shows nothing at all. The consequence is that
refreshing a deep URL keeps it — `/editjob/abc?activeGroup=g1&pageView=outputs` is never left, so its
param and both search values survive without anything capturing or restoring them.

**A step that fails holds the guard, so the reader can re-run it.** The guard waits on every login
step landing, and a step that fails reports an error rather than completing — so the wait does not
end and the route stays on the pending screen. That is the right call for the data (a job page drawn
against a half-built store shows wrong figures, not late ones), but it means the screen the reader is
held on has to offer a way forward.

`Functions/Auth/retryLoginStep.js` owns which steps can be re-run and how. The three bootstrap steps
can: their fetches take no arguments, so re-running the one that failed emits its step, resolves the
completion the guard is awaiting, and lets the route through — without re-fetching what the other
steps already have. A failed step's icon in `LoginUI` is the button that does it, which is what the
"Click to retry" tooltip beside it always described.

`CHARACTER_DATA` is deliberately not retryable. `runPostLoginAccountSync` works from the
`user_document` and `linked_characters` of the login response, and nothing outside that response
holds them — so recovering it means signing in again, and its alert keeps the reload.

## When a reader has to sign in again

*Stage 3 — landed.*

One question — must this reader sign in again — reached the SPA in three vocabularies and was
answered in five places, two of which disagreed about what counts. `Functions/Auth/plannerSessionRedirect.js`
now owns it: `reauthDemand(signal)` classifies, `enforceReauthDemand(signal)` acts, and every caller
passes whatever it happens to hold.

The three shapes it reads, all of them now one call:

- **A deadline** the server handed over in an auth response, stored per tab as
  `reauth_required_at`. Read with no signal at all, so a session the server has already timed out
  is a demand in its own right.
- **A terminal code** on a rejected request — `reauth_required` or `session_revoked` — whether the
  caller holds it as a parsed string, an `err.code`, or only inside an error message.
- **An ESI credential classification**, `EsiCredentialError` carrying `reauth_required`.

`reauthDemand` answers whether there is a demand, not which kind: `reauth_required` and
`session_revoked` differ in what the server saw and never in what the SPA does about it.
`enforceReauthDemand` clears the tab session and the client-readable cookies and leaves for EVE SSO,
returning whether it fired — so a caller's remaining work is only about what it must **not** do
next: the private request path still throws its 401, and the rotate path still clears its failure
backoff.

**A demand always means a full EVE sign-in, never `/auth`.** The material a rotate or a resume would
need is exactly what is no longer valid, so there is nothing for the in-app login to do. Callers do
not get to choose — the handler is the only thing that acts on a demand, which is what stops the
request path and the guard answering the same server instruction differently.

**The redirect keeps the reader's place.** `redirectToEveSSO` falls back to
`${pathname}${search}${hash}`, and the returning `state` is checked against the real route table by
`getRedirectPathAfterAuth`, so a reauth demand mid-session comes back to the page it interrupted
rather than to the dashboard.

**`hasResumablePlannerSession` no longer answers this.** It reports only whether this browser holds
credentials; it used to fold the deadline in and return `false`, which made a timed-out session
indistinguishable from a browser that never had one. Keeping the two apart is what lets the guard
tell those cases apart — see the table above.

## What a page needs beyond a session

*Stage 4 — landed.*

A finished login is not the same as a page being able to draw. Its steps load the jobs that sit **on
the planner**, and a job inside a group is not one of them until it is marked ready for sale — so a
deep link to a grouped job used to arrive with every step complete and no job to show.

A route whose page cannot draw without something states it in a `loader`. The router runs one after
`beforeLoad`, so the session is already up and the fetch is authenticated, and holds the same pending
state — login progress, or the splash — until it resolves. The page renders with its data present.

- `/editjob/$jobID` ensures its job: from the store, else fetched by id, else `notFound()`. A URL
  carrying `activeGroup` asks for a second thing — the page reads that group's other jobs — so the
  loader loads the group's members too, through `loaderDeps` exposing the search to it. A group that
  has gone does not refuse the page: the URL names the job.
- `/group/$groupID` ensures the group exists and its members are loaded.

Both go through `Functions/Groups/ensureGroupJobs.js`, so opening a group and opening a job inside
one load the same thing. Archived members are left alone — they have no job document until they are
restored, and `Group`'s `liveMemberIDs` getter is the one place that says which members those are.

`useEditJobInitialState` no longer looks the job up and redirects to `/jobplanner` when it is absent,
and `groupFrame` no longer fetches its members in an effect — both now read what the loader
guaranteed. `Functions/Helper/getMissingJobObjects.js` went with the latter, its last caller.

**The route also says which group the reader is working in.** `activeGroupID` decides where a new
job is filed, which buttons a job in a group offers, and whether the edit page takes a group lock —
and it used to be set only by visiting the group page, and cleared only by closing, archiving or
deleting a group. Leaving a group by the side menu therefore left it set, and a job added on the
planner was filed into the group the reader had walked away from. Refreshing a job opened inside a
group had the opposite fault: the URL said the group, the store did not, so the page offered the
wrong buttons and took no group lock.

`Functions/Groups/activeGroupForRoute.js` reads it from the route — the group page's own param, a
job's `activeGroup`, and nothing anywhere else — and the root guard puts the store in step on every
navigation. A preload is skipped: hovering a link is not arriving at it, and the group must not
change under a reader who passed over something. `groupFrame` no longer sets it on its way through.

**A URL naming something that is not there now says so**, and says the right thing to the reader in
front of it. `Components/routeNotFound.jsx` is the router's `defaultNotFoundComponent`. A signed-in
reader is told the link may be stale or the thing deleted. A reader with no account is told their
work is kept only while they are here — because it never left the browser, so a reload is the usual
reason they are on this page, and "deleted" would be untrue.

**A reader with no account keeps the planner.** Every public route renders for them, and with no
stored session the resume returns at once, so nothing holds a page up waiting for a login they are
not doing. Jobs and groups they build live in the store without being sent anywhere, so opening one
needs no fetch and the loaders do not refuse it.

**Preloading now reaches the network.** A loader runs on intent preload as well as navigation, so
hovering a job card fetches that job. `defaultPreloadStaleTime` is set to 30 seconds so that hovering
along a list does not refetch the same rows per card.

## How this is tested

*Landed alongside Stage 4.*

One harness, [`frontend/src/tests/routerHarness.jsx`](../../../frontend/src/tests/routerHarness.jsx),
and every routing test goes through it. It builds a router over the app's **real** route tree, which
is the point: a test used to invent a tree of its own, so a link could name a route the app does not
have and still pass, and a guard could be called with a context no router would produce.

| Use | Call | What it covers |
|---|---|---|
| A component holding links or navigating | `renderWithRouter(ui)` | `to` resolves against the real tree; the returned router says where a click went |
| A route being entered | `enterRoute(url)` | matching, the root guard, the route's loader — and where the reader ends up |
| The screen a reader is left looking at | `renderRoute(url)` | the app's own router options, rendered: its pending screen, its not-found page |

`enterRoute` renders nothing, so no page component is pulled in. What it covers is the routing layer
itself: `routes.e2e.test.js` walks the app to a URL and asks where a reader arrived, whether the
match is a not-found, what was fetched, and which group the store now holds. The three test files
that called `beforeLoad` and `loader` by hand are gone, folded into it.

`renderRoute` does render, under `appRouterOptions` — the same object the app's own router is built
from, held apart from the instance for exactly this. A test using it mocks `src/App` with an
`Outlet`, since the root route's component reaches for websockets and queries that have nothing to do
with which screen the router chose. `routeScreens.e2e.test.jsx` covers that choice.

**The whole way in is covered end to end.** `loginJourney.e2e.test.js` opens a deep link to a job
inside a group as a signed-out reader holding a stored session, and stands in only for the edges —
the network the login talks to, and the browser storage saying a session can be rebuilt. The guard,
the resume, the login's own step reporting and both route loaders are the real ones. It asserts the
reader is signed in once, that all four login steps completed before either loader ran, that the job
and then the group's other jobs were fetched, that the search the link carried survived, and that the
router settled on the job.

A route's page is a lazy chunk that jsdom does not resolve, so a rendering test reaches the route's
pending screen rather than the page itself. That is the ceiling, and `routeScreens.e2e.test.jsx` says
so rather than implying more.

Three mutations confirm the harness bites where the superseded tests could not: declaring a private
route `public` fails the walk to it, pointing a link at a route the app does not have fails the
component test that renders it, and removing `defaultNotFoundComponent` fails the screen tests.

**The reauth handler is tested at the classifier**, in `plannerSessionRedirect.test.js`: each of the
three vocabularies is pinned to the outcome it produces, and so is the case that matters most —
a recoverable failure (`session_missing`, a recoverable `EsiCredentialError`, a bare network error)
must classify as no demand, because treating one as terminal would send a reader to EVE for
something the next request would have fixed. `routes.e2e.test.js` covers the guard side: a failed
resume reaches `/auth` from a public route carrying the page it left, and a reader with no session
at all still gets the public page.

## Signing in and coming back

*Stage 5 — landed.*

A resume never leaves the page, so nothing has to be carried. A **fresh sign-in does** — the browser
navigates to EVE and the URL is gone — and what comes back is the callback URL, so `state` is the
only thing that survives. It carries where the reader was headed.

What changed is not where that value lives but that it is now **checked rather than trusted**.
`getRedirectPathAfterAuth` is three tests: the value must start with a single `/` — `//evil` is
protocol-relative and leaves the site while reading as a path — it must match a route the app has,
and it must not be `transient`, because `/auth` and `/signout` are passed through rather than
returned to. Anything else lands on the default, which is all a damaged `state` is worth.

That is what retires the earlier failure without storing anything: `state` used to carry `"main"` for
a login, which was kept as the path to return to and navigated to from `/auth`, resolving relatively
onto `/auth/main`. `"main"` is not a route, so it now falls to the default.

The rule that treated any route carrying a param as private is gone with it. A reader sent to sign in
from a shared job or group link comes back to it, and a deep link into a private page is where they
land rather than the dashboard. `storeOriginalPathFromOAuthState` and the `originalPath` key in
`localStorage` are deleted; signing out no longer has one to clear.

## Who sees which navigation

*Stage 6 — landed.*

The side menu used to wrap its entries in `isLoggedIn &&`, which was a list of which pages need an
account maintained by hand in a second place — and the one nobody would think to update when a route
changed. Each entry now asks the route: `canVisitRoute(path, isLoggedIn)` in `utils/routeAccess.js`
says a public route is open to anyone, a private one needs a signed-in reader, and a path the app has
no route for is nowhere to go.

One `isLoggedIn` gate stays, around the account block at the foot of the menu. That block holds Sign
Out, which is an action rather than a page to be let into, so gating the section is a layout decision
rather than a second opinion about route access.

With that, every consumer of a route's audience reads the same declaration: the guard, the post-login
landing, and the menu.
