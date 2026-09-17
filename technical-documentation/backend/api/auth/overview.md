# Authentication & Session System

End-to-end documentation for the planner's authentication and session-handling subsystem after the migration **off** of internal API-issued JWTs and **onto** Redis-backed session cookies + EVE SSO.

> Documentation is split into three files:
>
> - **README.md** (this file) — vocabulary, cross-stack architecture, the wire contract, end-to-end flows, and environment.
> - **[spa.md](../../../frontend/auth/spa.md)** — React app: bootstrap modes, Zustand actions, request-time auth, refresh cooldown, Tranquility gate, signout, realtime auth.
> - **[sessions.md](./sessions.md)** — Go API: middleware, Redis key layout, handler-by-handler contracts, refresh state machine, websocket upgrade auth.

---

## 1. Vocabulary

| Term | Definition |
|---|---|
| **EVE SSO** | CCP's OAuth 2.0 server at `login.eveonline.com`. Issues `access_token` (JWT, ~20m) and `refresh_token` (opaque, long-lived). |
| **ESI access JWT** | The short-lived OAuth access token CCP returns. Verified locally with EVE's JWKS. Carries the **character hash** in the `owner` claim. |
| **ESI refresh token** | The long-lived OAuth refresh secret. **For cloud accounts** it lives encrypted in Mongo `users.refreshTokens`; **for local accounts** it lives in browser `localStorage["Auth"]`. |
| **Account ID** | Derived **deterministically** from the EVE main character hash by stripping non-alphanumeric characters (`plannersession.AccountIDFromCharacterHash`). Same across logins/devices. |
| **Planner session** | One row inside `account_sessions:<accountID>` in Redis, identified by `sessionID`. Represents one logged-in app session (one device / tab group). |
| **Session ID** | An opaque UUID generated server-side (`plannersession.GenerateSessionID`). Sent to the browser as the value of the **`eip_session`** HttpOnly cookie (or presented per-tab via the `X-Session-ID` header / `planner_session_id` query param). |
| **Planner refresh token** | A separate opaque UUID stored in Redis under `refresh_token:<token>` with metadata. Used to **rotate the planner session**. *Not* an EVE SSO token. For cloud accounts it lives in the HttpOnly **`eip_app_refresh`** cookie; for local accounts the SPA holds the raw string in Zustand. |
| **Reauth required at** | `started_at + RefreshTokenTTL` (7 days). After this, the session is treated as expired and `AuthConstructor` rejects with `reauth_required`. |
| **Bootstrap** | A login-equivalent rotate that **also** reloads user docs / linked characters. Used by the SPA after a cold reload to re-hydrate state without a fresh EVE SSO round-trip. |
| **Rotate** | A pure session rotate (Redis row replaced, new session id) without re-loading the Mongo user document. Used by the periodic cooldown timer. |
| **Cloud account** | `users.userCloudAccounts === true`. ESI refresh material lives in Mongo (encrypted) so the user can sign in from any device without browser-stored OAuth credentials. |
| **Local account** | `users.userCloudAccounts === false` (or undefined). ESI refresh token is held by the browser in `localStorage["Auth"]`. |
| **Tranquility gate** | A React Query–backed cache of EVE's `/status/` endpoint that **defers** planner / ESI refresh activity while CCP's server is known offline. |

---

## 2. What changed (compared to the previous system)

The previous implementation issued an **internal RSA-signed JWT** from the API and exposed JWKS endpoints for the websocket service to verify it.

The current implementation **does not issue any internal JWTs**. All API and websocket calls authenticate against a **shared session cookie** (or per-tab header/query param) that the middleware resolves against Redis on every request, through a session package (`shared/plannersession`) both services import rather than either reaching into the other.

**Removed source files (gone in this version):**

- `services/api/v1endpoints/jwks.go`
- `services/shared/core/internaljwt/jwt.go`
- `services/shared/core/internaljwt/key_cache.go`
- `services/shared/core/internaljwt/rsa_keys.go`
- `services/websocket/sso/jwks.go`
- `services/websocket/sso/jwt.go`
- `services/websocket/sso/types.go`
- `frontend/src/Hooks/App/useCheckEveServerStatus.js` (replaced by `useTranquilityServerStatusQuery`).

**Implication:** every request — API and `/ws` — is authenticated against Redis through `shared/plannersession`. There is no JWT signing key to rotate, no JWKS to publish, and no client-side bearer token to manage for *planner-internal* auth.

---

## 3. Cross-stack architecture

```mermaid
flowchart LR
    Browser[React SPA]
    EveSSO[EVE SSO\nlogin.eveonline.com]
    API[Go API service\n services/api]
    WS[Go websocket service\n services/websocket]
    Redis[(Redis)]
    Mongo[(MongoDB)]

    Browser -- "1: GET authorize" --> EveSSO
    EveSSO -- "code" --> Browser
    Browser -- "POST /eve-sso/tokens/exchange" --> API
    API -- "code -> tokens" --> EveSSO
    API -- "EveSSOTokenPayload" --> Browser

    Browser -- "POST /auth/sessions (eve_token)" --> API
    API -- "verify EVE JWT" --> EveSSO
    API -- "PutRefreshToken / PutSession" --> Redis
    API -- "load users + linked chars" --> Mongo
    API -- "SessionBootstrapResponse + cookies" --> Browser

    Browser -- "POST /auth/sessions/rotate (cookie)" --> API
    Browser -- "POST /auth/sessions/bootstrap (cookie)" --> API
    Browser -- "POST /auth/sessions/logout (cookie)" --> API

    Browser <-- "WebSocket /ws (cookie)" --> WS
    WS -- "ExtractSession" --> Redis

    classDef external fill:#fef3c7,stroke:#92400e;
    classDef store fill:#dbeafe,stroke:#1e40af;
    class EveSSO external;
    class Redis,Mongo store;
```

**One-line model**: the only identity material the browser holds is the `eip_session` cookie (and for cloud users, the `eip_app_refresh` cookie). Everything else flows through Redis on the server, through `shared/plannersession` — the package both `API` and `WS` import rather than either reaching into the other's code.

---

## 4. Identity primitives

### 4.1 Account ID

```
accountID = sanitize(characterHash)         // strip non-[a-zA-Z0-9]
```

Computed by `plannersession.AccountIDFromCharacterHash` in `services/shared/plannersession/store.go`. Deterministic per EVE character, stable across sessions / devices.

### 4.2 Session ID

Opaque UUID (or 32 random bytes URL-base64 if UUID generation fails) produced by `plannersession.GenerateSessionID()` — delegates to `plannersession.GenerateRefreshToken()` in `services/shared/plannersession/store.go`. Sent to the browser as the `eip_session` cookie value, or presented per-tab via `X-Session-ID` / `planner_session_id`.

### 4.3 Planner refresh token

Same generator as `sessionID`; distinct value. Stored as the key of `refresh_token:<token>` in Redis with a `RefreshTokenData` body (account id, character hash, scopes, corp/alliance grants cache, current `sessionID`, app version, timestamps).

---

## 5. Cookies

| Name | HttpOnly | Path | TTL | Purpose |
|---|---|---|---|---|
| **`eip_session`** | yes | `/` | 7d (`RefreshTokenTTL`) | Carries the **sessionID**. Primary identity material for API + WS (a per-tab `X-Session-ID` header or `planner_session_id` query param, when present, is preferred over it). |
| **`eip_app_refresh`** | yes | `/api/v1/auth` | 7d | Carries the **planner refresh token** (cloud accounts only). Scoped to auth paths so it is never exposed to other endpoints. |
| **`eip_esi_oauth_storage`** | **no** | `/` | 7d | Non-secret routing hint: `"server"` (cloud-stored ESI refresh) or `"client"` (browser-stored). Read by the SPA on cold reload (`utils/authGuard.js`) to decide whether to attempt cookie-cloud resume. |

All three are `Secure` + `SameSite=Lax`. Login / rotate / bootstrap **set**; logout **clears**.

---

## 6. End-to-end flows

### 6.1 First login (EVE OAuth code → planner session)

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant S as SPA
    participant E as EVE SSO
    participant A as API
    participant R as Redis
    participant M as Mongo

    U->>S: Click "Login"
    S->>E: GET /v2/oauth/authorize
    E-->>U: Login + scope consent
    E->>S: Redirect with ?code=...
    S->>A: POST /api/v1/eve-sso/tokens/exchange { auth_code }
    A->>E: POST /v2/oauth/token (auth code grant)
    E-->>A: { access_token (JWT), refresh_token, expires_in }
    A-->>S: EveSSOTokenPayload (CCP tokens only)

    S->>A: POST /api/v1/auth/sessions { token: access_token }
    A->>A: ValidateEveTokenAndExtractHash
    A->>A: accountID = sanitize(characterHash)
    A->>A: GenerateRefreshToken + GenerateSessionID
    A->>R: PutRefreshToken refresh_token:<token>
    A->>R: PutSession account_sessions:<accountID>[sessionID]
    A->>R: SET session_index:<sessionID> = accountID, session_refresh:<sessionID> = token
    A->>M: ResolveUserDocumentsForLogin
    M-->>A: users / settings / linked characters
    A-->>S: SessionBootstrapResponse + cookies\n  Set-Cookie eip_session, eip_app_refresh (cloud), eip_esi_oauth_storage
    S->>S: applyLoginAuthResponse + setLoggedIn(true)
    S->>S: connectWebsocket (cookie-authenticated /ws)
```

### 6.2 Cookie cloud resume (cold reload, no SSO round-trip)

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant S as SPA
    participant A as API
    participant R as Redis
    participant M as Mongo

    U->>S: Open app (no `Auth` localStorage, eip_app_refresh + eip_session present)
    S->>S: useAuthUrlLogin -> mode "cookieCloudResume"
    S->>A: POST /api/v1/auth/sessions/bootstrap { eve_token: "" }\nCookie: eip_app_refresh; eip_session
    A->>R: RefreshToken(eip_app_refresh)
    R-->>A: RefreshTokenData
    A->>M: RefreshStoredEsiFromMongoForCharacter (main)
    M-->>A: fresh ESI access token
    A->>R: PutRefreshToken (new), PutSession, DeleteRefreshToken (old)
    A-->>S: SessionBootstrapResponse incl. linked_characters[main.access_token]\nSet-Cookie eip_session (rotated), eip_app_refresh (rotated)
    S->>S: applyLoginAuthResponse + setLoggedIn(true)
```

### 6.3 Periodic rotate (cooldown-driven)

```mermaid
sequenceDiagram
    autonumber
    participant S as SPA
    participant A as API
    participant R as Redis

    Note over S: any private fetch, when the session is due
    S->>S: ensurePlannerSession()
    S->>S: Tranquility cached offline? -> return
    S->>S: lastPlannerSessionValidatedAt within 20m? -> return
    S->>A: POST /api/v1/auth/sessions/rotate { eve_token? }\nCookie: eip_session, eip_app_refresh
    A->>R: RefreshToken (presented or eip_app_refresh)
    A->>A: validate eve_token character_hash OR refresh ESI from Mongo
    A->>R: PutRefreshToken (new), PutSession, DeleteRefreshToken (old)
    A-->>S: SessionRotateResponse { session_id, refresh_token? }
    S->>S: setSessionTokens + lastPlannerSessionValidatedAt = now
```

### 6.4 Logout

```mermaid
sequenceDiagram
    autonumber
    participant S as SPA
    participant A as API
    participant R as Redis
    participant W as Websocket

    S->>W: disconnectWebsocket()
    S->>A: POST /api/v1/auth/sessions/logout { refresh_token? }\nCookie: eip_session, eip_app_refresh
    A->>A: RequireAccountID (from session cookie context)
    A->>R: RefreshToken -> verify token.AccountID matches context
    A->>R: RevokeSessionTokens(presented, sessionID)
    A->>R: RemoveSession(accountID, sessionID)
    A-->>S: 204 + Set-Cookie clear (all three)
    S->>S: clearPlannerAuthCookiesClientSide + resetAccountStore + queryClient.clear() + storage.clear()
    S->>S: navigate "/"
```

### 6.5 WebSocket upgrade

```mermaid
sequenceDiagram
    autonumber
    participant S as SPA
    participant W as WS service
    participant R as Redis

    S->>W: GET /ws (Upgrade)\nCookie: eip_session
    W->>W: session id present? no -> 401 session_missing
    W->>R: ExtractSession (account_sessions + session_index)
    R-->>W: identity (accountID, sessionID, grants)
    W->>R: Touch (LastSeenAt)
    W-->>S: 101 Switching Protocols
    W->>S: { type: "connected", clientID: "..." }
    S->>S: setWsClientID(clientID)
```

---

## 7. Wire contracts

### 7.1 `POST /api/v1/eve-sso/tokens/exchange`

```json
{ "auth_code": "<from EVE redirect>", "account_type": "main" }
```

Response — exactly the CCP token payload, with no planner identity:

```json
{
  "access_token": "<ESI access JWT>",
  "refresh_token": "<EVE OAuth refresh>",
  "token_type": "Bearer",
  "expires_in": 1199
}
```

### 7.2 `POST /api/v1/auth/sessions` (initial login)

Request:

```json
{ "token": "<ESI access JWT>" }
```

Headers: `X-App-Version: <semver|unknown>` (optional).

Response (`SessionBootstrapResponse`, abbreviated):

```jsonc
{
  "kind": "session_bootstrap",
  "esi_oauth_storage": "server" | "client",
  "account_id": "<sanitized hash>",
  "session_id": "<uuid>",
  "main_character_hash": "<hash>",
  "refresh_token": "<planner refresh>",       // omitted for cloud users (cookie carries it)
  "reauth_required_at": 1736000000,            // unix seconds, started_at + 7d
  "first_login": false,
  "user_document": { /* users collection projection, refresh tokens stripped */ },
  "application_settings": { /* settings collection */ },
  "linked_characters": [                        // cloud: each row carries an ESI access token
    { "characterHash": "...", "access_token": "...", "token_type": "Bearer", "expires_in": 1199 }
  ]
}
```

Set cookies: `eip_session`, `eip_app_refresh` (cloud only), `eip_esi_oauth_storage`. Headers `Cache-Control: no-store`.

### 7.3 `POST /api/v1/auth/sessions/rotate`

Request:

```jsonc
{
  "refresh_token": "<planner refresh>",   // optional if eip_app_refresh cookie present
  "eve_token": "<ESI access JWT>"           // optional for cloud (server falls back to Mongo)
}
```

Response (`SessionRotateResponse`):

```json
{
  "kind": "session_rotate",
  "account_id": "...",
  "session_id": "<new uuid>",
  "main_character_hash": "...",
  "refresh_token": "<new planner refresh>",
  "reauth_required_at": 1736000000
}
```

### 7.4 `POST /api/v1/auth/sessions/bootstrap`

Same request shape as `/rotate`. Same response **shape** as `/sessions` (full `SessionBootstrapResponse`, `kind: "session_bootstrap"`). Used by the SPA on cold reload for cloud-account cookie resume and for returning-user flows that need fresh user documents.

### 7.5 `POST /api/v1/auth/sessions/logout` (private)

Requires a valid `eip_session` cookie (private route — wrapped by `AuthConstructor`).

Request:

```jsonc
{ "refresh_token": "<planner refresh>" }  // optional if eip_app_refresh cookie present
```

Response: `204 No Content` + `Set-Cookie` clears for all three auth cookies (`Max-Age=0`).

Server-side: `Store.RevokeSessionTokens` deletes `refresh_token:<presented>` and every other refresh token a scan attributes to the same `session_id`, then `Store.RemoveSession` removes the `account_sessions` row and its indexes. The SPA also calls `clearPlannerAuthCookiesClientSide()` so `eip_esi_oauth_storage` is removed even if the HTTP call fails (HttpOnly cookies require a successful logout response with `credentials: "same-origin"`).

### 7.6 `POST /api/v1/eve-sso/tokens/refresh`

Direct passthrough to CCP's refresh-token grant. Used by the SPA only for **local** (browser-stored) ESI refresh material.

```jsonc
{ "refresh_token": "<EVE OAuth refresh>" }
```

Response: same shape as `/exchange`.

---

## 8. Redis key map

| Key | Body | TTL | Purpose |
|---|---|---|---|
| `refresh_token:<token>` | `RefreshTokenData` JSON (account id, character hash, scopes, corps/alliances cache, session id, app version, timestamps) | 7d | Planner refresh token row. One per active device chain. |
| `account_sessions:<accountID>` | `AccountRecord` (map of `sessionID → Session`, grants) | 7d | All currently active planner sessions for an account. |
| `session_index:<sessionID>` | `<accountID>` (string) | 7d | Fast `sessionID → accountID` reverse lookup. |
| `session_refresh:<sessionID>` | `<token>` (string) | 7d | Fast `sessionID → current refresh token` reverse lookup. |
| `custom_claims_corporations:<accountID>` | JSON `[int64]` | 30d | Cached corporation grants for this account. |
| `custom_claims_alliances:<accountID>` | JSON `[int64]` | 30d | Cached alliance grants for this account. |

See [sessions.md §3](./sessions.md#3-redis-key-layout) for the full struct definitions and the `Store` methods that read/write them.

---

## 9. Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `EVE_CLIENT_ID` | yes | EVE SSO OAuth client id (used to mint exchange + refresh requests, and as the `azp` claim audience when verifying ESI JWTs). |
| `EVE_CLIENT_SECRET` | yes | EVE SSO OAuth client secret. |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | yes | Backing store for sessions and refresh tokens. |
| `REFRESH_TOKEN_AES_KEY` | yes for cloud | Base64 AES key (16/24/32 bytes) for encrypting **ESI** refresh tokens stored in Mongo. |
| `REFRESH_TOKEN_AES_KEY_VERSION` | no | Active key version for the keyring (default `"v1"`). |
| `REFRESH_TOKEN_AES_LEGACY_KEYS` | no | JSON `{ "<version>": "<base64 key>" }` for legacy decryption. |
| `AUTH_SESSION_CLEANUP_DRY_RUN` | no | Set `true` to have the orphan refresh-token sweep log what it would revoke without revoking it. |

---

## 10. Failure modes & status codes

| Condition | API response | Notes |
|---|---|---|
| `eip_session` / per-tab session id missing on private route | `401 { "code": "session_missing" }` | Middleware-level; the SPA does **not** auto-redirect on 401. The frontend `requireAuth` guard is purely state-based (`account.isLoggedIn`). |
| Session row missing / `RevokedAt` set | `401 { "code": "session_revoked" }` | Cleaned up by logout or admin tooling. |
| `ReauthRequiredAt` past now | `401 { "code": "reauth_required" }` | Hard 7-day cap; user must run the full SSO flow again. |
| Redis unreachable while resolving or touching a session | `503 { "code": "service_unavailable" }` | Classified through `dependency.IsUnavailable`; distinct from `session_missing`. |
| `refresh_token` Redis row missing on rotate / bootstrap | `401 { "code": "session_revoked" }` | Most often: the token was rotated by another tab or device. The SPA treats the code as terminal and starts a full EVE SSO login. |
| `refresh_token` Redis row missing on logout | `401 "Invalid token"` | The client clears its cookies regardless. |
| Cloud account with no stored ESI material, or stored ESI refused by EVE SSO, on rotate / bootstrap | `401 { "code": "session_revoked" }` | The account has to authorise its main character again. |
| Wrong account on logout | `401 "Unauthorized"` | The presented refresh token's `account_id` must match the session-cookie account. |
| Tranquility cached offline (frontend) | refresh path returns early | No HTTP issued; existing cookies remain valid until they expire. |

---

For implementation detail, jump to:

- **[spa.md](../../../frontend/auth/spa.md)** — how the SPA orchestrates these flows.
- **[sessions.md](./sessions.md)** — how the API and websocket service enforce identity.
