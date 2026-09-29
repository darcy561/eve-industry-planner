package changestream

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type deltaCorpus struct {
	Stored struct {
		UpdatedFields map[string]any `json:"updatedFields"`
		RemovedFields []any          `json:"removedFields"`
	} `json:"stored"`
	Delivered struct {
		Changed   []models.JobJSONChange `json:"changed"`
		Removed   [][]string             `json:"removed"`
		Revision  int64                  `json:"revision"`
		AppliesTo int64                  `json:"appliesTo"`
	} `json:"delivered"`
}

func readDeltaCorpus(t *testing.T) deltaCorpus {
	t.Helper()
	path := filepath.Join("..", "..", "..", "testing", "fixtures", "realtime-messages", "job-delta.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	var corpus deltaCorpus
	if err := json.Unmarshal(raw, &corpus); err != nil {
		t.Fatalf("decode %s: %v", path, err)
	}
	return corpus
}

func TestJobDeltaMatchesTheCorpus(t *testing.T) {
	t.Parallel()
	corpus := readDeltaCorpus(t)

	delta, ok := jobDeltaFor(bson.M{
		"updatedFields": bson.M(corpus.Stored.UpdatedFields),
		"removedFields": bson.A(corpus.Stored.RemovedFields),
	})

	if !ok {
		t.Fatal("want the corpus's stored change to state a delta")
	}
	if !reflect.DeepEqual(delta.Changed, corpus.Delivered.Changed) {
		t.Errorf("changed =\n%#v\nwant\n%#v", delta.Changed, corpus.Delivered.Changed)
	}
	if !reflect.DeepEqual(delta.Removed, corpus.Delivered.Removed) {
		t.Errorf("removed = %v, want %v", delta.Removed, corpus.Delivered.Removed)
	}
	if delta.Revision != corpus.Delivered.Revision || delta.AppliesTo != corpus.Delivered.AppliesTo {
		t.Errorf("revision %d onto %d, want %d onto %d",
			delta.Revision, delta.AppliesTo, corpus.Delivered.Revision, corpus.Delivered.AppliesTo)
	}
}

func TestJobDeltaCorpusDropsWhatAClientIsNeverSent(t *testing.T) {
	t.Parallel()
	corpus := readDeltaCorpus(t)

	if _, held := corpus.Stored.UpdatedFields["protected"]; !held {
		t.Fatal("the corpus must carry a field a client is never sent, or it proves nothing")
	}
	for _, change := range corpus.Delivered.Changed {
		if change.Path[0] == "protected" {
			t.Error("the corpus states a field a client is never sent as delivered")
		}
	}
}
