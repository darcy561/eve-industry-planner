package commands

import (
	"context"
	"strings"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/stackservices"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const revisionScratchPrefix = "eip-parity-revision-"

// The counter is renamed against documents in whatever state the database left
// them, and each of these is a state a real document is in: written before the
// counter existed, written under its old name, or written under both because it
// was touched after the deploy and before the release ran.
//
// Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_ensureMetaRevision_leavesEveryDocumentCounted(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	clients := &stackservices.Clients{Mongo: mongo}
	coll := mongo.Coll(eipmongo.CollectionJobDocuments)

	states := []struct {
		name string
		meta bson.M
		want int64
	}{
		{"written before the counter existed", bson.M{"lastModified": time.Now().UTC()}, models.InitialDocumentRevision},
		{"counted under the old name", bson.M{"version": int64(7)}, 7},
		{"counted under both names", bson.M{"version": int64(7), "revision": int64(9)}, 9},
		{"already counted under the new name", bson.M{"revision": int64(4)}, 4},
	}

	ids := make([]string, 0, len(states))
	for i, state := range states {
		id := revisionScratchPrefix + string(rune('a'+i))
		ids = append(ids, id)
		if _, err := coll.UpdateOne(ctx, bson.M{"_id": id},
			bson.M{"$set": bson.M{"_meta": state.meta}},
			options.UpdateOne().SetUpsert(true)); err != nil {
			t.Fatalf("seed %s: %v", state.name, err)
		}
	}
	t.Cleanup(func() {
		cleanupCtx, cancelCleanup := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancelCleanup()
		_, _ = coll.DeleteMany(cleanupCtx, bson.M{"_id": bson.M{"$in": ids}})
	})

	report, err := ensureMetaRevision(ctx, clients, false)
	if err != nil {
		t.Fatalf("ensureMetaRevision: %v", err)
	}
	if !strings.Contains(report, "renamed") {
		t.Fatalf("report says nothing about what it did: %q", report)
	}

	for i, state := range states {
		var stored struct {
			Meta bson.M `bson:"_meta"`
		}
		if err := coll.FindOne(ctx, bson.M{"_id": ids[i]}).Decode(&stored); err != nil {
			t.Fatalf("read back %s: %v", state.name, err)
		}
		got, _ := stored.Meta["revision"].(int64)
		if got != state.want {
			t.Errorf("%s: revision = %v, want %d", state.name, stored.Meta["revision"], state.want)
		}
		if _, stale := stored.Meta["version"]; stale {
			t.Errorf("%s: the old key survived: %#v", state.name, stored.Meta)
		}
	}

	// A release step runs again after a failure, so a second pass must be a no-op.
	second, err := ensureMetaRevision(ctx, clients, false)
	if err != nil {
		t.Fatalf("second run: %v", err)
	}
	if !strings.Contains(second, "renamed 0") || !strings.Contains(second, "seeded 0") {
		t.Errorf("a second run changed something: %q", second)
	}
}
