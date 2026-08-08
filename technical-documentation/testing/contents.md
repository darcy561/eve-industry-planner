# Testing

## Owns (SoT)

Cross-cutting **map** of how this repo is tested today: layers, entrypoints, CI test suite policy, and where area SoT lives. Shared Go harness / ops-soak packages live under [`services/testing/`](../../services/testing/) — SoT: [harness.md](./harness.md).

## Does not own

- Deployment Tool run/`enginetest` conventions → [deployment/deployment-tool/cli/testing.md](../deployment/deployment-tool/cli/testing.md)
- Feature behaviour under test → owning [frontend](../frontend/contents.md) / [backend](../backend/contents.md) / [stack](../stack/contents.md) topic
- Publish / prerelease / Public CLI ship workflows → [deployment/github-actions](../deployment/github-actions/contents.md)
- Planned Swarm sims / capacity dry-run / management drills → [migration-plans/swarm-roadmap.md](../migration-plans/swarm-roadmap.md) (`#26` / `#27` / `#29`)

## Task map

| I need to… | Read |
|------------|------|
| See what test layers exist and what runs where | [overview.md](./overview.md) |
| CI policy (branches, path filters, suites) | [overview.md](./overview.md) § CI test suite → [test.yml](../../.github/workflows/test.yml) |
| Shared Go harness / ops soak packages (`services/testing`) | [harness.md](./harness.md) |
| Run Go tests / see services test depth | [services/contents.md](./services/contents.md) |
| api / core / websocket / worker / … depth | [services/contents.md](./services/contents.md) task map |
| Deployment Tool test depth by package | [deployment-tool/contents.md](./deployment-tool/contents.md) |
| Frontend (SPA) tests — placeholder | [frontend/contents.md](./frontend/contents.md) |
| Run Deployment Tool unit / Swarm integration / soak | [deployment-tool CLI testing](../deployment/deployment-tool/cli/testing.md) |
| Public CLI ship (dispatch; release-gated tests) | [deployment-tool.yml](../../.github/workflows/deployment-tool.yml) |
| Bring up a local stack to exercise manually | [deployment/guide.md](../deployment/guide.md) + `eip doctor` / day-2 verbs |
