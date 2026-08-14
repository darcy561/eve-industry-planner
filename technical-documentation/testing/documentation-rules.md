# Documentation rules (testing)

Applies to docs under `testing/`. On overlap with the project master [`../documentation-rules.md`](../documentation-rules.md), **this file wins** for those docs; otherwise the master applies.

- Entry: [`contents.md`](./contents.md).
- Topic layout: master **Testing topic doc shape** ([`../documentation-rules.md`](../documentation-rules.md) § Testing topic doc shape). Use it for every live topic here (`overview.md`, `services/*.md`, `deployment-tool/*.md`, future harness topics).
- Feature behaviour under test stays in the owning frontend / backend / stack / deployment-tool topic — link once from the coverage map.
- Services module: [`services/contents.md`](./services/contents.md) is the entry; **one topic file per service** under `services/`.
- Deployment Tool depth: [`deployment-tool/contents.md`](./deployment-tool/contents.md) is the entry; **one topic file per package area** under `deployment-tool/`. How to run / CI / `enginetest` conventions stay next to the tool → [`../deployment/deployment-tool/cli/testing.md`](../deployment/deployment-tool/cli/testing.md).
- Frontend: [`frontend/contents.md`](./frontend/contents.md) is the entry (placeholder until depth topics land). Prefer **one topic file per SPA area** (e.g. auth, document-lock) when filled in.
- Each depth topic uses **Tested** / **Thin** / **Little / none** with “what the tests cover” rows (not bare paths).
- Release / publish CI mechanics → [`../deployment/github-actions/contents.md`](../deployment/github-actions/contents.md).
- Current-behaviour and one-hop rules from the master apply. No roadmap links in topic docs — backlog pointers belong on `contents.md` Does not own only.
