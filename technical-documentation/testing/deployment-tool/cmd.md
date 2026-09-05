# cmd / commands — tests

Live SoT for test depth under [`deployment-tool/cmd`](../../../deployment-tool/cmd) and [`cmd/commands`](../../../deployment-tool/cmd/commands). Behaviour → [verbs.md](../../deployment/deployment-tool/cli/verbs.md). Module map → [contents.md](./contents.md).

## Entrypoints

```bash
# from deployment-tool/
go test ./cmd/...
```

## Coverage map

**Depth:** Root wiring, command registration, and a few ensure/update/restart surfaces are tested. Most individual verb implementations (`up`, `sync`, `secrets`, `doctor`, …) are thin or untested at the command layer (logic lives in `internal/*` packages).

### Tested

| Area | What the tests cover |
|------|----------------------|
| Root | Version/help/unknown; global flag wiring |
| Registration | Commands present (repair, ensure mongo/s3, restore keyfile, rekey, update, …) |
| Ensure cmds | Ensure mongo/s3 delegate + catalogue text |
| Init / update / restart | Init ensure dataplane paths; update/restart TUI message and continue args |

### Thin

- Individual command bodies: `up`, `dev`, `sync`, `secrets`, `status`, `shutdown`, `doctor`, `rebuild`, `logs`, `cli`, `add_path`, …

### Little / none

- `main.go`, `tools/tools.go`
- Full end-to-end verb execution (covered indirectly via `internal/*` tests + manual soak)

## Topic-only detail

- Prefer testing behaviour in `internal/<pkg>` over duplicating it in Cobra command tests. Depth labels → [contents.md](./contents.md).
