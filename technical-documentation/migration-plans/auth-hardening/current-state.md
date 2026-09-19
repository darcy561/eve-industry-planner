# Current state — what the auth stack actually has today

This is the audit that produced [plan.md](./plan.md). The planner auth stack carried a roadmap under
`backend/api/auth/roadmap.md` from before migration projects existed, and it was never updated after
that. Every claim it made was checked against the code as it stands. The result splits three ways:
work that has since shipped, work that is genuinely still open, and work that another project took
over.

The evidence is recorded here rather than summarised, so that a later reader can tell whether a
verdict still holds without repeating the sweep.

**Re-checked after the SPA token acquisition work landed.** That branch rewrote much of
`Functions/Auth/`, so the verdicts it could have moved were taken again against the merged tree rather
than assumed. Three changed: #8's evidence moved file, #16 grew from five test files to fifteen, and
#11 narrowed. #54 did **not** close, though it was expected to — `signout.jsx` gained no test on the
incoming side.

## What has shipped

These were open items on the retired roadmap. Each is now covered by code and, where the item was a
test gap, by tests that exist and run.

| Old id | Item | Evidence |
|--------|------|----------|
| #40, #41 | SSO exchange and refresh handler tests | `services/api/v1endpoints/sso/refresh_route_test.go` — ten tests covering both routes: a token the app can use, a code traded for a token, bodies the handler cannot use, a refused token reported as the server answering, silence reported as an outage, and both routes still serving while the limiter gate is closed. `sso/helpers_test.go` covers the `isSSOGrantClientError` mapping the roadmap asked for. |
| #15 | Refresh state machine tests | `services/api/v1endpoints/session_lifecycle_test.go` — unknown token, revoked token, reauth required once the window elapses, still refused afterwards, token left stored when the rotate does not complete, malformed body, non-POST. |
| #43 | Login handler tests | Same file — a token signed by another issuer, an expired token, a malformed request, a non-POST request. `live_session_lifecycle_test.go` covers minting a session the browser can use, reporting first login exactly once, logout ending only that session, and a cloud login handing back the linked-character roster without the stored ESI material. |
| #44 | Logout handler tests | `session_lifecycle_test.go` — revokes the session, clears its cookies, leaves other sessions alone on an unknown token, rejects a malformed request and a non-POST request. |
| #46 | `Store.Touch` failure semantics | `services/api/middleware/auth.go` classifies through `dependency.IsUnavailable` and answers `503` rather than folding a dependency outage into `session_missing`. Documented in [sessions.md](../../backend/api/auth/sessions.md) § 11. |
| #8 | The SPA parses the auth code out of a response | `parsePlannerAuthCodeFromText` in `frontend/src/Functions/Auth/plannerSessionRedirect.js`, which reads `code` off the JSON body; `sessionClient.js` calls it and attaches the result to the thrown error as `err.code`. |
| #9 | Explicit `reauth_required` / `session_missing` handling | `frontend/src/Functions/Auth/plannerSessionRedirect.js` parses the code from a JSON body and classifies which codes are terminal; `plannerSessionRedirect.test.js` pins both. |
| #10 | A private fetch that returns a terminal auth code resets auth | `handleTerminalPlannerAuthResponse` in `frontend/src/Functions/Endpoints/Private/applyPrivateHeaders.js` redirects to a full EVE login. |
| #16 | Frontend auth tests | Fifteen files across `Functions/Auth/` (including `esiCredentials/`), `Components/Auth/` and `Zustand/account/`, covering the credential provider and both storage strategies, planner session recovery, the terminal-code classification, cloud session handling, token lifetime, and that a rotation renders nothing. Depth is inventoried in [testing/frontend/auth.md](../../testing/frontend/auth.md). |
| #51 | Additional account import window | `tryCompleteAdditionalAccountImportWindow` has regression coverage in `Components/Auth/additionalAccountImport.test.js`. |
| #12 | Every planner auth refusal answers one envelope | `sessionreq.WriteCodedError` is the single writer for the REST middleware, the rotate refusal and both websocket upgrade paths. The upgrade body serves logs and proxies: a browser cannot read a refused handshake. |
| #47 | The upgrade's auth cases are exercised | `integration_connect_test.go` adds a revoked session, an elapsed reauth window, the shared envelope itself, and a Redis outage answering `503` rather than `401`. |
| #13 | Cookie clearing on a rejection code is moot | `sessionreq.SetSessionCookie` has no callers; only the clears in logout and rotate remain, for a cookie an older client may carry. |
| #55 | The guard and the 401 answer different questions | Documented in [overlay.md](./overlay.md) § Stage A: the guard decides render-or-rebuild from client state, the 401 decides serve-or-refuse from the session record, and they may disagree. |
| #45 | A login that fails after minting leaves nothing behind | `authenticate.go` discards the refresh token, the session record and its index at both failure points between the mint and the response, through `sessionmaint.DiscardMintedSessionBestEffort`. `TestLoginLeavesNothingBehindWhenTheDocumentsCannotBeRead` and `TestLoginLeavesNothingBehindWhenTheSessionCannotBeStored` pin it. Bootstrap deliberately keeps its material — see [plan.md](./plan.md) § Stage E. |
| #43 (residual) | A cloud login does not hand back the stored ESI secret | `TestLive_loginDoesNotHandBackTheStoredEsiSecret` asserts every `refreshTokens` row in the login response carries `characterHash` and nothing else. |
| #48 | Session resume does not depend on the planner session id | `services/websocket/server/ws_session_resume.go` resumes on `previousClientID`, and `integration_scopes_resume_test.go` exercises it. |

The consequence for the retired roadmap's test coverage matrix is that every row it marked as a gap
was filled except the WebSocket upgrade's session cases and end-to-end coverage. The corrected
picture is in [overlay.md](./overlay.md) § Auth test coverage.

## What is still open

Each of these was checked directly, not inferred from the roadmap's own status column.

| Old id | Item | Evidence that it is still open |
|--------|------|-------------------------------|
| #11 | The reauth deadline is never shown to the user | Narrowed. It is no longer inert: `isPlannerReauthDeadlinePassed` gates `ensurePlannerSession`, so a session past its deadline goes to a full EVE login instead of attempting a rotate that would be refused. What is still missing is any warning before that happens — the deadline is acted on, never displayed, so the redirect arrives without notice. |
| ~~#54~~ | ~~Signout orchestration is untested~~ | **Closed under Stage B.** `signoutJourney.e2e.test.js` walks the real router to `/signout` and pins the whole teardown, the held ESI access tokens included. Behaviour: [overlay.md](./overlay.md) § Stage B. |
| #14 | Rejection and contention are not measured | Session lifecycle metrics exist and are good — `api.auth_sessions.started_total`, `continued_total`, `ended_total`, `stored_total`, `store_errors_total` and the `api.session_refresh.*` family in `services/shared/telemetry/apimetrics/instruments.go`. What is missing is a counter for rejections keyed by code, a counter for the optimistic-locking retries in `shared/plannersession`, and counts from the maintenance sweep. |
| #56 | Auth failure logs are not uniformly shaped | The middleware and the WebSocket upgrade both attach structured detail, and `refresh.go` attaches caveats; whether every auth handler failure carries `session_id`, `account_id` and the flow has not been checked handler by handler. |
| #22 | No Redis outage runbook | The code half is done — the `503` split landed with #46 — but there is no operator document saying what a `503` on an auth route means or what to do about it. |
| #49 | Cloud ESI credential errors have no user-facing copy | `refresh.go` maps the whole `user.ErrMongoStoredEsi*` family to status codes; none of it reaches the user as an explanation. |
| #50 | Linked-character hydration on cloud bootstrap is untested | The bootstrap response carries `LinkedCharacters`; nothing asserts the per-character tokens survive into the store. |
| #42 | CCP outage behaviour is undocumented | The limiter gate is exercised by `sso/refresh_route_test.go`, but how deferral is meant to line up with the SPA's Tranquility gate is written down nowhere. |
| #19 | Planner refresh tokens are plaintext in Redis | [sessions.md](../../backend/api/auth/sessions.md) § 8 states it as current behaviour: Redis is the trust boundary. Never revisited. |
| #32 | No CSRF defence | `grep -rni csrf services/ frontend/src` returns nothing. |
| ~~#30~~, #31 | ~~Logout everywhere, device list~~, configurable reauth window | **#30 closed under Stage B**: logout everywhere is built as a server-side endpoint, and the device list is declined with it. #31 is Stage F. |
| ~~#21~~ | ~~Account-wide revocation~~ | **Closed under Stage B.** `Store.RevokeAllSessions` and `POST /api/v1/auth/sessions/revoke-all`. `sessions.md` § 14 still says it is not built and is corrected on promote — see [plan.md](./plan.md) § Promote. |

## Superseded or owned elsewhere

| Old id | Where it went |
|--------|---------------|
| #57 | **Closed by work that shipped.** SPA token acquisition was rebuilt around a credential provider that resolves a token at the point of use, and the React-mounted maintenance clocks were deleted rather than relocated — so the lifecycle supervisor #57 proposed has nothing left to own. Current behaviour is [frontend/auth/spa.md](../../frontend/auth/spa.md). |
| #17, #18 | **[entity-id-encryption](../entity-id-encryption/plan.md).** That project reports the code half landed; what remains is one operator sweep against real databases and retiring the plaintext refresh-token fallback. Restating a status here would give it two homes. |
| #21 | **Premise changed, not moved — [shared-planners](../shared-planners/plan.md).** A session's grants stopped being a cached list of corporation and alliance ids: Stage B made them `models.SessionGrants` owner keys and Stage C repointed the fill at membership rows, which is why `refresh.go` now calls `mongo.OwnerKeysForAccount` rather than reading a claims cache. That project's Stage E has since built the membership revocation path, and it rewrites stored grants rather than sweeping session keys. What survives for this project is the session-side half — account-wide revocation, see [plan.md](./plan.md) Stage B. |
| #52 | **Closed, no change.** The worker's `update_account_session_grants` task is not a duplicate of the handler's inline resolve: it is the only caller of ESI affiliation and the only writer of membership rows, while the handler projects rows that already exist. Recorded at [plan.md](./plan.md) § Stage E. |
| #53 | **[shared-planners](../shared-planners/plan.md) § Stage I.** The grants list has one non-test reader — the websocket's connect-time ceiling — so whether a failed fill should refuse a session cannot be answered without deciding whether the stored list survives at all. |

## Facts the retired roadmap got wrong

These were stale statements in the document body rather than backlog items, and they are the reason
the file could not simply be pruned.

- The layer reference described session grants as "corp/alliance IDs on session". They are owner keys
  resolved from membership rows. The `custom_claims_corporations:` and `custom_claims_alliances:`
  Redis keys named in the system map do still exist, in `shared/plannersession/keys.go`.
- The metrics items pointed at `apimetrics` as an API-service package. It is
  `services/shared/telemetry/apimetrics` and has been shared since the service boundary work.
- The test coverage matrix was wrong in six of its rows, all in the same direction.
- The "Obsolete / external references" section existed to name a retired practice — the internal JWT
  and its JWKS — which is exactly what the documentation rules put out of live documentation.
- The incident appendix recorded a production failure from May 2026 whose entire value has been
  absorbed into the behaviour it produced: the reauth gate, the index cleanup, the CAS writes and the
  orphan sweep, all of which are current behaviour documented in `sessions.md`.

## The cross-site sweep

Run when the OAuth `state` stopped carrying paths, which asked what it is actually for. The
evidence is here rather than only in the stage, so a later reader can tell whether a verdict still
holds without repeating the sweep.

**Sound as it stands.**

- Every cookie the stack sets is `Secure` and `SameSite=Lax` — `plannersession/request/cookie.go`,
  `helper/auth/app_refresh_cookie.go`, `esi_oauth_storage_cookie.go`, `tenant_affinity_cookie.go`.
  The session and app-refresh cookies are `HttpOnly`; the ESI OAuth storage hint is deliberately not,
  because the SPA reads it.
- CORS is an explicit allow-list with credentials, not a wildcard —
  `accessControlAllowOriginList=${EIP_ALLOWED_ORIGINS}` on the `cors` middleware in `docker-stack.yml`,
  and `EnvFields` marks the value required, refusing every browser origin when empty.
- `SameSite=Lax` is doing real work: it keeps the session cookie off cross-site POST and fetch, which
  is what leaves only top-level GET navigations exposed.

**Open, and now Stage G.** Nothing checks that a sign-in callback answers a sign-in this browser
started, and `/signout` tears down on arrival so a link from any site ends a session.

**Open, and it narrows #32.** [sessions.md](../../backend/api/auth/sessions.md)'s reading — and this
project's own § Stage F — treat the per-tab `X-Session-ID` header as "a double-submit defence in
everything but name". `SessionID()` in `shared/plannersession/request/cookie.go` **prefers** the
header and falls back to the `eip_session` cookie, so the header is not required and a request
carrying only the cookie still authenticates. What actually holds the line is `SameSite=Lax`, one
cookie attribute away from not holding it.

The fallback cannot simply be deleted. `v1endpoints/refresh.go` relies on it deliberately — when the
presented refresh token is missing or stale but `eip_session` is valid, the current refresh row is
resolved from that session id for multi-tab local accounts — and the WebSocket upgrade reads the id
from a query parameter because a browser cannot set a header on `/ws`. Requiring the header on
state-changing endpoints and leaving the fallback to those two paths was the shape this audit
proposed; it is one of three options now, and which one closes #32 is
[plan.md](./plan.md) § Stage F.

## Go modernisation in the touch surface

`go fix -diff` was run against only the packages this plan expects to touch — `api/middleware`,
`api/v1endpoints` and its `user` subpackage, `websocket/server`, `shared/plannersession/...` and
`shared/telemetry/apimetrics`. Three files carry suggestions, and they are not all free:

- `api/v1endpoints/authenticate.go` and `refresh.go` — composite literal tidying, folding a trailing
  field assignment into the literal. **Declined.** Read as a diff rather than as a description, the
  rewrite moves the per-tab cookie comment inside the struct literal and leaves
  `RefreshToken: refreshToken}` on the closing brace. The trailing assignment is the clearer form.
- `api/v1endpoints/session_types.go` — the fixer wants `omitempty` removed from the `UserDocument`
  and `ApplicationSettings` fields of the bootstrap response. **This one changes the wire.** Dropping
  `omitempty` makes both fields always present in the JSON, where today an empty document is omitted
  entirely. It must not be applied as a modernisation; if it is taken at all it is a deliberate
  contract change and belongs with the wire-compatibility note in [plan.md](./plan.md).

Nothing else in the touch surface has `go fix` debt.
