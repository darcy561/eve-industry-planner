# Overlay — behaviour this project holds until it promotes

Two kinds of content live here. The first is current behaviour that no live document states, which
the retired auth roadmap was the only home for; it is held here so that removing that roadmap loses
nothing, and it promotes as described in [plan.md](./plan.md) § Promote. The second is the
"what changed / how it works now" record for each stage, which fills in as stages land.

Where this file and live documentation disagree, this file wins for the surfaces it names. Everywhere
else, live documentation is the truth.

## Session window invariants

[overview.md](../../backend/api/auth/overview.md) § 1 documents the reauth deadline as
`started_at + RefreshTokenTTL`, and [sessions.md](../../backend/api/auth/sessions.md) § 11 documents
the `401 reauth_required` it produces. Neither states the rule that makes the deadline mean anything:
**a rotate or a bootstrap must not move it.**

The deadline is anchored at a full EVE SSO login, or at the first `session_id` minted on a new chain.
`ReauthDeadlineFromSessionStart` in `services/shared/plannersession/reauth.go` derives it from
`SessionStart` alone, and `refresh.go` writes `SessionStart` only in two cases — when it is minting a
session id because the chain has none, and when a legacy refresh row carries a zero value. A rotate
of an existing chain leaves it untouched, updates `SessionSeenAt`, and the middleware's `Store.Touch`
updates `LastSeenAt`. None of those three feed the deadline.

The rule matters because the opposite behaviour is the natural thing to write. A cookie resume looks
like a login from the handler's point of view, and refreshing the window on it would turn a hard
seven-day cap into an indefinite session that never asks for EVE SSO again — which is the property
the cap exists to prevent. Anyone editing `refresh.go` should be able to read that before deciding
where to set `SessionStart`.

Two supporting facts belong with it when this promotes:

- After the deadline, the only way back is `POST /auth/sessions` with a fresh EVE access token. A
  cookie-only bootstrap is refused, and refusing it is what `TestRefreshRequiresReauthOnceTheWindowElapses`
  and `TestRefreshStaysRefusedAfterReauthRequired` pin.
- A cloud account's ESI refresh secret does not reach the SPA for storage. It lives in Mongo, and the
  login response carries the linked-character roster without it. Asserted since Stage E — see
  § Stage E below.
- The browser holds no session cookie on these routes. Identity is the `X-Session-ID` header and the
  refresh token in the request body, per tab. Nothing issues `eip_app_refresh` any more; the server
  still reads one a client may be carrying, and clears it on logout and on `reauth_required`.

## Auth test coverage

The backend half of this correction has since been promoted:
[testing/services/api.md](../../testing/services/api.md) no longer claims `v1endpoints` carries
"type/JSON tests only", and now names the rotate coverage and the live gates it runs behind. The SPA
half has a home of its own in [testing/frontend/auth.md](../../testing/frontend/auth.md). What
remains below is this project's own reading of depth, kept because it is what the still-open items
are argued from — not because the live documents disagree with it.

**Tested**

- **Session kernel, reauth math, grants, TTLs and the key invariants** — `services/shared/plannersession`,
  including `TestOperationsLeaveTheKeysTheyOwe`, which asserts that a write touching several key
  families lands in all of them rather than only reading back what it just wrote.
- **Request-side session reading** — cookie, header and query precedence, and failure classification —
  `shared/plannersession/request`.
- **The maintenance sweep**, including its dry-run switch — `shared/plannersession/maintenance`.
- **Session HTTP handlers** — `api/v1endpoints/session_lifecycle_test.go` covers logout (revoke,
  cookie clearing, an unknown token leaving other sessions alone, malformed and non-POST requests),
  refresh (unknown token, revoked token, the reauth window elapsing and staying refused, a rotate that
  does not complete leaving the token stored, malformed and non-POST requests) and login (a token
  signed by another issuer, an expired token, malformed and non-POST requests).
- **The same handlers against real infrastructure** — `live_session_lifecycle_test.go`: a login mints
  a session the browser can use, first login is reported exactly once, and logout ends only the
  session that presented itself.
- **SSO exchange and refresh routes** — `api/v1endpoints/sso/refresh_route_test.go`: both routes'
  happy paths, bodies the handler cannot use, a refused token distinguished from an outage, the
  limiter gate being fed, and both routes still serving while it is closed.
- **Cross-service agreement on the stored session shape** — `testing/sessionhandover`.
- **The worker's grants task** — `worker/tasks/esi/update_account_session_grants_test.go`.
- **SPA auth error handling** — `Functions/Auth/plannerSessionRedirect.test.js` (parsing a code out of
  a body, and which codes are terminal), `hasResumablePlannerSession.test.js`,
  `plannerAuthCookies.test.js`, `Components/Auth/additionalAccountImport.test.js`,
  `oauthUrlParams.test.js`.

**Thin**

- **The API auth middleware.** `middleware/auth_test.go` holds one test, for the client failure detail
  it attaches. The cookie path and the mapping from each failure class to its status code are covered
  only indirectly, through the `shared/plannersession` tests underneath.
- **The WebSocket upgrade.** `integration_connect_test.go` covers a missing session and a refusal
  while draining. A revoked session, an elapsed reauth window and a failing `Touch` are not exercised
  on the upgrade path at all, despite each having its own branch in `HandleWS`.
- **The window-preservation invariant above.** The deadline elapsing is tested; a happy rotate
  *preserving* `SessionStart` is not, so the invariant would survive being broken.
- **Signout orchestration** — pinned since Stage B, end to end through the real router, store and
  query cache. See § Stage B.

**Little or none**

- **Cloud ESI credential failure paths** — the `user.ErrMongoStoredEsi*` mapping in `refresh.go`, and
  linked-character hydration on cloud bootstrap.
- **End to end.** No test drives a browser through login, rotate and signout against a running stack.

When this promotes, the API rows go to [testing/services/api.md](../../testing/services/api.md) and
the upgrade rows to [testing/services/websocket.md](../../testing/services/websocket.md); the SPA rows
go to the frontend testing entry when it is filled in.

## Stage records

Each stage adds its section here as it lands, stating what changed and how the surface behaves
afterwards.

### Stage A — one shape for a rejected session

**One writer answers every planner auth refusal.** `sessionreq.WriteCodedError` writes
`{"code","message"}` with `Content-Type: application/json` and `Cache-Control: no-store`. The REST
middleware, the rotate endpoint's `reauth_required` refusal and both websocket upgrade rejection
paths call it; the three separately maintained copies of that struct are gone, which is what let the
upgrade drift into plain text in the first place.

**The upgrade body is for operators, not browsers.** A refused handshake reaches a browser as a close
with no status and no body — the SPA states this in `websocketClient.js` and reacts by rechecking
app-config and reconnecting on backoff. So the envelope buys one vocabulary in logs and proxy traces,
and nothing more. What actually detects a terminal session is the rotate path: `runScheduledTokenRefresh`
and `runTabVisibleAuthRefresh` call rotate, which answers the coded 401 that
`enforceReauthDemand` acts on. The socket is not an auth-signalling channel and is not
being made into one.

**A Redis outage on the upgrade is a 503.** Both the session read and the `Touch` classify through
`dependency.IsUnavailable` and answer `503 redis_unavailable`, matching what the REST middleware has
done since the dependency split. Before this the upgrade answered `401 session_missing` for an
unreachable Redis, which sent a browser to a login it did not need.

**Two of the three terminal codes cannot be produced by the record path.**

- `reauth_required` — reading an account record prunes every session past its reauth deadline, so an
  elapsed session is gone before anything classifies it and the reader answers `session_missing`. The
  unreachable check in `ExtractSession` is removed and the reason recorded there: pruning is the
  single enforcement point, and a change that stops it removing expired sessions has to put a check
  back. The code still reaches clients from the rotate endpoint, which reads the deadline off the
  refresh-token row rather than the pruned record.
- `session_revoked` — nothing sets `Session.RevokedAt`. Revocation removes the row, which reads as
  `session_missing`. The reader is correct and now tested by seeding the field directly; the writer is
  Stage B's account-wide revoke, which wants exactly this tombstone.

**The failure-code vocabulary keeps `reauth_required`, though `ExtractSession` no longer raises it.**
`ClientFailureMessage` and `failureClass` in `shared/plannersession/request` name all three codes,
because they are the vocabulary an operator greps and the SPA switches on — not a list of what one
function returns. `reauth_required` is still live on the wire from the rotate endpoint, so its message
and class have to exist. `TestEveryFailureCodeHasItsMessageAndClass` pins every branch for exactly
this reason; the `SessionError` doc comment now says which codes the extract path produces and where
the third comes from, so the switches are not read as dead.

**Cookie clearing on a rejection code is moot** (#13). `sessionreq.SetSessionCookie` has no callers —
nothing issues `eip_session`. Only the clears remain, on logout and on `reauth_required` in the rotate
handler, for a cookie an older client may still be carrying. There is nothing for the middleware to
clear that those two do not already reach.

**The route guard and an API 401 answer different questions, deliberately** (#55). The guard
(`utils/authGuard.js`) reads client state — `account.isLoggedIn`, and for public routes
`hasResumablePlannerSession()` — and decides whether to render or send the tab to `/auth` to rebuild.
The 401 reflects the session record in Redis and decides whether a request is served. A tab can be
logged in by the guard while every request is refused, which is the window a rotate closes; the guard
is not a security boundary and must not be read as one.

### Stage B — revoking more than one session

**An account's sessions can be ended in one operation.** `Store.RevokeAllSessions` in
`shared/plannersession/revoke.go` is that operation, and `POST /api/v1/auth/sessions/revoke-all`
(private) is what calls it. It answers with what it ended — `sessions_revoked` and
`refresh_tokens_revoked`.

**A revoked session is tombstoned, and stays resolvable.** `RevokedAt` is written on every session in
the account's record and the `session_index` is deliberately left in place. That pair is what makes the
revoke an answer: the tab's next private request resolves its session, `ExtractSession` reads the
tombstone and refuses with `401 session_revoked`, and the SPA's terminal-code handling sends the reader
to EVE SSO. Removing the rows instead would answer `session_missing`, which is what an unknown session
answers, so a reader would not be able to tell a deliberate revoke from an expiry.

This gives `Session.RevokedAt` its first writer. Until now the field was read in two places and set by
nothing but a test.

**A rotate is not where the code comes from.** `ResolveTokenForValidSession` treats a revoked session as
`ErrRefreshTokenNotFound`, so the rotate endpoint says only that there is no token. Every private
request and the WebSocket upgrade go through `ExtractSession`, and that is what raises
`session_revoked`. Stage A's finding was that a refused *handshake* cannot carry a code to a browser —
not that only the rotate path can.

**The refresh tokens are collected in one walk.** `tokensForAccount` matches a stored row either by the
account id on it or by a session id being revoked, in a single pass of `refresh_token:*`. The
per-session helper it does not use, `tokensForSession`, scans that whole keyspace on every call, so a
loop over `RevokeSessionTokens` would have walked it once per open tab. The session-id half of the match
catches a token written before the account id was recorded on the row.

**Ordering inside the revoke is deliberate.** The tombstones are written first, then the tokens are
deleted. A failure between the two leaves every session already refused rather than alive with no way to
end it. Deleting a token clears its `session_refresh` entry, which `DeleteRefreshToken` already owns, so
the revoke does not clear indexes itself.

**The count is re-derived per attempt, not accumulated.** The tombstoning runs inside
`UpdateAccountRecord`, whose mutation is re-applied on every compare-and-set retry, so the report and
the session-id set are cleared at the top of the closure rather than added to across attempts. Without
that, an attempt whose write never landed would have its sessions counted again by the attempt that
did, and the endpoint would meter more sessions ended than the account ever held. This is the contract
`UpdateAccountRecord` already states — derive from the record you are handed — and it is now pinned at
that contract rather than at this one caller:
`TestUpdateAccountRecordRerunsTheMutationOnAConflict` forces a real conflict by writing the watched key
through miniredis directly, which bumps its version without going through the watched connection, so
the retry happens on every run rather than when the timing allows. A test that raced a second goroutine
against it instead never lost the `WATCH` at all, and passed whether or not the bug was present.

**A tombstone cannot outlive its session.** Nothing about a revoke moves the reauth deadline, so a
record read prunes a revoked session on the same schedule as any other, and every key carries a TTL
regardless.

**Nothing in the SPA calls it, deliberately.** Signing out everywhere is a support action, not something
a reader asks for from the app, so the endpoint is reached by hand. The device list that would have gone
beside such a control is declined for the same reason — see [plan.md](./plan.md) § Stage B.

**The sign-out order is pinned** (#54). `frontend/src/routes/signoutJourney.e2e.test.js` walks the app
to `/signout` through the real router and asserts what a reader is left with: the socket closes before
the server is told, the reader lands back on `/`, and the store, the query cache and the browser's
storage are empty. Only the socket and the logout call are stood in for — the store, the query cache,
the coalesce queue and the router are the real ones, so the test is over the teardown rather than over
a list of calls.

Two things it establishes that the route's own comments only asserted.

- **Dropping the coalesce queue is load bearing, and its reason is not the one the comment gives.** The
  comment says a pending flush could re-add jobs after `resetJobDataStore`. It could not: the flush
  reads `account.isLoggedIn`, and the account store is reset first, so it empties the queue and writes
  nothing. What the clear actually prevents is the flush outliving the sign-out entirely — a job
  delivered moments before, still waiting out its 80ms, reaching **the next reader to sign in on that
  tab**. The test signs back in before letting the timer run, which is the only sequence where the
  clear is the thing that saves it.
- **Each step of the teardown is separately covered.** Removing any one of the socket disconnect, the
  logout call, the coalesce clear, the account reset, the job-data reset, the query-cache clear, the
  storage clear or the ESI credential reset fails at least one of the six tests. The credential reset
  is the one no slice reset would have reached: held ESI access tokens live outside the store.

Not covered: the ordering of `resetAccountStore` ahead of the other slice resets. Its reason is an
in-flight account read re-merging `application_settings` after they are cleared, which needs a real
request in flight across the teardown to observe. The route's comment is the only record of it.

### Stage G — a callback the browser did not ask for

**Signing out by following a link is closed** (part 1). `/signout` tears the session down on arrival and
`SameSite=Lax` sends the session cookie on a top-level GET, so a link from any site — or a bookmark, or
a pasted URL — used to end a reader's session. The route now refuses unless the navigation carries a
mark the app puts there: `SIGNOUT_INTENT` in `Functions/Auth/signoutIntent.js`, passed as router history
state by the side menu and read from `location.state` in `beforeLoad`. History state belongs to a
navigation the app performed and cannot be written by a URL, which is the whole of why it works.

The check is strict — `state?.signOut === true` — so a near-miss shape does not pass, and the router's
own state keys do not either.

**Both exits from the route replace rather than push.** The click that starts a sign-out pushes a
`/signout` entry carrying the mark before `beforeLoad` runs. The success path replaces it, so nothing is
left for Back to land on. The failure path uses `window.location.replace("/")` for the same reason: a
bare `href` assignment pushes, which would have left the marked entry live and let Back replay the whole
teardown.

**A callback now has to answer a sign-in this browser started** (parts 2 to 4, landed together — an
exchange that verified a state only when one was present would be no defence, since an attacker would
omit it).

`POST /api/v1/eve-sso/sign-in-state` mints a 32-byte value, returns it, and adds it to `eip_sso_state`:
HttpOnly, Secure, `SameSite=Strict`, `Path=/api/v1/eve-sso`, ten minutes.

**Strict, not Lax**, and the reason is not the obvious one. The request that reads the cookie is not the
top-level return from `login.eveonline.com` — the path keeps the cookie off that entirely — but the
exchange the SPA issues afterwards from a page already on this origin. That is same-site however the
reader reached the page, so Strict sends it and buys the tighter default for nothing.

**The cookie holds a set, not a value.** Up to three sign-ins may be in flight, because two at once is
ordinary: a session expires in one tab while a character is being linked in another. A single-valued
cookie would let the second mint overwrite the first and refuse both.

**The mint refuses another site**, and this follows from Strict rather than being belt and braces. The
handler builds the new cookie from what the request carried, and Strict keeps the cookie off a
cross-site request — so a forged `POST` from any page would arrive looking like a browser holding
nothing, and the response would replace the reader's live sign-ins instead of adding to them. One such
request is enough to strand a login already under way. `Sec-Fetch-Site` is set by the browser and a page
cannot forge it.

A request carrying no `Sec-Fetch-Site` at all is allowed, and that is the limit of the check: Safari
before 16.4 and older WebViews hold cookies perfectly well and send no such header, so a forged mint
from one of those is still indistinguishable from the real thing. Refusing an absent header would stop
those browsers signing in at all, which is worse than what it prevents — the residual risk is a sign-in
stranded until the reader tries again, not access to an account.

`EveSSOExchangeHandler` now requires `state` in the body and checks it against that set in constant time
**before the code is spent** — refusing after trading the code with CCP would still have completed the
attacker's half. A match is removed, so a state answers one callback and no more. A mismatch removes
nothing: those values belong to sign-ins still in flight, and clearing them would let anyone able to
make a browser send one bad callback cancel the reader's real sign-in.

**The minted value is held in `sessionStorage`, not in the OAuth `state` parameter.** It has to survive
a full redirect to EVE and back, and `sessionStorage` does that without putting it in a URL that is
logged, shared and echoed by a third party. So `state` keeps carrying only where the reader was headed,
which is not secret and is still validated against the app's real routes on arrival — the settled
behaviour the stage asked about is unchanged, and the additional-account flow's `additional:<nonce>`
state is untouched.

**Every way into the exchange mints one.** Signing in, the header's own login button and linking a
character all trade a code, so all three prove the browser started it. `redirectToEveSSO` has exactly
one caller now — `redirectToFullEveLogin` — so a new entry point cannot skip the mint by reaching past
it. Linking mints before opening its popup rather than after: a popup blocked
or closed after a failed mint is a worse thing to explain.

**A sign-in that cannot be started does not start.** `redirectToFullEveLogin` awaits the mint and does
not leave for EVE without one, because the exchange would refuse whatever came back — so leaving anyway
would spend a trip through CCP to fail on return, and again on the next attempt. Linking reports it in a
snackbar and leaves the popup closed.

**`enforceReauthDemand` still answers synchronously** although the sign-in now begins with a request. It
reports that the tab is leaving, which is all any caller acts on, and every caller is already on a
failure path — so a mint that fails is logged rather than thrown. The visible change is that the
redirect lands a tick after the refusal that caused it, which the recovery tests now wait for rather
than assert outright.

**Not covered:** a reader who is genuinely mid-sign-in holds a valid state, so a callback delivered to
them in that window would be matched. Every `state` scheme has this property — the value binds a
callback to a browser, not to a particular code — and closing it would need the code bound at mint
time, which the OAuth flow does not allow.

### Stage C — what an operator sees when auth fails

Not started.

### Stage D — what a user sees when a cloud credential dies

Not started.

### Stage E — bootstrap that half-succeeds

The decisions, and the two items that closed or moved rather than shipping, are in
[plan.md](./plan.md) § Stage E. What has landed so far:

**A login that fails after minting leaves nothing behind.** `AuthHandler` mints a refresh token,
writes a session record, and only then reads Mongo. Both failure points between the mint and the
response now discard what exists, through `sessionmaint.DiscardMintedSessionBestEffort`, which removes
the refresh row, the session from the account record and the session index — the session write is not
atomic either, so a record that landed without its index is cleaned by the same call. The `Started`,
`Stored` and distinct-account metrics moved below the document read, so they count sessions a browser
actually received.

**Bootstrap does the opposite, and that is deliberate.** It revokes the presented refresh token before
the document read, so the row it minted is what the SPA's retry recovers through its `X-Session-ID`
header — `ResolveTokenForValidSession` finds it, and the retry supersedes it. Discarding there would
turn a failure the client already recovers from into a forced EVE login. `DiscardMintedSessionBestEffort`
carries that rule on itself so a later reader does not reach for it on a rotate.

**A cloud login hands back the roster, not the material.** The login response's `refreshTokens` rows
carry `characterHash` and nothing else. `TestLive_loginDoesNotHandBackTheStoredEsiSecret` asserts the
shape of the row rather than the absence of a planted string, because the login re-encrypts what it
refreshes and a plaintext sentinel would vanish on its own; without the strip the row carries
`rTokenCiphertext`, `rTokenNonce` and `rTokenKeyVersion`.

**Rotate and bootstrap set no cookies, and no longer pretend to.** `ApplyRotatedSessionCookies` was a
no-op taking six arguments and discarding all of them; it and `UseAppRefreshCookieOnResponse`, whose
only caller was its own test, are deleted. Identity on these routes is the `X-Session-ID` header and
the refresh token in the body. `SetEsiOAuthStorageCookieFromUserCloud` and
`SetTenantAffinityCookieAccount` are unaffected — those are not session material.

**The account planner is ensured twice on a bootstrap, deliberately.** `refresh.go` ensures before it
resolves grants, and the fatal ensure inside `ResolveUserDocumentsForLogin` runs after that resolve —
so the earlier call is what stops an account with a missing planner row receiving an empty grant list
on the very bootstrap that repaired it.

### Stage F — the security decisions that were never taken

Not started. Decisions are recorded in [plan.md](./plan.md) Stage F as they are taken.
