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

**Little or none**

- **Signout orchestration** — `routes/signout.jsx` has no test; the disconnect, logout and cache-clear
  ordering is unpinned.
- **Cloud ESI credential failure paths** — the `user.ErrMongoStoredEsi*` mapping in `refresh.go`, and
  linked-character hydration on cloud bootstrap.
- **End to end.** No test drives a browser through login, rotate and signout against a running stack.

When this promotes, the API rows go to [testing/services/api.md](../../testing/services/api.md) and
the upgrade rows to [testing/services/websocket.md](../../testing/services/websocket.md); the SPA rows
go to the frontend testing entry when it is filled in.

## Stage records

Nothing has landed yet. Each stage adds its section here as it does, stating what changed and how the
surface behaves afterwards.

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
`redirectToFullEveLoginIfTerminal` acts on. The socket is not an auth-signalling channel and is not
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

Not started. No longer waiting on anything: [shared-planners](../shared-planners/plan.md) Stage E has
landed, and it revokes a membership by rewriting the account's stored grants rather than by sweeping
session keys, so the account-wide revoke is separate work rather than a second copy of it.

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
