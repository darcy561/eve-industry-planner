# kit / templates — tests

Live SoT for test depth under [`deployment-tool/internal/kit`](../../../deployment-tool/internal/kit) (incl. `templates/`, `env/`, `yamldefaults/`). Behaviour → [engineering.md](../../deployment/deployment-tool/cli/engineering.md), [variables.md](../../deployment/deployment-tool/cli/variables.md). Module map → [contents.md](./contents.md).

## Entrypoints

```bash
# from deployment-tool/
go test ./internal/kit/...
```

## Coverage map

**Depth:** Deep coverage of env emit/check, yamldefaults, home paths, self-update parsing, and write-missing templates.

### Tested

| Area | What the tests cover |
|------|----------------------|
| Home / paths | Kit home; go-test fallbacks; writable dir/file; PATH link install/remove |
| Self-update | Version/tag/SHA256 parsing; relaunch env merge |
| Stack update | Missing-only stack file updates |
| Envfile | Parse; truthy; merge |
| Templates / env | Emit/check; backup rotation; fail-closed; autogen; AES roll; field consistency; require live/dev; operator doc check; write-missing env/config |
| yamldefaults | Apply round-trip preserving CLI |
| Obs embed | Prometheus config embed |

### Thin

- `product.go`, `channel.go` — mostly tangential via other tests

### Little / none

- — (templates/env are densely tested)

## Topic-only detail

- Depth labels → [contents.md](./contents.md).
