# config — tests

Live SoT for test depth under [`deployment-tool/internal/config`](../../../deployment-tool/internal/config). Behaviour → [config.md](../../stack/config.md), [verbs.md](../../deployment/deployment-tool/cli/verbs.md) (`eip sync`). Module map → [contents.md](./contents.md).

## Entrypoints

```bash
# from deployment-tool/
go test ./internal/config/
```

## Coverage map

**Depth:** One of the strongest areas — defaults, validation, sync-env, and service/Traefik/Grafana **diff** logic. Live Engine apply is mostly skip/inspect classification via fakes.

### Tested

| Area | What the tests cover |
|------|----------------------|
| Defaults / YAML | Default config validity; write/load round-trip; example YAML; sync-env stability |
| Validation | Accept/reject ports, paths, trusted CIDRs/IPs, concurrency; summary lines |
| Sync-env | Map defaults; CLI exclusion; backup path; trusted-proxy CIDR CSV |
| Capacity / service diffs | Desired-state env gating; env/label noop+changes |
| Traefik / Grafana diffs | Publish/path/trusted-proxies/dashboard rule; Grafana path apply gating; path-from-rule |
| Engine-apply classification | Inspect-error vs missing-skip for Traefik/capacity (`enginetest`) |

### Thin

- Live Docker apply execution (`traefik_apply`, `grafana_apply`, emit) — diff + skip paths, not full happy-path ServiceUpdate against a daemon

### Little / none

- — (package is densely unit-tested)

## Topic-only detail

- Depth labels → [contents.md](./contents.md). Run conventions → [CLI testing](../../deployment/deployment-tool/cli/testing.md).
