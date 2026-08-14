# Technical rules (testing)

Applies when editing testing docs or shared test harness guidance. On overlap with the project master [`../technical-rules.md`](../technical-rules.md), **this file wins**; otherwise the master applies.

- Shared bar already in the master: **testing as we build**, unit tests + per-area helpers, eventual e2e.
- Doc layout → master **Testing topic doc shape** + [`documentation-rules.md`](./documentation-rules.md).
- Map / entrypoints → [`contents.md`](./contents.md), [`overview.md`](./overview.md), [`services/contents.md`](./services/contents.md), [`deployment-tool/contents.md`](./deployment-tool/contents.md), [`frontend/contents.md`](./frontend/contents.md) (placeholder).
- Deployment Tool run/CI conventions → [`../deployment/deployment-tool/cli/testing.md`](../deployment/deployment-tool/cli/testing.md); depth inventory → [`deployment-tool/contents.md`](./deployment-tool/contents.md).
- Do not invent a second global test style here. Shared Go harness / ops-soak **code** lives under [`services/testing/`](../../services/testing/) (import `eve-industry-planner/testing/…`). Shared cross-soak helpers: [`testing/harness`](../../services/testing/harness) (`ConnectNATS`, `PollUntil`, `AsynqRedisOpt`). WS client SoT: [`testing/ws_soak/lib`](../../services/testing/ws_soak/lib). Document each harness area as its own topic — start: [harness.md](./harness.md).
- Ops soak (`testing/ws_soak`): default edge URL is Traefik; always override `LOG_LEVEL=warn` (or higher) in the docker run; fanout wall = ramp (connect) + duration (publish); report `pending` is harness expects, not NATS/WS queues — details in [harness.md](./harness.md).
- Capacity soak (`testing/capacity_soak`): prefer host + `DOCKER_HOST` for desired replicas; shorten operator `scale_*` for demos; `-phase all|up|down`; worker uses `harness.AsynqRedisOpt` / `CapacitySoakNoop`; websocket/api call soaklib hold with `Accounts==Clients` — details in [harness.md](./harness.md) § Capacity soak.
