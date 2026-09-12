# Frontend — job planner

## Owns (SoT)

Behaviour of the job planner page's own panels under
[`frontend/src/Components/Job Planner`](../../../frontend/src/Components/Job Planner)
and the shared `useJobStatuses` hook: the job status accordion list, its
expansion state, and how that state follows the signed-in account.

## Does not own

- The job dependency tree, shared with the group page → [../group/job-tree.md](../group/job-tree.md)
- Document-lock UI and per-card read-only state → [../document-lock/spa.md](../document-lock/spa.md)
- Routing and page chrome → [../navigation/spa.md](../navigation/spa.md)

## Task map

| I need to… | Read |
|------------|------|
| Change the job status stages, their expansion state, or how that state follows the account | [job-status.md](./job-status.md) |
