package mongo_test

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const publicDocumentsScratchCollection = "eip_parity_public_documents"

func TestLive_GetPublicByID_findsADocumentAndSaysWhenThereIsNone(t *testing.T) {
	m := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	coll := m.Coll(publicDocumentsScratchCollection)
	_ = coll.Drop(ctx)
	t.Cleanup(func() { _ = coll.Drop(context.Background()) })
	if _, err := coll.InsertOne(ctx, bson.M{"_id": "bp-1", "name": "Rifter Blueprint"}); err != nil {
		t.Fatalf("seed: %v", err)
	}
	docs := m.Docs(publicDocumentsScratchCollection)

	doc, found, err := docs.GetPublicByID(ctx, "bp-1")
	if err != nil || !found || doc["name"] != "Rifter Blueprint" {
		t.Fatalf("GetPublicByID = %v, %v, %v", doc, found, err)
	}
	if _, found, err := docs.GetPublicByID(ctx, "bp-missing"); err != nil || found {
		t.Errorf("a missing document reported found=%v err=%v, want not found and no error", found, err)
	}
}

func TestLive_GetPublicByIDs_answersInTheOrderAskedAndSkipsWhatIsMissing(t *testing.T) {
	m := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	coll := m.Coll(publicDocumentsScratchCollection)
	_ = coll.Drop(ctx)
	t.Cleanup(func() { _ = coll.Drop(context.Background()) })
	if _, err := coll.InsertMany(ctx, []any{bson.M{"_id": "bp-1"}, bson.M{"_id": "bp-2"}}); err != nil {
		t.Fatalf("seed: %v", err)
	}

	got, err := m.Docs(publicDocumentsScratchCollection).GetPublicByIDs(ctx, []string{"bp-2", "bp-missing", "bp-1"})

	if err != nil {
		t.Fatalf("GetPublicByIDs: %v", err)
	}
	if len(got) != 2 || got[0]["_id"] != "bp-2" || got[1]["_id"] != "bp-1" {
		t.Errorf("got %v, want bp-2 then bp-1", got)
	}
}
