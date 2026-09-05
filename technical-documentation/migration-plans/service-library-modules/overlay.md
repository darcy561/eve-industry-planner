# Service library modules — overlay

What changed and how it works after each slice lands. Overlay wins over live SoT for the surfaces
below while this project is active; where there is no entry here, live docs remain the truth.

Nothing has landed yet — all sections are scaffolds.

## Module layout

_Empty — fill as each module lands: module path, packages it owns, what depends on it, and how the
`replace` wiring is set up._

## Build inputs

_Empty — fill after Track B: what each service image copies, how the closure list is generated, and
which changes do and do not produce a new image digest._

## Decisions recorded

_Empty — fill as open decisions in [plan.md](./plan.md) resolve, with the outcome and the reasoning._

## Promote targets

| Overlay section | Live SoT it folds into on promote |
|---|---|
| Module layout | [backend/contents.md](../../backend/contents.md) and the backend shared topic docs |
| Build inputs | [stack/stack.md](../../stack/stack.md); test/publish workflow conventions alongside [testing/contents.md](../../testing/contents.md) |
| Module layout rules that outlive the project | [technical-rules.md](../../technical-rules.md) § Package / module layout and refactors |
