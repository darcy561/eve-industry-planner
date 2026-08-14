# Frontend tests

## Owns (SoT)

How the SPA under [`frontend/`](../../../frontend/) is tested, plus qualitative test depth when topic files land here.

**Placeholder** — entrypoints and depth topics are not written yet. Until then: Vitest via `frontend/package.json` scripts (`npm test` / `npm run coverage`); existing `*.test.js(x)` under `frontend/src/` and `frontend/tests/`.

## Does not own

- SPA behaviour → [frontend/contents.md](../../frontend/contents.md)
- Cross-cutting layers map → [../overview.md](../overview.md)
- Services / Deployment Tool depth → [../services/contents.md](../services/contents.md), [../deployment-tool/contents.md](../deployment-tool/contents.md)

## Depth labels

Same as other testing modules when topics land: **Tested** / **Thin** / **Little / none** (not coverage-%). See [services/contents.md](../services/contents.md) § Depth labels.

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Unit (Vitest) | From `frontend/`: `npm test` | Watch mode (Vitest) |
| Unit once | `npm test -- --run` | CI-style single pass |
| Coverage | `npm run coverage` | `vitest run --coverage` |
| CI | [`.github/workflows/test.yml`](../../../.github/workflows/test.yml) job `frontend` | Selected when `frontend/**` changes — [overview](../overview.md) § CI test suite |

## Task map

| I need to… | Read |
|------------|------|
| _(add rows when topic files land — e.g. auth, document-lock, planner)_ | |
