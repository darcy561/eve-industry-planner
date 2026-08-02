# Documentation rules (deployment / deployment-tool)

Applies to docs under `deployment/deployment-tool/`. On overlap with the project master [`../../documentation-rules.md`](../../documentation-rules.md) (or parent `deployment/documentation-rules.md` if present), **this file wins** for those docs; otherwise the nearer parent / master applies.

- Entry: [`contents.md`](./contents.md) → [`cli/contents.md`](./cli/contents.md) / [`tui/contents.md`](./tui/contents.md).
- Topic isolation + current-behaviour from the master apply to `cli/*.md` and `tui/*.md` unless overridden here.
- [`cli/testing.md`](./cli/testing.md) uses the master **Testing topic doc shape** for run/CI/`enginetest` conventions. Qualitative depth by package → [`../../testing/deployment-tool/contents.md`](../../testing/deployment-tool/contents.md). Cross-cutting testing map → [`../../testing/contents.md`](../../testing/contents.md).
