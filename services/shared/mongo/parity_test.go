package mongo_test

import (
	"errors"
	"reflect"
	"testing"
	"time"

	legacy "eve-industry-planner/shared/core/mongo"
	mongoput "eve-industry-planner/shared/core/mongo/put"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

// Parity tests compare shared/mongo helpers to shared/core/mongo (oracle package).
// The production package under test must not import the oracle.

func TestParity_collectionNames(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		neu  string
		old  string
	}{
		{"DatabaseName", eipmongo.DatabaseName, legacy.DatabaseName},
		{"CollectionUsers", eipmongo.CollectionUsers, legacy.CollectionUsers},
		{"CollectionJobs", eipmongo.CollectionJobs, legacy.CollectionJobs},
		{"CollectionUserJobDocuments", eipmongo.CollectionUserJobDocuments, legacy.CollectionUserJobDocuments},
		{"CollectionArchivedJobs", eipmongo.CollectionArchivedJobs, legacy.CollectionArchivedJobs},
		{"CollectionBuildStats", eipmongo.CollectionBuildStats, legacy.CollectionBuildStats},
		{"CollectionUserJobGroups", eipmongo.CollectionUserJobGroups, legacy.CollectionUserJobGroups},
		{"CollectionUserGroupTemplateCatalog", eipmongo.CollectionUserGroupTemplateCatalog, legacy.CollectionUserGroupTemplateCatalog},
		{"CollectionUserGroupTemplatePayloads", eipmongo.CollectionUserGroupTemplatePayloads, legacy.CollectionUserGroupTemplatePayloads},
		{"CollectionUserWatchlistDeprecated", eipmongo.CollectionUserWatchlistDeprecated, legacy.CollectionUserWatchlistDeprecated},
		{"CollectionApplicationSettings", eipmongo.CollectionApplicationSettings, legacy.CollectionApplicationSettings},
		{"CollectionBlueprints", eipmongo.CollectionBlueprints, legacy.CollectionBlueprints},
		{"CollectionCitadelNames", eipmongo.CollectionCitadelNames, legacy.CollectionCitadelNames},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if tc.neu != tc.old {
				t.Fatalf("new=%q legacy=%q", tc.neu, tc.old)
			}
		})
	}
}

func TestParity_upsertUnsetMaps(t *testing.T) {
	t.Parallel()
	if !reflect.DeepEqual(eipmongo.ArchivedJobsUpsertUnset, legacy.ArchivedJobsUpsertUnset) {
		t.Fatalf("ArchivedJobsUpsertUnset new=%#v legacy=%#v", eipmongo.ArchivedJobsUpsertUnset, legacy.ArchivedJobsUpsertUnset)
	}
	if !reflect.DeepEqual(eipmongo.UserJobDocumentsUpsertUnset, legacy.UserJobDocumentsUpsertUnset) {
		t.Fatalf("UserJobDocumentsUpsertUnset new=%#v legacy=%#v", eipmongo.UserJobDocumentsUpsertUnset, legacy.UserJobDocumentsUpsertUnset)
	}
}

func TestParity_BuildStatsDocumentID(t *testing.T) {
	t.Parallel()
	cases := []struct {
		account string
		typeID  int
	}{
		{"", 0},
		{"acct-1", 34},
		{"a|b", -1},
	}
	for _, tc := range cases {
		got := eipmongo.BuildStatsDocumentID(tc.account, tc.typeID)
		want := legacy.BuildStatsDocumentID(tc.account, tc.typeID)
		if got != want {
			t.Fatalf("account=%q typeID=%d new=%q legacy=%q", tc.account, tc.typeID, got, want)
		}
	}
}

func TestParity_AsDocumentM(t *testing.T) {
	t.Parallel()
	inputs := []any{
		nil,
		bson.M{"a": "1", "n": 2},
		map[string]any{"a": "1"},
		bson.D{{Key: "accountID", Value: "acct-1"}, {Key: "n", Value: 3}},
		bson.D{{Key: "_meta", Value: bson.D{{Key: "accountID", Value: "acct-2"}}}},
		struct {
			X string `bson:"x"`
		}{X: "y"},
	}
	for i, in := range inputs {
		got := eipmongo.AsDocumentM(in)
		want := legacy.AsDocumentM(in)
		if !asDocumentMEqual(got, want) {
			t.Fatalf("case %d: new=%#v legacy=%#v", i, got, want)
		}
	}
}

func TestParity_UnmarshalDocumentM(t *testing.T) {
	t.Parallel()
	type meta struct {
		AccountID string `bson:"accountID"`
	}
	type doc struct {
		ID   string `bson:"_id"`
		Meta meta   `bson:"_meta"`
	}
	raw, err := bson.Marshal(doc{ID: "j1", Meta: meta{AccountID: "acct-1"}})
	if err != nil {
		t.Fatal(err)
	}

	got, errNew := eipmongo.UnmarshalDocumentM(raw)
	want, errOld := legacy.UnmarshalDocumentM(raw)
	if (errNew == nil) != (errOld == nil) {
		t.Fatalf("err new=%v legacy=%v", errNew, errOld)
	}
	if errNew != nil {
		return
	}
	if !asDocumentMEqual(got, want) {
		t.Fatalf("new=%#v legacy=%#v", got, want)
	}
	// Nested must be bson.M on both.
	if _, ok := got["_meta"].(bson.M); !ok {
		t.Fatalf("new _meta type=%T", got["_meta"])
	}
	if _, ok := want["_meta"].(bson.M); !ok {
		t.Fatalf("legacy _meta type=%T", want["_meta"])
	}
}

func TestParity_IsRetryableMongoError(t *testing.T) {
	t.Parallel()
	cases := []error{
		nil,
		errors.New("nope"),
		errors.New("server selection timeout"),
		errors.New("i/o timeout"),
		errors.New("connection reset by peer"),
		mongo.ErrNoDocuments,
	}
	for _, err := range cases {
		got := eipmongo.IsRetryableMongoError(err)
		want := legacy.IsRetryableMongoError(err)
		if got != want {
			t.Fatalf("err=%v new=%v legacy=%v", err, got, want)
		}
	}
}

func TestParity_retryTimingsMatchLegacyDefaults(t *testing.T) {
	t.Parallel()
	// shared/mongo Retry uses fixed timings; assert oracle DefaultRetryConfig still matches.
	want := legacy.DefaultRetryConfig()
	if want.MaxRetries != 3 || want.InitialDelay != 100*time.Millisecond || want.MaxDelay != 2*time.Second {
		t.Fatalf("oracle DefaultRetryConfig changed unexpectedly: %+v", want)
	}
}

func TestParity_StructToMongoDoc(t *testing.T) {
	t.Parallel()
	type meta struct {
		AccountID string `bson:"accountID"`
	}
	type sample struct {
		Name string `bson:"name"`
		Meta meta   `bson:"_meta"`
	}
	in := sample{Name: "n1", Meta: meta{AccountID: "acct-1"}}

	got, errNew := eipmongo.StructToMongoDoc(in, "custom-id")
	want, errOld := legacy.StructToMongoDoc(in, "custom-id")
	if (errNew == nil) != (errOld == nil) {
		t.Fatalf("err new=%v legacy=%v", errNew, errOld)
	}
	if errNew != nil {
		return
	}
	if !asDocumentMEqual(got, want) {
		t.Fatalf("new=%#v legacy=%#v", got, want)
	}
}

func TestParity_archiveFilters(t *testing.T) {
	t.Parallel()
	if !reflect.DeepEqual(eipmongo.UnprocessedArchivedJobFilter(), legacy.UnprocessedArchivedJobFilter()) {
		t.Fatal("UnprocessedArchivedJobFilter mismatch")
	}
	if !reflect.DeepEqual(eipmongo.ArchivedJobAccountFilter("a1"), legacy.ArchivedJobAccountFilter("a1")) {
		t.Fatal("ArchivedJobAccountFilter mismatch")
	}
}

func TestParity_ApplyMetaSessionClient(t *testing.T) {
	t.Parallel()
	var neu, old models.MetaData
	eipmongo.ApplyMetaSessionClient(&neu, "sess", "client")
	mongoput.ApplyMetaSessionClient(&old, "sess", "client")
	if neu != old {
		t.Fatalf("new=%+v legacy=%+v", neu, old)
	}
	eipmongo.ApplyMetaSessionClient(&neu, "", "")
	mongoput.ApplyMetaSessionClient(&old, "", "")
	if neu != old || neu.SessionID != "sess" || neu.ClientID != "client" {
		t.Fatalf("empty inputs should not clear: new=%+v legacy=%+v", neu, old)
	}
	eipmongo.ApplyMetaSessionClient(nil, "x", "y")
	mongoput.ApplyMetaSessionClient(nil, "x", "y")
}

func asDocumentMEqual(a, b bson.M) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	if len(a) != len(b) {
		return false
	}
	for k, av := range a {
		bv, ok := b[k]
		if !ok {
			return false
		}
		if !reflect.DeepEqual(av, bv) {
			return false
		}
	}
	return true
}
