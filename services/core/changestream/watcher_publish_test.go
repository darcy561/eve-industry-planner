package changestream

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/testing/natsfake"

	natslib "github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	"go.mongodb.org/mongo-driver/v2/bson"
)

type publishedMessage struct {
	DocID     string           `json:"docID"`
	Operation string           `json:"operationType"`
	Document  map[string]any   `json:"document"`
	Changed   []map[string]any `json:"changed"`
	Removed   [][]string       `json:"removed"`
	Revision  int64            `json:"revision"`
	AppliesTo int64            `json:"appliesTo"`
}

func watcherOverFakeNATS(t *testing.T) (*Watcher, *natslib.Subscription) {
	t.Helper()
	fake := natsfake.New(t)
	spec := eipnats.DocUpdateStreamSpec()
	if _, err := fake.JS().CreateOrUpdateStream(context.Background(), jetstream.StreamConfig{
		Name:     spec.Name,
		Subjects: spec.Subjects,
	}); err != nil {
		t.Fatalf("create %s: %v", spec.Name, err)
	}
	sub, err := fake.Conn().SubscribeSync(eipnats.SubjectDocUpdate + ".>")
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	t.Cleanup(func() { _ = sub.Unsubscribe() })
	return &Watcher{nats: fake.NATS}, sub
}

func changeEvent(collection, operation string, update bson.M) bson.M {
	event := bson.M{
		"operationType": operation,
		"ns":            bson.M{"coll": collection},
		"documentKey":   bson.M{"_id": "job-1"},
		"fullDocument": bson.M{
			"jobID": "job-1",
			"name":  "After",
			"_meta": bson.M{
				"revision": int64(8),
				"owner":    bson.M{"kind": "account", "id": "acct-1"},
			},
		},
	}
	if update != nil {
		event["updateDescription"] = update
	}
	return event
}

func published(t *testing.T, w *Watcher, sub *natslib.Subscription, event bson.M) (publishedMessage, bool) {
	t.Helper()
	if err := w.processChangeEvent(context.Background(), event); err != nil {
		t.Fatalf("processChangeEvent: %v", err)
	}
	msg, err := sub.NextMsg(2 * time.Second)
	if err != nil {
		return publishedMessage{}, false
	}
	var got publishedMessage
	if err := json.Unmarshal(msg.Data, &got); err != nil {
		t.Fatalf("decode published message: %v\n%s", err, msg.Data)
	}
	return got, true
}

func TestWatcherPublishesAJobUpdatesDeltaBesideTheDocument(t *testing.T) {
	w, sub := watcherOverFakeNATS(t)

	got, ok := published(t, w, sub, changeEvent(eipmongo.CollectionJobDocuments, "update", bson.M{
		"updatedFields": bson.M{"_meta.revision": int64(8), "name": "After"},
		"removedFields": bson.A{"build.extrasCosts.e-1"},
	}))

	if !ok {
		t.Fatal("want the update published")
	}
	if got.Revision != 8 || got.AppliesTo != 7 {
		t.Errorf("want 8 applying onto 7, got %d onto %d", got.Revision, got.AppliesTo)
	}
	if len(got.Changed) == 0 || len(got.Removed) != 1 {
		t.Errorf("want the changes and the cleared row, got %v and %v", got.Changed, got.Removed)
	}
	if got.Document["name"] != "After" {
		t.Errorf("want the whole document beside the delta, got %v", got.Document)
	}
}

func TestWatcherPublishesTheDocumentAloneWhenADeltaCannotBeStated(t *testing.T) {
	w, sub := watcherOverFakeNATS(t)

	got, ok := published(t, w, sub, changeEvent(eipmongo.CollectionJobDocuments, "update", bson.M{
		"updatedFields": bson.M{"_meta.revision": int64(8), "build.nonsense": 1},
	}))

	if !ok {
		t.Fatal("want an update whose delta cannot be stated still published")
	}
	if got.Changed != nil || got.Revision != 0 || got.AppliesTo != 0 {
		t.Errorf("want no delta, got changed %v revision %d onto %d", got.Changed, got.Revision, got.AppliesTo)
	}
	if got.Document["name"] != "After" {
		t.Errorf("want the whole document carrying the change, got %v", got.Document)
	}
}

func TestWatcherStatesADeltaForJobDocumentUpdatesAlone(t *testing.T) {
	for name, event := range map[string]bson.M{
		"an update to another collection": changeEvent(eipmongo.CollectionJobGroups, "update", bson.M{
			"updatedFields": bson.M{"_meta.revision": int64(8), "name": "After"},
		}),
		"an insert of a job document": changeEvent(eipmongo.CollectionJobDocuments, "insert", nil),
	} {
		t.Run(name, func(t *testing.T) {
			w, sub := watcherOverFakeNATS(t)

			got, ok := published(t, w, sub, event)

			if !ok {
				t.Fatal("want it published")
			}
			if got.Changed != nil || got.Removed != nil || got.Revision != 0 || got.AppliesTo != 0 {
				t.Errorf("want no delta, got %+v", got)
			}
		})
	}
}

func TestWatcherPublishesNothingForASchemaMaintenanceWrite(t *testing.T) {
	w, sub := watcherOverFakeNATS(t)

	if _, ok := published(t, w, sub, changeEvent(eipmongo.CollectionJobDocuments, "update", bson.M{
		"updatedFields": bson.M{"schemaVersion": 2, "_meta.lastModified": "2026-09-28T00:00:00Z"},
	})); ok {
		t.Fatal("want a schema-maintenance write kept from every subscriber")
	}
}

func TestIsSchemaMaintenanceOnlyUpdate(t *testing.T) {
	t.Parallel()

	for name, tc := range map[string]struct {
		update    bson.M
		operation string
		want      bool
	}{
		"a schema version and a stamp": {
			bson.M{"updatedFields": bson.M{"schemaVersion": 2, "_meta.lastModified": "x"}}, "update", true,
		},
		"the older spelling of the schema version": {
			bson.M{"updatedFields": bson.M{"schema_version": 2}}, "update", true,
		},
		"a stamp with no schema version": {
			bson.M{"updatedFields": bson.M{"_meta.lastModified": "x"}}, "update", false,
		},
		"a schema version beside a real field": {
			bson.M{"updatedFields": bson.M{"schemaVersion": 2, "name": "After"}}, "update", false,
		},
		"a schema version beside a cleared field": {
			bson.M{
				"updatedFields": bson.M{"schemaVersion": 2},
				"removedFields": bson.A{"build.extrasCosts.e-1"},
			}, "update", false,
		},
		"nothing updated":  {bson.M{"updatedFields": bson.M{}}, "update", false},
		"no update at all": {nil, "update", false},
		"not an update":    {bson.M{"updatedFields": bson.M{"schemaVersion": 2}}, "replace", false},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if got := isSchemaMaintenanceOnlyUpdate(tc.update, tc.operation); got != tc.want {
				t.Errorf("want %v, got %v", tc.want, got)
			}
		})
	}
}
