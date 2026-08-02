# Deployment Tool — CLI

## Owns (SoT)

Deployment Tool CLI: engineering layout, bring-up recipe, verb behaviour, variables, messaging, release channels / bootstrap, tests. Includes `eip dev`.

## Does not own

- TUI-only behaviour → [../tui/contents.md](../tui/contents.md)
- GitHub Actions workflow YAML/docs → [../../github-actions](../../github-actions/contents.md)
- Swarm fragment SoT → [../../../stack](../../../stack/contents.md)

## Task map

| I need to… | Read |
|------------|------|
| Conventions, package map, kit, build-host | [engineering.md](./engineering.md) |
| Bring-up recipe / Ready / ensure roles | [deploy.md](./deploy.md) |
| Verb behaviour / TUI↔CLI map / day-2 ship | [verbs.md](./verbs.md) |
| Unit / integration / CI tests for the tool | [testing.md](./testing.md) |
| SoT registries, process flags, project home | [variables.md](./variables.md) |
| EIPMSG wire protocol / CLI↔TUI emit | [messaging.md](./messaging.md) |
| Release channels / bootstrap `--release` / `APP_VERSION` | [release-channels.md](./release-channels.md) |
| CI prerelease publish | [prerelease.md](../../github-actions/prerelease.md) |
| CI Public ships | [public.md](../../github-actions/public.md) |
| Document a CLI verb (e.g. `eip dev`) | _(add topic rows here when written)_ |
