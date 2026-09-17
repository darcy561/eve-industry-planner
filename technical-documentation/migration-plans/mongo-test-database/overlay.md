# Mongo test database — overlay

How the live Mongo test setup works **while this project is in flight**. Live docs remain the truth
where this file is silent; where they overlap, this file wins.

Stage A has landed. Everything else is as
[testing/harness.md](../../testing/harness.md) § Live Mongo describes it: tests gated on
`EIP_MONGO_PARITY_LIVE`, `ScratchAccount` for cleanup, and no CI job. See
[plan.md](./plan.md) § Starting position.

Each stage fills its section below as it lands, stating **what changed** and **how that part works
now** — not what is intended.

## Stage A — One database name

The database name resolves in one place:
[`config.MongoDatabase()`](../../../services/shared/core/config/mongo.go) returns `MONGO_DATABASE`
when it is set to something other than blank, and `config.DefaultMongoDatabase`
(`eve_industry_planner`) otherwise. It reads the variable at the call rather than once at start-up,
so a test that sets it after the process is running still moves.

[`mongo.DatabaseName()`](../../../services/shared/mongo/names.go) is now a function returning that
resolver instead of a second constant, so the URI a client dials and the database its handles bind
to cannot disagree. Two declarations could drift, and a handle bound to a database the URI never
named reads an empty collection rather than failing.

**`authSource` stays pinned to `eve_industry_planner`** and does not follow the resolver. The app
user is created in that database with `readWrite` on it, so authentication names it whatever
database the client then works in. `TestMongoURL_authSourceDoesNotFollowTheDatabase` holds that
apart: the URI's path follows `MONGO_DATABASE` while its `authSource` does not.

`MONGO_DATABASE` is in `EnvFields` as an optional Database-section field defaulting to blank, which
is what keeps every service on `eve_industry_planner` without an operator setting anything. **A
service sees no change**: nothing sets the variable outside the live test suite.

## Stage B — Isolation

**A live run works in its own database and refuses the stack's.**
[`mongolive.TestDatabase`](../../../testing/mongolive/mongolive.go) names it
(`eve_industry_planner_test`); the runner points `MONGO_DATABASE` at it and nothing in the helper
sets the variable, because a helper that rewrote the environment would be choosing where the writes
land for a caller who thought they had chosen. Every handle from `Require` and `RequireWatch` passes
`requireTestDatabase`, which fails with the variable to set when the handle is bound to
`config.DefaultMongoDatabase`.

`ScratchDatabase(t, m)` drops the whole database at both ends of a test. `ScratchAccount` keeps its
signature and its call sites: it has to know every collection an account touches, and a collection
added without updating that list leaves rows behind. Dropping needs no list and cannot fall behind
one — which is only safe because of the guard above.

**The schema is applied by the helper, not by a separate step.**
[`schema.go`](../../../testing/mongolive/schema.go) creates the five pre-image collections, turns
on `changeStreamPreAndPostImages`, and creates the 26 indexes through the Go driver. `Require` runs
it once per test binary, so a fresh database is usable without the caller remembering. This departs
from [plan.md](./plan.md) § CI, which has the CI job apply the schema as its own step: one mechanism
covers a local run and a runner alike, and Stage C no longer needs that step.

The once-per-binary work keeps its error rather than failing inside the `sync.Once`. A `t.Fatalf`
there runs `runtime.Goexit`, and `Once` marks itself done on the way out regardless — so the test
that tripped it fails and every later test in the binary takes a no-op `Do` and runs green against a
database with no indexes and no pre-images. Reproduced before it was fixed: of two tests calling the
old shape, the first failed and the second passed.

The two lists are spelled in both modules and pinned by `TestSchemaMirror_pinned` on each side,
which is what `collection_names_test.go` already does for the collection names. Renames and
retired-index drops are not mirrored: both reconcile a database with history, and one this helper
creates has none.

**Rights on the test database are two roles, not one.** `readWrite` to use it, and `dbAdmin` because
the pre-image step is a `collMod`. [`scripts/testing/live-mongo.sh`](../../../scripts/testing/live-mongo.sh)
grants both before it runs and points `MONGO_DATABASE` at the test database. It reads the root
credentials from the **`mongo` service's own environment**: only the shared app user is a Docker
secret, and it is not mounted on `eip_core`, so there is no `/run/secrets` path to read them from.
The grant replaces any existing roles for that database rather than appending, so a repeated run
leaves the same three roles. `TestRunnerUsesTheTestDatabase` pins the script's default against
`mongolive.TestDatabase`: a shell script cannot read a Go constant, and the two disagreeing would
point a run at a database the guard does not know about.

**What running it found.** Fifteen failures on a database of their own, across fourteen tests.
Eleven were stale
assumptions about the document id — production scopes an id to its owner and these still built filters
from bare job ids, so they would have failed against any database and nothing noticed, because the
suite had never run anywhere but by hand. They are fixed.

Two were real product bugs that only this suite catches: `SeedDocumentVersion` never stamped a version
on a migrated document, and three statistics handlers read the calling account's figures rather than
the planner's. The first is fixed here; the second belongs to
[shared-planners](../shared-planners/contents.md) and is being fixed there. See [plan.md](./plan.md)
§§ What the fifteen turned out to be, The bug the suite was there to find.

**The last one is not fixed, and is a gap in this stage.** A run gives the suite one database, but
`go test ./...` runs a binary per package and runs them in parallel, so every live package writes into
it at once. Three runs from a dropped database gave three different answers; the same runs with `-p 1`
gave identical ones. A run of more than one live package is therefore `go test -p 1 ./...`
until the suite is isolated per package, which is outstanding work on this stage —
[plan.md](./plan.md) § The suite is not isolated per package has the measurements and what it would
take. It also bounds `ScratchDatabase`: dropping a whole database is safe for a binary that
owns one, and unsafe for a database several binaries share.

Serialised, and with the statistics bug still open: 2,254 pass, 1 fail, 29 skip.
