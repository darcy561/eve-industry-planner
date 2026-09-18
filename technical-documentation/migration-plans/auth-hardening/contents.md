# Auth hardening

## Owns

The work still outstanding on the planner authentication stack — EVE SSO, planner Redis sessions, API
middleware, the WebSocket upgrade, cloud ESI credential maintenance, and the SPA's handling of all of
it — and the investigation that has to happen before each piece can be scoped.

- The stages of outstanding work, what each one has to answer, and the order they unblock each other
  in — [plan.md](./plan.md). Stage G covers binding a sign-in callback to the browser that started it,
  and the logout a link can perform.
- The audit that produced those stages: every claim the retired auth roadmap made, checked against
  the code as it stands, sorted into shipped, still open, and superseded — [current-state.md](./current-state.md).
- The behaviour facts the retired roadmap was the only home for, held here until they promote into
  live documentation — [overlay.md](./overlay.md).

## Does not own

- How authentication works today — vocabulary, wire contracts, flows, Redis key map →
  [backend/api/auth/overview.md](../../backend/api/auth/overview.md) and
  [backend/api/auth/sessions.md](../../backend/api/auth/sessions.md). Live SoT, untouched until this
  project promotes.
- Current SPA auth behaviour → [frontend/auth/spa.md](../../frontend/auth/spa.md).
- How the SPA acquires ESI tokens → [frontend/auth/spa.md](../../frontend/auth/spa.md). Token
  acquisition was rebuilt around a credential provider and the React-mounted refresh clocks were
  deleted; this project owns nothing about it. That work has landed on this lineage, and the audit
  verdicts it moved are re-checked in [current-state.md](./current-state.md).
- Entity refs and refresh-token encryption at rest in Mongo →
  [entity-id-encryption/contents.md](../entity-id-encryption/contents.md). Encryption of the planner's
  own `refresh_token:*` rows in Redis is a separate question and is Stage F here.
- What a session's grants mean, where the owner-key list is filled from, and the membership
  revocation path → [shared-planners/contents.md](../shared-planners/contents.md). Revoking a
  membership and revoking an account's sessions turned out to be separate operations — the first
  rewrites stored grants, the second sweeps session keys — so Stage B here builds its own and
  duplicates nothing. Whether a failed grants fill should refuse a session is that project's § Stage I.
- The document lock, its namespacing, and realtime consistency under more than one writer →
  [shared-planners/contents.md](../shared-planners/contents.md) and
  [document-write-granularity/contents.md](../document-write-granularity/contents.md).

## Task map

| I need to… | Read |
|------------|------|
| Understand why this project exists and what closes it | [plan.md](./plan.md) § Why this project exists, § Done when |
| See what the auth stack already covers, with the evidence | [current-state.md](./current-state.md) § What has shipped |
| See what is genuinely still missing, with the evidence | [current-state.md](./current-state.md) § What is still open |
| Find out why an item from the old roadmap is not here | [current-state.md](./current-state.md) § Superseded or owned elsewhere |
| Investigate why session rejection differs between REST and the WebSocket | [plan.md](./plan.md) § Stage A |
| Pick up account-wide revocation, and see why it is no longer blocked | [plan.md](./plan.md) § Stage B |
| Work out what an operator can see when auth fails | [plan.md](./plan.md) § Stage C |
| Work out what a user sees when a cloud ESI credential dies | [plan.md](./plan.md) § Stage D |
| Understand what happens when bootstrap half-succeeds, and what was decided | [plan.md](./plan.md) § Stage E |
| Find out where the grants ceiling question went | [plan.md](./plan.md) § Stage E, [shared-planners/plan.md](../shared-planners/plan.md) § Stage I |
| Take a decision on refresh-token encryption, CSRF, or a variable reauth window | [plan.md](./plan.md) § Stage F |
| Understand how a sign-in callback is bound to the browser that asked for it | [plan.md](./plan.md) § Stage G |
| See what the cross-site sweep checked and what it found sound | [current-state.md](./current-state.md) § The cross-site sweep |
| Check whether a change breaks a client | [plan.md](./plan.md) § Wire compatibility |
| See which stages have landed | [plan.md](./plan.md) § Stages |
| Find the auth invariants that no live document states yet | [overlay.md](./overlay.md) § Session window invariants |
| Find the corrected picture of what auth tests cover | [overlay.md](./overlay.md) § Auth test coverage |
| Promote this project and fix what pointed at the retired roadmap | [plan.md](./plan.md) § Promote |
