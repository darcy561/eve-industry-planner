# config — tests

Live SoT for test depth under [`deployment-tool/internal/config`](../../../deployment-tool/internal/config). Behaviour → [config.md](../../stack/config.md), [verbs.md](../../deployment/deployment-tool/cli/verbs.md) (`eip sync`). Module map → [contents.md](./contents.md).

## Entrypoints

```bash
# from deployment-tool/
go test ./internal/config/
```

## Coverage map

**Depth:** One of the strongest areas — defaults, validation, sync-env, **flow** apply (inspect → diff → ServiceUpdate), plus finer-grained desire/diff helpers.

### Tested

| Area | What the tests cover |
|------|----------------------|
| Defaults / YAML | Default config validity; write/load round-trip; example YAML; sync-env stability |
| Validation | Accept/reject ports, paths, trusted CIDRs/IPs, concurrency; grafana `base_url` (no path) + combine with path; summary lines |
| Sync-env | Map defaults; CLI exclusion; backup path; trusted-proxy CIDR CSV |
| Apply flows (`flow_apply_test`) | Capacity / Traefik / Grafana: live service → apply entrypoint → assert `ServiceUpdate` payload (`enginetest`); capacity unchanged skips update |
| Capacity / Traefik / Grafana helpers | Desire/diff gating, Grafana labels/path helpers (still useful for edge cases beside flows) |
| ServiceSpecPatch | Dry-run; empty name; inspect error; label merge; env set/unset; Mutate; missing ContainerSpec |
| Engine-apply classification | Inspect-error vs missing-skip for Traefik/capacity |

### Thin

- Full `eip sync` orchestration across all apply steps in one test (flows cover each apply path separately)

### Little / none

- — (package is densely unit-tested)

## Topic-only detail

- Depth labels → [contents.md](./contents.md). Run conventions → [CLI testing](../../deployment/deployment-tool/cli/testing.md).
