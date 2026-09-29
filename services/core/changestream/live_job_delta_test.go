package changestream

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/testing/mongolive"

	natslib "github.com/nats-io/nats.go"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func watchTestDatabase(t *testing.T, nats *eipnats.NATS) {
	t.Helper()
	watcher := NewWatcher(mongolive.RequireWatch(t, len(CollectionGroups())), nats, nil)
	stop := watcher.Start(CollectionGroups())
	t.Cleanup(stop)
}

type publishedDelta struct {
	DocID     string                 `json:"docID"`
	Operation string                 `json:"operationType"`
	Changed   []models.JobJSONChange `json:"changed"`
	Removed   [][]string             `json:"removed"`
	Revision  int64                  `json:"revision"`
	AppliesTo int64                  `json:"appliesTo"`
	Document  map[string]any         `json:"document"`
}

func TestLive_JobDelta_aFieldScopedWriteReachesTheSubscriberAsADelta(t *testing.T) {
	m := mongolive.Require(t)

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	nats, err := eipnats.Open(ctx)
	if err != nil {
		t.Skipf("stack NATS unreachable: %v", err)
	}
	t.Cleanup(func() { nats.Close() })
	watchTestDatabase(t, nats)

	const (
		accountID = "eip-live-delta-account"
		jobID     = "eip-live-delta-job"
	)
	owner := models.AccountOwner(accountID)
	storedID := eipmongo.OwnerScopedDocumentID(owner, jobID)

	coll := m.Coll(eipmongo.CollectionJobDocuments)
	clear := func() {
		cctx, c := context.WithTimeout(context.Background(), 30*time.Second)
		defer c()
		_, _ = coll.DeleteOne(cctx, bson.M{"_id": storedID})
	}
	clear()
	t.Cleanup(clear)

	if _, err := coll.InsertOne(ctx, bson.M{
		"_id": storedID,
		models.MetaFieldName: bson.M{
			models.MetaFieldOwner:    mongolive.OwnerDoc(owner),
			models.MetaFieldRevision: models.InitialDocumentRevision,
		},
		"jobID": jobID,
		"name":  "Before",
		"build": bson.M{
			"extrasCosts": bson.M{"e-1": bson.M{"id": "e-1", "extraValue": 120000}},
			"materials":   bson.M{"34": bson.M{"typeID": 34, "volume": 100}},
		},
	}); err != nil {
		t.Fatalf("insert the job: %v", err)
	}

	sub, err := nats.Conn().SubscribeSync(eipnats.SubjectDocUpdate + ".>")
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	t.Cleanup(func() { _ = sub.Unsubscribe() })
	awaitWatcherReady(t, sub, coll, owner)

	if _, err := coll.UpdateOne(ctx, bson.M{"_id": storedID}, bson.M{
		"$set": bson.M{
			"name":                      "After",
			"build.materials.34.volume": 4200,
		},
		"$unset": bson.M{"build.extrasCosts.e-1": ""},
		"$inc":   bson.M{eipmongo.FieldMetaRevision: 1},
	}); err != nil {
		t.Fatalf("write the fields: %v", err)
	}

	msg, _ := awaitPublished(t, sub, 30*time.Second, updatePublishedFor(jobID))

	var got publishedDelta
	if err := json.Unmarshal(msg.Data, &got); err != nil {
		t.Fatalf("decode published message: %v\n%s", err, msg.Data)
	}

	if got.Operation != "update" {
		t.Fatalf("operationType = %q, want update", got.Operation)
	}
	if got.Revision != models.InitialDocumentRevision+1 {
		t.Fatalf("revision = %d, want %d", got.Revision, models.InitialDocumentRevision+1)
	}
	if got.AppliesTo != got.Revision-1 {
		t.Fatalf("appliesTo = %d, want %d", got.AppliesTo, got.Revision-1)
	}

	byPath := map[string]any{}
	for _, change := range got.Changed {
		byPath[strings.Join(change.Path, ".")] = change.Value
	}
	if byPath["name"] != "After" {
		t.Errorf("changed name = %v, want After", byPath["name"])
	}
	if byPath["build.materials.34.volume"] != float64(4200) {
		t.Errorf("changed build.materials.34.volume = %v, want 4200", byPath["build.materials.34.volume"])
	}
	for path := range byPath {
		if strings.HasPrefix(path, "build.extrasCosts") {
			t.Errorf("changed names a row that was cleared rather than written: %v", path)
		}
	}

	if len(got.Removed) != 1 || len(got.Removed[0]) != 3 ||
		got.Removed[0][0] != "build" || got.Removed[0][1] != "extrasCosts" || got.Removed[0][2] != "e-1" {
		t.Errorf("removed = %v, want the one cleared row", got.Removed)
	}

	if got.Document["name"] != "After" {
		t.Errorf("the whole document must still travel beside the delta, got %v", got.Document["name"])
	}
}

func TestLive_JobDelta_aSchemaMaintenanceWriteCarriesNoDelta(t *testing.T) {
	m := mongolive.Require(t)

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	nats, err := eipnats.Open(ctx)
	if err != nil {
		t.Skipf("stack NATS unreachable: %v", err)
	}
	t.Cleanup(func() { nats.Close() })
	watchTestDatabase(t, nats)

	const (
		accountID = "eip-live-delta-maintenance-account"
		jobID     = "eip-live-delta-maintenance-job"
		marker    = "eip-live-delta-maintenance-marker"
	)
	owner := models.AccountOwner(accountID)
	storedID := eipmongo.OwnerScopedDocumentID(owner, jobID)
	markerID := eipmongo.OwnerScopedDocumentID(owner, marker)

	coll := m.Coll(eipmongo.CollectionJobDocuments)
	clear := func() {
		cctx, c := context.WithTimeout(context.Background(), 30*time.Second)
		defer c()
		_, _ = coll.DeleteMany(cctx, bson.M{"_id": bson.M{"$in": []string{storedID, markerID}}})
	}
	clear()
	t.Cleanup(clear)

	seed := func(id, name string) {
		if _, err := coll.InsertOne(ctx, bson.M{
			"_id": id,
			models.MetaFieldName: bson.M{
				models.MetaFieldOwner:    mongolive.OwnerDoc(owner),
				models.MetaFieldRevision: models.InitialDocumentRevision,
			},
			"jobID":         name,
			"schemaVersion": 1,
		}); err != nil {
			t.Fatalf("insert %s: %v", id, err)
		}
	}
	seed(storedID, jobID)
	seed(markerID, marker)

	sub, err := nats.Conn().SubscribeSync(eipnats.SubjectDocUpdate + ".>")
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	t.Cleanup(func() { _ = sub.Unsubscribe() })
	awaitWatcherReady(t, sub, coll, owner)

	if _, err := coll.UpdateOne(ctx, bson.M{"_id": storedID},
		bson.M{"$set": bson.M{"schemaVersion": 2}}); err != nil {
		t.Fatalf("bump the schema version: %v", err)
	}
	if _, err := coll.UpdateOne(ctx, bson.M{"_id": markerID}, bson.M{
		"$set": bson.M{"name": "After"},
		"$inc": bson.M{eipmongo.FieldMetaRevision: 1},
	}); err != nil {
		t.Fatalf("write the marker: %v", err)
	}

	_, seen := awaitPublished(t, sub, 30*time.Second, publishedFor(marker))

	for _, peek := range seen {
		if peek.DocID == jobID {
			t.Fatalf("the schema bump reached a subscriber; a maintenance write must be suppressed (saw %v)", seen)
		}
	}
}

func awaitWatcherReady(t *testing.T, sub *natslib.Subscription, coll *mongo.Collection, owner models.Owner) {
	t.Helper()
	probeID := eipmongo.OwnerScopedDocumentID(owner, "eip-live-delta-probe")
	t.Cleanup(func() {
		cctx, c := context.WithTimeout(context.Background(), 30*time.Second)
		defer c()
		_, _ = coll.DeleteOne(cctx, bson.M{"_id": probeID})
	})

	deadline := time.Now().Add(120 * time.Second)
	for time.Now().Before(deadline) {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		_, err := coll.UpdateOne(ctx, bson.M{"_id": probeID}, bson.M{
			"$set": bson.M{
				models.MetaFieldName: bson.M{models.MetaFieldOwner: mongolive.OwnerDoc(owner)},
				"jobID":              "eip-live-delta-probe",
				"name":               time.Now().Format(time.RFC3339Nano),
			},
		}, options.UpdateOne().SetUpsert(true))
		cancel()
		if err != nil {
			t.Fatalf("probe the watcher: %v", err)
		}

		msg, err := sub.NextMsg(3 * time.Second)
		if err != nil {
			continue
		}
		var peek struct {
			DocID string `json:"docID"`
		}
		if json.Unmarshal(msg.Data, &peek) == nil && peek.DocID == "eip-live-delta-probe" {
			return
		}
	}
	t.Fatal("the watcher published nothing for a probe: its change stream never opened")
}
