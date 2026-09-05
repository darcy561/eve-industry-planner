# ops / status / msg / process / catalogue — tests

Live SoT for test depth under `internal/ops`, `internal/status`, `internal/msg`, `internal/process`, `internal/catalogue`. Behaviour → [verbs.md](../../deployment/deployment-tool/cli/verbs.md), [messaging.md](../../deployment/deployment-tool/cli/messaging.md). Module map → [contents.md](./contents.md).

## Entrypoints

```bash
# from deployment-tool/
go test ./internal/ops/ ./internal/status/ ./internal/msg/ ./internal/process/ ./internal/catalogue/
```

## Coverage map

**Depth:** Repair planning, core-CLI guards, the capacity and ensure-task wait loops, EIPMSG protocol, status report shaping, and process helpers are covered. Live restart/shutdown/logs streaming and most catalogue metadata are thin/missing. **`yamlutil` has no tests** (sibling package).

### Tested

| Area | What the tests cover |
|------|----------------------|
| `ops` | Repair plan (healthy, selective ensure/force, missing rematerialise, registry-only); core CLI sole-owner / bad-update guards; restart target resolution; logs guards / effective tail; capacity container resolve (single-owner wait, mid-roll timeout, none-running, missing service, env override) and ensure-task wait (settle, budget give-up, probe error, cancel) on simulated time |
| `status` | Report build with/without obs; JSON round-trip; service/overall signal rollup; section/row/task formatting; write source fields |
| `msg` | EIPMSG line parse/reject/emit/progress/chip decoding; chipstate mapping; docker/health probe events |
| `process` | Update-resume flags; signal context timeout/cancel; console want-size; confirm yes/TUI/non-TTY |
| `catalogue` | Service order “prefer” ordering |

### Thin

- `ops` restart/shutdown execution; `CapacityCtl` above the resolve step; `status/format` indirect only; `process` termcheck / platform hold

### Little / none

- Live restart / shutdown / logs streaming
- Most of `catalogue` (`verbs.go`, `services.go` metadata)
- Entire `internal/yamlutil`

## Topic-only detail

- Depth labels → [contents.md](./contents.md).
- The capacity / ensure wait loops run under `testing/synctest`, so their minute-scale budgets cost no wall time. Conventions (and why `enginetest` works in a bubble) → [CLI testing](../../deployment/deployment-tool/cli/testing.md) § Time-dependent loops.
