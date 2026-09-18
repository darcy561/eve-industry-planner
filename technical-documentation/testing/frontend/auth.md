# SPA auth — tests

Live SoT for test depth across the SPA's authentication surface: credential acquisition, the planner session, login and post-login sync, and private-request recovery. Behaviour → [frontend/auth/spa.md](../../frontend/auth/spa.md). Route access and the guard that resumes a session → [navigation.md](./navigation.md). Module entrypoints → [contents.md](./contents.md).

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Whole suite | From `frontend/`: `npm test -- --run` | Vitest; no browser, no stack |
| One file | `npx vitest run src/Zustand/account/plannerSessionRecovery.test.js` | Tightest loop |
| Auth tree | `npx vitest run src/Functions/Auth` | Provider, strategies, character building, grants, reauth classification, login progress, step retry |
| Coverage | `npm run coverage` | `vitest run --coverage` |

Tests sit beside the module they cover; shared fixtures and helpers are in `frontend/src/tests/` ([frontend/technical-rules.md](../../frontend/technical-rules.md) § Tests sit beside what they test). The signed-JWT builder these suites use is `esiAccessToken` there — do not re-type one in a test file.

The SPA's own parity test for what a session response can carry,
`Functions/Auth/sessionResponse.parity.test.js`, reads a fixture generated on the Go side rather than
one authored here — see [testing/services/api.md](../services/api.md) § Coverage map and
[harness.md](../harness.md) § Model parity for the committed-fixture pattern it follows.

## Coverage map

**Depth:** Strong on credential acquisition, credential health, the planner session action and its recovery paths, login progress and step retry, and post-login prefetch. React component rendering of auth surfaces is thin. No browser-level end-to-end exists.

### Tested

| Area | What the tests cover |
|------|----------------------|
| `Functions/Auth/esiCredentials/provider.js` | A held token inside the buffer is returned and outside it is refreshed; concurrent callers for one character produce one refresh; failure classes pass through unchanged; adoption guards; `forget` drops a character |
| `Functions/Auth/esiCredentials/health.js` | Nothing is known of a character nothing has been asked of; a record change notifies its readers; a repeated identical state does not; `forget` drops one character's record without disturbing the rest |
| `Components/Auth/Hooks/useCredentialHealth.jsx` | Exercised through the surface reading it — see [accounts.md](./accounts.md) § Tested — rather than in isolation |
| `Functions/Auth/esiCredentials` singleton | Strategy resolved per call, including an account switching between cloud and local while running; a rotated client secret reaching both the roster and the main character's resume slot; blocked browser storage; a character no longer on the roster |
| `Functions/Auth/esiCredentials/strategies.js` | Each mode's endpoint and failure class; classification from `err.status` and from a message; a response carrying no access token; batching — several characters in one tick become one request, a hash asked for twice is asked once, a window wider than the server's cap splits into two requests, a per-character `error` fails only that character, and a failed request is recoverable for every waiter rather than reauth-required |
| `Functions/Auth/buildCharacterFromCredentials.js` | All three entry points; the main character's resume secret written on success, cleared on failure, and left alone for an alt |
| `Functions/Auth/refreshAccountSessionGrants.js` | One token per character; partial acquisition failures still submit the rest; the cloud short-circuit |
| `Functions/Auth/plannerSessionRedirect.js` | Each of the three reauth vocabularies — the stored deadline, a terminal code (parsed string, `err.code`, or only in a message), an `EsiCredentialError` classification — pinned to the outcome it produces; a recoverable failure (`session_missing`, a recoverable `EsiCredentialError`, a bare network error) classifies as no demand |
| `Functions/Auth/loginProgress.js` | Steps accumulated whether they land before or after a reader subscribes; `whenLoginComplete()` resolving once all four steps report; `startLogin()` arming a clean slate for a retry |
| `Functions/Auth/retryLoginStep.js` | Each of the three retryable steps re-emits its own completion without re-running the others; `characterData` is not retryable |
| `Functions/Auth/authRefreshTranquilityGate.js` | Deferral only on a successful fetch reporting offline; an unfilled cache does not defer |
| `Functions/Auth/characterHashCanonical.js` | Canonical form used for roster lookups and comparisons |
| `Functions/Auth/characterAffiliations.js` | The forced order — public data, then corporation, then alliance — and that a corporation or alliance the account already holds gains the character without being asked about again |
| `Functions/Endpoints/esiAccessClient.js` | All three calls, including that a refused batch carries its HTTP status — the value the strategy classifies on |
| `Zustand/account/plannerSessionActions.js` — recovery | A coded terminal rejection redirects to full EVE SSO and clears the tab's credentials; an uncoded one does not; a failed rotate is not retried by the next call, including a forced one; it resumes after the backoff; a success clears the record |
| `Zustand/account/plannerSessionActions.js` — storage modes | Cloud rotates with an empty `eve_token` when none can be acquired; local does not rotate at all and redirects when its credentials are dead |
| `Zustand/account` — render-freedom | **A token refresh notifies no store subscriber**, and no token lands on the character; removing a character drops its held token |
| `Zustand/account/characterActions.js`, `corporationsActions.js` | Roster writes for characters and corporations |
| `Components/Auth/Hooks/useLoginState.jsx` | Reads `loginProgress` through `useSyncExternalStore`, including steps that completed before the hook mounted |
| `Components/Auth/Hooks/useAuthUrlLogin.js` | Mode selection — `oauthCode`, `cookieCloudResume`, `eveClientRefresh`, and the full-SSO fallback |
| `Components/Auth/LoginUI/LoginUI.jsx` | Rendered login-progress states, including the retry affordance on a failed retryable step |
| `Components/Auth/bootstrapLoginSteps.test.js` | The three bootstrap steps (job documents, job groups, watchlist) each emit their own completion and error independently |
| `Functions/Endpoints/Private/applyPrivateHeaders.js` | The session is ensured before sending; a `session_missing` body forces **one** rotate and **one** retry; a body carrying a reauth demand redirects instead of retrying |
| `Functions/EveESI/Character/getSkills.js` | A fetcher acquires its own token and sends it, and makes no ESI call when none can be acquired |
| `Functions/Character/prefetchCharacterData.js` | The query list pinned **by name** rather than by count; `enabled` forced; a failing query settles rather than stopping the character; timing closed for a query that throws before fetching; the three-character concurrency bound; waterfall logging only when asked |
| `Components/Auth/runPostLoginAccountSync.js` | Login prefetches the characters it just built, and neither blocks nor fails on the prefetch |
| `Hooks/React Query/accountAffiliation.js` | Every live character re-read and grants resubmitted; a placeholder row skipped; one character's public data failing does not stop the grants submission; a corporation change writes the roster, and **nothing changing writes nothing** |
| `Functions/Auth/sessionResponse.parity.test.js` | Every field the SPA persists off a login, bootstrap or rotate response is present on the committed server-side surface, including the reauth deadline on both bootstrap and rotate |

Two of these are worth keeping red-tested when the code around them changes: the refresh that notifies no subscriber, and the affiliation pass that does not touch the store when nothing changed. Both guard the property that a periodic or repeated auth operation renders nothing, and nothing else in the suite fails if it is lost.

### Thin

- `plannerSessionActions.js` as a file: `ensurePlannerSession` is covered on both storage modes, its cooldown, its failure backoff and its recovery path, but the login-response reducers beside it (`applyLoginAuthResponse`, `applyUserDocumentFromRemote`, `setSessionTokens`) have no tests of their own.
- `Hooks/React Query/accountAffiliation.js`: the query function is covered, the `useQuery` wiring and its `enabled` gate are not.

### Little / none

- Browser-level end to end: there is no Playwright or equivalent, so a scenario that needs two real tabs — duplicating a logged-in tab so both hold one refresh token — is reproduced structurally rather than by driving a browser.

## Topic-only detail

- Depth labels → [contents.md](./contents.md) § Depth labels.
- **The recovery tests assert against a literal response body**, and the server test that produces it lives in [testing/services/api.md](../services/api.md) § Coverage map. They are a pair: the client suite pins that a 401 carrying `code: session_revoked` drives a full EVE SSO login, and the server suite pins that the API answers with exactly that. Change one side alone and the other fails.
- Only the browser navigation leaf (`eveSSORedirect`) is mocked in the recovery tests, so code parsing, terminal classification and the action's own catch all run.
- The batching assertion runs on the **real** microtask scheduler rather than an injected one: an injected window gathers the calls whatever the strategy does, and would pass against a strategy that sends per character.
