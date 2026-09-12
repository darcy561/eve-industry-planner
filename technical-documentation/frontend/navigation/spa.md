# SPA navigation

Routing, page chrome, what a route needs before it renders, and what happens on screen between one
page and the next. Session and credential mechanics → [frontend/auth/spa.md](../auth/spa.md).

## What a route declares

Every route states its own audience in `staticData`, beside the component it describes:

```js
export const Route = createFileRoute("/group/$groupID")({
  staticData: { audience: "public" },
  component: GroupFrame,
});
```

| `audience` | Signed out | Stored session | A landing place? |
|---|---|---|---|
| `public` | renders | resumed before the route renders | yes |
| `private` | sent to sign in | resumed before the route renders | yes |
| `transient` | renders | never resumed | never |

`resumeSession: false` is the one modifier, carried only by `/`, so the landing page stays readable to
a signed-in reader — a session does not resume there, and it is not somewhere a reader is returned to
after signing in.

`utils/routeAccess.js` reads the declarations. It walks the generated route tree **on first use, not
at import** — the tree imports the route files and a route reaches back to it, so a module-scope read
would find the tree in its dead zone. It answers what a route declares and which route a given path
belongs to, matching a literal ahead of a param so `/group/new` is itself rather than a group id.

**A route with no declaration is treated as private.** A test over the generated route tree fails if
any route declares nothing, so forgetting the field is caught rather than silently opening a page.

## One router, configured once

`appRouter` is the single `createRouter` instance, shared by `RouterProvider` and the Sentry
TanStack integration. Route-loading behaviour is set there rather than per route, so every page
loads the same way:

| Option | Value | What it does |
|--------|-------|--------------|
| `defaultPreload` | `"intent"` | Downloads a route's chunk, and runs its loader, on hover or focus |
| `defaultPreloadStaleTime` | 30s | A loader's result stays fresh across repeated hovers, so scanning a list of job cards does not refetch the same row per card |
| `defaultPendingComponent` | `Components/routePending.jsx` | Login progress while a login is running, the branded route splash otherwise |
| `defaultPendingMs` | 150 | Delay before the pending component appears |
| `defaultPendingMinMs` | 300 | Minimum time it stays once shown |
| `defaultNotFoundComponent` | `Components/routeNotFound.jsx` | Shown when a loader's `notFound()` or an unmatched path is reached |

Routes are lazy chunks (`lazyRouteComponent`). Without preloading, a chunk's download starts on
click, and the router — which wraps navigation in a React transition — holds the current page on
screen, unresponsive, until it lands. Preloading on intent means the chunk, and anything its loader
needs, is usually present before the click. The pending timings cover the case where it is not: a
navigation still loading after 150 ms shows the pending component, and having shown it, holds it long
enough to read.

Route files declare `staticData`, `component`, `loader` and `validateSearch` as needed. They do not
carry their own `Suspense` boundary; the router creates one per match from `defaultPendingComponent`.

`ThemeProvider` and `CssBaseline` sit in `AppWrapper`, above `RouterProvider` — the theme is the
reader's, not a route's, and the root route's own `beforeLoad` can pend before `App` (the root route's
component) ever mounts.

## One guard

The root route's `beforeLoad` sees the whole matched chain and every match's `staticData`, and runs
three things in order for every navigation:

1. **First login** — an account whose guided flow is incomplete goes to `/first-login`.
2. **Resume** — for a route that is not `transient` and has not opted out with
   `resumeSession: false`, a reader who is not signed in has a stored session rebuilt **in place**,
   awaited to completion. See [frontend/auth/spa.md](../auth/spa.md) § Signing in for what the resume
   actually runs.
3. **Require** — a reader with no session is redirected to `/auth`, carrying `location.href` — the
   whole location, search and hash included. Two things trigger it: a `private` route, and a
   **resume that was attempted and failed**, whatever the route's audience.

That second trigger is why the resume reports which of three things happened rather than a plain
success flag:

| The resume returns | When | The guard |
|---|---|---|
| `"rebuilt"` | the login ran and its steps completed | renders |
| `"failed"` | credentials were there and the rebuild did not finish | `/auth`, whatever the audience |
| `"no-session"` | this browser holds nothing to rebuild from | public renders signed out; private goes to `/auth` |

Rendering a public page signed out after a failed resume would hide the loss — the reader still
believes they have a session, and their jobs are simply absent from a page that looks finished. A
reader who never had a session is the opposite case, and the public pages are built for them, so
`"failed"` and `"no-session"` are never folded into one answer.

A reader the server wants signed in again never reaches that table at all: a reauth demand
([frontend/auth/spa.md](../auth/spa.md) § When a reader has to sign in again) has already sent the tab
to EVE before the guard's resume would run.

The pathless `_protected` layout renders only an `Outlet`; there is nothing left for it to guard.

**A step that fails holds the guard, so the reader can re-run it.** The guard waits on every login
step landing, and a step that fails reports an error rather than completing, so the wait does not end
and the route stays on the pending screen — the right call for the data, since a job page drawn
against a half-built store shows wrong figures rather than late ones. The pending screen is what
offers the way forward: see [frontend/auth/spa.md](../auth/spa.md) § Login progress for which steps
can be retried and how.

**The root guard also keeps the active group in step.** `activeGroupID` decides where a new job is
filed, which buttons a grouped job offers, and whether the edit page takes a group lock.
`Functions/Groups/activeGroupForRoute.js` reads it from the route — the group page's own param, a
job's `activeGroup` search value, and nothing else — and the guard applies it on every navigation but
skips a preload: hovering a link is not arriving at it, and the group must not change under a reader
who only passed over something.

## What a page needs beyond a session

A finished login is not the same as a page being able to draw. The login's steps load the jobs that
sit on the planner; a job inside a group is not one of them until it is marked ready for sale, and a
group's member jobs are fetched only once the group is opened. A route whose page cannot draw without
something states it in a `loader`. The router runs a loader after `beforeLoad` — so the session is
already up and the fetch is authenticated — and holds the same pending component until it resolves.

- `/editjob/$jobID` ensures its job: from the store, else fetched by id, else `notFound()`. A URL
  carrying `activeGroup` asks for a second thing — the page reads that group's other jobs — so the
  loader loads the group's members too, through `loaderDeps` exposing the search to it. A group that
  no longer exists does not refuse the page: the URL names the job.
- `/group/$groupID` ensures the group exists and its members are loaded.

Both go through `Functions/Groups/ensureGroupJobs.js`, so opening a group and opening a job inside one
load the same thing. Archived members are left alone — they have no job document until they are
restored, and `Group`'s `liveMemberIDs` getter is the one place that says which members those are.

A URL naming something that is not there renders `Components/routeNotFound.jsx`, the router's
`defaultNotFoundComponent`. A signed-in reader is told the link may be stale or the thing deleted. A
reader with no account is told their work is kept only while they are here — because it never left the
browser, so a reload is the usual reason they are on this page, and "deleted" would be untrue.

A reader with no account keeps the planner: every public route renders for them, and with no stored
session the resume returns at once, so nothing holds a page up waiting for a login they are not doing.

## Page chrome is mounted once

`DefaultPageLayout` — header, content row, footer — is rendered once in `App`, wrapping the
`Outlet`. Page components render their content only.

The header holds state (the side-menu open flag), so a layout rendered per page would tear that
state down on every navigation and flash the chrome. Mounting it above the outlet means only the
page content changes.

The content row is `flexDirection: "row"`: pages place a side drawer beside their main content and
depend on it. Anything wrapping the outlet has to preserve that direction.

Two views deliberately render outside the layout, taking the full viewport: the maintenance banner,
and the route pending component when the root match itself is pending.

## Navigating fades the incoming page

`PageTransition` wraps the outlet and fades new content in over
`theme.transitions.duration.enteringScreen`. Only the incoming page is rendered — the outgoing one
unmounts immediately — so a page being left releases its effects and document locks on navigation
rather than being held alive for the length of a fade.

`usePageKey` supplies the key, and it is the **route pattern** (`/editjob/$jobID`), not the resolved
path. Changing a param — opening a child job from an open one, switching group — updates the page in
place. Keying on the path instead would treat a param change as a page change and remount the route,
re-running setup that the route's own effects already handle from their `jobID` / `groupID`
dependencies.

## Signing in and coming back

A resume never leaves the page, so nothing has to be carried. A **fresh sign-in does** — the browser
navigates to EVE and the URL is gone — and what comes back is the callback URL, so `state` is the only
thing that survives. It carries where the reader was headed: the full location the guard captured,
including search and hash.

That value is **checked rather than trusted**. `getRedirectPathAfterAuth` is three tests over the same
route declarations `utils/routeAccess.js` reads: the value must start with a single `/` — `//evil` is
protocol-relative and leaves the site while reading as a path — it must match a route the app has, and
it must not be `transient`, because `/auth` and `/signout` are passed through rather than returned to.
Anything else lands on the default landing page, which is all a damaged `state` is worth.

A reader sent to sign in from a shared job or group link comes back to it, and a deep link into a
private page is where they land rather than a fixed default — a route carrying a param is not treated
as a special case.

## Who sees which navigation

The side menu asks each route whether a reader may go there: `canVisitRoute(path, isLoggedIn)` in
`utils/routeAccess.js` says a public route is open to anyone, a private one needs a signed-in reader,
and a path the app has no route for is nowhere to go. Every entry reads the same declaration the guard
and the post-login landing do, rather than a second, hand-maintained list.

One `isLoggedIn` gate stays on its own, around the account block at the foot of the menu. That block
holds Sign Out, which is an action rather than a page to be let into, so gating the section is a
layout decision rather than a second opinion about route access.

## Signing out

`/signout` has no component. Its teardown runs in an async `beforeLoad`, which the router awaits
before rendering anything, and which ends by throwing a redirect to `/`. The teardown itself —
ordering, cookies cleared, and the fallback when the server call fails — is
[frontend/auth/spa.md](../auth/spa.md) § Signout.

Because a route carrying a `beforeLoad` counts as pending, signing out uses the same splash timings
as any other navigation — nothing on a fast logout, the branded splash if the server call is slow.

## How this is tested

Test depth for routing and the guard → [testing/frontend/navigation.md](../../testing/frontend/navigation.md).
