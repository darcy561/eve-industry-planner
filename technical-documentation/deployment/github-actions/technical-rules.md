# Technical rules (deployment / github-actions)

Applies when editing `.github/workflows/**` or docs under `deployment/github-actions/`. On overlap with the project master [`../../technical-rules.md`](../../technical-rules.md), **this file wins**; otherwise the master applies.

- Workflow contracts and publish/prerelease docs → [`contents.md`](./contents.md).
- Operator binary/channel behaviour is not owned here → [`../deployment-tool/cli/release-channels.md`](../deployment-tool/cli/release-channels.md).
- Prefer extending existing workflow jobs/actions over parallel one-off publish scripts. Flag breaking tag/contract changes in planning (shared API/wire bar from the master).
