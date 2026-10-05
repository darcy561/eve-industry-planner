# Auth hardening — review

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
This review edits nothing outside the project folder and does not move any status in `plan.md`;
it records what the code bears out so the plan can be corrected deliberately.

Verified against the working tree on 2026-10-05 (HEAD 051f79cf9 plus uncommitted changes).
`git status --short` shows no uncommitted change in any auth surface; the in-flight edits under
`services/` are all in `jobdocuments`, `shared/models/job_write*` and `shared/mongo/jobs_put_change*`.

## Summary

The project replaces a stale auth roadmap with eight stages of outstanding work on the planner
session stack. Every status in [plan.md](./plan.md) § Stages is borne out by the code: A, B, E and G
are in, H's wire half is in (it arrived in 516eb2e3b, the shared-planners commit that also wrote the
stage into the plan), and C, D and F have no code at all.

Three things need attention.

- **Nothing landed here is deployed.** `Public` (tip fcfa2f7d6, 2026-07-18) has no
  `shared/plannersession/revoke.go`, no `helper/auth/sign_in_state_cookie.go` and no
  `shared/core/documentlock/participant.go`. "Landed" means on this lineage.
- **Stage H's owed half contradicts Stage C.** H says a session id does not belong in logs; C's #56
  asks that every auth failure log carry `session_id`. One of them has to give before either is built.
- **Stage F's CSRF question has a cheaper answer than the three the plan lists.** The cookie fallback
  the plan says cannot be deleted is not what either named path depends on — see
  § Decisions needed.

## Verified status

| Stage / slice | Plan says | Code bears out | Evidence | Verdict |
|---------------|-----------|----------------|----------|---------|
| A — one shape for a rejected session | Landed | One writer, used by REST, rotate and both upgrade paths; upgrade answers `503` on a Redis outage; four new upgrade tests | `sessionreq.WriteCodedError` in `shared/plannersession/request/response.go`, called from `api/middleware/auth.go`, `api/v1endpoints/refresh.go`, `auth_client_log.go`, `revokeSessions.go` and `websocket/server/logging.go` (`wsUpgradeRejectClient`, `wsUpgradeRejectServer`). `dependency.IsUnavailable` at `websocket/server/handler.go` on the read and the `Touch`. `integration_connect_test.go`: `…RevokedSessionUnauthorized`, `…ElapsedReauthWindowUnauthorized`, `…RefusalCarriesTheSharedEnvelope`, `…RedisOutageIsUnavailableNotUnauthorized`. `SetSessionCookie` has no caller outside its own test. `TestEveryFailureCodeHasItsMessageAndClass` in `request/request_test.go` | confirmed |
| B — revoking more than one session | Landed; SPA control and device list declined | Store operation, private route, tombstone, single keyspace walk, conflict test, sign-out journey test; no SPA caller | `Store.RevokeAllSessions` and `tokensForAccount` in `shared/plannersession/revoke.go`; `RevokeAllSessionsHandler` in `api/v1endpoints/revokeSessions.go`, routed at `api/apiServer.go` (`/api/v1/auth/sessions/revoke-all`, private group); `TestUpdateAccountRecordRerunsTheMutationOnAConflict` in `plannersession/store_test.go`; `frontend/src/routes/signoutJourney.e2e.test.js` (seven cases). `grep -rn "revoke-all" frontend/src` is empty | confirmed |
| C — what an operator sees when auth fails | Not started | No rejection counter on the API, no contention counter, no runbook | `shared/telemetry/apimetrics/instruments.go` holds only `api.session_refresh.*` and `api.auth_sessions.{started,continued,ended,stored,store_errors}_total`. The compare-and-set loop is `retry.Do` in `shared/redis/cas.go`, uncounted. No operator document covers a `503` on an auth route | confirmed |
| D — what a user sees when a cloud credential dies | Not started | Mapping exists, no reason reaches the SPA, no test | `refresh.go` switch over `user.ErrMongoStoredEsi*`; no `_test.go` under `services/` references the family; `Components/Auth/runPostLoginAccountSync.test.js` mocks `hydrateLinkedCharactersFromAccessSessions`, so #50 is unasserted | confirmed |
| E — bootstrap that half-succeeds | Landed | Discard at both failure points, counters below the document read, strip asserted, no-op helpers gone | `sessionmaint.DiscardMintedSessionBestEffort` in `shared/plannersession/maintenance/verify.go`, called twice in `authenticate.go` ahead of `Started`/`Stored`/`RecordAuthSessionDistinctAccount`; `TestLoginLeavesNothingBehindWhen…` (two) in `session_lifecycle_test.go`; `TestLive_loginDoesNotHandBackTheStoredEsiSecret` in `live_session_lifecycle_test.go`. `ApplyRotatedSessionCookies` and `UseAppRefreshCookieOnResponse` are absent from the tree; `SetAppRefreshCookie` remains with no caller, as the plan says | confirmed |
| F — the security decisions never taken | Not started | Nothing decided, nothing changed | `SessionID()` in `request/cookie.go` still falls back to `eip_session`; `RefreshTokenTTL = 7 * 24 * time.Hour` in `plannersession/keys.go`; `refresh_token:*` rows carry no cipher; no `csrf` anywhere in `services/` or `frontend/src` | confirmed |
| G — a callback the browser did not ask for | Landed, all four parts | Sign-out mark, mint route, cookie, exchange check before the code is spent, SPA mint on every entry | `SIGNOUT_INTENT` / `isDeliberateSignout` in `Functions/Auth/signoutIntent.js`, read in `routes/signout.jsx` `beforeLoad`; `SignInStateHandler` at `/api/v1/eve-sso/sign-in-state`; `eip_sso_state` in `helper/auth/sign_in_state_cookie.go` (HttpOnly, Secure, `SameSiteStrictMode`, `SignInStateTTL` ten minutes, `maxLiveSignInStates = 3`); `auth.TakeSignInState` in `sso/exchangeHandler.go`; `startSignIn` / `takeSignInState` in `Functions/Auth/signInState.js`, awaited by `redirectToFullEveLogin` and imported by `Components/Accounts/useLinkCharacter.js` | confirmed, with one qualification below |
| H — a session id on the wire | Landed in the shared-planners cutover; logs and traces owed | Wire half in; owed half untouched | `documentlock.ParticipantID` in `shared/core/documentlock/participant.go`, used by `status_pipeline.go`, `service_ops.go`, `presence_ingress.go`, `holder_require.go` (`HolderParticipantID`); `MetaData.SessionID` tagged `json:"-"` in `shared/models/metaData.go`; `core/changestream/watcher.go` drops `models.MetaFieldSessionID`; `routingOnlyFields` in `websocket/server/outgoinglogic/decode.go` strips `sourceSessionID`; `lockParticipantID` in `Functions/DocumentLock/lockParticipant.js`; `testing/fixtures/document-lock/participant.json`; `TestNoSessionIDLeavesTheLockThroughAWholeLifecycle` in `documentlock/no_session_on_wire_test.go`. Owed half: see § Stage H below | confirmed |

**Discrepancies.** No stage status is wrong. What follows is text in the project that the code
contradicts, and it should be corrected when the plan is next touched.

1. **[plan.md](./plan.md) § Stage C says the reauth deadline is "stored per tab and read by nothing".**
   `isPlannerReauthDeadlinePassed` in `Functions/Auth/tabSessionStorage.js` reads it and `reauthDemand`
   in `plannerSessionRedirect.js` acts on it. [current-state.md](./current-state.md) #11 already says
   so; the stage text was not updated with it.
2. **[plan.md](./plan.md) § Stage C says the maintenance sweep "reports nothing about what it revoked".**
   `RunLoop` in `shared/plannersession/maintenance/sweep.go` logs `orphan_refresh_tokens` and
   `orphan_refresh_tokens_removed` on every pass. It is unmetered, not unreported.
3. **[plan.md](./plan.md) § Stage D speaks of "the API's deferral when CCP's token endpoint is failing".**
   The API does not defer. `sso/refreshHandler.go` and `sso/exchangeHandler.go` call `h.ReportSSO` and
   state that the gate is reported to and never consulted. Only the SPA defers
   (`shouldDeferAuthRefreshDueToTranquilityOffline`). #42 is therefore a one-sided behaviour to
   document, not two behaviours to reconcile.
4. **§ Wire compatibility lists "Clearing cookies on a rejection code (Stage A)" as additive.** Stage A
   closed #13 as moot and `api/middleware/auth.go` sets no cookie on a refusal. The row describes a
   change that was not made.
5. **[overlay.md](./overlay.md) § Auth test coverage still lists the upgrade's revoked and elapsed
   cases as not exercised**, and [current-state.md](./current-state.md) closes § What has shipped with
   the same exception. Both predate Stage A's four tests.
6. **§ Promote has no item for Stage H.** `backend/api/document-lock/locks.md` still shows
   `holderSessionID` in the 409 refusal body and the lock event example. shared-planners'
   plan does not name that file either, so no project currently owes the correction.
7. **§ Promote item 2 names only the two services testing documents.**
   `testing/frontend/auth.md` mentions neither `signoutJourney.e2e.test.js` nor the sign-in state
   tests that Stages B and G added.
8. **Two stages describe an in-body comment as the record of a decision.** § Stage A says
   `ExtractSession` "records that pruning is the single enforcement point"; that is a four-line comment
   inside the function in `request/extract.go`, and `revoke.go` carries two more. The master
   [technical-rules.md](../../technical-rules.md) § One comment, and it is two lines removes them when
   those files are next edited. The reasons are already in [overlay.md](./overlay.md) § Stage A and
   § Stage B, so nothing is lost, but the plan should point there rather than at the code.

**Qualification on Stage G.** `signInStateRequestIsCrossSite` allows `Sec-Fetch-Site` values `""`,
`same-origin` and `none`, and refuses everything else with `403` — which includes `same-site`.
`docker-stack.yml` routes `/api` and `/` on one host, so the shipped stack is same-origin and unaffected.
A self-host that serves the SPA from one subdomain and the API from another, which the
`EIP_ALLOWED_ORIGINS` allow-list exists to permit, would have every mint refused and no way to sign in.
Not observed anywhere; read from the code. It is a decision below.

## What each remaining step changes

Stages A, B, E and G: landed, behaviour in [overlay.md](./overlay.md) § Stage A, § Stage B, § Stage E,
§ Stage G.

### Stage C — what an operator sees when auth fails

**Today.** A refused request is counted on one surface and not the other. The websocket counts every
refused upgrade by reason; the API middleware counts nothing; the rotate handler counts under its own
label set.

```text
ws.upgrade.errors_total{reason}            session_missing | session_revoked | redis_unavailable | draining | maintenance | at_cutoff
api.session_refresh.errors_total{...}      reauth_required | refresh_token_not_found | cloud_esi_not_found | validation_error | config_error | redis_error
api.auth_sessions.*                        started | continued | ended | stored | store_errors   (no rejections)
```

A failure log from the middleware or the upgrade carries what `FailureDetail.ClientFailureDetail`
in `request/failure.go` builds:

```json
{ "failure_class": "auth_session_revoked", "code": "session_revoked",
  "has_eip_session_cookie": false, "has_planner_session_id_header": true,
  "account_id": "…", "session_id": "…", "reason": "…" }
```

There is no field naming the flow, and the rotate path logs through a different builder
(`RefreshCredentialLogDetail` in `helper/auth/refresh_credential_log.go`) that carries neither
`account_id` nor `session_id`.

**After.** [plan.md](./plan.md) § Stage C names `auth_session_reject{code}` and leaves the rest
unspecified. Following the existing family, the shape would be:

```text
api.auth_sessions.rejected_total{code, surface}   code = the three terminal codes + redis_unavailable
```

The instrument name and the `surface` label are an illustration; the plan fixes neither.

**Work.**

1. Add the rejection counter to `shared/telemetry/apimetrics` and record it in `AuthConstructor` at
   each of its refusal points (three `401` branches and two `503` branches).
2. Decide the shared vocabulary with `ws.upgrade.errors_total` (see § Decisions needed) and, if one
   counter serves both, record it from `wsUpgradeRejectClient` and `wsUpgradeRejectServer`.
3. Count compare-and-set retries where they happen, in `shared/redis/cas.go`, labelled by caller, so
   `UpdateAccountRecord` contention is visible without `plannersession` growing its own loop.
4. Turn the sweep's two logged counts into counters beside the log line.
5. The handler-by-handler log pass (#56), once the session-id-in-logs decision is taken.
6. Write the Redis outage runbook into the project overlay; it promotes from there.
7. Look at the duplicated dependency branch in `middleware/auth.go` and `websocket/server/handler.go`
   before adding a counter call to each, as § Stage A asked.

**Wire.** Additive. Telemetry and log fields only; no `prepareRelease` step.

### Stage D — what a user sees when a cloud credential dies

**Today.** The switch in `refresh.go` answers each error class as follows, and the SPA cannot tell any
of them apart from an ordinary dead session.

| Error | Answer | What the SPA does |
|-------|--------|-------------------|
| `ErrMongoStoredEsiNotCloud` | `400`, plain text "eve_token is required for non-cloud sessions" | fails the call |
| `ErrMongoStoredEsiNoRow`, `…UserNotFound` | `401 {"code":"session_revoked"}` | `enforceReauthDemand` leaves for EVE SSO, logging to the console only |
| `ErrMongoStoredEsiInvalidGrant` | `401 {"code":"session_revoked"}` | the same |
| `ErrMongoStoredEsiKeyring`, `…Decrypt`, `…Persist` | `500` through `respondRefreshServerError` | bootstrap retries a `5xx` up to three times ([plan.md](./plan.md) § Stage E), then fails |
| anything else | `401`, plain text "Invalid token" through `http.Error`, no envelope and no code | fails the call |

The refusal body is the shared envelope and nothing more:

```json
{ "code": "session_revoked", "message": "Unauthorized" }
```

**After.** The plan asks for "a credential-failure reason on the rotate and bootstrap responses" and
does not give a shape. Those two response types (`SessionRotateResponse`, `SessionBootstrapResponse`
in `session_types.go`) are success bodies; every failure above is written by
`respondSessionRefreshTerminalAuthError` or an error helper. So the reason has to ride the refusal, for
example:

```json
{ "code": "session_revoked", "message": "Unauthorized", "reason": "esi_credential_invalid" }
```

The field name and its values are an illustration. Where it goes is a decision below.

**Work.**

1. Classify the seven errors as user-actionable, operator-actionable or neither, in the overlay.
2. Carry the class to the client in whichever shape is chosen.
3. Give the SPA somewhere to say it: `enforceReauthDemand` leaves the page without a word, so the
   message has to survive the redirect or be shown on `/auth` on arrival.
4. A test that asserts each error class produces its answer; none exists.
5. A test that a cloud bootstrap's `linked_characters` reach the credential provider (#50), with the
   real `hydrateLinkedCharactersFromAccessSessions` rather than a mock.
6. Document the outage story (#42) as it is: the SPA defers on a cached Tranquility status, the API
   reports to its gate and serves regardless.

**Wire.** Additive if the reason is an optional field on the envelope. A new `code` value would be
breaking in effect: `PLANNER_TERMINAL_AUTH_CODES` in `plannerSessionRedirect.js` is a closed set, and
an older SPA would treat an unknown code as non-terminal.

### Stage F — the security decisions that were never taken

**Today.** Three facts, each one line of code.

```go
// shared/plannersession/request/cookie.go — SessionID()
header X-Session-ID  →  query planner_session_id  →  cookie eip_session

// shared/plannersession/keys.go
RefreshTokenKeyPrefix = "refresh_token:"      // value stored as written, no cipher
RefreshTokenTTL       = 7 * 24 * time.Hour    // also the reauth window
```

**After.** Unspecified by design: the stage closes when each of #19, #32 and #31 has a recorded
answer. What each answer would change is under § Decisions needed.

**Work.** Take the three decisions; give any that survive a stage of its own.

**Wire.** Depends on the answers. Encrypting `refresh_token:*` is migrate-required (existing rows must
be rewritten or allowed to expire over seven days). Requiring a header or removing the cookie fallback
is breaking only for a client that sends no `X-Session-ID`, and the SPA sends it on every call
(`tabPlannerSessionRequestHeaders`, via `authSessionHeaders` in `sessionClient.js`).

### Stage H — the owed half: session ids in logs and traces

**Today.** The wire is clean and the logs are not. The request logger is bound with the raw id in one
place, and a dozen call sites add it by hand.

```go
// shared/logs/request_account.go — BindRequestIdentity
loggerFields = append(loggerFields, zap.String("session_id", sessionID))
```

Hand-written sites, each a `"session_id"` key in a detail map or attribute:
`api/middleware/auth.go` (two), `request/failure.go` (`ClientFailureDetail`),
`api/v1endpoints/refresh.go` (`refresh_token_resolved` debug step),
`api/v1endpoints/documentlocks/request_context.go` (`merged["session_id"]`),
`websocket/server/handler.go` (two), `websocket/server/logging.go` (nine),
`websocket/server/dispatch.go` (`source_session_id`), and a span attribute in
`websocket/server/ws_message_operation.go`. `core/changestream/watcher.go` logs `source_session_id`
as well.

**After.** [plan.md](./plan.md) § Stage H: "one rule in the logging layer (log the participant id,
never the session) rather than call site by call site". No shape is given. The binding would become
something like:

```go
loggerFields = append(loggerFields, zap.String("participant_id", digest(sessionID)))
```

**Work.**

1. Decide what replaces the id and where the digest lives (below).
2. Change `BindRequestIdentity`; that covers every log line written through the request logger.
3. The hand-written sites do not pass through it. Either each is edited, or the shared log attach
   helpers (`logs.AttachClientFailureDetail`, `AttachServerFailureDetail`, `AttachDebugStep`) rewrite
   a `session_id` key on the way in. The plan's "one rule" is only true under the second.
4. The span attribute and the changestream log line are outside `shared/logs` and need their own edit
   either way.
5. A test in the shape of `no_session_on_wire_test.go`: drive a request with a marked session id and
   fail if the marker reaches the log sink.

**Wire.** Additive for clients; nothing they receive changes. It changes what an operator greps for,
which is an operator-surface change and should be said in the runbook Stage C writes.

## Decisions needed

### Whether logs carry a session at all, and as what

**Question.** Stage H says session ids leave the logs; Stage C's #56 says every auth failure log must
carry `session_id` — which holds?

**Why it is James's call.** The two stages are in one plan and disagree. It also changes what an
operator has to correlate a support report against.

**Options.**
- *A digest everywhere.* Logs carry a one-way id; #56 is reworded to require that. Correlation across
  a session's log lines survives; looking a session up in Redis from a log line does not.
- *Reuse `documentlock.ParticipantID`.* One derivation for locks and logs, so a log line and a lock
  event name the same participant. `shared/logs` would import a lock package for a logging concern,
  and the domain prefix says "lock".
- *A digest owned by `shared/plannersession`.* Same derivation moved to the package that owns the
  session, with `documentlock` calling it. Cleaner ownership; touches the fixture both languages pin.
- *Keep raw ids in logs.* Record that logs are inside the trust boundary, as Redis is. Closes H's owed
  half as declined.

**Recommendation.** A digest everywhere, owned by `shared/plannersession`, applied in the shared log
helpers so call sites cannot bypass it.

**Blocked until decided.** Stage H's owed half, and work item 5 of Stage C.

### How #32 closes

**Question.** Does the API require proof beyond an ambient cookie on state-changing requests, and by
which mechanism?

**Why it is James's call.** The plan offers three shapes and picks none, and the code supports a
fourth it does not list.

**Options.**
- *Require `X-Session-ID` on state-changing private routes.* A page cannot set it cross-site. The 24
  private routes dispatch on method inside their handlers, so the check goes in `AuthConstructor`.
- *Apply the `Sec-Fetch-Site` check from Stage G to every state-changing route.* Needs nothing of the
  client. Lets through any browser that sends no such header, and refuses a split-origin deployment
  (next decision).
- *Record that `SameSite=Lax` is enough.* No change.
- *Remove the cookie branch from `SessionID()`.* Not in the plan. The plan says the fallback cannot
  go because the rotate recovery and the upgrade rely on it. Neither does:
  `ResolvePresentedRefreshTokenFromRequest` in `helper/auth/refresh_token_rotation.go` reads
  `sessionreq.SessionID(r)`, which the header satisfies and which the SPA sends on every session call;
  the upgrade reads the query parameter. Nothing issues `eip_session` — `SetSessionCookie` has no
  caller here, and `Public`'s own source already calls `ApplyRotatedSessionCookies` a no-op for
  per-tab sessions. With the branch gone there is no ambient credential for a forged request to ride,
  and #32 closes without a new check. The same reasoning covers the `eip_app_refresh` read in
  `refresh.go` and `logout.go`, and decides the dead `SetAppRefreshCookie` § Stage E left alone.

**Recommendation.** Remove the cookie branch, keep the two clears for one release, and record #32 as
closed because identity is header, query and body only. That `Public` has issued no session cookie for
longer than the cookie's seven-day life is inferred from its source, not measured; confirm against
live request logs before removing it: `has_eip_session_cookie` is already logged on every refusal the
middleware and the upgrade make.

**Blocked until decided.** Stage F, and the cleanup of `SetSessionCookie`, `SetAppRefreshCookie` and
their readers.

### Whether a split-origin deployment is supported

**Question.** Should the sign-in state mint accept a request whose `Sec-Fetch-Site` is `same-site`?

**Why it is James's call.** It is a statement about which self-hosted topologies the project supports.
The stack's CORS allow-list permits other origins; the mint refuses them.

**Options.**
- *Same-origin only.* Say so in the deployment documentation. Nothing changes in code.
- *Allow `same-site`.* A sibling subdomain can then start a sign-in. The cookie is
  `SameSite=Strict`, which is also site-scoped, so this matches what the cookie already permits.
- *Check `Origin` against `EIP_ALLOWED_ORIGINS`.* Precise, and reuses a list the operator already
  maintains; it needs the API to read a value only Traefik reads today.

**Recommendation.** Allow `same-site`. It matches the cookie's own scope and keeps the tool
unopinionated about hosting.

**Blocked until decided.** Nothing in flight; it gates the second option of the previous decision.

### Where a credential-failure reason rides, and what the reader is shown

**Question.** Does the reason go on the shared refusal envelope as a new field, become a new code, or
stay server-side with only the copy changing?

**Why it is James's call.** The plan's wire note puts it on the success responses, which cannot carry
it. Any real home touches the single envelope writer Stage A established and the SPA's closed code set.

**Options.**
- *An optional `reason` on the envelope.* Additive; `WriteCodedError` gains a parameter or a sibling.
- *New codes.* Explicit, but an older SPA treats an unknown code as non-terminal.
- *No wire change.* The SPA shows one generic "sign in again" message whenever it is sent to EVE.
  Cheapest, and it does not separate "re-authorise" from "tell the operator".

**Recommendation.** An optional `reason` on the envelope, with the operator-actionable classes
(keyring, decrypt, persist) left as a `500` and a generic message.

**Blocked until decided.** Stage D work items 2 and 3.

### What happens to the other characters when one credential dies

**Question.** When one linked character's stored token is refused, does the session end, or does that
character drop out while the rest keep working?

**Why it is James's call.** It is product behaviour. Today a refused grant for the character the
session names answers `session_revoked` and ends the tab's session.

**Options.** End the session (today); keep the session and mark the character as needing
re-authorisation, which the credential health surface (`useCredentialHealth`) already has a place for.

**Recommendation.** Keep the session when the dead credential is not the main character's.

**Blocked until decided.** Stage D work item 1, and the test for #50.

### Whether the reader sees the reauth deadline

**Question.** Is the seven-day deadline shown anywhere before it redirects the reader (#11)?

**Why it is James's call.** The plan marks it a product call.

**Options.** Leave it acted on and unseen; show it in a settings or account surface; warn shortly
before it passes.

**Recommendation.** A warning shortly before: the redirect is a full page leave, and a job's unsaved
edits are held only by the open editor.

**Blocked until decided.** Nothing else; it is the one SPA item in Stage C.

### One rejection vocabulary or two

**Question.** Do the API's new rejection counter and `ws.upgrade.errors_total{reason}` share label
values and an instrument?

**Why it is James's call.** Renaming or relabelling an existing websocket metric changes dashboards.

**Options.** One instrument in `apimetrics` with a `surface` label, retiring the auth reasons from the
websocket counter; two instruments sharing the `sessionreq` code constants as label values; leave the
websocket counter alone and add an unrelated API one.

**Recommendation.** Two instruments, one vocabulary. The websocket counter also counts `draining`,
`maintenance` and `at_cutoff`, which are not auth events.

**Blocked until decided.** Stage C work items 1 and 2.

### Where the Redis outage runbook lives

**Question.** Which live document receives it on promote?

**Why it is James's call.** § Promote item 3 says "wherever backend operational guidance lands", and
no such place exists; `backend/maintenance-mode.md` is the nearest precedent.

**Options.** A section of `backend/api/auth/sessions.md` § 11; a new `backend/api/auth/` topic; a
backend-wide operations document.

**Recommendation.** A new topic under `backend/api/auth/`, linked from § 11.

**Blocked until decided.** Only the promote step; the text can be written in the overlay now.

### Refresh tokens in Redis, and the reauth window

**Question.** Do #19 and #31 close as declined?

**Why it is James's call.** Both are recorded as decisions that may close with no change.

**Options.** For #19: encrypt `refresh_token:*` values at rest, or record Redis as the trust boundary.
Note the token is the key as well as the value, so encrypting the value protects only the metadata
(account id, character hash, session id). For #31: a per-scope window, or seven days for all.

**Recommendation.** Decline both and record why.

**Blocked until decided.** Stage F closing.

### Who promotes Stage H's wire change

**Question.** Does this project or shared-planners correct `backend/api/document-lock/locks.md`?

**Why it is James's call.** The stage is recorded here, the code shipped under shared-planners, and
neither promote list names the file.

**Options.** Add a Promote item here; add it to shared-planners' promote; leave it to whichever
promotes first.

**Recommendation.** shared-planners, which rewrites that document for the owner-keyed lock anyway;
add a line here pointing at it.

**Blocked until decided.** Nothing until promote.

## Dependencies and order

**Waits on.** Nothing. shared-planners Stage E, which once blocked Stage B, has landed
(`sessiongrants.WriteFromMemberships` in `shared/core/sessiongrants`).

**Waits on this.** shared-planners' cutover is what makes another member's session reachable, so
Stage H's owed half is the one item with a deadline. shared-planners § Stage I still carries #53,
which this project handed over; it is undecided there and nothing here depends on it.
shared-planners' overlay also parks one fragility here that the plan does not list:
`ensurePlannerSession`'s guard cannot tell "not yet logged in" from "logged in with credentials
unavailable". It has no stage.

**Recommended next slice.** Take the session-id-in-logs decision, then build Stage H's owed half
before the cutover. It is small, it has the only deadline, and Stage C's log pass cannot be written
until it is settled. Stage C follows, then D. Stage F is three decisions and can be taken at any time;
its CSRF answer is likely a deletion rather than a build.
