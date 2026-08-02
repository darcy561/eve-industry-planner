# GitHub Actions

## Owns (SoT)

Documentation for workflows under `.github/workflows` (publish, prerelease, release notes contracts). Workflow YAML remains in `.github/`.

## Does not own

- Bootstrap `--release` / baked `kit.Channel` operator behaviour → [../deployment-tool/cli/release-channels.md](../deployment-tool/cli/release-channels.md)
- App/runtime behaviour → backend / frontend / stack

## Task map

| I need to… | Read |
|------------|------|
| Prerelease tags / publish workflow | [prerelease.md](./prerelease.md) |
| Public app / CLI ship workflows | [public.md](./public.md) |
| Operator bootstrap / `APP_VERSION` channels | [release-channels.md](../deployment-tool/cli/release-channels.md) |
