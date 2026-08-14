# stack — tests

Live SoT for test depth under [`deployment-tool/internal/stack`](../../../deployment-tool/internal/stack). Behaviour → [stack.md](../../stack/stack.md). Module map → [contents.md](./contents.md).

## Entrypoints

```bash
# from deployment-tool/
go test ./internal/stack/
```

## Coverage map

**Depth:** Strong unit coverage for expand, interpolation, secret/config injection, and stackfile surfaces used by sync/deploy.

### Tested

| Area | What the tests cover |
|------|----------------------|
| Expand | Guards, interpolation, stamping, env overlay, in-memory rewrites, dollar escaping, mode normalization, wiki `WIKI_COMPAT_TAG` / `EIP_WIKI_HOST` inject; repo-stack wiki Host / compat tag |
| Externalize | Compose sources, bind paths, obs configs |
| Injection | Secret/config injection into expanded docs |
| Stackfile | Load; mounts; Traefik/Grafana apply surfaces; capacity targets; secret attaches |
| Env | Substitution defaults; repo-stack CORS/dollar regression |

### Thin

- Repo-stack expand is one test (CORS / `$` escaping plus wiki Host / compat tag)

### Little / none

- — (strong overall)

## Topic-only detail

- Depth labels → [contents.md](./contents.md).
