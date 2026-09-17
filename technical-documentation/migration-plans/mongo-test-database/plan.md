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

### What the fifteen turned out to be

They were not tests that needed a populated database, which is what this section
first recorded. The fifteen failures fell across fourteen tests, one of them contributing a failing
subtest as well. Eleven were **stale assumptions about the document id**, two were real product
bugs, and one is non-deterministic.

Production scopes a document id to its owner — `{"_id": {"$in": OwnerScopedDocumentIDs(owner, ids)}}`
in the delete route, `OwnerScopedDocumentID(owner, job.JobID)` in the archive write. These tests still
built filters from bare job ids, so they found nothing. They would have failed against any database,
including the stack's; nothing noticed because the live suite has never run anywhere but by hand.
`archiveJobFor` is the clearest case: its comment says it writes "the way the PUT route leaves it",
and the one detail it got wrong was the id the route actually uses.

| Package | Was |
|---------|-----|
| `api/v1endpoints/archivedjobs` | 6 — one helper seeding under a bare id |
| `api/helper` | 3 — three filters built from bare ids |
| `shared/mongo` | 2 — four filters, and a comment asserting `_id` is the bare job id |
| `worker/tasks/documentids` | 1 — not an id assumption at all: the `SeedDocumentVersion` bug below |
| `api/v1endpoints/statistics` | 1 — a product bug in another project's area |
| `core/commands` | 1 — not fixed: non-deterministic, see § The suite is not isolated per package |

Eleven were the id assumption. The other three were not, and two of them were real bugs.

### The bug the suite was there to find

`SeedDocumentVersion` type-asserted its nested `_meta` to `bson.D` and silently did nothing when it
was not, so the owner-scoped id rewrite never stamped a version on the documents it moved. The shared
client sets `DefaultDocumentM`, so a cursor hands the block back as `bson.M`.

**Its unit test passed against a shape the production path cannot produce.** It decoded with plain
`bson.Unmarshal`, which does give `bson.D`, and its comment stated that as how a cursor behaves. That
is the reusable lesson rather than the individual bug: a test that builds its input by a different
route than the code under test is asserting something about the route, not the code. It now covers
both shapes, and fails on the `bson.M` one if the assertion comes back.

The remaining failure, `TestLive_aSharedPlannerIsReachedByItsMembers`, is also a real product bug and
also one this suite is the only thing to catch: the membership gate resolves the owner a request names
and then throws it away, so three statistics handlers read the calling account's figures rather than
the planner's. It belongs to [shared-planners](../shared-planners/contents.md) and is being fixed
there.

### The suite is not isolated per package

`go test ./...` runs one binary per package, and those binaries run in parallel. This stage gives the
suite one database per *run*, so every live package writes into `eve_industry_planner_test` at the
same time. The result is not stable:

| | default (parallel) | `-p 1` (serial) |
|---|---|---|
| run 1 | 2253 pass, 3 fail, 28 skip | **2254 pass, 1 fail, 29 skip** |
| run 2 | 2256 pass, 1 fail, 27 skip | **2254 pass, 1 fail, 29 skip** |
| run 3 | 2252 pass, 3 fail, 29 skip | — |

Each run started from a dropped database. Three parallel runs gave three different answers; two serial
runs were identical. `TestLive_backfillAccountPlanners_completesEveryPartialState` is the test that
moves, and the skip counts move with it, so the interference is not confined to one test.

**`-p 1` is the answer for now.** A live run of more than one package is `go test -p 1 ./...`, which
costs wall clock and nothing else. Stage C's job runs it that way, and until it does, a green parallel
run is not evidence.

A database per binary is the better answer and is **outstanding work on this stage**: `mongolive`
would derive the name from the test binary rather than from a constant, which keeps the suite parallel
and makes `ScratchDatabase` safe by construction. It is not free — the app user needs rights on each
database, and MongoDB has no wildcard for that short of `anyDatabase`, so the authenticated local path
pays for it. CI provisions without auth and would not.

This also sharpens what `ScratchDatabase` is for. Dropping a whole database is safe against a database
one binary owns, and is not safe against one several binaries share — which is what they do today.

### An unsatisfiable gate fails like a regression

A gate says a dependency is wanted, not that it is there. `EIP_REDIS_PARITY_LIVE=1` with no Redis
running produced **54 failures across `shared/esiclient` and `api/v1endpoints`** — every Redis-backed
assertion failing on its own terms, spread over packages, with nothing saying the server was simply
absent. It reads as a code regression, and it was nearly reported as one against another session's
change.

`redislive.Require` and `mongolive.Require` both dial and fail per test, which is correct per test and
wrong in aggregate. A gate that is set and cannot be satisfied could say so once and stop the run.
That would have turned a misread into a sentence, and it is the same hazard as § The suite is not
isolated per package: a live run that fails in bulk for an environmental reason looks exactly like one
failing for a code reason, and the cost is in what a reader concludes before checking.

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

Eleven tests also had to stop assuming a bare document id before they would stand up on the empty
database this stage hands them, and the suite needs isolating per package — see §§ What the fifteen
turned out to be, The suite is not isolated per package.

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
| B — isolation | Landed per run; **per package outstanding** — see § The suite is not isolated per package |
| C — CI | Not started |
| D — remove the workaround | Not started |

## Done when

- No package declares the database name independently of the resolver.
- A live test run leaves the stack's database untouched.
- The live suite runs to completion on a GitHub runner, and gives the same answer twice.
- `cmd/mongo_parity_sample` and the fixture branch are gone, and the gate is named for what it does.
- `testing/harness.md` § Live Mongo describes all of the above as current behaviour.
