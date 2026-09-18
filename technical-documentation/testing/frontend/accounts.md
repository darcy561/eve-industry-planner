# Accounts page — tests

Live SoT for test depth across the Accounts page: the roster, a character's row and its action menu,
credential health as shown there, ESI data status, the corporations section, shared planners, token
storage, and community citadel names. Behaviour →
[frontend/accounts/contents.md](../../frontend/accounts/contents.md). Module entrypoints →
[contents.md](./contents.md).

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Whole suite | From `frontend/`: `npm test -- --run` | Vitest; no browser, no stack |
| Accounts tree | `npx vitest run "src/Components/Accounts"` | Every component and hook under this topic |
| Coverage | `npm run coverage` | `vitest run --coverage` |

Tests sit beside the module they cover; shared fixtures and helpers are in `frontend/src/tests/`. The
users store is mocked through `usersStoreHarness.js`, the snackbar events through
`snackbarHarness.js`, and a React Query client comes from `queryClients.js` — see
[contents.md](./contents.md) for the traps in reaching for these.

## Coverage map

**Depth:** Strong across every component and hook on the page, including the SSO popup import and
relink flow. Two kinds of defect are structurally invisible to this suite rather than merely
untested — see § Little / none.

### Tested

| Area | What the tests cover |
|------|----------------------|
| `AccountEntry.jsx` | Naming and portrait; the corporation shown or its absence; removal and what it clears locally and in the cloud; the credential-health chip for each state, including that a passing failure carries how long ago it was seen and a spent one does not; renewing offered while a secret may still work, linking again offered once it is spent; renewing surviving a credential the acquisition cannot serve; clearing what is held for one character and leaving the rest; removal offered only in the row menu, and never for the main character; the ESI status disclosure held back until opened |
| `accountInfo.jsx` | The main character's name and portrait; the account id shown, copied, and read as unknown rather than blank when absent; the stored name as a fallback before the roster exists; who the main character flies for; no corporation or alliance named when there is none; no paragraph about linking |
| `Accounts.jsx` | Every section present; the account id shown here, where first login does not show it; the page claiming the width of the layout row it sits in |
| `AdditionalAccounts.jsx` | Every character listed, the main one first and marked; a way to link another character offered; an account with nothing linked; the main character left out where a caller already shows it separately; the roster laid out as a column; roster order held when a row opens its ESI data |
| `CharacterEsiStatus.jsx` | Every collection fetched for a character named; corporation-wide collections left to the corporation's own list; a held collection's age shown; a collection nothing has fetched read as not held; an on-demand collection read as fetched when opened; the session-only limitation stated plainly |
| `CitadelNamesCommunityPanel.jsx` | Whether the reader is sharing shown and changed, and saved; what sharing means explained |
| `CorporationEsiSection.jsx` | One card per corporation however many members are linked; each corporation's list held back until opened; nothing drawn for an account in no corporation |
| `CorporationEsiStatus.jsx` | Every corporation-wide collection named and nothing else; a held collection read as fresh; a collection nothing has fetched read as not held; a wallet collection reported as its worst division |
| `CorporationsPanel.jsx` | A section with one row per corporation; nothing drawn when there are none |
| `PlannersPanel.jsx` | Every planner listed with why the account is in it; the active one marked; a planner nothing has opened yet not distinguished from one that has; the owner's own artwork worn, and none for a planner with no entity behind it; a custom planner's actions offered, each saying what it waits for; nothing managed on a group-access or the account's own planner; nothing drawn while loading or when the listing cannot be had; everything but leaving offered on a custom planner the account owns |
| `TokenStorageChoice.jsx` | Which mode a reader is on, and what it means; moving stored tokens to the cloud, including when the browser has nothing stored to send; writing tokens back to the browser on leaving the cloud; no-op when the chosen mode is already set |
| `useLinkCharacter.js` | Adding a character the account does not have; refusing one it already holds; replacing the secret of a character being linked again, including sending it to the server in cloud mode; refusing a sign-in as a different character than the one being linked again; a failed exchange reported rather than swallowed; the main character's replaced secret written where a reload will find it; an add counted and a relink not; only one sign-in in flight for the account at a time |
| `useMainCharacter.js` | The character the roster marks as main; the stored name as a fallback before the roster exists; read as unknown rather than blank when neither is held |

### Little / none

- **Layout.** jsdom runs no layout and evaluates no media query, so a reflow or a breakpoint change
  cannot be asserted directly. What a test can hold is a container's own shape — the roster asserts
  it is a flex column, and the page asserts it claims the width of the layout row it sits in — each
  written by breaking the thing it guards and watching the assertion fail.
- **What outlives a session.** A replaced refresh secret that reaches memory but not
  `localStorage["Auth"]` works perfectly until the tab is closed. The relink tests use a main
  character for exactly that reason, so the write-through is exercised rather than assumed.
- Browser-level end to end, as for the rest of the SPA — see [auth.md](./auth.md) § Little / none.

## Topic-only detail

- `AccountEntry.test.jsx` writes and reads `Functions/Auth/esiCredentials/health.js` directly to
  drive each credential-health state, rather than mocking `useCredentialHealth` — the same record the
  provider writes in production.
- The SSO popup flow is the most intricate thing this page carries, and was the last part of it to
  get any coverage; `useLinkCharacter.test.jsx` is the file to read before changing anything about how
  a character is added or relinked.
