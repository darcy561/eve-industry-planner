# Mongo test database — review

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
This review edits nothing outside the project folder and does not move any status in `plan.md`;
it records what the code bears out so the plan can be corrected deliberately.

Verified against the working tree on 2026-10-05 (HEAD 051f79cf9 plus uncommitted changes). The
only uncommitted files in this project's area are `services/shared/mongo/jobs_put_change.go`,
`services/shared/mongo/live_jobs_put_change_test.go` and `testing/fixtures/job-write/body.json`,
all of which belong to document-write-granularity and change nothing reviewed here.

## Summary

The project gives the live Mongo suite a database of its own and runs it in CI. Half of it is in:
the database name resolves in one place and the suite refuses to run in the stack's database, applies
its own schema, and has been run green once, serialised, by hand. The other half has not started.
There is no CI job of any kind for the live suite, the fixture-export workaround and the misnamed gate
are exactly where the plan found them, and the promotion draft under `promote/` is an empty stub
despite two stages having landed. **The project is not ready to promote**: two of four stages are
unstarted, one of the "Done when" lines is met, and the suite still has to be run with `-p 1` because
every live package shares one database.

Two things most need attention. First, the per-package isolation question (one database per test
binary or stay serial) blocks both a stable CI job and any use of `ScratchDatabase`, which today has
no callers. Second, `MONGO_DATABASE` sits in `EnvFields` with help text saying it is the database the
services work in, while `docker-stack.yml` forwards only `MONGO_HOST` and `MONGO_PORT` to the services
— an operator who sets it sees nothing happen.

## Verified status

| Stage / slice | Plan says | Code bears out | Evidence | Verdict |
|---|---|---|---|---|
| A — one database name | Landed | One resolver, both call sites read it, `authSource` pinned, key in `EnvFields`, tests on both sides | `config.MongoDatabase()`, `DefaultMongoDatabase`, `EnvMongoDatabase` in `services/shared/core/config/mongo.go`; `mongo.DatabaseName()` is a function in `services/shared/mongo/names.go`; `store.go:45` binds `client.Database(DatabaseName())`; `mongo_database_test.go` (`TestMongoURL_authSourceDoesNotFollowTheDatabase`), `database_name_test.go`; `deployment-tool/internal/kit/templates/env/fields.go:92`; commit 5b29cbb5c | confirmed |
| A — `MONGO_DATABASE` as an operator knob | Joins the operator env schema | In `EnvFields`, but the stack's `x-mongo-env` anchor (`docker-stack.yml:24`) carries only `MONGO_HOST` / `MONGO_PORT`; no service receives it | `grep MONGO_DATABASE docker-stack*.yml` is empty; the help text at `fields.go:93` says "Database the services work in" | overstated |
| B — guard, schema, runner | Landed per run | `TestDatabase`, `requireTestDatabase` on every `Require`/`RequireWatch`, `ensureSchemaOnce` keeping its error, 26 indexes and 5 pre-image collections, both mirror pins, runner pin, grants in the script | `testing/mongolive/mongolive.go`, `schema.go`, `schema_pin_test.go`; `deployment-tool/internal/dataplane/mongo/schema_mirror_test.go`; `runner_pin_test.go`; `scripts/testing/live-mongo.sh` lines 42–60 and 98; commit 608fe7e23 | confirmed |
| B — `ScratchDatabase` | Landed | Exists with its guard; **zero callers** anywhere in `services/` or `testing/`. The plan's own analysis says it is unsafe while binaries share a database, so nothing can adopt it yet | `grep -rn "ScratchDatabase(" services testing` returns only the declaration | partly |
| B — eleven id fixes | Fixed | Landed in 7487d0519, d86016d19 and 5f1ff5f67 (`api/helper/mongo_live_test.go`, `archivedjobs/live_restore_test.go`, `shared/mongo/live_parity_load_filter_test.go`); `live_restore_test.go:45` seeds under `OwnerScopedDocumentID` | confirmed |
| B — `SeedDocumentVersion` bug | Fixed, test covers both shapes | Fixed in edcd5cec9. The function is now `SeedDocumentRevision` in `services/shared/mongo/owner_scoped_ids.go`; `TestSeedDocumentRevisionWalksTheDecodedMetaBlock` runs the `bson.M` and `bson.D` cases. The plan's name is stale | confirmed (name stale) |
| B — statistics handlers bug | "Being fixed" in shared-planners | Landed there: `requireOwnedBySession` returns the owner and `getTotals.go:57`, `getTimeline.go:84`, `getTimelineItems.go:72` read what it returns; shared-planners `overlay.md` § Statistics are read for the planner the path names says *Landed* | understated |
| B — per-package isolation | Outstanding | Outstanding. `TestDatabase` is a constant; nothing derives a name per binary. The `-p 1` rule is written only in this folder — no script, workflow or live doc carries it, and `live-mongo.sh` runs one package per invocation so no multi-package runner exists to enforce it | confirmed |
| Dependencies — `testing/go.mod` tidy | Needs `go mod tidy`, lands before B | `go mod tidy -diff` in `testing/` is empty. Either landed or never drifted; the plan still states it as owed | overstated (stale) |
| C — CI | Not started | Not started. `.github/workflows/test.yml` has no Mongo, no gate, no `live-mongo` job; `.github/scripts/` has no Mongo helper. The `docker swarm init`-as-a-step precedent the plan cites is real (`deployment-tool.yml` § integration) | confirmed |
| D — remove the workaround | Not started | Not started. `services/cmd/mongo_parity_sample/main.go` exists; `live_parity_test.go:105` reads `MONGO_PARITY_FIXTURE_DIR` and skips without fixtures; `mongolive.Gate` is still `EIP_MONGO_PARITY_LIVE`; seven `live_parity_*_test.go` files keep the name | confirmed |
| Promotion draft | "Drafted as each stage lands" | `promote/testing/harness-live-mongo.md` is seven lines ending "*Empty until Stage A.*" | overstated |

**Discrepancies.**

- *`MONGO_DATABASE` as an operator knob.* The plan's own table (§ The database name) says only the live
  tests set it, which matches the stack, so behaviour is as designed. What overstates is the `EnvFields`
  help text, which promises a service-side effect the stack does not deliver. See § Decisions needed.
- *`ScratchDatabase`.* Code exists and is correct, but "done means code and a user path exist" and no
  test can take that path until per-package isolation lands. Treat as shipped-but-unusable, not landed.
- *Statistics handlers.* The other project finished; this project's overlay and plan still say "being
  fixed there". A one-line correction in both.
- *`SeedDocumentVersion`.* Renamed to `SeedDocumentRevision` when `_meta.version` became
  `_meta.revision`; the plan and overlay should use the current name.
- *`testing/go.mod`.* No drift today; strike § Dependencies or mark it done.
- *Suite size.* 201 `TestLive_` functions across 14 packages today (`grep -rn "^func TestLive_"`), against
  108 in § Goal and 132 in § What a trial provisioning measured. The suite has grown by half since the
  trial was sized, which matters for the CI job's wall clock under `-p 1`.
- *Promotion draft.* Two stages have landed and the draft that is supposed to become live prose is
  empty. [testing/harness.md](../../testing/harness.md) § Live Mongo still describes the pre-Stage-B
  world ("run against the stack's own database"), which is correct for a live doc during the project
  — but the replacement text should already exist here.

## What each remaining step changes

### Stage A — one database name

Landed; see [overlay.md](./overlay.md) § Stage A. One correction belongs to it, under
§ Decisions needed — `MONGO_DATABASE` in `EnvFields`.

### Stage B — per-package isolation (the outstanding half)

**Today.** Every live binary binds to the same constant.

```go
// testing/mongolive/mongolive.go
const TestDatabase = "eve_industry_planner_test"

func requireTestDatabase(t *testing.T, mongo *eipmongo.Mongo) {
	if got := mongo.DB.Name(); got == config.DefaultMongoDatabase {
		t.Fatalf(/* set MONGO_DATABASE=eve_industry_planner_test */)
	}
}
```

`go test ./...` over `services/` runs fourteen live binaries in parallel against that one database;
the plan measured three parallel runs giving three answers and two serial runs giving one. Nothing in
the repository runs the suite serially: `live-mongo.sh` runs a single package, and there is no CI job.

**After.** The plan says what it would take but not the shape: "`mongolive` would derive the name from
the test binary rather than from a constant". The natural form, drawn from the code rather than the
plan, is a prefix plus the package the binary was built from:

```go
// testing/mongolive — target, not current
const TestDatabasePrefix = "eve_industry_planner_test"

// TestDatabase is the database this binary works in: the prefix plus the
// package name go test stamped on the binary.
func TestDatabase() string {
	return TestDatabasePrefix + "_" + binaryPackageName()
}
```

with `requireTestDatabase` accepting any name under the prefix and refusing anything else, and
`ScratchDatabase` becoming safe by construction because the binary owns what it drops. The
local runner's grant then has to cover the database the binary it is about to run will use —
`live-mongo.sh` already knows the package, so it can derive the same name — or grant on every
`eve_industry_planner_test_*` after the fact. MongoDB has no wildcard grant short of `anyDatabase`,
which is the cost the plan records.

How the binary learns its own package is the open detail: `os.Args[0]` is `<pkg>.test` under
`go test`, which is enough; `runtime/debug.ReadBuildInfo` gives the main package path but is
`command-line-arguments`-shaped for a test binary. Both are testable without a database.

**Work.**

1. Replace the `TestDatabase` constant with a per-binary derivation and widen the guard to a prefix
   check; keep the `-p 1` fallback documented in the overlay until this lands.
2. Point `live-mongo.sh` at the derived name and grant `readWrite` + `dbAdmin` on it; move
   `TestRunnerUsesTheTestDatabase` to pin the prefix rather than the whole name.
3. Give `ScratchDatabase` its first caller — `TestLive_backfillAccountPlanners_completesEveryPartialState`
   in `services/core/commands/live_release_account_planner_test.go` is the test the plan names as the
   one that moves, so it is the natural first adopter — and remove the "must not run from `t.Parallel`"
   caveat once a binary owns its database. Two live files call `t.Parallel()` today
   (`core/changestream/live_resume_test.go`, `api/v1endpoints/user/live_market_locations_test.go`).
4. Re-run the three-times-from-dropped measurement in parallel and record it in the overlay; the
   "gives the same answer twice" line in § Done when is only evidenced by this.
5. Bring `mongolive.go`'s comments to the two-line rule while the file is open. The package doc still
   says the tests "write to the same database the running stack uses" and `Require` says it "connects
   to the stack's Mongo"; both are false since Stage B.

**Wire.** None. The database name is internal to the test module and the runner script. No
`prepareRelease` step.

### Stage C — CI

**Today.** `test.yml` runs `go test ./...` in `services/` and `testing/` with no gate set, so every
live test skips (173 skips in the plan's measurement). No job starts a mongod. The only Docker-in-a-step
precedent is the Swarm one:

```yaml
# .github/workflows/test.yml — deployment-tool-integration, today
      - name: Swarm init
        run: |
          docker swarm leave --force 2>/dev/null || true
          docker swarm init
      - name: Integration tests
        run: go test ./internal/swarm/ -tags=integration -count=1 -timeout 10m
```

**After.** A `live-mongo` job under `workflow_dispatch`, from [plan.md](./plan.md) § CI with the
overlay's correction that the schema step is gone because `Require` applies it:

```yaml
# .github/workflows/test.yml — target, not current
  live-mongo:
    name: live mongo
    if: github.event_name == 'workflow_dispatch' && inputs.live_mongo
    runs-on: ubuntu-latest
    timeout-minutes: 30
    defaults: { run: { working-directory: services } }
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-go@v6
        with: { go-version-file: services/go.mod, cache-dependency-path: services/go.sum }
      - name: Start mongod
        run: |
          docker run -d --name mongo --hostname mongo --add-host mongo:127.0.0.1 \
            -p 27017:27017 mongo:8 --replSet rs0 --bind_ip_all
          echo "127.0.0.1 mongo" | sudo tee -a /etc/hosts
          until docker exec mongo mongosh --quiet --eval 'db.runCommand({ping:1}).ok' | grep -q 1; do sleep 1; done
          docker exec mongo mongosh --quiet --eval \
            "rs.initiate({_id:'rs0', members:[{_id:0, host:'mongo:27017'}]})"
          until docker exec mongo mongosh --quiet --eval 'rs.isMaster().ismaster' | grep -q true; do sleep 1; done
      - name: Live suite
        env:
          EIP_MONGO_PARITY_LIVE: "1"
          MONGO_DATABASE: eve_industry_planner_test
          MONGO_HOST: mongo
          MONGO_PORT: "27017"
          MONGO_USERNAME: ci
          MONGO_PASSWORD: ci
        run: go test -p 1 -count=1 -timeout 25m ./...
```

Three things in that sketch are not in the plan and need settling before it is written — see
§ Decisions needed: whether Redis and NATS are provisioned too; how an unsatisfiable gate reports;
and whether `-p 1` is accepted for the first version or Stage B's isolation lands first. One detail
is a plain fact to check during implementation: `config.MongoURL` requires `MONGO_USERNAME` and
`MONGO_PASSWORD` (`swarmsecret.Require`) even against a `--auth`-less mongod, so the job sets
throwaway values.

**Work.**

1. The job above, plus a `live_mongo` boolean input beside the four existing ones and a row in the
   `ci` aggregate (skipped counts as green, as the others do).
2. Decide and provision Redis / NATS (§ Decisions needed).
3. A preflight that fails the job once, in one sentence, when the gate is open and mongod is
   unreachable (§ Decisions needed — gate behaviour).
4. Record the first three green runs in the overlay, then move the job to the `services` path filter.
5. Add the CI row to the harness Entrypoints table in the promotion draft.

**Wire.** None at the product level. Additive to the workflow: a new input and job, nothing existing
changes. No `prepareRelease` step.

### Stage D — remove the workaround

**Today.** The fixture branch and the export command both exist:

```go
// services/shared/mongo/live_parity_test.go
func loadParitySampleDocs(t *testing.T) []bson.M {
	if mongolive.Enabled() {
		return loadLiveSampleDocs(t)
	}
	return loadFixtureSampleDocs(t)   // reads MONGO_PARITY_FIXTURE_DIR or ../../../.tmp/mongo-parity
}
```

`services/cmd/mongo_parity_sample/main.go` is a `main` package with a `docker run` recipe in its
header that copies account documents to disk. `mongolive.Gate` is `EIP_MONGO_PARITY_LIVE`, spelled once
in code and in `live-mongo.sh`; the 31 test files that also spell it do so only in comments, which the
comment rule removes anyway.

**After.** `TestLive_realDocs_AsDocumentM_andUnmarshal` becomes a plain `mongolive.Require` test
reading what the other live tests in the binary wrote, or is dropped: its helpers are unit-tested in
`struct_doc_test.go` and the plan says so. The command and the fixture branch go. The gate becomes
`EIP_MONGO_LIVE`. The seven `live_parity_*_test.go` files take names for what they check; the plan does
not choose them, so proposed from the test functions inside each:

| Today | Proposed |
|---|---|
| `live_parity_test.go` | removed, or `live_document_helpers_test.go` if kept |
| `live_parity_account_roundtrip_test.go` | `live_account_roundtrip_test.go` |
| `live_parity_custom_structures_test.go` | `live_custom_structures_test.go` |
| `live_parity_docshape_test.go` | `live_document_shape_test.go` |
| `live_parity_load_filter_test.go` | `live_load_jobs_by_filter_test.go` |
| `live_parity_putget_test.go` | `live_jobs_groups_roundtrip_test.go` |
| `live_parity_schema_upgrade_test.go` | `live_schema_upgrade_test.go` |

**Work.**

1. Delete `services/cmd/mongo_parity_sample`, `loadFixtureSampleDocs`, `loadParitySampleDocs` and the
   `MONGO_PARITY_FIXTURE_DIR` read; decide whether the remaining test earns its place.
2. Rename `mongolive.Gate` and update `live-mongo.sh`; delete the 31 comment mentions rather than
   rewriting them.
3. Rename the seven files.
4. Update every doc that names the gate or the command on promote (this is the promotion fold, not
   live-doc editing now): `testing/harness.md`, `testing/services/shared.md`, `api.md`, `core.md`,
   `backend/shared/jsoncodec.md` (names `cmd/mongo_parity_sample` twice), and the kept
   `swarm-stack/promote/testing/services/shared.md`. Other projects' overlays that spell the gate —
   document-write-granularity, shared-planners, changestream-tenant-scale, archived-jobs-stats — are
   migration writing and may keep the old name as history, but a reader following them to run a test
   would type the wrong variable, so a sweep is cheap and worth it.

**Wire.** None at the product level. `EIP_MONGO_PARITY_LIVE` → `EIP_MONGO_LIVE` is breaking for any
developer's shell history and for `live-mongo.sh`, which changes in the same slice; nothing deployed
reads either. No `prepareRelease` step.

### Promotion draft

**Today.** Seven lines ending "*Empty until Stage A.*"

**After.** The replacement for `testing/harness.md` § Live Mongo and the CI row for its Entrypoints
table, written as live prose: the gate (whichever name Stage D settles), `Require` applying the schema,
the test database and its guard, `ScratchDatabase` beside `ScratchAccount`, the runner script's grants,
the host-side throwaway replica set recipe (already written in the overlay § Stage B), and the CI job.
Also the coverage-map row for `testing/mongolive` in the same file, which today lists `ScratchAccount`
and not `ScratchDatabase`.

**Work.** One pass once Stage C's job shape is fixed; most of the prose exists in
[overlay.md](./overlay.md) § Stage B and needs moving, not writing.

## Decisions needed

### One database per binary, or stay serial

**Question.** Does the suite get a database per test binary, or does `go test -p 1` become the rule and
the CI job's shape?

**Why it is James's call.** It trades local setup cost against CI wall clock and against whether
`ScratchDatabase` ever becomes usable. The plan leans one way ("a database per binary is the better
answer") but records the auth cost and leaves it outstanding rather than choosing.

**Options.**

- *Per-binary database.* Name derived from the binary; guard checks a prefix; `ScratchDatabase` is safe;
  `go test ./...` runs parallel and is the same command everywhere. Cost: the local runner must grant
  rights per database (it runs one package at a time, so it knows which), and a developer's throwaway
  replica set collects one database per package run. CI with no `--auth` pays nothing.
- *Serial.* Keep the constant; CI runs `-p 1`; the overlay rule becomes the live rule. Cost: a 201-test
  suite behind a serialised 2,000-test unit run on every dispatch, a rule no tool enforces locally, and
  a `ScratchDatabase` export with no safe caller.
- *Per-binary namespace inside one database* (collection prefix). Rejected on the plan's own grounds:
  the schema's index and pre-image lists are per collection name and would have to be applied per
  prefix; it reintroduces the enumeration `ScratchDatabase` exists to remove.

**Recommendation.** Per-binary database, derived from `os.Args[0]`, with the prefix as the one
constant. It is the only option under which both remaining "Done when" lines about the suite ("gives
the same answer twice", "leaves the stack's database untouched" by construction rather than by a
single guard) are met without a convention someone has to remember.

**Blocked until decided.** Stage C's job (its `go test` line and timeout), `ScratchDatabase` adoption,
the harness-doc wording in the promotion draft.

### What CI provisions beyond mongod

**Question.** Does the `live-mongo` job also start Redis and NATS, or accept the skips?

**Why it is James's call.** The plan's § CI lists only mongod; the trial it reports ran with Redis on
6399 and `EIP_REDIS_PARITY_LIVE=1` open, and its numbers (2,233 pass, 28 skip) are from that larger
provisioning. The plan's one named exception, `TestLive_Publish_ownerReachesTheSubscriberFromTheDocument`,
skips itself when NATS is unreachable (`live_publish_test.go:26`), so a NATS-less runner is already
tolerated. The local runner passes `NATS_URL`, `REDIS_*`, `EIP_WS_URL` and `ENTITY_ID_KEY` through,
so some live tests reach those.

**Options.**

- *mongod only.* Smallest job; every Redis-backed live assertion skips; the published numbers will not
  match the trial's.
- *mongod + Redis.* One more `docker run`; matches the trial; the Redis gate's own guard (`redislive`
  refuses 6379) is satisfied by publishing on 6399.
- *mongod + Redis + NATS.* Closest to a stack; NATS needs JetStream enabled and the publish test still
  needs a running core service, so it still skips.

**Recommendation.** mongod + Redis. It reproduces the measurement the plan already stands on and costs
one step. Leave NATS until a test needs it without also needing a service.

**Blocked until decided.** The job's steps and env; the overlay's recorded baseline.

### How an open gate with no server reports

**Question.** When the gate is set and the server is absent, does the run fail once with one sentence,
or per test as it does now?

**Why it is James's call.** The plan records 54 failures reading as a code regression and calls it a
hazard, but writes no fix. Fixing it changes a shared harness package every live test uses, and a
`sync.Once`-cached dial error in `Require` still fails every test — just with an identical message —
because Go has no way for a package to abort a binary short of `TestMain`, which these packages do not
have and should not each grow.

**Options.**

- *Leave it.* Per-test failures with the dial error; readable once you know.
- *Cache the dial once in `Require`* (the same `sync.Once` shape `ensureSchemaOnce` uses) so every
  failure carries one identical sentence naming the gate and the address. Cheap; does not stop the run.
- *Runner preflight.* `live-mongo.sh` and the CI job ping mongod before `go test` and stop with one
  line. Solves the aggregate problem where it occurs; does nothing for a bare `go test` with the gate
  set.

**Recommendation.** Both of the last two: preflight in the two runners, and the cached dial in `Require`
so the per-test message is one sentence pointing at the gate rather than a driver stack.

**Blocked until decided.** Stage C's job steps; otherwise nothing — this is small and can land with
either B or C.

### `MONGO_DATABASE` in `EnvFields` without the stack forwarding it

**Question.** Should the stack forward `MONGO_DATABASE` to the services so the `EnvFields` knob does
what its help says, or should the help say the services ignore it?

**Why it is James's call.** It is a product-facing operator field. The plan put it in `EnvFields`
because that is the env schema's SoT, while also saying no service ever sets it. Both halves are
defensible; the current text is not, because it describes a behaviour the stack does not have.

**Options.**

- *Forward it.* Add `MONGO_DATABASE` to `x-mongo-env` (or the `.env`-fed `x-app-public-env`). Additive
  on the wire. Gives operators a real knob — and a footgun: the app user has rights only on
  `eve_industry_planner`, so a value pointing elsewhere authenticates and then fails every write.
- *Reword.* Keep the field, change its help to "Set by the live test suite; services always use
  eve_industry_planner." Nothing else moves.
- *Remove it from `EnvFields`.* Keep the key as a Go constant only. Breaks the "EnvFields is the SoT
  for every env key" rule the project cites.

**Recommendation.** Reword. The plan never intended an operator path, the footgun is real, and the
one-SoT rule is satisfied by the field existing with honest help.

**Blocked until decided.** Nothing in code; the promotion draft's wording for the key.

### When the gate rename lands

**Question.** Does Stage D's rename to `EIP_MONGO_LIVE` land now, before CI, or at promote?

**Why it is James's call.** The code change is one constant and one script line, but the name is
spelled in four live docs, one kept promote draft of another project, and four other projects' overlays.
Renaming before CI means the job is born with the right name; renaming at promote means every doc fold
happens once. The plan says D "may land last or alongside C" and does not choose.

**Options.**

- *Now, with or before C.* The CI job never carries the old name; the four overlays in other projects
  get a one-line sweep now.
- *At promote.* One fold; the CI job and the overlay carry a name the project itself calls wrong until
  then.

**Recommendation.** Now, as the first slice of D, so Stage C is written against the final name.

**Blocked until decided.** The env block in Stage C's job.

## Dependencies and order

**This project waits on nothing.** The statistics fix it waited on landed in shared-planners; the
`testing/go.mod` tidy it listed is already clean.

**Waiting on this project.** Nothing names it as a dependency. `collection-naming/` is kept partly
because this project cites its renames; when this project promotes, recheck whether that folder's
other two citers still need it.

**Cross-project notes.**

- shared-planners `overlay.md` says the statistics fix is *Landed*; this project's plan and overlay say
  it is being fixed. Update here.
- The plan and overlay name `SeedDocumentVersion`; the code's name is `SeedDocumentRevision`.
- `backend/shared/jsoncodec.md` cites `cmd/mongo_parity_sample` as a live example twice. Stage D
  deletes the package, so the promotion fold has to give that doc a different example.

**Recommended next slice.** Settle § One database per binary, or stay serial, then land the per-binary
derivation with the gate rename (D's first item) in one slice: both touch `mongolive.go` and
`live-mongo.sh`, and the file's comments come down to the rule in the same pass. Stage C follows
against the final name and a parallel-safe suite, provisioning mongod and Redis, with a preflight. The
rest of D (delete the command and the fixture branch, rename the seven files) and the promotion draft
close the project.
