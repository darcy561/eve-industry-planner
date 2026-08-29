# Authentication & session — roadmap & backlog

Tracks **strategy**, **shipped work**, **test gaps**, and **open backlog** for the full planner auth stack: EVE SSO, planner Redis sessions, API middleware, WebSocket upgrade, ESI token maintenance (cloud/local), session grants, and the React SPA.

Companion architecture docs:

- [readme.md](./overview.md) — vocabulary, wire contracts, flows, file index
- [sessions.md](./sessions.md) — Go API + WS + Redis
- [spa.md](../../../frontend/auth/spa.md) — SPA bootstrap, rotate, signout, Tranquility gate

Related rollouts (separate plans):

- [Authz HMAC rollout](../../../migration-plans/authz-hmac/contents.md) — ref IDs and scope snapshots
- [Frontend lifecycles](../../../frontend/lifecycles/roadmap.md) — move SPA maintenance timers out of React mount into a boot-time supervisor

> Per backlog item: **status** · **size** (S/M/L) · **where** · **why** · **how** · optional **acceptance**.  
> Add **new** open items at the bottom **without renumbering** existing ids. Layer-specific items use **#4x** ids.

---

## How to use this document

| Section | Purpose |
|---------|---------|
| [System map](#system-map) | Every layer and primary code paths |
| [Product policy](#product-policy-non-negotiable) | Rules that must not regress |
| [Test coverage](#test-coverage-matrix) | What CI exercises today vs gaps |
| [Done](#done) | Closed backlog ids |
| [Backlog by layer](#backlog-by-layer) | Open work grouped by subsystem |
| [Appendix: session_missing](#appendix-may-2026--session_missing-incident) | One production incident (not the whole system) |
| [Pickup order](#recommended-pickup-order) | Suggested sequencing |

---

## System map

Auth is **not** a single cookie — it is several token types and three runtime surfaces that must stay aligned.

```mermaid
flowchart TB
  subgraph browser ["Browser (SPA)"]
    SSO[EVE SSO redirect / code]
    LS[localStorage Auth - local ESI refresh]
    CK[HttpOnly cookies eip_session / eip_app_refresh / eip_esi_oauth_storage]
    ZS[Zustand account + tokenActions]
  end

  subgraph api ["API (services/api)"]
    EX[POST /eve-sso/tokens/exchange|refresh]
    LG[POST /auth/sessions]
    RT[POST /auth/sessions/rotate|bootstrap]
    LO[POST /auth/sessions/logout]
    MW[middleware AuthConstructor]
  end

  subgraph redis ["Redis"]
    RTK[refresh_token:*]
    AS[account_sessions:*]
    SI[session_index:*]
    CC[custom_claims_corporations|alliances:*]
  end

  subgraph mongo ["MongoDB"]
    USR[users + refreshTokens encrypted]
    SET[application_settings]
  end

  subgraph ws ["WebSocket (services/websocket)"]
    UP[GET /ws upgrade + cookie]
    RES[session_resume + realtime fanout]
  end

  subgraph bg ["Background"]
    WRK[worker: grants, ESI maintenance, session cleanup cron]
    CORE[core singleton: doclock expiry, auth-session-maintenance hourly]
  end

  SSO --> EX
  EX --> LG
  LG --> RTK
  LG --> AS
  LG --> SI
  CK --> RT
  RT --> RTK
  RT --> AS
  ZS --> RT
  CK --> MW
  MW --> AS
  MW --> SI
  CK --> UP
  UP --> AS
  LG --> USR
  RT --> USR
  WRK --> AS
  WRK --> CC
  CORE --> AS
  CORE --> SI
  CORE --> RTK
  UP --> RES
```

### Layer reference

| Layer | Responsibility | Key paths |
|-------|----------------|-----------|
| **EVE SSO (CCP)** | OAuth code grant, ESI access JWT, ESI refresh secret | `services/api/v1endpoints/sso/*` |
| **Planner session (Redis)** | App identity: `session_id`, reauth window, grants cache on session row | `services/api/helper/auth/*` |
| **Session HTTP** | Login, rotate, bootstrap, logout; cookie issuance | `authenticate.go`, `refresh.go`, `logout.go` |
| **Private API auth** | Cookie → Redis on every private route | `middleware/auth.go`, `auth_helpers.go` |
| **WebSocket auth** | Same cookie + Redis as REST; no internal JWT | `websocket/server/handler.go` |
| **ESI access (runtime)** | Short-lived JWT for ESI calls; cloud refreshes from Mongo | `user/cloudStoredEsiRefresh*.go`, `tokenActions.js` |
| **Session grants** | Corp/alliance IDs on session + `custom_claims_*` | `UpdateAccountSessionGrants`, worker `update_account_session_grants` |
| **SPA bootstrap** | OAuth code / localStorage / cookie cloud resume | `useAuthUrlLogin.js`, `appLoginFlow.js` |
| **SPA maintenance** | Rotate cooldown, Tranquility gate, staggered ESI refresh | `tokenActions.js`, `useRefreshESITokens.js` |
| **Signout** | WS disconnect → logout → store reset | `routes/signout.jsx` |
| **First login** | Onboarding route (orthogonal UX, same session) | `routes/__root.jsx`, `First Login/*` |
| **Hygiene jobs** | Prune expired sessions, orphan keys | `session_cleanup.go`, worker cron, core singleton |

### Token types (do not conflate)

| Token | Lifetime | Stored | Used for |
|-------|----------|--------|----------|
| ESI access JWT | ~20m | Memory / Zustand character rows | ESI API calls; optional body on rotate |
| ESI refresh (OAuth) | Long | Mongo (cloud, encrypted) or `localStorage["Auth"]` (local) | Mint new ESI access via CCP or server |
| Planner refresh | 7d chain | Redis `refresh_token:*` + cookie (cloud) or Zustand (local) | Rotate/bootstrap without full SSO |
| Planner session id | 7d | Redis + `eip_session` cookie | Every private API + `/ws` |

---

## Product policy (non-negotiable)

| Rule | Meaning |
|------|---------|
| **Fixed reauth window** | `reauth_required_at` = `SessionStart + 7d`. Anchored at **full EVE SSO login** (or first `session_id` on a new chain). |
| **Rotate/bootstrap must not slide the window** | Cookie resume may rotate planner material and touch `LastSeenAt` — must **not** reset `SessionStart` / `ReauthRequiredAt`. |
| **After the window** | Full EVE SSO (`POST /auth/sessions` with fresh access JWT), not cookie-only bootstrap. |
| **No internal planner JWT** | Identity is `eip_session` + Redis only (API and WS share `ExtractAccountSession`). |
| **Cloud ESI secret never in SPA long-term** | Cloud accounts: Mongo + `eip_app_refresh`; strip secrets from login JSON. |

---

## Shipped foundation

- **Docs (#1)** — [README](./overview.md), [BACKEND](./sessions.md), [FRONTEND](../../../frontend/auth/spa.md); internal JWT/JWKS removed.
- **Redis session hardening (#2–#6, #20)** — reauth gate, index cleanup, CAS writes, persist verify on rotate, scheduled orphan cleanup.
- **Operational cleanup** — Worker cron every 4h + core singleton `auth-session-maintenance` hourly; `AUTH_SESSION_CLEANUP_DRY_RUN`.

---

## Test coverage matrix

| Area | Automated tests | Gap |
|------|-----------------|-----|
| Reauth predicates | `session_reauth_test.go` | — |
| `session_index` / prune | `refresh_token_session_index_test.go` | — |
| CAS / concurrent upsert+grants | `account_sessions_cas_test.go` | — |
| Persist verify + cleanup | `session_persist_test.go`, `session_cleanup_test.go` | — |
| JSON response shapes | `session_types_test.go` | — |
| SSO grant error strings | `sso/helpers_test.go` | Exchange/refresh handlers |
| **HTTP login / rotate / bootstrap / logout** | — | **#15** |
| **Middleware `AuthConstructor`** | indirect via helpers | Cookie + error codes |
| **WS `/ws` upgrade** | `subscribe_auth_test.go` (doc subscribe only) | Session cookie upgrade |
| **Worker grants task** | `update_account_session_grants_test.go` | — |
| **Frontend auth** | — | **#16**, login/rotate/signout flows |
| **E2E** | — | Optional Playwright smoke |

**Summary:** Redis/session **helpers** are well covered; **HTTP handlers**, **middleware**, **WS session auth**, and **SPA** are not.

---

## Done

| Id | Summary |
|----|---------|
| **#1** | Auth architecture docs; internal JWT removed |
| **#2** | Reauth gate on rotate/bootstrap (`reauth_required`) |
| **#3** | `session_index` deleted on prune/revoke/orphan resolve |
| **#4** | Optimistic locking on `account_sessions` (WATCH + retry) |
| **#5** | Verify session row before cookies; rollback new refresh on failure |
| **#6** | Unified `IsReauthExpired` / refresh + middleware alignment |
| **#20** | `RunAuthSessionMaintenance` (orphan index + refresh tokens) |

---

## Backlog by layer

### A — EVE SSO & CCP token exchange

| Id | Item | Status | Size |
|----|------|--------|------|
| **#40** | **Exchange handler integration tests** — `POST /eve-sso/tokens/exchange`: invalid code, empty token, happy path mock CCP | open | M |
| **#41** | **ESI refresh handler tests** — `POST /eve-sso/tokens/refresh`; `isSSOGrantClientError` mapping to 401 vs 503 | open | S |
| **#42** | **Rate-limit / outage behaviour** — document deferral when CCP token endpoint fails; align with Tranquility gate on SPA | open | S |

**Where:** `services/api/v1endpoints/sso/*`, [README §6.1–6.4](./overview.md#6-end-to-end-flows).

---

### B — Planner session (Redis)

| Id | Item | Status | Size |
|----|------|--------|------|
| **#7** | **Logout revokes `refresh_token:*`** — `RevokeRefreshTokensForLogout` + SPA `clearPlannerAuthCookiesClientSide` | done | S |
| **#21** | **Admin revoke-all for account** — support/compromise: all sessions, indexes, refresh rows | open | M |

**Where:** `logout.go`, `session_persist.go` (`RevokeRefreshTokensForLogout`), `plannerAuthCookies.js`; [BACKEND §6.3](./sessions.md#63-post-apiv1authsessionslogout-private--logouthandler), [FRONTEND §8](../../../frontend/auth/spa.md#8-signout).

---

### C — Session HTTP handlers (login / rotate / bootstrap / logout)

| Id | Item | Status | Size |
|----|------|--------|------|
| **#15** | **Refresh state machine tests** — miniredis + `httptest`: happy rotate preserves `SessionStart`; expired → `reauth_required` + no cookies; bootstrap cookie path; upsert verify failure | open | M |
| **#43** | **`authenticate.go` handler tests** — first login sets cookies, `SessionStart`, cloud strips `refresh_token` from body, grants side effect | open | M |
| **#44** | **Logout handler tests** — 204, cookies cleared, session + refresh revoked (`httptest` + miniredis for handler; `session_persist_test` covers revoke helper) | open | S |
| **#45** | **Bootstrap Mongo failure** — no cookies if `ResolveUserDocumentsForLogin` fails after Redis writes; document rollback policy | open | S |

**Where:** `authenticate.go`, `refresh.go`, `logout.go`.

---

### D — Middleware & private API identity

| Id | Item | Status | Size |
|----|------|--------|------|
| **#13** | **Clear cookies on middleware `reauth_required`** | open | S |
| **#46** | **`TouchAccountSession` failure semantics** — today maps to `session_missing`; document or distinguish Redis outage (**#22**) | open | S |

**Where:** `middleware/auth.go`, [BACKEND §2](./sessions.md#2-middleware--authconstructor).

---

### E — WebSocket & realtime

| Id | Item | Status | Size |
|----|------|--------|------|
| **#12** | **WS upgrade JSON errors** — same `{"code","message"}` as REST | open | S |
| **#47** | **WS upgrade integration test** — cookie present/absent, `reauth_required`, `session_missing` | open | M |
| **#48** | **Session resume vs planner rotate** — document that `sessionID` rotate does not force WS reconnect; resume uses `previousClientID` | open | S |

**Where:** `websocket/server/handler.go`, `realtimeClient.js`, [FRONTEND §6](../../../frontend/auth/spa.md#6-realtime-auth-integration).

---

### F — ESI token maintenance (cloud / local)

| Id | Item | Status | Size |
|----|------|--------|------|
| **#49** | **Cloud stored ESI refresh error UX** — map `ErrMongoStoredEsi*` to user-visible copy on bootstrap/rotate | open | M |
| **#50** | **Linked characters bootstrap** — test cloud login returns per-character access tokens; hydration in `appLoginFlow` | open | M |
| **#51** | **Additional account import OAuth** — `tryCompleteAdditionalAccountImportWindow` documented + regression test | open | S |

**Where:** `user/cloudStoredEsiRefresh*.go`, `cloudAdditionalSessions.go`, `tokenActions.js`, `useRefreshESITokens.js`.

---

### G — Session grants & background jobs

| Id | Item | Status | Size |
|----|------|--------|------|
| **#52** | **Grants refresh on login** — NATS `UpdateAccountSessionGrants` task: document failure modes when JetStream down | open | S |
| **#53** | **Fail bootstrap if grants update fails** (optional strict mode) — today warn-only on `UpdateAccountSessionGrants` in refresh | open | S |

**Where:** `refresh.go`, `authenticate.go`, worker `update_account_session_grants.go`.

---

### H — Frontend SPA

| Id | Item | Status | Size |
|----|------|--------|------|
| **#8** | Parse `code` in `sessionClient.js` | open | S |
| **#9** | Explicit `reauth_required` / `session_missing` handling | open | M |
| **#10** | Private fetch 401 → auth reset (debounced) | open | M |
| **#11** | Show `reauth_required_at` in settings/debug | open | S |
| **#16** | Frontend tests for auth errors + login modes | open | S |
| **#54** | **Signout orchestration test** — disconnect WS → logout → `queryClient.clear` order | open | S |
| **#55** | **`requireAuth` vs API 401** — document intentional split; optional sync on hard invalidation | open | S |
| **#57** | **SPA maintenance lifecycles** — extract `useRefreshESITokens` timers into boot-time `Lifecycles/*`; keep `tokenActions` + React Query ownership | open | M |

**Where:** [spa.md](../../../frontend/auth/spa.md), `authGuard.js`, `signout.jsx`; full plan [lifecycles/roadmap.md](../../../frontend/lifecycles/roadmap.md).

---

### I — Observability & quality

| Id | Item | Status | Size |
|----|------|--------|------|
| **#14** | Metrics: `auth_session_reject{code}`, cleanup counts, CAS conflicts | open | M |
| **#56** | **Structured logs** — consistent `session_id`, `account_id`, `session_flow` on all auth handler failures | open | S |

**Where:** `apimetrics`, `refresh.go` (partial today).

---

### J — Security & compliance

| Id | Item | Status | Size |
|----|------|--------|------|
| **#17** | Mongo ESI refresh encryption rollout | tracked | L |
| **#18** | Authz HMAC / scope snapshots | tracked | L |
| **#19** | Planner `refresh_token:*` encryption at rest (optional) | open | L |
| **#32** | Session-bound CSRF / double-submit | open | M |

---

### K — Operations

| Id | Item | Status | Size |
|----|------|--------|------|
| **#22** | Redis outage: runbook + optional 503 `service_unavailable` vs `session_missing` | open | S/L |

**Env vars (auth-related):** `EVE_CLIENT_ID`, `EVE_CLIENT_SECRET`, `REDIS_*`, `REFRESH_TOKEN_AES_*`, `AUTH_SESSION_CLEANUP_DRY_RUN` — see [README §9](./overview.md#9-environment-variables).

---

### L — Strategic product (later)

| Id | Item | Status | Size |
|----|------|--------|------|
| **#30** | Logout everywhere + device list | open | L |
| **#31** | Configurable reauth window by scope | open | L |
| **#32** | CSRF hardening (also listed in J) | open | M |

---

## Appendix: May 2026 — `session_missing` incident

One production failure mode that motivated **#2–#6** and **#20** — not the only auth concern.

**Symptoms:** `POST /auth/sessions/bootstrap` → 200; then private routes → `401 session_missing`; WS upgrade fails.

**Root causes (can combine):**

1. Reauth window elapsed but bootstrap still issued cookies before **#2**.
2. Orphan `session_index` without `account_sessions` row (**#3**, **#20**).
3. `UpdateAccountSessionGrants` lost update during long bootstrap (**#4**).

**User workaround:** Clear `eip_session`, `eip_app_refresh`, `eip_esi_oauth_storage`; full EVE SSO login.

---

## Recommended pickup order

1. **#8**, **#9**, **#10** — SPA handles API auth codes (unblocks support).
2. **#15**, **#43**, **#12**, **#47** — handler + WS tests (regression safety net).
3. **#13** — middleware cookie hygiene on `reauth_required` (**#7** done).
4. **#14**, **#16**, **#54** — metrics + frontend tests.
5. **#40**, **#41** — SSO handler tests.
6. **#57** — SPA lifecycle supervisor ([frontend-lifecycles](../../../frontend/lifecycles/roadmap.md)); can parallelise with SPA tests.
7. **#17**, **#18** — when scheduled (separate plans).
8. **#21**, **#30+** — admin and product features.

---

## Obsolete / external references

- Internal JWT / JWKS — removed; [README §2](./overview.md#2-what-changed-compared-to-the-previous-system).
- `technical-documentation/backend/api/session-esi.md` — may overlap; prefer `technical-documentation/backend/api/auth/*`.
- `firebaseadmin` — migration/admin only, not request auth ([BACKEND §10](./sessions.md#10-servicessharedfirebaseadmin)).
