// Package mongolive gates a test on the stack's Mongo and gives it scratch space
// to work in.
//
// Live tests here write to the same database the running stack uses, so what
// they share is a way in and a way to leave nothing behind.
package mongolive

import (
	"context"
	"os"
	"sync"
	"testing"
	"time"

	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Gate is the environment variable that opts a run in to live Mongo.
const Gate = "EIP_MONGO_PARITY_LIVE"

// TestDatabase is the database a live run works in. The runner points
// MONGO_DATABASE at it; nothing here sets the variable, because a test helper
// that rewrote the environment would be deciding where the writes land on
// behalf of a caller who thought they had chosen.
const TestDatabase = "eve_industry_planner_test"

const dial = 15 * time.Second

// Skip reports whether the gate is closed, skipping the test if it is.
//
// Separate from Require for the few tests that read live data through their own
// path rather than a handle, so the gate is still spelled once.
func Skip(t *testing.T) bool {
	t.Helper()
	if os.Getenv(Gate) != "1" {
		t.Skipf("set %s=1 to run against stack Mongo", Gate)
		return true
	}
	return false
}

// Enabled reports whether the gate is open, without skipping.
//
// For a test that has something to do either way — checking a shape against live
// documents when they are reachable and against fixtures when they are not.
func Enabled() bool { return os.Getenv(Gate) == "1" }

// Require connects to the stack's Mongo, or skips the test.
//
// The connection is closed when the test ends, and the ping is part of the
// gate: a handle that cannot reach the server fails here rather than inside
// whatever the test was about.
func Require(t *testing.T) *eipmongo.Mongo {
	t.Helper()
	if Skip(t) {
		return nil
	}
	return connect(t, "connect", eipmongo.ConnectPrimary)
}

// RequireWatch connects a client built for change streams, or skips the test.
//
// Change streams need the client that carries no operation timeout, because a
// long-lived awaitable cursor would otherwise be ended by it. streams sizes the
// connection pool to the number of concurrent watches the caller will open.
func RequireWatch(t *testing.T, streams int) *eipmongo.Mongo {
	t.Helper()
	if Skip(t) {
		return nil
	}
	if streams < 1 {
		t.Fatalf("RequireWatch needs at least one stream, got %d", streams)
	}
	return connect(t, "connect watch", func() (*eipmongo.Mongo, error) {
		return eipmongo.ConnectWatch(uint64(streams))
	})
}

func connect(t *testing.T, what string, dialFn func() (*eipmongo.Mongo, error)) *eipmongo.Mongo {
	t.Helper()
	mongo, err := dialFn()
	if err != nil {
		t.Fatalf("%s: %v", what, err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), dial)
		defer cancel()
		mongo.Disconnect(ctx)
	})

	ctx, cancel := context.WithTimeout(context.Background(), dial)
	defer cancel()
	if err := mongo.Ping(ctx); err != nil {
		t.Fatalf("ping: %v", err)
	}
	requireTestDatabase(t, mongo)
	ensureSchemaOnce(t, mongo)
	return mongo
}

// The schema work happens once per test binary. The creates are idempotent, but
// a fresh database needs them before the first test reads, and no caller should
// have to remember that.
//
// The error is kept rather than failed on inside the Once. A t.Fatalf there runs
// runtime.Goexit, and sync.Once marks itself done on the way out regardless — so
// the test that tripped it fails and every later test in the binary takes a
// no-op Do and runs green against a database with no indexes and no pre-images.
var (
	schemaOnce sync.Once
	schemaErr  error
)

func ensureSchemaOnce(t *testing.T, mongo *eipmongo.Mongo) {
	t.Helper()
	schemaOnce.Do(func() { schemaErr = ensureSchema(mongo) })
	if schemaErr != nil {
		t.Fatalf("live schema: %v", schemaErr)
	}
}

// requireTestDatabase refuses a handle bound to the database the stack serves.
//
// These tests write real documents and delete what they think they created. Run
// against the stack's database they are one missed filter away from deleting a
// player's jobs, and the failure would look like a bug in the product rather
// than in a test. The guard is the same one redislive makes about port 6379.
func requireTestDatabase(t *testing.T, mongo *eipmongo.Mongo) {
	t.Helper()
	if got := mongo.DB.Name(); got == config.DefaultMongoDatabase {
		t.Fatalf("live tests are bound to %q, the database the stack serves. "+
			"Set %s=%s (scripts/testing/live-mongo.sh does this) and grant the app user readWrite on it.",
			got, config.EnvMongoDatabase, TestDatabase)
	}
}

// ScratchDatabase drops the whole database the handle is bound to, at both ends
// of the test.
//
// ScratchAccount has to know every collection an account touches; a collection
// added without updating that list leaves rows behind. Dropping the database
// needs no list and cannot fall behind one. It is only safe because the handle
// cannot be bound to the stack's database — see requireTestDatabase.
//
// It takes the whole database, not a namespace within it, so it is a per-binary
// device and not a per-test one. Two things follow for a caller. It must not run
// from a t.Parallel test, where a sibling's documents go with it. And it drops
// the indexes and pre-images Require applied, which Require will not apply again
// — the schema work is once per binary — so a test that drops and then depends
// on a change stream has to put them back itself.
func ScratchDatabase(t *testing.T, mongo *eipmongo.Mongo) {
	t.Helper()
	requireTestDatabase(t, mongo)
	drop := func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := mongo.DB.Drop(ctx); err != nil {
			t.Fatalf("drop %s: %v", mongo.DB.Name(), err)
		}
	}
	drop()
	t.Cleanup(drop)
}

// ScratchAccount clears every document an account owns — its own row and
// settings, its archive and statistics, and its planner, membership and planner
// settings — now and when the test ends.
//
// Both ends, because a run that died before its cleanup would otherwise leave
// rows that the next run reads as its own. The account id is the caller's to
// choose and should be one no real account can hold.
func ScratchAccount(t *testing.T, mongo *eipmongo.Mongo, accountID string) {
	t.Helper()
	clear := func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		// Every scoped document, derived rows included, states its owner in the
		// same place. Statistics rows carried a root accountID before the owner
		// block; cleaning on that would leave a test's rows behind for the next.
		scope := bson.M{eipmongo.FieldMetaOwnerKind: models.OwnerAccount, eipmongo.FieldMetaOwnerID: accountID}
		owner := bson.M{"_id": models.AccountOwner(accountID).Key()}
		for _, target := range []struct {
			docs   *eipmongo.Docs
			filter bson.M
		}{
			{mongo.StatisticsRows, scope},
			{mongo.StatisticsTimeline, scope},
			{mongo.StatisticsTotals, scope},
			{mongo.ArchivedJobs, scope},
			// Restore writes back to the planner, so its targets are scratch too.
			{mongo.JobDocuments, scope},
			{mongo.Groups, scope},
			{mongo.StatisticsRebuildQueue, owner},
			{mongo.StatisticsReconcileRota, owner},
			// The planner and its settings are keyed by the owner key; a
			// membership row is keyed by the planner and the account together, so
			// it is cleared on the planner it belongs to.
			{mongo.Planners, owner},
			{mongo.PlannerSettings, owner},
			{mongo.PlannerMemberships, bson.M{"plannerID": models.AccountOwner(accountID).Key()}},
			{mongo.Users, bson.M{"_id": accountID}},
			{mongo.ApplicationSettings, bson.M{"_id": accountID}},
		} {
			if target.docs == nil {
				continue
			}
			_, _ = target.docs.Collection().DeleteMany(ctx, target.filter)
		}
	}
	clear()
	t.Cleanup(clear)
}

// OwnerMeta is the `_meta` an owned document carries, for a fixture that writes
// one directly rather than through a model.
//
// A hand-built block is easy to get half right — an id with no kind passes every
// compile-time check and matches no owner-scoped read — so fixtures build it from
// here rather than each spelling the shape.
func OwnerMeta(owner models.Owner) bson.M {
	return bson.M{models.MetaFieldOwner: OwnerDoc(owner)}
}

// OwnerDoc is the owner block itself, for a fixture that puts it inside a `_meta`
// it is already building, or patches it with a dotted path.
//
// It takes an [models.Owner] rather than two strings so a caller cannot pass one
// without the other, and does not validate: a test asserting what an unreadable
// owner does needs to be able to write one.
func OwnerDoc(owner models.Owner) bson.M {
	return bson.M{"kind": string(owner.Kind), "id": owner.ID}
}
