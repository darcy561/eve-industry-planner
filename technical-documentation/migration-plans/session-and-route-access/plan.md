# Session and route access — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md) and
[`../technical-rules.md`](../technical-rules.md) (migration-plans), plus the root masters they defer
to, and — for the surfaces this plan names — [`../../frontend/technical-rules.md`](../../frontend/technical-rules.md)
and [`../../frontend/documentation-rules.md`](../../frontend/documentation-rules.md).
Phase 1 (project folder and docs) before any product work.
No Go surfaces are in scope: every file this plan names is under `frontend/src`, so `go fix -diff`
does not apply.
Live SoT will not be edited until this project is complete and promotion is approved.

## Goal

A route states what it is, and one guard acts on it. Rebuilding a stored session happens where the
reader already is, so refreshing a page keeps the page — including the params and search that say
*which* job, and which group it was opened from.

## Starting position

The counts and call sites are in [measurements/inventory.md](./measurements/inventory.md). Four
findings shape everything below.

**Four places answer an access question, and two of them disagree.** Guards answer "does this need a
signed-in reader" and "should a stored session resume here"; `utils/routeUtils.js` answers "may a
reader land here"; the side menu answers "should this be visible". `routes/editjob/$jobID.jsx` and
`routes/group/$groupID.jsx` declare `allowPublicAccess`, and `routeUtils` calls both private because
they carry a param. The side menu's gated entries are a hand-maintained copy of the `_protected`
children.

**The redirect carries a pathname, so a resume drops the search.** `allowPublicAccess` redirects with
`state: location.pathname`. A reader resuming on `/editjob/abc?activeGroup=g1&pageView=outputs` comes
back to `/editjob/abc`: the job survives, the group it was opened from does not.

**The login does not need a component.** `runAppLogin({ queryClient, mode })` is a plain async
function; the `queryClient` is a module singleton whose own doc comment offers it to guards; login
progress is event-driven, so the UI observes rather than drives.

**Authenticated is not ready.** `applyClientSessionAfterAppTokens` awaits the session, the character
and the account sync, then starts the prefetch, the watchlist, the job groups and the job documents
**without awaiting them**. Readiness is the four `LOGIN_STEPS` completing, which is what
`useAfterLoginStepNavigation` waits for before it moves the reader off `/auth`.

## What the redirect actually costs

Redirecting to `/auth` to resume is doing two jobs, and only the first is obvious:

1. It runs the login.
2. **It holds the reader on a screen with no jobs on it** until the download finishes.

Job data builds from ESI during those steps, so a job-bearing page rendered against a half-built store
shows figures that are wrong rather than merely late. The hold is load-bearing, and any design that
removes the redirect has to replace both jobs, not just the first.

That is also why "public" cannot mean "render immediately": public means usable by a reader with no
session, not safe to paint mid-login.

## What a route declares

One field, on the route, next to the component it describes:

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

`resumeSession: false` is the one modifier, and `/` is the only route that carries it.

**A route with no declaration is private.** Adding a route and forgetting the field then fails
closed, and a test over the generated tree asserts every route has one, so it fails loudly too.

## The route table

| Routes | `audience` | Note |
|---|---|---|
| `/` | `public` | `resumeSession: false` — the marketing page stays readable, a session resumes on the first real page |
| `/jobplanner`, `/reprocessing`, `/itemtrees`, `/group/new`, `/editjob/$jobID`, `/group/$groupID` | `public` | usable signed out; these are the deep-link and share targets |
| `/dashboard`, `/accounts`, `/settings`, `/asset-library`, `/blueprint-library`, `/archived-jobs`, `/first-login` | `private` | |
| `/auth`, `/signout` | `transient` | never guarded, never returned to |

`/` keeping its current behaviour is a decision, not an omission. Today it is expressed by the route
simply lacking a guard that six others have, which reads as an oversight; the modifier says it was
chosen.

## One guard

The root `beforeLoad` receives the whole matched chain and each match's `staticData`, so it can act
for the leaf. It runs, in order:

1. **First login** — an account whose guided flow is incomplete goes to `/first-login`. This already
   lives here; the duplicate copy in `_protected.jsx` goes.
2. **Resume** — `audience` is not `transient`, the route does not opt out, and a session is stored:
   await the login **to completion**, then continue.
3. **Require** — a fresh sign-in starts when the route is `private` and no session was rebuilt, and
   also when a stored session was there to resume and the resume failed. A reader who *had* a session
   is asked to sign in again rather than dropped onto a signed-out page, whatever the audience.

After this, `_protected.jsx` is a layout with no `beforeLoad`, `allowPublicAccess` and `requireAuth`
are gone with their seven call sites, and `/auth` and `/signout` keep only the work that is genuinely
theirs — the OAuth callback and the teardown.

## Why the resume can move

Only a *fresh* sign-in has to leave the app, because it must physically visit EVE's authorize
endpoint. A resume is a token exchange followed by a download; nothing about it needs a URL.

What `/auth` owns today that is genuinely its own is the **mode decision** inside `useAuthUrlLogin` —
additional-account window, `oauthCode`, `cookieCloudResume`, `eveClientRefresh`, else bounce to EVE.
Of those, only `oauthCode` belongs to the callback route. The two resume modes become a plain
`resumeStoredSession({ queryClient })` that the guard calls and `/auth` reuses.

## Authenticated is not ready

The guard awaits **completion**, not `runAppLogin`. Completion is the four `LOGIN_STEPS`, and the
events that report them already exist — nothing new has to be emitted.

What does not exist is somewhere to *hold* that state. `useLoginState` accumulates steps from the
moment it mounts, so a login starting before it mounts loses its early ones, and a guard cannot read
it at all. So this project adds a small module-level login progress tracker: step state plus a
`whenLoginComplete()` promise, written by the same events, read by both the guard and the UI.

That also closes a latent defect — progress that is missed today whenever the steps outrun the mount.

## The login screen is a state

While the guard awaits, the router shows `defaultPendingComponent`. That component renders the
existing login progress UI when a login is in flight, and the route splash otherwise.

The reader therefore sees the same step-by-step screen they see today, at the URL they asked for
rather than at `/auth`. The pending timings already configured on `appRouter` — 150 ms before the
splash appears, 300 ms minimum once shown — apply unchanged, so a fast resume shows nothing.

## Login complete is not data complete

The guard waits for the login's four steps, and that is the right gate for *a session*. It is not a
gate for *a page*, because the steps do not load everything a page can need:

- `GET /api/v1/job-documents/planner` returns the jobs that sit **on the planner**. A job inside a
  group is not one of them until it is marked ready for sale, so it is absent from `jobArray` after a
  complete login.
- A group's member jobs are fetched when the group is opened, not at login.

Two pages therefore have a requirement of their own that completion does not satisfy:

| Page | What it needs | What it does today |
|---|---|---|
| `/editjob/$jobID` | that job | reads the store only — `findJobInJobArray` has no fetch behind it — and on a miss logs and redirects to `/jobplanner` |
| `/group/$groupID` | the group's member jobs | fetches them in an effect after mount, so the page renders empty and fills |

A deep link to a grouped job is the case that shows it: the session rebuilds, every step completes,
and the page still cannot find its job.

**A route says what its page needs, in a `loader`.** The router runs it after `beforeLoad` — so the
session is already up and the fetch is authenticated — and holds the same pending state until it
resolves, which is the login progress or the splash. The page then renders with its data present
rather than fetching its way into existence.

`/editjob/$jobID` ensures its job: from the store, else fetched by id through the machinery
`jobsFromIdsOrObjects` already uses, else `notFound()`. `/group/$groupID` ensures its members, which
moves an effect-driven fetch onto the route that needs it.

A job URL carrying `activeGroup` is asking for both: the page reads the group's other jobs, so that
link loads the group's members as well. Opening a group and opening a job inside one are the same
load, and go through one function rather than two derivations of it.

**Which group the reader is working in is part of the same answer.** `activeGroupID` decides where a
new job is filed, which buttons a grouped job offers, and whether the edit page takes a group lock.
Only the group page set it, and only closing, archiving or deleting a group cleared it — so leaving a
group by the side menu left it set, and a job added on the planner was filed into a group the reader
had left. The route says it instead, on every navigation but not on a preload.

Two things follow. A missing job becomes a **not-found page** instead of a redirect to `/jobplanner`
with a console error, which needs `defaultNotFoundComponent` on the router — the same gap the router
already warns about. And because `defaultPreload: "intent"` preloads loaders too, hovering a job card
fetches that job, which is the point but wants `defaultPreloadStaleTime` set deliberately rather than
left to its default.

## The worked case: refreshing a job with a group in its search

A reader holding a stored session presses reload on
`/editjob/abc?activeGroup=g1&pageView=outputs`.

**Today.** `allowPublicAccess` sees a resumable session and redirects to
`/auth?state=/editjob/abc`. `/auth` logs in, waits for every step, then navigates to `/editjob/abc`.
The job is right and the group is gone, because the search never crossed the redirect.

**After.** The root guard matches `/editjob/$jobID`, reads `audience: "public"`, sees a stored
session, and awaits the resume in place. The pending component shows login progress. The route then
renders at the URL it already had.

`$jobID` and both search params survive because **nothing navigated** — there is no capture step to
get wrong and no restore step to lose them in. That is the whole of the param story for a refresh or
a deep link, and it needs no mechanism of its own.

## What crosses the handshake

A fresh sign-in does leave, so it needs a way back. `state` carries where the reader was headed —
path, search and hash — and EVE echoes it onto the callback URL.

**A nonce keyed to a stored location was built and then taken back out.** It would have kept the
return target off the network entirely and given `state` its CSRF job, but neither is this project's
to bank: the SPA has no CSRF defence either way, and that question is open as
[auth-hardening](../auth-hardening/plan.md) § Stage F (#32). What it did cost was a seam — the guard
held a path, the storage wanted a nonce, and the handover between them was wrong on the first
attempt, sending a bookmark to a private page to the dashboard. A damaged `state` landing on the
default is not worth that.

**A returning target is validated before the router sees it.** It must start with `/`; it must not
start with `//`, which is protocol-relative and leaves the site while passing a naive check; it must
match a route the app has; and it must not be `transient`. Anything else goes to the default.
`NavigateOptions.href` accepts external URLs, so this is a requirement and not a precaution.

## Where a reader lands

Any route except a `transient` one. A deep link into a private page returns there after signing in
rather than diverting to the dashboard.

The superseded rule sent every private page to the dashboard, and its comment said that was so readers
did not get stuck on secure routes after a refresh — a problem that has since been resolved
independently. Returning people to `/settings` is the case that would expose it if anything of it
remains, so Stage D verifies rather than assumes.

## Wire compatibility

| Change | Class | Note |
|---|---|---|
| OAuth `state` becomes a nonce | **Additive** | Client-only. The API never reads `state`; EVE echoes whatever it is given. |
| `originalPath` in `localStorage` retired | **Additive** | Replaced by a per-tab `sessionStorage` entry. A stale key left by an older bundle is ignored, not read. |
| Route `staticData` | **Additive** | A route option the router already supports; nothing outside the SPA sees it. |
| Guards consolidated onto the root | **Additive** | No route's URL, search schema or API call changes. |

No API contract, cookie, header or stored-document shape changes anywhere in this project.

## Stages

**Stage 1 — the declaration and the reading of it.** `staticData.audience` on all 16 routes plus the
modifier on `/`; a module that reads the tree and answers "what is this route" and "is this href a
route at all"; the fail-closed test over the generated tree. No behaviour change — the existing
guards still run.

**Stage 2 — the progress tracker.** Module-level login step state and `whenLoginComplete()`, written
by the existing events. `useLoginState` reads it instead of only live events, which fixes the missed
early steps. Still no behaviour change.

**Stage 3 — one guard.** Root `beforeLoad` takes over first-login, resume and require, reading Stage 1
and awaiting Stage 2. `resumeStoredSession` extracted from `useAuthUrlLogin`. Delete
`allowPublicAccess`, `requireAuth`, and the duplicate first-login check. The pending component renders
login progress.

**Stage 4 — the data a page needs.** A route whose page cannot draw without something the login did
not load says so in a `loader`, so the router holds the same pending state until it is there. See
§ Login complete is not data complete. `/editjob/$jobID` ensures its job; `/group/$groupID` ensures
its members, moving that fetch out of the effect it runs in today. A job that genuinely does not
exist becomes a not-found rather than a silent bounce, which needs `defaultNotFoundComponent` on the
router.

**Stage 5 — the handshake.** `state` becomes a nonce; capture and restore the full href; validation
before `navigate({ href })`. `getRedirectPathAfterAuth` reduces to "a real route, and not transient",
and `storeOriginalPathFromOAuthState` and the `originalPath` key go.

**Stage 6 — the second readers.** The side menu gates entries on `audience` rather than `isLoggedIn`.
Any other surface found asking the same question moves with it.

Stages 1 and 2 are independent and land first because nothing observable changes; Stage 3 is where
behaviour moves. Stage 4 closes a correctness gap Stage 3 exposes and comes before the rest; 5 and 6
follow.

**The additional-account import window is deliberately last, and may be declined.** It already carries
a nonce in `state` and broadcasts a code back to its opener rather than returning to a path, so it is
the one flow that neither gains nor needs anything from Stage 4. Folding it into the same mechanism is
tidiness, and it is the fiddliest part of the auth surface.

## Stage status

| Stage | Status |
|---|---|
| 1 — the declaration | **Landed.** All 16 routes declare an audience, `utils/routeAccess.js` reads the tree, and the fail-closed test covers a route that declares nothing. Behaviour: [overlay.md](./overlay.md) § What a route declares |
| 2 — the progress tracker | **Landed.** `Functions/Auth/loginProgress.js` holds step state outside React and `useLoginState` reads it. Behaviour: [overlay.md](./overlay.md) § How login progress is tracked |
| 3 — one guard | **Landed.** The root guard owns first login, resume and the require; `allowPublicAccess`, `requireAuth` and `utils/authGuard.js` are gone. A resume that fails sends the reader to sign in whatever the route's audience, and the one question of whether a reader must sign in again is now answered in one handler rather than five places. Behaviour: [overlay.md](./overlay.md) § Guarding a route, § When a reader has to sign in again |
| 4 — the data a page needs | **Landed.** `/editjob/$jobID` and `/group/$groupID` carry loaders, the router has a not-found page and a deliberate preload staleness, and the fetch-or-bounce in the two pages is gone. Behaviour: [overlay.md](./overlay.md) § What a page needs beyond a session |
| 5 — the handshake | **Landed.** `state` carries where the reader was headed and is checked against the real routes on return; `getRedirectPathAfterAuth` is down to "a route the app has, and not transient"; `storeOriginalPathFromOAuthState` and the `originalPath` key are gone. Behaviour: [overlay.md](./overlay.md) § Signing in and coming back |
| 6 — the second readers | **Landed.** The side menu asks each route whether a reader may go there, through `canVisitRoute`. Behaviour: [overlay.md](./overlay.md) § Who sees which navigation |

## Settled

- **A reader returns to the page they asked for**, private pages included. Decided directly rather
  than inherited.
- **`/` does not resume a stored session**, so a signed-in reader can still see the landing page. It
  becomes an explicit modifier rather than a missing guard.
- **The login flow must finish before job data is shown.** Public means usable signed out, not safe to
  render mid-login.
- **A route with no declaration is private**, enforced by a test over the generated tree.
- **`state` carries a nonce, never a path.**
- **A resume that fails sends the reader into the sign-in flow**, whatever the route's audience. A
  reader who had a session and lost it is asked to sign in again rather than silently dropped to a
  signed-out page they were not expecting.

## Open questions

- **Should a route chunk downloading during a login look different from the login itself?** Settled
  in Stage 3 as: the pending component shows login progress whenever a login is running and the
  route splash otherwise, so the two waits do not look alike.
- **The additional-account window stays as it is.** It was only ever a candidate for folding into a
  shared nonce mechanism, and that mechanism was built and then taken back out. Its own
  `additional:<nonce>` handshake and `BroadcastChannel` hand-off are the right shape for two live
  contexts, which is a different problem from a tab that leaves and comes back.

## What promote has to fix

Live-SoT defects found while writing this plan. They are recorded here and corrected at promote, not
before.

- [frontend/auth/spa.md](../../frontend/auth/spa.md) § Signout describes `routes/signout.jsx` as "an
  ordinary route whose component runs the teardown on mount". It has no component: the teardown runs
  in `beforeLoad` and ends by throwing a redirect.
  [frontend/navigation/spa.md](../../frontend/navigation/spa.md) § Signing out is a navigation guard
  describes it correctly, so the two live docs disagree today.
- [frontend/auth/spa.md](../../frontend/auth/spa.md) § Route guards is accurate for the current code
  and is superseded wholesale by this project's Stage 3.
- [frontend/auth/spa.md](../../frontend/auth/spa.md) names the account slice field
  `refreshToken` / `refreshTokenEXP`. `refreshTokenEXP` no longer exists: it was read from
  `refresh_token_exp` and `refresh_token_expires_at`, which no session response has ever carried, so
  it was permanently null. The reauth window it was meant to express is `reauth_required_at`, stored
  as `reauthRequiredAt`. The row becomes `refreshToken` alone.
