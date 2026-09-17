# Mongo test database — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

## Goal

There is one Mongo database in this project, `eve_industry_planner`, and the live test suite writes
to it. 108 gated tests across eight packages connect through the same constructors the services use,
land in the database the running stack is serving, and clean up by deleting the documents they know
they created. None of them run in CI.

This project gives the tests a database of their own and runs them in CI. When it closes:

- The database name is resolved in one place and can be pointed at `eve_industry_planner_test`.
- A live test can drop its whole database instead of enumerating collections to clean.
- The live suite runs on a GitHub runner against a mongod that suite provisions itself.
- The fixture-export path that existed to avoid touching live data is gone.

## Starting position

### What is already good

- **`testing/mongolive` exists and is used.** 27 test files, 41 `ScratchAccount` call sites, both
  client shapes (`Require`, `RequireWatch`) and the owner fixture builders. This project extends it
  rather than introducing a second harness.
- **`scripts/testing/live-mongo.sh` already automates the local run** — builds a linux test binary,
  takes credentials from the running stack's secrets, runs it on `eip-core`.
- **The schema Ensure applies is declarative.** `IndexSpecs()` (26 specs) and `PreimageCollections`
  (5 names) are exported data with no Docker coupling.
- **`go fix -diff` is clean** on `services/shared/mongo/`, `services/shared/core/config/` and
  `testing/mongolive/` — no modernization debt to land before this work.

### What is wrong

**The database name is written twice, and one copy is also the `authSource`.**
[`names.go`](../../../services/shared/mongo/names.go) declares `DatabaseName` for
`NewMongo`; [`config/mongo.go`](../../../services/shared/core/config/mongo.go) declares
`mongoDatabase` for the URI path *and* `authSource=`. The two must agree, and nothing enforces it.
This is the one-SoT rule broken on the single most load-bearing string in the data layer.

**Test isolation is per-account, inside the live database.** `ScratchAccount` deletes from 13 named
collections for one account id. A test that writes outside a scratch account, or a collection added
without updating that list, leaves rows in the database the stack is serving. The helper runs its
clear at both ends precisely because the blast radius is real.

**The live suite does not run in CI.** [`test.yml`](../../../.github/workflows/test.yml) has no Mongo
and no job that opens the gate, so 108 tests are only ever run by hand, on one developer's machine,
against their own data.

**A fixture-export path exists to work around all of the above.**
`services/cmd/mongo_parity_sample` is a `main` package, run by a documented `docker run`
incantation, that copies up to 50 documents per collection out of live Mongo onto disk — carrying
whatever account data those documents hold. It feeds one test, which skips when the export is
absent. The helpers it covers are already unit-tested in `shared/mongo/helpers_test.go`.

**The gate is named for a migration that finished.** `EIP_MONGO_PARITY_LIVE` was named when the one
test under it checked driver-v2 document parity. It now gates the whole live suite, of which parity
is one test.

## What a trial provisioning measured

Stage C was built once outside this project, run, and reverted, to size what provisioning alone
buys. The job it produced is gone; the numbers are why this section exists.

The trial gave the suite a `mongo:8` replica set and a Redis on 6399, opened both gates, and ran
`go test ./... -count=1` over `services/`. Against the same tree with the gates closed:

| | gates closed | gates open |
|---|---|---|
| passed | 2,074 | **2,233** |
| failed | 0 | **15** |
| skipped | 173 | 28 |

So provisioning turns roughly 145 skips into runs, and 159 of those pass the first time they have
ever run anywhere. The suite is larger than this plan's Goal records: 132 `TestLive_` functions
today against the 108 counted when it was written.

### Fifteen tests do not stand up on a fresh database

| Package | Tests |
|---------|-------|
| `api/v1endpoints/archivedjobs` | 6 — the filing and restore flows |
| `api/helper` | 3 — the job-document, groups and list flows |
| `shared/mongo` | 2 — `TestLive_LoadJobsByFilter_accountScope`, `_docsLayerSlip` |
| `api/v1endpoints/statistics` | 1 — `TestLive_aSharedPlannerIsReachedByItsMembers` |
| `core/commands` | 1 — `TestLive_backfillAccountPlanners_completesEveryPartialState` |
| `worker/tasks/documentids` | 1 — `TestLive_RewriteMovesADocumentOntoAnIDCarryingItsOwner` |

They fail as `deleted count: got 0 want 1` and `id_only: got []` — a seed that does not land where the
read-back looks. Two of them pass beside their siblings and fail alone, so at least part of it is
order dependence rather than a missing server feature.

**Stage B's schema step does not explain them.** The trial applied neither pre-images nor indexes, but
neither could account for these failures: all 26 specs in `IndexSpecs()` are non-unique, so they
change how a query is served and not what it matches, and `changeStreamPreAndPostImages` reaches
change streams only. Nothing in either list makes a delete match a row it otherwise would not.

What does fit is this plan's own § Starting position: these tests were written to land in the
database the running stack is serving, and some read what is already there. A scratch database of
their own is the same empty database the trial gave them.

**This is scope the stages do not yet carry.** § Done when asks for a live suite that "runs to
completion on a GitHub runner", and provisioning does not reach it — those fifteen have to seed what
they read. It belongs with Stage B, which is where isolation makes each test responsible for its own
data, rather than with Stage C.

### Two notes for whoever builds Stage C

**`--auth` is a choice, not a constraint.** The trial ran with `--auth` and a generated keyfile, and
the suite passed against it; the first user goes in through the localhost exception before the
replica set has one, which is the order `eip ensure-mongo` already uses. § CI's no-auth form is the
simpler one and nothing argues against it — but an auth-first variant is known to work if a later
reason wants it.

**Publish the port mongod listens on.** Docker Desktop does not expose `--network host` to the host,
so a local run of the same recipe needs `-p` and a member host the driver can reach from outside the
container. § CI's `--add-host mongo:127.0.0.1` pair handles this on a runner; a developer running it
by hand on Docker Desktop needs the published-port form instead.

## The database name

One resolver, defaulting to today's value, read by both current declaration sites:

| `MONGO_DATABASE` | Database | Who sets it |
|------------------|----------|-------------|
| unset | `eve_industry_planner` | every service, unchanged |
| set | that name | live tests, local and CI |

`authSource` stays pinned to `eve_industry_planner` and does **not** follow `MONGO_DATABASE`. The app
user is created in `eve_industry_planner` with `readWrite` on it, so authentication must continue to
name that database whatever database the client then works in. Granting the same user `readWrite` on
the test database keeps one credential working for both. A resolver that moved `authSource` too
would break auth on the first run.

`MONGO_DATABASE` joins the operator env schema in `EnvFields`, which is its SoT.

## Isolation

`ScratchAccount` keeps its signature and its 41 call sites. Alongside it, `ScratchDatabase(t, m)`
drops the database the handle is bound to, and refuses to run when that database is
`eve_industry_planner` — the guard is the point, in the same spirit as `redislive` refusing the
stack's Redis port.

## CI

**Not a `services:` block.** A GitHub service container starts before the job's steps, which leaves
no point at which `rs.initiate()` can run, so the container never becomes a replica set and every
change-stream test fails against it. The precedent to follow is already in this repo:
[`deployment-tool.yml`](../../../.github/workflows/deployment-tool.yml) runs `docker swarm init` as
an ordinary step and then runs a gated suite.

The job provisions its own mongod:

1. `docker run -d --hostname mongo --add-host mongo:127.0.0.1 mongo:8 --replSet rs0 --bind_ip_all`,
   published on 27017. No `--auth`, so no keyfile and no user creation.
2. `rs.initiate({_id:'rs0', members:[{_id:0, host:'mongo:27017'}]})`, then poll for primary.
3. Pre-images on the 5 collections; the 26 indexes.
4. Run the suite with the gate open and `MONGO_DATABASE` set to the CI database.

**`mongo:27017` is the name at both ends.** The replica set advertises whatever host its config
names, and the driver connects to that name rather than the seed it was given. The container maps
the name to itself (`--hostname` + `--add-host`, the same pair the stack uses for the same reason);
the runner maps it to loopback so the test binary can reach it. Keeping the stack's own member host
means local and CI do not diverge on the one setting most likely to produce a confusing failure.

**Renames and retired-index drops are skipped.** Both exist to reconcile databases with history. A
database created by this job has none.

**Setup is reimplemented, not reused.** `mongo.Ensure` finds a Swarm task, shells out to
`docker exec`, and reads operator credentials from a kit env file; none of that exists on a runner,
and `services` cannot import `deployment-tool`. The deployment-tool has no Mongo driver dependency
at all — its whole bootstrap is mongosh JS over `docker exec` — so there is no shared code path to
take. `testing/mongolive` applies the same schema through the Go driver it already depends on.

That leaves the two lists spelled in two modules. The established answer here is the one
`index_specs.go` already documents for partial filters: cross-module facts are pinned by tests on
both sides rather than shared as code. A test asserts the lists agree.

**Manual trigger first.** The job lands under `workflow_dispatch` while it proves stable, then moves
to the same path filter as the other suites. Until it does, it is not a merge gate.

`TestLive_Publish_ownerReachesTheSubscriberFromTheDocument` needs a running core service to publish
the message it asserts on, so it skips in CI and stays a local-stack test.

## Wire compatibility

**Additive.** `MONGO_DATABASE` is a new optional env key with a default that reproduces current
behaviour. No persisted document shape, HTTP contract, NATS subject or cross-process surface
changes. A deployment that never sets it behaves exactly as it does today.

## Dependencies

`testing/go.mod` needs `go mod tidy` — indirect otel, grpc and genproto pins have drifted and three
sentry entries are stale. It is unrelated to this work and predates it. It lands as its own commit
before Stage B rather than riding inside a feature slice, because `go fix` on the module reports the
drift and would otherwise mask a real result.

## Stages

**Stage A — one database name.** The resolver, both call sites reading it, `MONGO_DATABASE` in
`EnvFields`, and a test that the two declaration sites agree. Services unchanged at their default.

**Stage B — isolation.** `ScratchDatabase` with its guard, `mongolive.Require` setting the test
database, and the pre-images and indexes applied through the driver by `Require` itself rather than
by a separate step. The list-agreement tests land with it.

It also grants the app user rights on the test database. `ensureUsersJS` grants `readWrite` on the
literal `eve_industry_planner` only, so a local run pointed at another database authenticates (the
`authSource` pin is what makes that work) and then fails on authorization. **Two roles are needed,
not one:** `readWrite` to use the database, and `dbAdmin` because enabling change-stream pre-images
is a `collMod`. Measured: with `readWrite` alone the run fails with *"not authorized on
eve_industry_planner_test to execute command { collMod … }"*. CI sidesteps this by provisioning
without `--auth`; a developer running against the stack's Mongo does not.

Fifteen tests also have to seed what they read, or they fail on the empty database this stage hands
them — see § What a trial provisioning measured for the list and the evidence that the schema step
does not cover it.

**Stage C — CI.** The `live-mongo` job under `workflow_dispatch`, provisioning mongod, applying the
schema, running the suite.

**Stage D — remove the workaround.** Delete `cmd/mongo_parity_sample`, the fixture branch and
`MONGO_PARITY_FIXTURE_DIR`; the remaining test becomes a plain live test. Rename the gate to
`EIP_MONGO_LIVE` and the `live_parity_*` files to what they check.

Stage A is a prerequisite for B; B for C. D depends only on B and may land last or alongside C.

## Stage status

| Stage | Status |
|-------|--------|
| A — one database name | Landed — see [overlay.md](./overlay.md) |
| B — isolation | Landed, except the fifteen — see [overlay.md](./overlay.md) |
| C — CI | Not started |
| D — remove the workaround | Not started |

## Done when

- No package declares the database name independently of the resolver.
- A live test run leaves the stack's database untouched.
- The live suite runs to completion on a GitHub runner, including the fifteen tests that today
  depend on documents the stack's database already holds.
- `cmd/mongo_parity_sample` and the fixture branch are gone, and the gate is named for what it does.
- `testing/harness.md` § Live Mongo describes all of the above as current behaviour.
