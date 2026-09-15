package commands

import (
	"context"
	"slices"
	"strings"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/stackservices"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const rewriteEnumScratchAccount = "eip-parity-rewrite-enum-account"

// The enumeration and the gate share one selector, so this seeds a bare-id
// document and a moved one under the same owner and checks both read it the
// same way. Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_rewriteOwnerScopedIDs_enumeratesAndGatesOnBareIDs(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	mongolive.ScratchAccount(t, mongo, rewriteEnumScratchAccount)

	owner := models.AccountOwner(rewriteEnumScratchAccount)
	coll := mongo.Coll(eipmongo.CollectionJobDocuments)
	for _, id := range []string{"enum-bare", eipmongo.OwnerScopedDocumentID(owner, "enum-moved")} {
		if _, err := coll.InsertOne(ctx, bson.M{
			"_id": id, "_meta": bson.M{models.MetaFieldOwner: mongolive.OwnerDoc(owner)},
		}); err != nil {
			t.Fatalf("seed %s: %v", id, err)
		}
	}
	clients := &stackservices.Clients{Mongo: mongo}

	owners, err := ownersNeedingScopedIDs(ctx, mongo, eipmongo.CollectionJobDocuments)
	if err != nil {
		t.Fatalf("ownersNeedingScopedIDs: %v", err)
	}
	if !slices.Contains(owners, owner) {
		t.Fatalf("owners = %v, want one holding a bare-id document", owners)
	}
	report, err := verifyOwnerScopedIDs(ctx, clients, true)
	if err != nil || !strings.Contains(report, eipmongo.CollectionJobDocuments) {
		t.Fatalf("dry-run gate = %q, %v; want it to name the collection", report, err)
	}
	if _, err := verifyOwnerScopedIDs(ctx, clients, false); err == nil {
		t.Fatal("the gate passed with a bare id still stored")
	}

	if _, err := coll.DeleteOne(ctx, bson.M{"_id": "enum-bare"}); err != nil {
		t.Fatalf("remove the bare document: %v", err)
	}
	owners, err = ownersNeedingScopedIDs(ctx, mongo, eipmongo.CollectionJobDocuments)
	if err != nil {
		t.Fatalf("ownersNeedingScopedIDs after the move: %v", err)
	}
	if slices.Contains(owners, owner) {
		t.Fatal("an owner with nothing left to move was still enumerated")
	}
}
