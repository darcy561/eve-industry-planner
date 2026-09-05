// Package mongolive gates a test on the stack's Mongo and gives it scratch space
// to work in.
//
// Live tests here write to the same database the running stack uses, so what
// they share is a way in and a way to leave nothing behind.
package mongolive

import (
	"context"
	"os"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Gate is the environment variable that opts a run in to live Mongo.
const Gate = "EIP_MONGO_PARITY_LIVE"

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
	return mongo
}

// ScratchAccount clears every archive, statistics and planner document an
// account owns, now and when the test ends.
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
