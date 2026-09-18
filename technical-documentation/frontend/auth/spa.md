# Authentication (`frontend/src/Functions/Auth`)

Live SoT for how the SPA signs a user in, holds the credentials it needs, authenticates every private
request and the realtime connection, and tears all of it down again. Package:
[`frontend/src/Functions/Auth`](../../../frontend/src/Functions/Auth). Session state and the rotate
action: [`frontend/src/Zustand/account`](../../../frontend/src/Zustand/account). Route access and
what a route needs before it renders → [frontend/navigation/spa.md](../navigation/spa.md).

Wire contracts, cookies and status codes → [backend/api/auth/overview.md](../../backend/api/auth/overview.md).
Server-side session storage and the websocket upgrade check → [sessions.md](../../backend/api/auth/sessions.md).
Endpoint list → [session-esi.md](../../backend/api/session-esi.md). Test depth →
[testing/frontend/auth.md](../../testing/frontend/auth.md).

## Defaults

| Piece | Default | Change |
|-------|---------|--------|
| ESI access token buffer | refresh when fewer than 660s remain | `frontend/src/Functions/Auth/esiCredentials/provider.js` |
| ESI token skew for a rotate body | 60s | `frontend/src/Zustand/account/plannerSessionActions.js` |
| Cloud access-token batch | 50 character hashes per request | `frontend/src/Functions/Auth/esiCredentials/strategies.js` |
| Planner rotate cooldown | 20 minutes (`PLANNER_SESSION_ROTATE_COOLDOWN_MINUTES`) | `frontend/src/global-config-app.js` |
| Rotate failure backoff | 30s | `frontend/src/Zustand/account/plannerSessionActions.js` |
| Affiliation refresh | 15 minutes, both `staleTime` and `refetchInterval` (`ACCOUNT_AFFILIATION_REFRESH_MINUTES`) | `frontend/src/global-config-app.js` |
| Tranquility poll | 15 minutes online, 5 minutes offline, no poll before the first success | `frontend/src/Hooks/React Query/tranquilityServerStatus.js` |
| Tranquility rate-limit retry | up to 50 attempts, delay from the error or 1s | same |
| Request retry | 4 attempts, 350ms base, on 408 / 429 / 5xx; 429 waits the server `Retry-After`, capped at 120s | `frontend/src/Functions/Endpoints/withRequestRetries.js` |
| React Query `staleTime` | 60s | `frontend/src/queryClient.js` |
| WebSocket ping | 45s | `frontend/src/WebSocket/websocketClient.js` |
| WebSocket reconnect | 750ms doubling, capped at 20s | same |
| Session handoff window | reconnect cap + 5s = 25s | same |
| `resume_ack` wait | 400ms, then continue without it | same |
| Visibility re-sync delay | 800ms after a background tab becomes visible | `frontend/src/WebSocket/useAccountWebSocket.js` |

Nothing here runs on a schedule of its own. Every value above is either a *staleness* bound React
Query enforces, or a floor that stops a caller repeating work — never a timer that acquires a
credential nobody asked for.

## Wiring

```text
resumeStoredSession / useAuthUrlLogin ──► runAppLogin ──► applyClientSessionAfterAppTokens
                                                                    │
        ┌───────────────────────────────────────────────────────────┼────────────────────────────────────┐
        ▼                                                          ▼                                    ▼
  account slice                                             esiCredentials                     useAccountWebSocket
  (identity, session id)                              (ESI access tokens, per character)              (/ws)
        │                                                          ▲                                    │
        │ ensurePlannerSession                                     │ getEsiAccessToken                  │ clientID
        ▼                                                          │                                    ▼
  POST /auth/sessions/rotate                            ESI fetchers, rotate body           requestWithPrivateHeaders
                                                                                                          │
                                                                                                          ▼
                                                                               fetch: eip_session cookie + X-Session-ID
```

Login is the only thing that assembles a session; everything after it is pulled by a caller that
needs something. A private request awaits `ensurePlannerSession`, which is a no-op unless the session
is actually due. An ESI fetcher awaits `getEsiAccessToken`, which returns the token already in hand
unless it is close to expiry. The websocket depends only on being logged in.

A route rebuilds a stored session itself, in place, rather than sending the reader to `/auth` — see
[frontend/navigation/spa.md](../navigation/spa.md) § Guarding a route. `resumeStoredSession`
(`frontend/src/Functions/Auth/resumeStoredSession.js`) is what both the guard and `/auth` call: it
picks the mode, runs `runAppLogin`, and waits on the login's own completion rather than on
`runAppLogin` resolving, because that resolves once the reader is authenticated with the planner's
own data still arriving.

## What the SPA holds

The account slice (`frontend/src/Zustand/account/account.js`) holds **identity**: who is signed in,
which planner session this browser tab owns, and the character roster. It holds no ESI access token,
and no reauth deadline — that lives per tab in `sessionStorage`, below.

| Field | Holds |
|-------|-------|
| `accountID` | the account, from the login response |
| `mainCharacterHash` | the EVE character hash the account was established with |
| `sessionID` | the planner session id for **this tab**, mirrored from `sessionStorage` |
| `lastPlannerSessionValidatedAt` | when a login, rotate or bootstrap last confirmed the session — what the rotate cooldown reads |
| `refreshToken` | the tab's planner refresh token, mirrored from `sessionStorage` and sent in the body on bootstrap and rotate |
| `isLoggedIn` | the signal a route's audience is checked against |
| `plannerPrivateAuthReady` | false from the moment a login response lands until the post-login sync finishes; gates work that must not race the first private request |
| `isFirstTimeLogin` / `hasCompletedFirstLoginFlow` | a new account, and whether the guided flow has been completed — the second drives the `/first-login` redirect |
| `linkedCharacterHashesFromBootstrapSession` / `linkedBootstrapHydrationPending` | the linked characters a cloud login reported, held until the post-login sync has adopted them |
| `characters` / `corporations` / `alliances` | the roster and what it is affiliated with, hydrated by the post-login sync rather than by login itself. An alliance is reached only through a corporation the account is in, and is dropped when the last of those corporations goes |

The slice's actions live in `frontend/src/Zustand/account/plannerSessionActions.js`:
`applyLoginAuthResponse` merges a login, bootstrap or rotate response onto the account and
application-settings slices in one transaction; `setSessionTokens` merges what a rotate returned;
`applyUserDocumentFromRemote` applies a realtime change to the `users` document, which is how a
storage-mode switch made elsewhere reaches this tab; and `ensurePlannerSession` is the rotate path
below. Roster writes are beside them in `characterActions.js`.

Planner session material is **per tab**, in `sessionStorage`
(`frontend/src/Functions/Auth/tabSessionStorage.js`): session id, refresh token, and the reauth
deadline. The Zustand fields mirror what a page render needs; the storage copy is what a cold reload
resumes from — so two tabs of the same account hold two planner sessions and never spend each other's
refresh token. `localStorage["Auth"]` is separate again: it is the main character's EVE refresh
secret, and only a local account keeps one.

## Signing in

`useAuthUrlLogin` (`frontend/src/Components/Auth/Hooks/useAuthUrlLogin.js`) runs once on `/auth` and
picks a mode for `runAppLogin`:

| Situation | Mode | What it does |
|-----------|------|---------------|
| The URL carries an OAuth `code` | `oauthCode` | exchanges the code with EVE SSO, then `POST /auth/sessions` |
| No `localStorage["Auth"]`, but a tab refresh token or the cloud storage cookie hint | `cookieCloudResume` | `POST /auth/sessions/bootstrap` with the tab's refresh token; a cloud account may send no `eve_token` |
| `localStorage["Auth"]` is present | `eveClientRefresh` | builds the character from that secret, then bootstrap if the tab has a refresh token, falling back to `POST /auth/sessions` |
| Nothing resumable, or any of the above failing | — | full EVE SSO redirect, which gives the tab a new planner session |

`resumeStoredSession` (`frontend/src/Functions/Auth/resumeStoredSession.js`) picks between
`cookieCloudResume` and `eveClientRefresh` the same way, for a route rebuilding a session where the
reader already is rather than on `/auth`; `/auth` calls it for the two resume modes and keeps only
`oauthCode` as work genuinely its own.

`hasResumablePlannerSession()` (`frontend/src/Functions/Auth/tabSessionStorage.js`) reports only
whether this browser holds credentials a cold reload could rebuild from — a tab refresh token or the
cloud storage hint, or `localStorage["Auth"]` for a local account. It says nothing about whether the
reader is allowed to resume: a session past its reauth deadline still has its credentials sitting
here. That question is `reauthDemand`, below, and keeping the two apart is what lets a resume tell a
timed-out session from a browser that never had one.

Every mode builds its `Character` through
`frontend/src/Functions/Auth/buildCharacterFromCredentials.js`, which adopts the access token that
falls out of the exchange into the credential provider — so the first ESI query for that character
does not exchange a second time.

All modes converge on `applyClientSessionAfterAppTokens`
(`frontend/src/Functions/Auth/appLoginFlow.js`), which applies the session response, pushes a cloud
account's main ESI refresh secret into Mongo and drops the browser copy, flips `isLoggedIn`, hydrates
the character and what it is affiliated with into the roster, prefetches that character's data, clears the
in-memory job array, awaits the post-login account sync that adopts the linked characters, and starts
the watchlist, job-group and job-document bootstrap steps without waiting on them. It releases
`plannerPrivateAuthReady` in a `finally`, so a login that failed part-way still opens the gate.

**What "affiliated with" resolves to is one call**, `buildCharacterAffiliations`
(`frontend/src/Functions/Auth/characterAffiliations.js`): the character's public data, then its
corporation, then that corporation's alliance. The order is forced — a character's public data is
where its corporation id comes from, and the corporation's is where its alliance id comes from — and
every surface that brings a character into an account goes through it, so the sequence is written
once rather than at each of login, session resume and linking a character from the Accounts page. A
corporation or alliance the account already holds gains the character and is not asked about again.

`connectWebsocket` follows from `isLoggedIn` flipping, not from anything the login flow calls.

### Login progress

`Functions/Auth/loginProgress.js` holds how far the current login has got — the completed steps, the
current step, an error, and the characters reported so far — outside React, written by the
`loginStepComplete` / `loginError` / `loginComplete` / `userDataUpdate` events the login flow emits.
It lives outside React because those events can fire before anything displaying progress has mounted.
`useLoginState` (`frontend/src/Components/Auth/Hooks/useLoginState.jsx`) reads it through
`useSyncExternalStore`, so a step that completes before mount is still counted.

`startLogin()` clears what the last login reached and arms a fresh `whenLoginComplete()` promise; it
is called when a reader arrives at `/auth` and by a resume. `isLoginRunning()` reports whether a login
is in flight directly, because the first step is a network round trip away from the start.
`whenLoginComplete()` is what a caller awaits for the planner's own data rather than only for
authentication — see [frontend/navigation/spa.md](../navigation/spa.md) § Login complete is not data
complete.

A step that fails does not resolve `whenLoginComplete()`; it reports an error and waits to be
re-run. `Functions/Auth/retryLoginStep.js` names the steps that can be — the three bootstrap steps
(`bootstrapJobDocumentsLoginStep`, `bootstrapJobGroupsLoginStep`, `bootstrapWatchlistLoginStep`), each
of which takes no arguments and simply re-emits its own completion. `characterData` is not retryable:
`runPostLoginAccountSync` works from the `user_document` and `linked_characters` of the login
response, and nothing outside that response holds them, so recovering it means signing in again. A
failed step's icon in `LoginUI` is the retry button, wired through `canRetryLoginStep` /
`retryLoginStep`.

## Acquiring an ESI access token

`frontend/src/Functions/Auth/esiCredentials/provider.js` owns *give me a usable ESI access token for
this character*. Call sites import its default instance:

```js
const { accessToken, exp } = await getEsiAccessToken(characterHash, { minRemainingSec });
```

| Member | Behaviour |
|--------|-----------|
| `getEsiAccessToken(hash, { minRemainingSec = 660 })` | returns the held token while more than `minRemainingSec` seconds remain, and refreshes otherwise; concurrent callers for one character share a single refresh |
| `adoptEsiAccessToken(hash, accessToken)` | takes ownership of a token another flow already obtained — login and bootstrap exchange refresh material anyway, and the token that falls out is the one to hold |
| `heldEsiAccessToken(hash)` | the token in hand, or `""`, for a caller that can proceed without one; never fetches |
| `reacquireEsiAccessToken(hash)` | drops whatever is held for the character and acquires a fresh one, for a reader asking the application to try again |
| `forget(hash)` / `reset()` | drop one character's token, or all of them |

**An access token is not application state.** It lives in the provider's map rather than on a
`Character` in Zustand, so a refresh writes no store state and renders nothing.
`account.characters` is subscribed to across the app — header, dashboard, account cards, asset pages,
character pickers — and none of those surfaces display a token. Identity belongs in the store,
credentials belong here. The same reasoning applies to a rotated client-held refresh secret, which is
written onto the roster entry in place rather than through `set` — `writeClientSecret`, exported for a
caller replacing a character's secret by some path other than a rotation, writes both the roster entry
and, for the main character, `localStorage["Auth"]`, which is what a cold reload resumes from.

Because nothing implicitly drops a held token, they are dropped explicitly: signout calls `reset()`,
and `removeCharacter` calls `forget(hash)`.

### Credential health

Whether the application can currently use a character's credentials at all is a different question
from whether one particular token is fresh, and is answered by
[`esiCredentials/health.js`](../../../frontend/src/Functions/Auth/esiCredentials/health.js), kept
beside the provider for the same render-freedom reason as the tokens themselves — a value nothing in
`account.characters` displays must not write through the store.

| State (`CREDENTIAL_HEALTH`) | Means |
|------|-------|
| `unknown` | nothing has been asked of this character's credentials yet |
| `ok` | the last acquisition returned a token |
| `degraded` | the last acquisition failed for a reason that may pass — a network fault, a server refusal |
| `reauth-required` | the refresh material is spent; only signing in as the character again restores it |

`recordCredentialHealth` is written by `getEsiAccessToken` on every acquisition, success or failure —
classified through `isReauthRequired`, the same classification below that a caller reads for its own
retry decision — and by `adoptEsiAccessToken` on adoption. `forget` and `reset` clear a character's
record or all of them, alongside its tokens. An outcome matching the one already held is dropped
rather than re-stamped: the record is read through `useSyncExternalStore`, which compares snapshots
by identity, so a fresh object for an unchanged state would re-render every subscriber on each
background refresh.

`useCredentialHealth(characterHash)`
([`Components/Auth/Hooks/useCredentialHealth.jsx`](../../../frontend/src/Components/Auth/Hooks/useCredentialHealth.jsx))
is the read side, over the same subscription. It answers `{state, at}`; what a reader is shown for a
given state is decided by whatever surface displays it, not by this module.

**Failures are classified, not swallowed.** A rejection is an `EsiCredentialError` carrying
`recoverable` or `reauth_required`, read back with `isReauthRequired(err)`. A 4xx means the stored
material was rejected and will be rejected again; anything else — network, 5xx, a rate limit — is
worth a later attempt. A caller acts on the class, because only the strategy knows what a given
failure means for its own material.

### The two storage modes

Where the refresh material lives is the only place cloud and local differ for a token. The strategy
is resolved per call from `applicationSettings.userCloudAccounts`, so an account that switches mode
while the app is open is followed.

| Strategy | Material | Request |
|----------|----------|---------|
| `serverStoredCredentials` | encrypted in Mongo; never reaches the browser | `POST /api/v1/esi/characters/access-tokens/server` with the hashes gathered in one tick, split at 50 per request. A per-character `error` row fails that character alone; the request itself failing is `recoverable` for every waiter, because a transport fault says nothing about anyone's stored material. |
| `clientHeldCredentials` | the refresh secret on the `Character` in the roster, and `localStorage["Auth"]` for the main character | `POST /api/v1/eve-sso/tokens/refresh`. EVE SSO may return a rotated secret, which is written back in place — a spent secret is refused on the next attempt. |

Batching lives inside the cloud strategy, so nothing above it changes: the provider single-flights
per character, which is exactly what leaves several acquisitions in flight for the strategy to
gather. The batch size matches the Go handler's cap — one over it answers 400, failing every
character in the request for a reason none of them caused. A hash asked for twice is exchanged once
on both sides, because a second exchange would spend the refresh token the first just rotated.

### Who asks for one

Every ESI fetcher under `frontend/src/Functions/EveESI/**` awaits the provider and sends what it
returns, guarding on a character hash rather than on a token being present.
`refreshAccountSessionGrants` acquires one token per character with `Promise.allSettled`, so one dead
credential does not stop the submission — for a cloud account it returns immediately, because the
server holds the material and recomputes grants itself. `ensurePlannerSession` acquires the main
character's token for the rotate body.

## The planner session

`ensurePlannerSession` (`frontend/src/Zustand/account/plannerSessionActions.js`) is the **only** code
path that hits `POST /api/v1/auth/sessions/rotate`. Private requests await it before sending, and it
returns without HTTP unless the session is actually due.

The gates, in the order they are checked:

| Gate | Skips the rotate when |
|------|-----------------------|
| Tranquility | the cache says the cluster is offline |
| Single-flight | a rotate is already in flight — the caller awaits that one |
| Main character | the roster holds no main character yet |
| Reauth deadline | the tab's stored deadline has passed; this redirects to full EVE SSO instead |
| Cooldown | the session was validated less than 20 minutes ago and a session id is held — `force` skips this gate |
| Failure backoff | a rotate failed less than 30 seconds ago — `force` does **not** skip this gate |

Past the gates it acquires the main character's ESI access token with `minRemainingSec = 60`, reads
the tab's refresh token, and rotates. A cloud account can rotate on the cookie plus its Mongo-stored
material, so a token it cannot acquire is not fatal and an empty `eve_token` is sent; a local account
has no such fallback and does not rotate without one, redirecting to full EVE SSO if the failure was
`reauth_required`.

**Single-flight, cooldown and backoff are all module-level, not store state.** Concurrent private
requests would otherwise each rotate the session and orphan each other's refresh row; a failed rotate
would leave the cooldown permanently elapsed and have every subsequent private request repeat it; and
a rotate marker in the store would re-render subscribers for a value nothing displays. `force` exists
for the `session_missing` recovery in the request path, which is precisely the burst the failure
backoff is there to stop — hence one gate it does not open.

On success the response's session id and, for a local account, the raw refresh token and its expiry
are written through `setSessionTokens`, which persists to `sessionStorage` and mirrors into the
slice, and `lastPlannerSessionValidatedAt` is stamped.

A failure is read for its code. `frontend/src/Functions/Auth/plannerSessionRedirect.js` owns the
single question of whether it demands a fresh sign-in — see § When a reader has to sign in again,
below. Anything else records the failure time and logs. An untyped 401 on a **local** account that
still holds an ESI access token is retried once as `establishPlannerSession`: a fresh session rather
than a rotate.

A failed rotate never signs the user out by itself; it is a reauth demand, if it is one, that sends
the tab to EVE.

### Why nothing runs on a timer

Acquisition is on demand, and this is the reasoning a later change is most likely to undo by adding a
scheduler back:

- The reauth deadline is fixed at the session's start and does not slide
  ([sessions.md](../../backend/api/auth/sessions.md)), so rotating early buys no extra life.
- The websocket authenticates on the session, which a rotate carries forward.
- EVE OAuth refresh tokens do not expire from disuse.

The cost is that the first query after a long idle period pays one OAuth round-trip for that
character. Several ESI hooks set `refetchOnWindowFocus: false`, so a tab regaining focus does not
warm every token — perceived latency only, since a request that needs a token still gets a fresh one.

### Affiliation and session grants

Which corporation each character belongs to, and the ESI tokens the server derives session grants
from, are one subject on one cadence, owned by `frontend/src/Hooks/React Query/accountAffiliation.js`
and mounted from `App.jsx`.

| Piece | Value |
|-------|-------|
| Query key | `["account", "affiliation"]` |
| `staleTime` / `refetchInterval` | 15 minutes |
| `enabled` | `isLoggedIn && plannerPrivateAuthReady` |

The query function re-reads every live character's public data, then calls
`refreshAccountSessionGrants`. It writes the roster **only when a corporation actually changed**,
because `account.characters` is subscribed to across the app and a periodic no-op write would
re-render all of it on a timer. It is a query rather than a clock: React Query decides when it is
stale, refetches on focus when it is, and stops entirely once the user is not logged in.

## Authenticating a request

Every private API call goes through `requestWithPrivateHeaders`
(`frontend/src/Functions/Endpoints/Private/applyPrivateHeaders.js`).

```
requestWithPrivateHeaders(URL, options, config)
  └── executePrivateRequestSingle (retry shell)
        └── executePrivateFetchOnce
              ├── await ensurePlannerSession()   unless config.skipSessionRefresh
              └── fetch(URL, applyPrivateHeaders(options, config))
```

`applyPrivateHeaders` forces `credentials: "same-origin"` unless the caller set it, so the browser
attaches the `eip_session` cookie, and adds:

| Header | When |
|--------|------|
| `X-Session-ID` | whenever this tab holds a planner session id — how the API knows *which* of an account's sessions is calling |
| `X-Request-Name` | the caller passed `config.requestName`, for reading the network tab |
| `X-WS-Client-ID` | `/ws` has sent its `connected` message; the API uses it to suppress echoing a change back to the tab that made it |

There is no `Authorization` header. Identity is the cookie plus the session header.

Two 401 shapes are read off the response before the retry policy sees it. A body carrying a demand
for a fresh sign-in is handed to `enforceReauthDemand`, which redirects and throws rather than
retrying — the tab is already leaving. A body carrying `session_missing` triggers one
`ensurePlannerSession({ force: true })` and one retry of the same request; recovery is attempted
once, and the retried attempt does not attempt it again.

Two config flags exist for calls that must not take the default path. `skipSessionRefresh: true`
suppresses both the pre-request rotate and the 401 recovery, and `retry: false` disables the retry
shell. Logout passes both: it must not rotate a session it is about to destroy, and it must not
repeat a destructive call.

**Batching** splits a JSON-body array across several requests: pass
`config.batch = { size, arrayKey, mergeResponseJsonArrays?, failure? }`. Chunks run **sequentially**,
not in parallel, so a large write does not burst the private rate limiter. `failure: "first"`
rethrows the first chunk's error as it stands, preserving `err.status`; the default aggregates.
`mergeResponseJsonArrays` reassembles the chunk responses into one synthetic JSON array response, so
the caller sees one result. Sizes mirror the Go handler limits — 100 for document PUTs, 200 for
id lists.

`PRIVATE_AUTH_TOKEN_UNAVAILABLE` is the never-retry sentinel the retry shell checks for. It is
exported and honoured; no path throws it today.

## The Tranquility gate

When EVE's Tranquility cluster is offline, hammering SSO and the rotate path is wasteful and noisy.
The status lives in React Query rather than component state, so non-React callers — Zustand actions,
the fetch path — read the same cache without prop drilling.
`useTranquilityServerStatusQuery()` is mounted from `App.jsx` so the cache is alive whenever the SPA
is.

| Piece | Behaviour |
|-------|-----------|
| Query key | `["esi", "tranquility-server-status"]` |
| Fetch | `https://esi.evetech.net/status/?datasource=tranquility`, answering `{ online, playerCount }` |
| Caching | `staleTime` and `gcTime` `Infinity`, no refetch on focus; the poll interval is the only refresh |
| Retry | only a rate-limit rejection is retried, waiting the delay the error carries |
| Readers | `getTranquilityServerStatusFromCache`, `isTranquilityOnlineFromCache`, `getTranquilityServerStatusQueryState` |

`shouldDeferAuthRefreshDueToTranquilityOffline` is the predicate the rotate path calls. It defers
**only** on a successful fetch that reported offline: a cache that has never been filled does not
defer, so a `/status/` endpoint that is itself unreachable cannot lock the SPA out of its own
session. ESI domain queries make their own decision from the same cache, in
`frontend/src/Functions/Shared/queryExecutionEnabled.js`.

## The realtime connection

`useAccountWebSocket` (`frontend/src/WebSocket/useAccountWebSocket.js`) connects on
`[isLoggedIn, accountID]` and disconnects on anything else. It does **no** auth work — a credential is
acquired by whatever needs one. A second effect in the same hook re-syncs account singletons and
planner job documents 800ms after a background tab becomes visible, because a background socket is
throttled and may have missed fan-out.

`frontend/src/WebSocket/websocketClient.js` is a module singleton on same-origin `/ws`, upgraded to
`wss:` on an https page. The tab's planner session id travels as the `planner_session_id` query
parameter and the browser attaches `eip_session` on the upgrade; the server checks both
([sessions.md](../../backend/api/auth/sessions.md) § WebSocket upgrade auth). A baked app version is
sent alongside as an ops hint only.

Rotating the session does **not** reconnect: the connect effect depends on the account, not the
session. The socket that is open stays open on the identity it opened with, and the next reconnect
for any reason picks up the current session id.

What happens on open is decided by the session id, not by the socket:

| Condition on open | Follows |
|-------------------|---------|
| The session id differs from the last successful open | baseline GET of the account singletons |
| A `session_resume` was sent and no `resume_ack` cleared the baseline within 400ms | baseline GET of the account singletons |
| The session id differs and this is not the first open | refetch of the planner job documents |

The resume handoff is what makes a same-session reconnect cheap. On teardown the hook stashes the
current client id, and the next connect sends `{ type: "session_resume", previousClientID }`
immediately after open. An acknowledged handoff skips the duplicate baseline GETs; an unanswered one
falls back to fetching them, because an uncertain handoff must not be trusted with what the tab
already believes.

`frontend/src/WebSocket/wsClientIdentity.js` holds the `clientID` the server sends in its `connected`
message. That value is what `X-WS-Client-ID` carries on private calls, and it is best-effort: before
the socket is open there is nothing to send, and the API simply treats such a change as coming from
another tab.

## When a reader has to sign in again

`frontend/src/Functions/Auth/plannerSessionRedirect.js` owns the single question of whether a reader
must abandon whatever they hold and sign in fresh, which reaches the SPA in three different shapes:

- **A deadline** the server handed over in an auth response, stored per tab as
  `reauth_required_at`. `reauthDemand()` checks it first and with no signal at all, so a session the
  server has already timed out is a demand in its own right.
- **A terminal code** on a rejected request — `reauth_required` or `session_revoked` — whether the
  caller holds it as a parsed string, an `err.code`, or only inside an error message.
- **An ESI credential classification**, `EsiCredentialError` carrying `reauth_required`.

`reauthDemand(signal)` answers whether there is a demand, not which kind — `reauth_required` and
`session_revoked` differ in what the server saw and never in what the SPA does about it.
`enforceReauthDemand(signal)` clears the tab session and the client-readable cookies and leaves for
EVE SSO, returning whether it fired, so a caller's remaining work is only about what it must **not**
do next: the private request path still throws its 401, and the rotate path still clears its failure
backoff.

**A demand always means a full EVE sign-in, never `/auth`.** The material a rotate or a resume would
need is exactly what is no longer valid, so there is nothing for an in-app login to do. The redirect
falls back to the page the reader was on (`${pathname}${search}${hash}`), and the returning `state` is
checked against the real route table before it is used — see
[frontend/navigation/spa.md](../navigation/spa.md) § Signing in and coming back.

## Signout

`routes/signout.jsx` has no component. Its teardown runs in an async `beforeLoad`, which the router
awaits before rendering anything, and which ends by throwing a redirect to `/`:

1. `disconnectWebsocket()` — close `/ws` before anything else, so no fan-out lands mid-teardown.
2. `logoutPlannerSession(tabRefreshToken)` — `POST /api/v1/auth/sessions/logout`, carrying the tab's
   raw refresh token when it holds one; a cloud account's server reads the value from
   `eip_app_refresh` instead.
3. Reset the client: drop the queued inbound job-document upserts, reset the account slice, then job
   data, application settings and world data, expire the client-readable cookie, and `reset()` the
   credential provider.
4. `queryClient.clear()`, then `sessionStorage.clear()` and the `localStorage` keys.
5. Throw a redirect to `/`.

Any failure runs the same cleanup and then hard-navigates with `window.location.href`, so a logout
that could not reach the API still leaves nothing behind in the browser and does not carry broken
state into the next session.

Two orderings in step 3 are load-bearing. The inbound coalesce queue is dropped **first**, because a
pending flush would repopulate job data after the reset. The account slice is reset **before** the
others, so an in-flight account GET completing in the same tick cannot re-merge stale application
settings. Held ESI access tokens live outside the store, so no slice reset drops them — the provider
is reset explicitly.

| Cookie | HttpOnly | Cleared by |
|--------|----------|------------|
| `eip_session` | yes | server `Set-Cookie` on a successful logout |
| `eip_app_refresh` | yes | server `Set-Cookie` on a successful logout |
| `eip_esi_oauth_storage` | no | the server, and the client-side expiry in the teardown |

The logout call clears the tab's `sessionStorage` material and expires the client-readable cookie in a
`finally`, whatever the API answered — so a request that never landed still cannot leave a stale cloud
hint for a public route to read and bounce a signed-out user back into `/auth`.

## Topic-only detail

- Planner session material is per tab. Two tabs of one account hold two sessions, and neither one's
  rotate invalidates the other's refresh row.
- `establishPlannerSession` always issues a fresh session id and clears the cooldown. Only login and
  the local-account 401 recovery may call it; the rotate path must not.
- All rotate work goes through `ensurePlannerSession`. Reaching `/auth/sessions/rotate` from anywhere
  else bypasses the in-flight promise, the cooldown and the failure backoff at once.
- Cloud versus local is read from `applicationSettings.userCloudAccounts`, derived from
  `esi_oauth_storage` on the session response and from the user document. For a token it is consulted
  in exactly one place, the credential strategy; do not mirror the flag onto the account slice.
- Read the Tranquility status through its accessors: `useTranquilityServerStatusQuery()` for
  rendering, `shouldDeferAuthRefreshDueToTranquilityOffline(get)` for non-React code — both over the
  one cache.
- Credential health (`unknown` / `ok` / `degraded` / `reauth-required`) is a separate record from the
  token map, read through `useCredentialHealth`. It answers *can this character's credentials be used
  at all*, never *is this particular token fresh*.
