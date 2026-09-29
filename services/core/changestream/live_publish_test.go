package changestream

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/testing/mongolive"

	natslib "github.com/nats-io/nats.go"
	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestLive_Publish_ownerReachesTheSubscriberFromTheDocument(t *testing.T) {
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
		accountID = "eip-live-publish-account"
		jobID     = "eip-live-publish-job"
	)
	owner := models.AccountOwner(accountID).Key()

	coll := m.Coll(eipmongo.CollectionJobDocuments)
	clear := func() {
		cctx, c := context.WithTimeout(context.Background(), 30*time.Second)
		defer c()
		_, _ = coll.DeleteOne(cctx, bson.M{"_id": jobID})
	}
	clear()
	t.Cleanup(clear)

	sub, err := nats.Conn().SubscribeSync(eipnats.SubjectDocUpdate + ".>")
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	t.Cleanup(func() { _ = sub.Unsubscribe() })
	awaitWatcherReady(t, sub, coll, ownerOf(owner))

	if _, err := coll.InsertOne(ctx, bson.M{
		"_id": jobID,
		"_meta": bson.M{
			models.MetaFieldOwner: mongolive.OwnerDoc(models.AccountOwner(accountID)),
		},
		"jobID": jobID,
	}); err != nil {
		t.Fatalf("insert the job: %v", err)
	}

	msg, _ := awaitPublished(t, sub, 30*time.Second, publishedFor(jobID))

	var got struct {
		Collection string `json:"collection"`
		DocID      string `json:"docID"`
		OwnerKey   string `json:"ownerKey"`
		Operation  string `json:"operationType"`
	}
	if err := json.Unmarshal(msg.Data, &got); err != nil {
		t.Fatalf("decode published message: %v\n%s", err, msg.Data)
	}

	if got.OwnerKey != owner {
		t.Fatalf("published ownerKey = %q, want %q — the document's owner did not reach the subscriber",
			got.OwnerKey, owner)
	}
	if got.Collection != eipmongo.CollectionJobDocuments || got.DocID != jobID {
		t.Fatalf("published collection/docID = %q/%q", got.Collection, got.DocID)
	}
	if got.Operation != "insert" {
		t.Fatalf("operationType = %q, want insert", got.Operation)
	}

	wantSubject := eipnats.DocUpdateSubject(owner, eipmongo.CollectionJobDocuments, jobID)
	if msg.Subject != wantSubject {
		t.Fatalf("subject = %q, want %q", msg.Subject, wantSubject)
	}
}

func ownerOf(held any) models.Owner {
	switch v := held.(type) {
	case models.Owner:
		return v
	case string:
		owner, err := models.ParseOwnerKey(v)
		if err != nil {
			return models.Owner{}
		}
		return owner
	default:
		return models.Owner{}
	}
}

type publishedPeek struct {
	DocID     string `json:"docID"`
	Operation string `json:"operationType"`
}

func awaitPublished(t *testing.T, sub *natslib.Subscription, within time.Duration, match func(publishedPeek) bool) (*natslib.Msg, []publishedPeek) {
	t.Helper()
	var seen []publishedPeek
	deadline := time.Now().Add(within)
	for time.Now().Before(deadline) {
		msg, err := sub.NextMsg(time.Until(deadline))
		if err != nil {
			break
		}
		var peek publishedPeek
		if json.Unmarshal(msg.Data, &peek) != nil {
			continue
		}
		seen = append(seen, peek)
		if match(peek) {
			return msg, seen
		}
	}
	t.Fatalf("nothing matching was published within %s (saw %v)", within, seen)
	return nil, nil
}

func publishedFor(docID string) func(publishedPeek) bool {
	return func(peek publishedPeek) bool { return peek.DocID == docID }
}

func updatePublishedFor(docID string) func(publishedPeek) bool {
	return func(peek publishedPeek) bool {
		return peek.DocID == docID && peek.Operation == "update"
	}
}

func TestLive_Publish_sendsTheBareIDForAnOwnerScopedDocument(t *testing.T) {
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
		accountID = "eip-live-publish-scoped-account"
		jobID     = "eip-live-publish-scoped-job"
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

	sub, err := nats.Conn().SubscribeSync(eipnats.SubjectDocUpdate + ".>")
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	t.Cleanup(func() { _ = sub.Unsubscribe() })
	awaitWatcherReady(t, sub, coll, ownerOf(owner))

	if _, err := coll.InsertOne(ctx, bson.M{
		"_id": storedID,
		"_meta": bson.M{
			models.MetaFieldOwner: mongolive.OwnerDoc(owner),
		},
		"jobID": jobID,
	}); err != nil {
		t.Fatalf("insert the job: %v", err)
	}

	msg, _ := awaitPublished(t, sub, 30*time.Second, publishedFor(jobID))

	var got struct {
		DocID    string `json:"docID"`
		OwnerKey string `json:"ownerKey"`
	}
	if err := json.Unmarshal(msg.Data, &got); err != nil {
		t.Fatalf("decode published message: %v\n%s", err, msg.Data)
	}
	if got.DocID != jobID {
		t.Fatalf("published docID = %q, want the bare %q", got.DocID, jobID)
	}
	if got.OwnerKey != owner.Key() {
		t.Fatalf("published ownerKey = %q, want %q", got.OwnerKey, owner.Key())
	}

	wantSubject := eipnats.DocUpdateSubject(owner.Key(), eipmongo.CollectionJobDocuments, jobID)
	if msg.Subject != wantSubject {
		t.Fatalf("subject = %q, want %q", msg.Subject, wantSubject)
	}
}

func TestLive_Publish_recoversADeletedDocumentsOwnerFromItsID(t *testing.T) {
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
		accountID = "eip-live-publish-delete-account"
		jobID     = "eip-live-publish-delete-job"
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
		"_meta": bson.M{
			models.MetaFieldOwner: mongolive.OwnerDoc(owner),
		},
		"jobID": jobID,
	}); err != nil {
		t.Fatalf("insert the job: %v", err)
	}

	sub, err := nats.Conn().SubscribeSync(eipnats.SubjectDocUpdate + ".>")
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	t.Cleanup(func() { _ = sub.Unsubscribe() })
	awaitWatcherReady(t, sub, coll, ownerOf(owner))

	if _, err := coll.DeleteOne(ctx, bson.M{"_id": storedID}); err != nil {
		t.Fatalf("delete the job: %v", err)
	}

	msg, _ := awaitPublished(t, sub, 30*time.Second, publishedFor(jobID))

	var got struct {
		DocID     string `json:"docID"`
		OwnerKey  string `json:"ownerKey"`
		Operation string `json:"operationType"`
	}
	if err := json.Unmarshal(msg.Data, &got); err != nil {
		t.Fatalf("decode published message: %v\n%s", err, msg.Data)
	}
	if got.Operation != "delete" {
		t.Fatalf("operationType = %q, want delete", got.Operation)
	}
	if got.DocID != jobID {
		t.Fatalf("published docID = %q, want the bare %q", got.DocID, jobID)
	}
	if got.OwnerKey != owner.Key() {
		t.Fatalf("published ownerKey = %q, want %q — a delete lost its owner",
			got.OwnerKey, owner.Key())
	}
}
