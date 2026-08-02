# Documentation rules (deployment / github-actions)

Applies to docs under `deployment/github-actions/`. On overlap with the project master [`../../documentation-rules.md`](../../documentation-rules.md) (or parent `deployment/documentation-rules.md`), **this file wins** for those docs; otherwise the nearer parent / master applies.

- Entry: [`contents.md`](./contents.md). Workflow YAML SoT remains under `.github/workflows/`.
- Do not re-teach bootstrap / `kit.Channel` / operator channel behaviour here — link [`../deployment-tool/cli/release-channels.md`](../deployment-tool/cli/release-channels.md).
- One-hop + current-behaviour from the master apply unless overridden here.
