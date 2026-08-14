# dataplane — tests

Live SoT for test depth under [`deployment-tool/internal/dataplane`](../../../deployment-tool/internal/dataplane) (`mongo/`, `s3/`, `task/`). Behaviour → [deploy.md](../../deployment/deployment-tool/cli/deploy.md) (Ensure*). Module map → [contents.md](./contents.md).

## Entrypoints

```bash
# from deployment-tool/
go test ./internal/dataplane/...
```

## Coverage map

**Depth:** Strong on mongo helpers (keyfile, indexes, preimages, rekey guards), S3 bucket naming, task retry, and Ready registry wiring. End-to-end ensure against real containers is mostly untested at unit level.

### Tested

| Area | What the tests cover |
|------|----------------------|
| Ready / registry | Not-ready errors; ready registry wiring; service-ensures registry; ensure-mongo/s3 as SoT entry points |
| Task | Retry / timeout / cancel / wait; wait force-updates an idle-stuck service after 8s |
| S3 | App buckets; safe bucket names |
| Mongo keyfile | Write/restore; refuse-generate; container-restore |
| Mongo indexes / preimage | Specs render/validate/ensure-with mocks; preimage collections; JS parity |
| Mongo helpers | Safe idents; mongosh error wrap; rekey guards; auth fail/ok paths |

### Thin

- `mongo/ensure`, `replica`, `volume`, `users`, `check` — orchestration against real containers

### Little / none

- Full EnsureMongo / EnsureS3 happy paths without mocks (manual soak / live daemon)

## Topic-only detail

- Depth labels → [contents.md](./contents.md).
