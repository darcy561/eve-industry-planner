# `/api/v1` session and ESI surfaces

Planner **app session** (opaque Redis refresh + cookies) is separate from **ESI access JWT** (CCP) and from **OAuth credential storage** (Mongo).

## Planner session

| Method | Path | Response `kind` |
|--------|------|-------------------|
| POST | `/api/v1/auth/sessions` | `session_bootstrap` |
| POST | `/api/v1/auth/sessions/bootstrap` | `session_bootstrap` |
| POST | `/api/v1/auth/sessions/rotate` | `session_rotate` |
| POST | `/api/v1/auth/sessions/logout` | (204 no body) |

Bootstrap payloads include `esi_oauth_storage`: `client` \| `server` (mirrors `userCloudAccounts`). The browser may also read `eip_esi_oauth_storage` cookie (routing hint).

## ESI access (split by storage mode)

| Mode | Method | Path |
|------|--------|------|
| Client-held OAuth refresh | POST | `/api/v1/eve-sso/tokens/refresh` |
| Server-stored OAuth refresh | POST | `/api/v1/esi/characters/access-token/server` (private) |

Raw CCP OAuth exchange remains `POST /api/v1/eve-sso/tokens/exchange`.

## Linked-character OAuth credentials (server storage)

| Method | Path |
|--------|------|
| GET, PUT, DELETE | `/api/v1/user/linked-characters/oauth-credentials` |

GET returns character hashes only.

## SPA module layout

- **Session:** [`frontend/src/Functions/Auth/sessionClient.js`](frontend/src/Functions/Auth/sessionClient.js) (re-exported as `serverTokens.js`; URLs live at the top of that file).
- **ESI access HTTP:** [`frontend/src/Functions/Endpoints/esiAccessClient.js`](frontend/src/Functions/Endpoints/esiAccessClient.js).
- **OAuth credentials (private):** [`frontend/src/Functions/Endpoints/Pirivate/accountCredentialsClient.js`](frontend/src/Functions/Endpoints/Pirivate/accountCredentialsClient.js) and [`cloudStoredEsiRefreshTokens.js`](frontend/src/Functions/Endpoints/Pirivate/cloudStoredEsiRefreshTokens.js).
