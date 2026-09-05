# deploy / engine — tests

Live SoT for test depth under [`deployment-tool/internal/deploy`](../../../deployment-tool/internal/deploy) and [`internal/engine`](../../../deployment-tool/internal/engine). Behaviour → [deploy.md](../../deployment/deployment-tool/cli/deploy.md). Module map → [contents.md](./contents.md).

## Entrypoints

```bash
# from deployment-tool/
go test ./internal/deploy/
# internal/engine has no *_test.go today
```

## Coverage map

**Depth:** Thin — guard rails and fragment state machine only. Full recipe/materialise orchestration and **`internal/engine` are largely untested**.

### Tested

| Area | What the tests cover |
|------|----------------------|
| Source / obs | Source resolution; obs stack requirement; bad-source rejection on run/rematerialise |
| Fragments | Deploy fragment state machine; recipe-ready parent context |

### Thin

- Obs run/rematerialise — rejection/guards, not happy-path two-pass deploy

### Little / none

- `materialise`, `inspect`, `labels`, full `recipe` orchestration
- Entire `internal/engine` package

## Topic-only detail

- Prefer expanding unit tests with fakes over requiring a live Swarm for recipe wiring. Depth labels → [contents.md](./contents.md).
