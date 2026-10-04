package mongo_test

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestLive_SetSubdocumentAndIncrementInsideItConflicts(t *testing.T) {
	m := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	coll := m.JobDocuments.Collection()
	id := "version-conflict-probe"
	t.Cleanup(func() { _, _ = coll.DeleteOne(context.Background(), bson.M{"_id": id}) })

	_, err := coll.UpdateOne(ctx, bson.M{"_id": id}, bson.M{
		"$set": bson.M{"_meta": bson.M{"owner": models.AccountOwner("acct-probe")}},
		"$inc": bson.M{eipmongo.FieldMetaRevision: 1},
	}, nil)
	if err == nil {
		t.Fatal("expected a path conflict; the versioned update may set _meta whole")
	}
	t.Logf("mongo refused as expected: %v", err)
}
