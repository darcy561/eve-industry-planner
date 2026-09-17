// The document id rewrite against real Mongo.
//
// `_id` is immutable, so the move is an insert and a delete rather than an
// update — which is what makes the partial states below worth pinning.
//
// Requires EIP_MONGO_PARITY_LIVE=1.
package documentids

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/testing/mongolive"
	"eve-industry-planner/worker/taskrun"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

const rewriteScratchAccount = "eip-parity-rewrite-account"

type rewriteHarness struct {
	t     *testing.T
	mongo *eipmongo.Mongo
	deps  *taskrun.Dependencies
	owner models.Owner
	coll  *mongodriver.Collection
}

func newRewriteHarness(t *testing.T) *rewriteHarness {
	t.Helper()
	mongo := mongolive.Require(t)
	owner := models.AccountOwner(rewriteScratchAccount)

	h := &rewriteHarness{
		t: t, mongo: mongo, owner: owner,
		deps: &taskrun.Dependencies{Mongo: mongo},
		coll: mongo.Coll(eipmongo.CollectionJobDocuments),
	}
	h.clear()
	t.Cleanup(h.clear)
	return h
}

func (h *rewriteHarness) clear() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	_, _ = h.coll.DeleteMany(ctx, bson.M{
		eipmongo.FieldMetaOwnerKind: h.owner.Kind,
		eipmongo.FieldMetaOwnerID:   h.owner.ID,
	})
}

// seed writes a document under the id given, with the owner it belongs to.
func (h *rewriteHarness) seed(ctx context.Context, id string) {
	h.t.Helper()
	if _, err := h.coll.InsertOne(ctx, bson.M{
		"_id":   id,
		"jobID": eipmongo.BareDocumentID(id),
		"_meta": bson.M{
			models.MetaFieldOwner: mongolive.OwnerDoc(h.owner),
		},
	}); err != nil {
		h.t.Fatalf("seed %s: %v", id, err)
	}
}

func (h *rewriteHarness) run(ctx context.Context, dryRun bool) {
	h.t.Helper()
	if err := RewriteOwnerScopedIDs(ctx, eipnats.RewriteOwnerScopedIDsRequest{
		OwnerKey:   h.owner.Key(),
		Collection: eipmongo.CollectionJobDocuments,
		DryRun:     dryRun,
	}, h.deps); err != nil {
		h.t.Fatalf("RewriteOwnerScopedIDs: %v", err)
	}
}

func (h *rewriteHarness) exists(ctx context.Context, id string) bool {
	h.t.Helper()
	count, err := h.coll.CountDocuments(ctx, bson.M{"_id": id})
	if err != nil {
		h.t.Fatalf("count %s: %v", id, err)
	}
	return count > 0
}

func TestLive_RewriteMovesADocumentOntoAnIDCarryingItsOwner(t *testing.T) {
	h := newRewriteHarness(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	bare := "rewrite-job-1"
	scoped := eipmongo.OwnerScopedDocumentID(h.owner, bare)
	h.seed(ctx, bare)

	h.run(ctx, false)

	if h.exists(ctx, bare) {
		t.Error("the document is still stored under its bare id")
	}
	if !h.exists(ctx, scoped) {
		t.Fatal("the document was not written under the scoped id")
	}

	var moved bson.M
	if err := h.coll.FindOne(ctx, bson.M{"_id": scoped}).Decode(&moved); err != nil {
		t.Fatalf("read the moved document: %v", err)
	}
	if moved["jobID"] != bare {
		t.Errorf("jobID = %v, want the bare id to survive the move", moved["jobID"])
	}
	meta, ok := moved["_meta"].(bson.M)
	if !ok {
		t.Fatalf("_meta = %T, want a subdocument", moved["_meta"])
	}
	if meta[eipmongo.MetaFieldRevisionKey] != models.InitialDocumentRevision {
		t.Errorf("version = %v, want the document seeded at %d",
			meta[eipmongo.MetaFieldRevisionKey], models.InitialDocumentRevision)
	}
}

// The whole point of selecting on the id: running twice writes nothing the
// second time, so the sweep can be repeated until it reports none remaining.
func TestLive_RewriteIsIdempotent(t *testing.T) {
	h := newRewriteHarness(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	bare := "rewrite-job-2"
	scoped := eipmongo.OwnerScopedDocumentID(h.owner, bare)
	h.seed(ctx, bare)

	h.run(ctx, false)
	h.run(ctx, false)

	count, err := h.coll.CountDocuments(ctx, bson.M{"_id": scoped})
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 1 {
		t.Fatalf("the document exists %d times after two runs, want once", count)
	}
}

// A process that dies between the insert and the delete leaves the document
// under both ids. The next run finishes the move rather than failing on the
// duplicate it created.
func TestLive_RewriteFinishesAHalfDoneMove(t *testing.T) {
	h := newRewriteHarness(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	bare := "rewrite-job-3"
	scoped := eipmongo.OwnerScopedDocumentID(h.owner, bare)
	h.seed(ctx, bare)
	h.seed(ctx, scoped)

	h.run(ctx, false)

	if h.exists(ctx, bare) {
		t.Error("the old id survived a half-done move")
	}
	if !h.exists(ctx, scoped) {
		t.Error("the moved document was removed")
	}
}

// A dry run reports without writing, which is what makes it safe to read before
// the window rather than after one.
func TestLive_RewriteDryRunWritesNothing(t *testing.T) {
	h := newRewriteHarness(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	bare := "rewrite-job-4"
	h.seed(ctx, bare)

	h.run(ctx, true)

	if !h.exists(ctx, bare) {
		t.Error("a dry run moved the document")
	}
	if h.exists(ctx, eipmongo.OwnerScopedDocumentID(h.owner, bare)) {
		t.Error("a dry run wrote the scoped id")
	}
}

// Another owner's documents are not this task's to move.
func TestLive_RewriteLeavesAnotherOwnerAlone(t *testing.T) {
	h := newRewriteHarness(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	other := models.AccountOwner("eip-parity-rewrite-other")
	otherID := "rewrite-job-other"
	t.Cleanup(func() {
		cctx, c := context.WithTimeout(context.Background(), 30*time.Second)
		defer c()
		_, _ = h.coll.DeleteMany(cctx, bson.M{
			eipmongo.FieldMetaOwnerKind: other.Kind, eipmongo.FieldMetaOwnerID: other.ID,
		})
	})
	if _, err := h.coll.InsertOne(ctx, bson.M{
		"_id":   otherID,
		"_meta": bson.M{models.MetaFieldOwner: mongolive.OwnerDoc(other)},
	}); err != nil {
		t.Fatalf("seed the other owner: %v", err)
	}

	h.run(ctx, false)

	if !h.exists(ctx, otherID) {
		t.Fatal("another owner's document was moved")
	}
}
