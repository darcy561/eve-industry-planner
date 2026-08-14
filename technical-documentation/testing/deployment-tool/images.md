# images — tests

Live SoT for test depth under [`deployment-tool/internal/images`](../../../deployment-tool/internal/images). Behaviour → [verbs.md](../../deployment/deployment-tool/cli/verbs.md) (`eip update` / `eip rebuild`). Module map → [contents.md](./contents.md).

## Entrypoints

```bash
# from deployment-tool/
go test ./internal/images/
```

## Coverage map

**Depth:** Pull stream parsing, bake arg parsing, live-refs collection, and basic digest match are covered. Full reconcile/tag orchestration is thinner.

### Tested

| Area | What the tests cover |
|------|----------------------|
| Pull | Parallelism bounds; stream consume (up-to-date, layers, errors); progress board render/JSON/fraction |
| Registry | Host parsing; auth base64 |
| Live refs | App/data refs; obs gating |
| Reconcile helper | Digest match |
| Bake | Role env key; arg parsing (`--no-cache`, role names, `swarm`); swarm local tag |

### Thin

- `reconcile.go` — digest-match helper; not full force-update orchestration
- `tags.go` — little/no dedicated tests

### Little / none

- End-to-end pull+reconcile against a registry/daemon

## Topic-only detail

- Depth labels → [contents.md](./contents.md).
