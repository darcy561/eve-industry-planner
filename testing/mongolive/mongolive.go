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

// Require connects to the stack's Mongo, or skips the test.
//
// The connection is closed when the test ends, and the ping is part of the
// gate: a handle that cannot reach the server fails here rather than inside
// whatever the test was about.
func Require(t *testing.T) *eipmongo.Mongo {
	t.Helper()
	if os.Getenv(Gate) != "1" {
		t.Skipf("set %s=1 to run against stack Mongo", Gate)
	}
	mongo, err := eipmongo.ConnectPrimary()
	if err != nil {
		t.Fatalf("connect: %v", err)
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

		scope := bson.M{"accountID": accountID}
		owner := bson.M{"_id": models.AccountStatsOwner(accountID).Key()}
		for _, target := range []struct {
			docs   *eipmongo.Docs
			filter bson.M
		}{
			{mongo.ArchivedJobStats, scope},
			{mongo.AccountTimelineMonths, scope},
			{mongo.AccountProductionTotals, scope},
			{mongo.ArchivedJobs, eipmongo.ArchivedJobAccountFilter(accountID)},
			// Restore writes back to the planner, so its targets are scratch too.
			{mongo.JobDocuments, eipmongo.ArchivedJobAccountFilter(accountID)},
			{mongo.Groups, eipmongo.ArchivedJobAccountFilter(accountID)},
			{mongo.AccountRebuildQueue, owner},
			{mongo.AccountReconcileRota, owner},
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
