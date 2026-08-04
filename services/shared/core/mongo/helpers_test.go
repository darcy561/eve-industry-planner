package mongo

import (
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
	}{Name: "x"})
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
