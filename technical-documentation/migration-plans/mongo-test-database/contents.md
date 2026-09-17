# Mongo test database

## Owns

Where the live Mongo test suite writes, and where it runs.

- **The database name as a resolved value** — one SoT for `eve_industry_planner`, and the rule that
  `authSource` does not follow it.
- **`MONGO_DATABASE`** — the operator env key that points a client at another database, and its
  default.
- **Test isolation for live Mongo** — `ScratchDatabase` beside the existing `ScratchAccount`, and the
  guard that stops a drop reaching the stack's database.
- **Schema setup outside the Deployment Tool** — applying pre-images and indexes through the Go
  driver, and the tests pinning those lists against the deployment-tool's copies.
- **The live-Mongo CI job** — how a runner gets a replica set, why not a `services:` block, and what
  the job does not attempt.
- **The gate's name**, and the removal of the fixture-export path it was named for.

## Does not own

- What each live test asserts. Those belong to their own areas — statistics, planner documents,
  change streams, archived jobs → [testing/services/](../../testing/services/contents.md).
- The Mongo service, its image pin, replica set and network membership →
  [stack/](../../stack/contents.md).
- `eip ensure-mongo` and the Deployment Tool's Mongo bootstrap, which stay the operator path for the
  real stack → [deployment/deployment-tool/](../../deployment/deployment-tool/cli/contents.md).
- The collection names and index specs themselves. This project copies them, it does not decide them
  → [collection-naming/](../collection-naming/contents.md).
- The shared harness as a whole → [testing/harness.md](../../testing/harness.md), which this project
  will amend on promote.
- Live SoT under [testing/](../../testing/contents.md) and [backend/](../../backend/contents.md),
  promoted only when this project closes.

## Task map

| I need to… | Read |
|------------|------|
| Understand the goal and what closes the project | [plan.md](./plan.md) §§ Goal, Done when |
| See what is wrong with the setup today | [plan.md](./plan.md) § Starting position |
| Know how the database name resolves, and why `authSource` does not follow | [plan.md](./plan.md) § The database name |
| Understand how a test gets isolation | [plan.md](./plan.md) § Isolation |
| Know how CI gets a replica set, and why not a `services:` block | [plan.md](./plan.md) § CI |
| See what a trial provisioning measured, and which tests it left failing | [plan.md](./plan.md) § What a trial provisioning measured |
| Check what is additive and what breaks | [plan.md](./plan.md) § Wire compatibility |
| See the stages and their order | [plan.md](./plan.md) § Stages |
| Check what has landed | [plan.md](./plan.md) § Stage status |
| See how a part works while the project is in flight | [overlay.md](./overlay.md) |
| Read the live prose this project will promote | [promote/testing/harness-live-mongo.md](./promote/testing/harness-live-mongo.md) |
