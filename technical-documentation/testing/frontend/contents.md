# Frontend tests

## Owns (SoT)

How the SPA under [`frontend/`](../../../frontend/) is tested, plus qualitative test depth in the topic files here.

## Does not own

- SPA behaviour → [frontend/contents.md](../../frontend/contents.md)
- Cross-cutting layers map → [../overview.md](../overview.md)
- Services / Deployment Tool depth → [../services/contents.md](../services/contents.md), [../deployment-tool/contents.md](../deployment-tool/contents.md)

## Depth labels

Same as other testing modules: **Tested** / **Thin** / **Little / none** (not coverage-%). See [services/contents.md](../services/contents.md) § Depth labels.

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Unit (Vitest) | From `frontend/`: `npm test` | Watch mode (Vitest) |
| Unit once | `npm test -- --run` | CI-style single pass |
| Coverage | `npm run coverage` | `vitest run --coverage` |
| CI | [`.github/workflows/test.yml`](../../../.github/workflows/test.yml) job `frontend` | Selected when `frontend/**` changes — [overview](../overview.md) § CI test suite |

`*.test.js(x)` sit beside the module they test under `frontend/src/`; reusable fixtures and helpers
live in `frontend/src/tests/`. Reach for an existing one before writing a mock: a static data file is
mocked through `cachedDataMock.js` or seeded through `seedItems.js` ([static-data.md](./static-data.md)),
a location name through `seedLocationNames.js`, and the snackbar events through `snackbarHarness.js`.

## Task map

| I need to… | Read |
|------------|------|
| SPA auth test depth — credentials, planner session, login | [auth.md](./auth.md) |
| Routing test depth — the guard, route loaders, and the screens a reader sees | [navigation.md](./navigation.md) |
| Asset and blueprint collection test depth — builders, index hooks, scheduler, library rendering | [esi-collections.md](./esi-collections.md) |
| Static data test depth — the file owners, and how to mock or seed one | [static-data.md](./static-data.md) |
| _(add rows as topic files land — e.g. document-lock, planner)_ | |
