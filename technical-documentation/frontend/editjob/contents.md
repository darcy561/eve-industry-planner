# Frontend — Edit Job

## Owns (SoT)

Behaviour of the Edit Job page's own controls under
[`frontend/src/Components/Edit Job`](../../../frontend/src/Components/Edit Job):
the floating step-navigation arrows, and which jobs the Link Parent Job dialogue
offers.

## Does not own

- The Edit Job reducer, its actions, and how a component changes the job being
  edited → [../technical-rules.md](../technical-rules.md) § Changing the job
  being edited
- The SPA's shared dialogue shell → [../technical-rules.md](../technical-rules.md)
  § Dialogues
- Document-lock UI and read-only gating on Edit Job controls →
  [../document-lock/spa.md](../document-lock/spa.md)
- The job dependency tree component itself, shared with the group page →
  [../group/job-tree.md](../group/job-tree.md)

## Task map

| I need to… | Read |
|------------|------|
| Change when the floating step arrows appear, or how they watch their controls | [floating-step-buttons.md](./floating-step-buttons.md) |
| Change which jobs the Link Parent Job dialogue offers | [parent-job-link.md](./parent-job-link.md) |
