package mongo

import (
	"encoding/json"
	"reflect"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestStructToMongoDoc_customIDAndNestedMeta(t *testing.T) {
	t.Parallel()
	type meta struct {
		AccountID string `bson:"accountID"`
	}
	type sample struct {
		Name string `bson:"name"`
		Meta meta   `bson:"_meta"`
	}

	doc, err := StructToMongoDoc(sample{Name: "n1", Meta: meta{AccountID: "acct-1"}}, "custom-id")
	if err != nil {
		t.Fatal(err)
	}
	if doc["_id"] != "custom-id" {
		t.Fatalf("_id=%#v", doc["_id"])
	}
	if doc["name"] != "n1" {
		t.Fatalf("name=%#v", doc["name"])
	}
	metaM, ok := doc["_meta"].(bson.M)
	if !ok {
		t.Fatalf("_meta type=%T want bson.M", doc["_meta"])
	}
	if metaM["accountID"] != "acct-1" {
		t.Fatalf("accountID=%#v", metaM["accountID"])
	}
}

func TestStructToMongoDoc_generatesObjectID(t *testing.T) {
	t.Parallel()
	doc, err := StructToMongoDoc(struct {
		Name string `bson:"name"`
	}{Name: "x"}, "")
	if err != nil {
		t.Fatal(err)
	}
	id, ok := doc["_id"].(bson.ObjectID)
	if !ok || id.IsZero() {
		t.Fatalf("_id=%#v want non-zero ObjectID", doc["_id"])
	}
}

func TestApplyLastModified_metaAsBsonD(t *testing.T) {
	t.Parallel()
	before := time.Now().UTC().Add(-time.Second)
	setDoc := bson.M{
		"name": "n1",
		"_meta": bson.D{
			{Key: "accountID", Value: "acct-1"},
			{Key: "lastModified", Value: time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)},
		},
	}
	applyLastModified(setDoc, nil, nil, false)

	meta := AsDocumentM(setDoc["_meta"])
	if meta == nil {
		t.Fatal("_meta missing after applyLastModified")
	}
	if meta["accountID"] != "acct-1" {
		t.Fatalf("accountID=%#v", meta["accountID"])
	}
	lm, ok := meta["lastModified"].(time.Time)
	if !ok {
		t.Fatalf("lastModified type=%T", meta["lastModified"])
	}
	if lm.Before(before) {
		t.Fatalf("lastModified not refreshed: %v", lm)
	}
}

func TestUnprocessedArchivedJobFilter_shape(t *testing.T) {
	t.Parallel()
	f := UnprocessedArchivedJobFilter()
	or, ok := f["$or"].([]any)
	if !ok || len(or) != 4 {
		t.Fatalf("$or=%#v", f["$or"])
	}
}

// unprocessedArchivedJobFilterCanonicalJSON pins the exact filter that the
// archivedJobs partial index in deployment-tool mirrors. A partial index only
// covers a query when its filter matches, so the two must move together.
//
// The same literal is pinned by TestArchivedJobsPartialFilterMatchesServices in
// deployment-tool/internal/dataplane/mongo. deployment-tool is a separate module
// and cannot import this one, so changing the filter means changing both — and
// changing either alone fails the other module's test.
const unprocessedArchivedJobFilterCanonicalJSON = `{"$or":[` +
	`{"_meta.archiveProcessed":null,"archiveProcessed":null},` +
	`{"_meta.archiveProcessed":null,"archiveProcessed":false},` +
	`{"_meta.archiveProcessed":false,"archiveProcessed":null},` +
	`{"_meta.archiveProcessed":false,"archiveProcessed":false}` +
	`]}`

func TestUnprocessedArchivedJobFilter_canonicalJSON(t *testing.T) {
	t.Parallel()
	got, err := json.Marshal(UnprocessedArchivedJobFilter())
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}
	if string(got) != unprocessedArchivedJobFilterCanonicalJSON {
		t.Fatalf("filter changed.\n got: %s\nwant: %s\n\nUpdate PartialFilterJSON for archivedJobs in "+
			"deployment-tool/internal/dataplane/mongo/index_specs.go to match, or the partial index "+
			"stops covering this query.", got, unprocessedArchivedJobFilterCanonicalJSON)
	}
}

func TestArchivedJobAccountFilter(t *testing.T) {
	t.Parallel()
	got := ArchivedJobAccountFilter("acct-1")
	want := bson.M{"_meta.accountID": "acct-1"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v want %#v", got, want)
	}
}
