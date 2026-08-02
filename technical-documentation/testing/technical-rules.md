# Technical rules (testing)

Applies when editing testing docs or shared test harness guidance. On overlap with the project master [`../technical-rules.md`](../technical-rules.md), **this file wins**; otherwise the master applies.

- Shared bar already in the master: **testing as we build**, unit tests + per-area helpers, eventual e2e.
- Doc layout → master **Testing topic doc shape** + [`documentation-rules.md`](./documentation-rules.md).
- Map / entrypoints → [`contents.md`](./contents.md), [`overview.md`](./overview.md), [`services/contents.md`](./services/contents.md), [`deployment-tool/contents.md`](./deployment-tool/contents.md), [`frontend/contents.md`](./frontend/contents.md) (placeholder).
- Deployment Tool run/CI conventions → [`../deployment/deployment-tool/cli/testing.md`](../deployment/deployment-tool/cli/testing.md); depth inventory → [`deployment-tool/contents.md`](./deployment-tool/contents.md).
- Do not invent a second global test style here. When a shared harness lands, document it as its own topic under this folder (same testing topic shape) and extend this file with the concrete conventions.
