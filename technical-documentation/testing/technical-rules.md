# Technical rules (testing)

Applies when editing testing docs or shared test harness guidance. On overlap with the project master [`../technical-rules.md`](../technical-rules.md), **this file wins**; otherwise the master applies.

- Shared bar already in the master: **testing as we build**, unit tests + per-area helpers, eventual e2e.
- Doc layout → master **Testing topic doc shape** + [`documentation-rules.md`](./documentation-rules.md).
- Map / entrypoints → [`contents.md`](./contents.md), [`overview.md`](./overview.md), [`services/contents.md`](./services/contents.md), [`deployment-tool/contents.md`](./deployment-tool/contents.md), [`frontend/contents.md`](./frontend/contents.md) (placeholder).
- Deployment Tool run/CI conventions → [`../deployment/deployment-tool/cli/testing.md`](../deployment/deployment-tool/cli/testing.md); depth inventory → [`deployment-tool/contents.md`](./deployment-tool/contents.md).
- Do not invent a second global test style here. Shared Go harness / ops-soak **code** lives under [`services/testing/`](../../services/testing/) (import `eve-industry-planner/testing/…`). Document each harness area as its own topic here (same testing topic shape) — start: [harness.md](./harness.md) — and extend this file when concrete shared conventions appear.
- Ops soak (`testing/ws_soak`): default edge URL is Traefik; always override `LOG_LEVEL=warn` (or higher) in the docker run; fanout wall = ramp (connect) + duration (publish); report `pending` is harness expects, not NATS/WS queues — details in [harness.md](./harness.md).
