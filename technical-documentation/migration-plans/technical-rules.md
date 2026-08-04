# Technical rules (migration-plans)

Applies when implementing backlog work tracked under `migration-plans/`, or when editing technical notes in this folder. On overlap with the project master [`../technical-rules.md`](../technical-rules.md), **this file wins** only for process notes here; **code** still follows the nearest live area’s technical rules (`backend/`, `stack/`, `deployment/deployment-tool/`, etc.).

- Folder purpose, Phase 1 gate, overlay SoT, no live-doc edits until promote → [`documentation-rules.md`](./documentation-rules.md).
- Project folders are named for the **work**, not a git branch; project complete = promote, not merge (see documentation-rules § One subfolder).
- **No product/code work until Phase 1** (project subfolder + docs scaffold) is complete.
- Engineering practices from the master apply to implementation the same as any other change — migration status does not relax testing, security, or code quality bars.
- While a project is active: document behaviour changes in the **project subfolder** (overlay). Do **not** edit live SoT until the project is complete and promotion is approved.
- **Product code comments stay current-behaviour only** (master [`../technical-rules.md`](../technical-rules.md) § Current behaviour only): describe what the code owns today. Do **not** point comments at migration tickets, overlay files, roadmap section numbers, or “landed in #N / Section N”. Ticket/section narrative lives in the project overlay and roadmap — not in `deployment-tool/`, `services/`, stack YAML comments, etc.
- After go-ahead: promote overlays into live docs; leave history here.
