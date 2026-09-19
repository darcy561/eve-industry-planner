# Plan — auth hardening

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

## Why this project exists

The planner authentication stack shipped its hard parts and then stopped being tracked. What tracked
it was a roadmap living in `backend/api/auth/roadmap.md`, written before this repository used
migration projects, and never updated afterwards. By the time it was audited, roughly half its open
items had quietly shipped, three had been taken over by other projects, and its description of how
session grants work no longer matched the code. A backlog nobody trusts is worse than no backlog: it
made the auth stack look unfinished in places it is not, and finished in places it is not.

This project is the replacement. It carries the work that genuinely remains, grouped so that each
group is one investigation rather than a list of loose tickets, and it carries the audit that decided
what remains — [current-state.md](./current-state.md).

The old numeric ids are kept alongside each item. They appear in commit messages and in one live
document, and dropping them would break the only thread back to why an item exists.

## What this project is not

It is not a rewrite of authentication. Every stage below is a gap in an otherwise working system, and
several may close with a decision to do nothing — that is a legitimate outcome and should be recorded
as one rather than left open.

It is also not the place for anything another project owns. Refresh-token encryption in Mongo and the
entity ref model belong to [entity-id-encryption](../entity-id-encryption/plan.md); what a session's
grants mean and how membership revocation works belong to
[shared-planners](../shared-planners/plan.md). SPA token acquisition is finished work and its
behaviour is live SoT — [frontend/auth/spa.md](../../frontend/auth/spa.md). Where a stage touches
those, it says what it consumes.

## Stages

The stages are ordered by what unblocks what, not by size. Nothing here is blocked on another project
any more: B's wait on shared-planners ended when that project's Stage E landed. A, B, C, D and G are
independent of each other and can run in any order. E has landed, which settles the two handlers
everything else in `v1endpoints` edits. F is a set of decisions, not a set of changes, and should be
taken deliberately rather than drifting.

| Stage | Status |
|-------|--------|
| A — one shape for a rejected session | **Landed.** One shared refusal envelope across REST and the upgrade, the dependency split extended to the upgrade, and the upgrade's auth cases tested. The stage's premise was corrected on the way: a browser cannot read a refused handshake, so the envelope serves operators and the rotate path is what detects a terminal session. `Session.RevokedAt` has no writer, which passes to Stage B |
| B — revoking more than one session | **Landed.** `RevokeAllSessions` tombstones every session an account holds in one keyspace walk, `POST /api/v1/auth/sessions/revoke-all` calls it, and the sign-out teardown is pinned (#54). `Session.RevokedAt` now has its writer, which closes what Stage A owed. The SPA control and the device list are **declined**: this is a support tool, not something a reader reaches for |
| C — what an operator sees when auth fails | **Not started.** The Redis outage runbook is owed regardless of the counters |
| D — what a user sees when a cloud credential dies | **Not started.** Independent of everything else here |
| E — bootstrap that half-succeeds | **Landed.** The login handler discards what it minted at both failure points, the lifecycle counters moved below the document read, the ESI secret strip is asserted, and the no-op cookie helpers are deleted. #52 closed unchanged and #53 moved to shared-planners § Stage I. Behaviour: [overlay.md](./overlay.md) § Stage E |
| F — the security decisions that were never taken | **Not started.** Three decisions, each of which may legitimately close as declined |
| G — a callback the browser did not ask for | **Landed.** `/signout` ignores an arrival the app did not make, and the exchange refuses a callback carrying no state this browser was issued. The value is minted by a route of its own, held in `sessionStorage` and bound by an HttpOnly cookie |

---

### Stage A — one shape for a rejected session

**Carries:** #12, #13, #47, #55.

**Landed.** Behaviour: [overlay.md](./overlay.md) § Stage A.

The stage was scoped on a premise that did not survive reading the code: that making the upgrade
rejection a JSON envelope would let the SPA's terminal-code redirect fire on a failed handshake. A
browser cannot read the status or body of a refused WebSocket upgrade — the SPA says so in its own
comments and reacts by rechecking app-config and reconnecting. The envelope was still worth taking,
for logs and proxy traces, but it is not what tells a user their session is dead.

**Decisions taken**

- **The socket is not an auth-signalling channel** and is not being made into one. Accepting the
  upgrade in order to send a readable close frame was considered and declined: it allocates a real
  connection for an unauthenticated request and inverts rejecting before the socket exists. What
  detects a terminal session is the rotate path, which answers the coded 401 the SPA already acts on.
- **One writer, not one per surface** (#12). `sessionreq.WriteCodedError` replaced three copies of the
  same envelope struct. Three copies drifting is how the upgrade came to answer plain text.
- **The dependency split reaches the upgrade too.** Not in the stage as written, found while testing
  it: the upgrade answered `401 session_missing` when Redis was unreachable, on both the session read
  and the `Touch`. Both now answer `503 redis_unavailable`.
- **The unreachable reauth check is removed** rather than left as defence. Pruning deletes an elapsed
  session before the reader sees it, so the branch could not fire; `ExtractSession` now records that
  pruning is the single enforcement point and that a change there has to restore a check.
- **#13 closes as moot.** Nothing issues `eip_session`; only the clears in logout and rotate remain,
  for a cookie an older client may carry.
- **#55 closes as documentation.** The guard answers "render or rebuild", the 401 answers "serve or
  refuse", and they are allowed to disagree — see [overlay.md](./overlay.md) § Stage A.

**Owed to Stage B — closed**

`Session.RevokedAt` had no writer: logout removes the row, so `session_revoked` never reached a client
and the reader was exercised only by a test that seeded the field. **Closed.** Stage B's account-wide
revoke writes the tombstone, and leaves the session index in place so a refused request can read it.

**Done when** the two surfaces answer with the same shape, cookie clearing has a stated rule per code,
and `websocket/server` has upgrade tests for a revoked session, an elapsed reauth window and a failing
`Touch`. Met, with two honest qualifications: the elapsed-window test pins `session_missing` rather
than the `reauth_required` the stage assumed, and the `Touch` dependency branch is **not**
independently exercised — the outage test fails the session read first, so the request never reaches
`Touch`. Isolating it needs a store that fails only the second call, which the miniredis fixture
cannot express. The branch is the same three lines as the read branch above it.

**Two things deliberately not changed**

- **`Pragma: no-cache` is not carried into the shared writer.** The rotate handler's own refusal used
  to set it, and its success responses still do, as do three other credential-bearing responses.
  `Cache-Control: no-store` is what actually binds; spreading a request header used as a response
  header to a fourth place is not worth the consistency.
- **The dependency branches are duplicated per surface.** REST and the upgrade both run "if the
  dependency is unavailable answer 503, else answer the coded 401", against different response and
  logging plumbing. Forcing a shared helper across `helper.RespondEndpointError` and
  `wsUpgradeRejectServer` would hide more than it saves — but this is the shape that drifted last
  time, so Stage C should look at it before adding more branching here.

---

### Stage B — revoking more than one session

**Carries:** #21, #30, #54.

Logout revokes the session that presented itself. There is no way to revoke every session an account
holds, which is what a support request after a compromised machine actually needs, and there is no
way for a user to see what sessions exist. `sessions.md` § 14 names the gap directly.

**Landed.** The store operation, the endpoint that calls it, the tombstone decision and the sign-out
test are in, and the SPA half is declined rather than outstanding. Behaviour:
[overlay.md](./overlay.md) § Stage B.

**The reason it was blocked did not survive.** The stage waited on
[shared-planners](../shared-planners/plan.md) Stage E on the premise that revoking a membership and
revoking an account's sessions were the same work seen from opposite ends, so building this first
would produce a second sweep over the same keys. Stage E has landed and what it built is
`sessiongrants.WriteFromMemberships`: it rewrites the account's stored **grants** from its membership
rows and announces them, and touches no session row, no index and no refresh token. That is the right
shape — losing one planner narrows a live session's ceiling rather than ending the session — and it
means the two operations share a record, not a sweep.

That answers the first half of this stage's own store question before it is asked, and it settles
the § Stage I dependency too: the ceiling is where a revocation is applied, so the stored snapshot is
load bearing and the route this stage consumes is not going to change under it.

**Decisions taken**

- **A revoked session is tombstoned, not deleted** (#21). `Store.RevokeAllSessions` writes `RevokedAt`
  on every session and **leaves the `session_index` in place**, because the two together are what turn
  a revoke into an answer: the next request the tab makes resolves its session, finds the tombstone and
  is refused `session_revoked`, which the SPA already treats as terminal and acts on by going back to
  EVE SSO. Deleting the rows would answer `session_missing` — what an unknown session answers — and the
  reader would learn nothing. This gives `Session.RevokedAt` its first writer, which closes what Stage A
  left owed. The cost is that rows live until their reauth deadline; pruning and the key TTLs already
  bound that, and a test pins that a tombstone cannot outlive its session.
- **The refusal comes from the middleware, not the rotate path.** Worth stating because this stage was
  scoped believing otherwise: `ResolveTokenForValidSession` collapses a revoked session into
  `ErrRefreshTokenNotFound`, so a rotate says only "no token". The code the browser acts on is raised by
  `ExtractSession`, which every private request and the upgrade go through. Stage A's finding was that
  the *socket* cannot carry a terminal code, not that only the rotate can.
- **One keyspace walk, not one per session.** `tokensForAccount` collects an account's refresh tokens in
  a single pass, matching either the account id on the row or a session id being revoked — the second
  catches a token written before the account id was recorded on it. Building the revoke out of
  `RevokeSessionTokens` would have walked the whole `refresh_token:*` keyspace once per session.
- **The tab that asks is revoked with the rest.** This answers a machine somebody else has, and the
  requesting tab is no more trustworthy than the others; it finds out the same way they do.

- **The revoke stays server-side, and the device list is declined** (#30). No SPA control calls the
  endpoint and none is planned: this answers a support request about a machine somebody else has, which
  arrives as a support request rather than as something a reader reaches for in the app. A device list
  was the other half of #30 and goes with it — it would be built from what the record already carries
  (`StartedAt`, `LastSeenAt`, `AppVersion`, `ReauthRequiredAt`, `CharacterHash`; no address and no user
  agent are stored), so it was never the privacy question it looked like, but a list nobody is shown is
  not worth building. Reopening either is a product decision, not unfinished work.

**Still owed here**

Nothing.

~~Whether signout's ordering is load bearing, and pinning it with a test (#54).~~ **Done.** It is, and
`signoutJourney.e2e.test.js` pins it end to end. One of the two reasons written on the route turned out
to be wrong about its own mechanism — see [overlay.md](./overlay.md) § Stage B.

**Done when** an account's sessions can be revoked in one operation, `Session.RevokedAt` either has a
writer or is gone, and the signout ordering is pinned. **Met.**

---

### Stage C — what an operator sees when auth fails

**Carries:** #14, #22, #56, #11.

Session lifecycle metrics are good: starts, continuations, ends, stores and store errors, plus a
refresh duration histogram. What is missing is everything about failure. There is no counter for
rejections keyed by code, so an outbreak of `reauth_required` and an outbreak of `session_missing`
look the same from outside. There is no counter for the optimistic-locking retries in
`shared/plannersession`, which is the signal that would have shown the contention behind the incident
that motivated those CAS writes in the first place. The maintenance sweep reports nothing about what
it revoked.

Alongside that, the `503` split landed — a Redis outage is no longer misreported as a missing
session — but no operator document says what a `503` on an auth route means or what to do next.

**What this stage has to answer**

- Which counters are worth carrying, keyed how. `auth_session_reject{code}` is the obvious one; the
  cardinality is bounded by the three terminal codes plus the dependency case.
- Whether the WebSocket's existing `recordUpgradeError` reason codes and the API's rejection codes
  should be one vocabulary. They describe the same event on two surfaces.
- Whether every auth handler failure carries `session_id`, `account_id` and the flow it was in
  (#56) — this needs a pass handler by handler, not a spot check.
- Where the Redis outage runbook lives. It is operator guidance, so it promotes into live
  documentation rather than staying here.
- Whether the reauth deadline should be visible to the user at all (#11). It is already stored per
  tab and read by nothing; showing it in a settings or debug surface is cheap and makes a support
  conversation shorter, but it is a product call.

**Done when** a rejection can be counted by its cause, an auth failure log carries the identity it
concerns, and an operator hitting a `503` has somewhere to read.

---

### Stage D — what a user sees when a cloud credential dies

**Carries:** #49, #50, #42.

`refresh.go` maps the whole `user.ErrMongoStoredEsi*` family — not cloud, no row, user not found,
keyring, decrypt, persist, invalid grant — to status codes with care. None of that reaches the user
as an explanation. A cloud account whose stored ESI refresh token CCP has invalidated gets the same
blank failure as one whose keyring is misconfigured, and the two need opposite responses: one is
re-authorise, the other is tell the operator.

**What this stage has to answer**

- Which of those error classes are user-actionable, which are operator-actionable, and which are
  neither. The mapping already exists in the handler; this is deciding what each class *means*.
- How that reaches the SPA. The rotate and bootstrap responses have no field for it today, so this is
  a wire question — see § Wire compatibility.
- What happens to the other linked characters when one character's credential dies. Cloud bootstrap
  returns per-character tokens and nothing asserts they survive into the store (#50).
- How the API's deferral when CCP's token endpoint is failing lines up with the SPA's Tranquility
  gate (#42). Both exist; whether they agree has never been written down. The limiter gate's
  behaviour is already covered by `sso/refresh_route_test.go`, so this is documentation plus
  whatever that documentation exposes as a mismatch.

**Done when** a dead cloud credential produces a message the user can act on, the linked-character
path has a test, and the outage story is written in one place.

---

### Stage E — bootstrap that half-succeeds

**Carries:** #45, #43 residual, #52, #53.

Login and bootstrap both mint session material in Redis and then read the account's documents out of
Mongo. If that read fails, the material already exists. Neither handler decides what should happen to
it, and the two are not equally exposed.

**What the investigation found**

- **The cookie question has no subject.** `auth.ApplyRotatedSessionCookies` is a no-op that discards
  all six of its arguments: per-tab sessions moved identity onto the `X-Session-ID` header and a body
  `refresh_token`, and rotate and bootstrap set no session cookie at all. The question is therefore
  whether the *response body* carrying the new refresh token ever reaches the client, not whether
  cookies go out. The dead wrapper is called from two sites in `refresh.go` and goes with this stage.
- **Bootstrap recovers on its own.** The SPA sends `X-Session-ID` on the bootstrap call and retries a
  `5xx` up to three times, and `ResolveTokenForValidSession` finds the orphaned new refresh row by
  session id. The retry then revokes it as superseded, so the orphan does not accumulate. A tab is
  lost only if Mongo is still failing after the last attempt.
- **`AuthHandler` is the exposed one.** It mints the refresh token, writes the session record,
  increments `Started` and `RecordAuthSessionDistinctAccount`, and only then resolves the documents.
  On failure nothing revokes what it minted and the client holds no session id to recover with, so
  every attempt leaves an orphan and inflates the lifecycle counters Stage C is about to build on.

**Decisions taken**

- **#45 — revoke, then fail, on the login handler only.** `AuthHandler` discards the refresh token,
  the session record and its index at both failure points between the mint and the response, and its `Started`, `Stored` and
  distinct-account metrics move to after the document read succeeds. Bootstrap is deliberately left
  alone: it revokes the presented token before the read, so the row it minted is the only thing a
  retry can recover through its session id, and discarding it would turn a failure the SPA already
  recovers from into a forced EVE login. The distinction is the whole of the difference between the
  two handlers — the login response is the only place a session id reaches the browser. The
  alternative orderings were considered and rejected: moving the Mongo read ahead of the Redis writes
  reorders both handlers for a failure that is already recoverable on one of them, and declaring the
  orphan acceptable leaves a Mongo outage silently inflating the session counters.
- **#52 — closed, no change.** The worker's `update_account_session_grants` task is not a duplicate of
  the handler's inline resolve. The task is the only thing that calls ESI affiliation, writes the
  corporation and alliance caches and reconciles membership rows; the handler only projects rows that
  already exist into the grants list. Different jobs, and the task remains the one that discovers a
  membership.
- **#53 — handed to [shared-planners](../shared-planners/plan.md) § Stage I.** The grants list has one
  non-test reader: the websocket's connect-time ceiling, which decides whether a client may switch its
  active planner into that owner's fan-out pool. Every REST route authorises from the membership rows
  in Mongo instead. So a failed fill costs a session its live shared-planner updates and nothing else,
  and whether the fill should be fatal cannot be answered without deciding whether the stored list
  survives at all — which is that project's § Losing access, § Stage E revocation path and § Stage F
  grant task. This project stops tracking #53; the wire-breaking change it implied is withdrawn.

**Still owed here**

Nothing. The remaining items closed as follows.

- **The ESI refresh-secret strip is asserted** (#43 residual), in a live test. The assertion is on the
  shape of each `refreshTokens` row rather than on a planted secret string: the login re-encrypts
  what it refreshes, so a plaintext sentinel disappears whether or not anything strips it — the first
  version of this test passed with the strip removed and proved nothing. Without the strip the row now
  carries `rTokenCiphertext`, `rTokenNonce` and `rTokenKeyVersion` into the response, which is what
  fails.
- **The dead cookie helpers are gone.** `ApplyRotatedSessionCookies` and its two call sites, plus
  `UseAppRefreshCookieOnResponse`, which had no caller outside its own test.
- **`EnsureAccountPlanner` keeps both calls.** It looked like a duplicate and is not: `refresh.go`
  must ensure before it resolves grants, and on a bootstrap the fatal ensure inside
  `ResolveUserDocumentsForLogin` runs *after* that resolve. Dropping the earlier call would hand an
  account with a missing planner row an empty grant list on exactly the bootstrap that repaired it —
  the failure the existing comment was written to prevent. The comment now says so, so the call is not
  deleted as redundant later.
- **`auth.SetAppRefreshCookie` is now dead and was left alone.** Nothing calls it; `ReadAppRefreshCookie`
  and `ClearAppRefreshCookie` still have callers, because the server reads and clears a cookie an older
  client may still be carrying. Deleting the setter is a decision about how long that is tolerated
  rather than a cleanup, so it is not taken here.
- **Nothing from `go fix` in this package.** Re-running it against the tree shows all three
  suggestions are refusals, not just the `omitempty` one: the two composite-literal rewrites fold the
  per-tab cookie comment inside the struct literal and weld `RefreshToken: …}` onto the closing brace,
  which is worse than what is there. See [current-state.md](./current-state.md) § Go modernisation in
  the touch surface.

**Done when** the login half-success leaves nothing behind and has a test, the lifecycle counters
only count sessions a client received, bootstrap's recovery is stated rather than assumed, the strip
is asserted, and the dead cookie wrapper is gone.

---

### Stage F — the security decisions that were never taken

**Carries:** #19, #32, #31.

Three items sat open for long enough that "open" stopped meaning anything. Each is a decision, and
each can legitimately close as declined — but it should close.

- **Planner refresh tokens are plaintext in Redis** (#19). [sessions.md](../../backend/api/auth/sessions.md)
  § 8 states this as deliberate: Redis is the trust boundary. The question is whether that still holds
  now that Mongo's refresh tokens are encrypted at rest, or whether the asymmetry is the anomaly.
- **No CSRF defence** (#32). The session cookie is `HttpOnly` and the SPA sends a per-tab
  `X-Session-ID` header that a cross-site form cannot set. The cross-site sweep recorded at
  [current-state.md](./current-state.md) § The cross-site sweep narrows the question: `SessionID()`
  **prefers** the header and falls back to the `eip_session` cookie, so it is not a double-submit
  defence — `SameSite=Lax` is what holds the line. The decision is whether to require the header on
  state-changing endpoints, leaving the fallback to the two paths that need it: the refresh recovery
  in `refresh.go`, and the WebSocket upgrade, which reads the id from a query parameter because a
  browser cannot set a header on `/ws`.
- **A reauth window fixed at seven days** (#31). Making it vary by scope is only worth anything if
  there is a scope that deserves a different number.

**Done when** each has an answer recorded in this file, and the ones that survive have a stage.

---

### Stage G — a callback the browser did not ask for

**Found** when the OAuth `state` stopped carrying paths, which left the question of what it is
*for*. What it carries today, and what a returning value is validated against, is
[frontend/auth/spa.md](../../frontend/auth/spa.md) § Signing in.

Nothing checks that a sign-in callback answers a sign-in this browser started. `useAuthUrlLogin`
reads `state` off the callback URL and never consults it before handing `code` to
`POST /api/v1/eve-sso/tokens/exchange`, and `AuthHandler` derives the account from the character hash
in the resulting token without reading any cookie already present. So a crafted
`/auth?code=<attacker's code>` signs a reader into **the attacker's** character, and anything they
build afterwards lands in the attacker's planner.

**The check that looks like it covers this does not.** `/auth`'s `beforeLoad` redirects a signed-in
reader away before the callback is ever handled — but it reads `isLoggedIn` from a Zustand store that
is module state, and a cross-site link is a full document load, so the store is at its defaults and
the reader reads as signed out. `/auth` is `transient`, so the root guard deliberately does not
resume a session there either. The guard protects in-app navigation to the sign-in page, which was
never the exposure.

**What this stage has to answer**

- Where the value is minted. The exchange already goes through the API
  (`v1endpoints/sso/exchangeHandler.go`), so the server is the chokepoint and can refuse — which a
  client-side check cannot, since the attacker's target is a browser they are already steering.
- What binds it to the browser. A value the API issues must come back from the same browser, which
  means a short-lived `HttpOnly` cookie beside it; a value the SPA alone remembers can be produced by
  an attacker from their own browser.
- Whether `AuthHandler` should also refuse to mint a session for one account while a valid session
  cookie names another. On its own it inherits the same weakness — a fresh document has no cookie to
  compare — so it is a second line rather than the fix.
- Whether the return location keeps riding in `state` beside the minted value. It is not secret and
  is validated against the real routes on arrival, so it can; that keeps the settled behaviour that
  the URL carries where a reader was headed.

**Also here: signing out by following a link.** `/signout` tears down in `beforeLoad`, so arriving is
enough, and `SameSite=Lax` sends the session cookie on a top-level GET — so a link from any site
signs a reader out. The router carries history state a URL cannot (`ParsedLocation.state`), so the
menu can mark the navigation as deliberate and the route can decline to tear down without it. No
extra click, and a pasted or bookmarked `/signout` stops being a logout too. Watch what a reload of
`/signout` replays.

**The parts, smallest first**

1. ~~`/signout` declines to tear down unless the app marked the navigation.~~ **Landed.** The mark is
   router history state, which a URL cannot carry — behaviour in [overlay.md](./overlay.md) § Stage G.
2. ~~A route that mints a sign-in state, sets it in a short-lived `HttpOnly` cookie and returns the
   value.~~ **Landed** as `POST /api/v1/eve-sso/sign-in-state`.
3. ~~`EveSSOExchangeHandler` takes `state`, compares it with the cookie, clears it, and refuses on a
   mismatch.~~ **Landed**, and the comparison happens before the code is spent.
4. ~~The SPA calls the mint before leaving for EVE and sends the value with the code.~~ **Landed**, for
   signing in and for linking a character, which trades a code the same way.

**Decided: the mint is a route of its own.** The sign-in calls nothing before it leaves for EVE, so
there was no existing request to hang it on; attaching it to an unrelated one would set the cookie on
page loads that are not signing in. It costs a round trip before every sign-in.

**Decided: the value does not ride in `state`.** It is held in `sessionStorage`, which survives the
redirect without putting it in a URL a third party echoes. `state` keeps carrying only the return
location, which was the settled behaviour this stage asked whether to keep.

**Decided: a sign-in that cannot be started does not start.** The exchange refuses a callback with no
state, so leaving for EVE without one spends a trip through CCP to fail on the way back and then
repeats. Behaviour: [overlay.md](./overlay.md) § Stage G.

**Done when** a callback whose `state` the API did not issue to that browser cannot mint a session,
and arriving at `/signout` without the app having sent you there does not end a session. **Met.**

---

## Wire compatibility

Assessed for every stage that could touch a client-visible surface.

| Change | Class | Note |
|--------|-------|------|
| WebSocket upgrade rejection body becomes JSON (Stage A) | **Additive in practice** | The SPA's `parsePlannerAuthCodeFromText` already reads a code out of either a JSON body or a bare string, so a JSON body is understood by clients that predate the change. Anything else reading the upgrade body would see a changed string. |
| Clearing cookies on a rejection code (Stage A) | **Additive** | A `Set-Cookie` on a 401 that carried none before. |
| Account-wide revoke endpoint (Stage B) | **Additive** | A new route, `POST /api/v1/auth/sessions/revoke-all`. Landed. |
| Minting a sign-in state (Stage G) | **Additive** | A new route and a new short-lived cookie; nothing existing changes shape. Landed. |
| The exchange requiring `state` (Stage G) | **Breaking for a client that does not send it** | Landed. Only this SPA calls `/api/v1/eve-sso/tokens/exchange`, and it ships with the change. A sign-in already in flight across the deploy fails and is retried by signing in again. |
| New counters and log fields (Stage C) | **Additive** | Telemetry only. |
| A credential-failure reason on the rotate and bootstrap responses (Stage D) | **Additive** | A new optional field; older clients ignore it. |
| ~~Failing bootstrap where it currently warns (Stage E)~~ | **Withdrawn** | The grants fill it referred to is #53, now [shared-planners](../shared-planners/plan.md) § Stage I. Nothing left in this project makes a warned failure fatal. |
| Dropping `omitempty` from the bootstrap response's `user_document` and `application_settings` (the `go fix` suggestion in `session_types.go`) | **Breaking** | Both fields would always be emitted. Not to be applied as a modernisation — see [current-state.md](./current-state.md) § Go modernisation in the touch surface. |

Nothing in this project changes a Redis key layout, a cookie name, or a persisted document shape.

## Done when

- Every stage above has either landed or closed with a recorded decision.
- The behaviour facts held in [overlay.md](./overlay.md) have promoted into live documentation.
- Nothing in the live tree points at a retired auth roadmap.

## Promote

The retired roadmap was removed when this project was created, because a planning document in the
live tree is itself the defect this project was opened to clean up. What it carried that is worth
keeping is held in [overlay.md](./overlay.md) and promotes as follows.

1. § Session window invariants → [backend/api/auth/overview.md](../../backend/api/auth/overview.md),
   which already documents the reauth deadline but not the rule that a rotate must not slide it.
2. § Auth test coverage → [testing/services/api.md](../../testing/services/api.md) and
   [testing/services/websocket.md](../../testing/services/websocket.md), in the coverage-map shape the
   testing documentation rules prescribe.
3. The Redis outage runbook produced by Stage C → wherever backend operational guidance lands; it is
   operator-facing, so it does not stay in this folder.
4. **The cookie story in live SoT is out of date and this project owes the correction.**
   [overview.md](../../backend/api/auth/overview.md) and
   [sessions.md](../../backend/api/auth/sessions.md) both describe rotate and bootstrap as setting or
   rotating `eip_app_refresh`, and the browser as holding it. Nothing has issued that cookie since
   per-tab sessions landed, and Stage E removed the no-op that pretended to. The corrected picture is
   § Session window invariants in [overlay.md](./overlay.md).

5. **[sessions.md](../../backend/api/auth/sessions.md) is stale on four counts** after Stage A. It
   names `writeAuthError`, which no longer exists; it documents `ExtractSession`, the middleware and
   the websocket upgrade as able to answer `reauth_required`, which only the rotate endpoint now does;
   its § 7 upgrade walkthrough has no `503` dependency split; and it lists `Pragma: no-cache` on the
   middleware's error response, which the shared writer does not set.

6. **[sessions.md](../../backend/api/auth/sessions.md) owes the account-wide revoke** once Stage B
   promotes: § 3.6 gains `RevokeAllSessions`, § 6 gains the endpoint, § 10 gains the route, and § 14's
   "Bulk revoke of every session an account holds is not built" is no longer true. § 3.3 should also say
   that `revoked_at` now has a writer and that a revoked session keeps its `session_index` on purpose.

7. **The sign-in state is new live surface** that Stage G added: `sessions.md` § 5 gains `eip_sso_state`
   and § 10 the mint route, and [frontend/auth/spa.md](../../frontend/auth/spa.md) § Signing in has to
   say that a sign-in starts with a mint and that the value is held per tab rather than carried in the
   OAuth `state`.

Then delete this folder and its row in [`../contents.md`](../contents.md).

## Recommended pickup order

1. **Stage C** — makes the rest measurable, and the runbook is owed regardless.
2. **Stage D** — independent; can run alongside any of the above.
3. **Stage F** — decisions, whenever there is appetite to take them.
