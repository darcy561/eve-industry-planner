# GitHub Actions

## Owns (SoT)

Documentation for workflows under `.github/workflows` (publish, prerelease, release notes contracts). Workflow YAML remains in `.github/`.

## Does not own

- Bootstrap `--release` / baked `kit.Channel` operator behaviour → [../deployment-tool/cli/release-channels.md](../deployment-tool/cli/release-channels.md)
- App/runtime behaviour → backend / frontend / stack
- CI test suite policy (path filters, branch defaults) → [../../testing/overview.md](../../testing/overview.md) § CI test suite

## Task map

| I need to… | Read |
|------------|------|
| Unit/integration CI (services / frontend / deployment-tool) | [../../testing/overview.md](../../testing/overview.md) § CI test suite → [`test.yml`](../../../.github/workflows/test.yml) |
| Prerelease tags / publish workflow | [prerelease.md](./prerelease.md) |
| Public app / CLI ship workflows | [public.md](./public.md) |
| Operator bootstrap / `APP_VERSION` channels | [release-channels.md](../deployment-tool/cli/release-channels.md) |
