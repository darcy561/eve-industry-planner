package changestream

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const liveCSColl = "_eip_changestream_live_b5"

// Live deepen for B5 (resume + invalid StartAfter). Same gate as mongo live parity:
//
//	EIP_MONGO_PARITY_LIVE=1
func TestLive_Watch_resumeStartAfter(t *testing.T) {
	m := requireLiveChangestreamMongo(t)
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	coll := m.Coll(liveCSColl)
	t.Cleanup(func() {
		cctx, c := context.WithTimeout(context.Background(), 15*time.Second)
		defer c()
		_ = coll.Drop(cctx)
	})
	_ = coll.Drop(ctx)

	csCtx, csCancel := context.WithCancel(ctx)
	defer csCancel()
	stream, err := coll.Watch(csCtx, mongodriver.Pipeline{}, options.ChangeStream().SetFullDocument(options.UpdateLookup))
	if err != nil {
		t.Fatalf("watch: %v", err)
	}

	idA := fmt.Sprintf("live-resume-a-%d", time.Now().UnixNano())
	tokenCh := make(chan bson.Raw, 1)
	go func() {
		for stream.Next(csCtx) {
			var ev bson.M
			if err := stream.Decode(&ev); err != nil {
				continue
			}
			if op, _ := ev["operationType"].(string); op != "insert" {
				continue
			}
			tok, err := resumeTokenFromEvent(ev)
			if err != nil {
				continue
			}
			select {
			case tokenCh <- tok:
			default:
			}
			return
		}
	}()

	if _, err := coll.InsertOne(ctx, bson.M{"_id": idA}); err != nil {
		_ = stream.Close(context.Background())
		t.Fatalf("insert A: %v", err)
	}
	var token bson.Raw
	select {
	case token = <-tokenCh:
	case <-time.After(10 * time.Second):
		_ = stream.Close(context.Background())
		t.Fatal("timeout waiting for A")
	}
	_ = stream.Close(context.Background())
	csCancel()

	csCtx2, csCancel2 := context.WithCancel(ctx)
	defer csCancel2()
	stream2, err := coll.Watch(csCtx2, mongodriver.Pipeline{}, options.ChangeStream().
		SetFullDocument(options.UpdateLookup).
		SetStartAfter(token))
	if err != nil {
		t.Fatalf("StartAfter watch: %v", err)
	}
	defer stream2.Close(context.Background())

	idB := fmt.Sprintf("live-resume-b-%d", time.Now().UnixNano())
	sawB := make(chan struct{}, 1)
	go func() {
		for stream2.Next(csCtx2) {
			var ev bson.M
			if err := stream2.Decode(&ev); err != nil {
				continue
			}
			if op, _ := ev["operationType"].(string); op != "insert" {
				continue
			}
			if liveEventDocID(ev) != idB {
				continue
			}
			select {
			case sawB <- struct{}{}:
			default:
			}
			return
		}
	}()

	if _, err := coll.InsertOne(ctx, bson.M{"_id": idB}); err != nil {
		t.Fatalf("insert B: %v", err)
	}
	select {
	case <-sawB:
		t.Logf("resume StartAfter delivered insert %s", idB)
	case <-time.After(10 * time.Second):
		t.Fatal("timeout waiting for B after StartAfter")
	}
}

func TestLive_Watch_invalidResumeThenCold(t *testing.T) {
	m := requireLiveChangestreamMongo(t)
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	coll := m.Coll(liveCSColl + "_invalid")
	t.Cleanup(func() {
		cctx, c := context.WithTimeout(context.Background(), 15*time.Second)
		defer c()
		_ = coll.Drop(cctx)
	})
	_ = coll.Drop(ctx)

	bad, err := bson.Marshal(bson.M{"_data": "eip-live-invalid-resume-token"})
	if err != nil {
		t.Fatal(err)
	}

	csCtx, csCancel := context.WithCancel(ctx)
	defer csCancel()
	_, err = coll.Watch(csCtx, mongodriver.Pipeline{}, options.ChangeStream().
		SetFullDocument(options.UpdateLookup).
		SetStartAfter(bson.Raw(bad)))
	if err == nil {
		t.Fatal("expected Watch error for invalid StartAfter")
	}
	if !isInvalidResumeError(err) {
		t.Fatalf("invalid StartAfter should clear+cold-start (isInvalidResumeError): %v", err)
	}
	t.Logf("invalid StartAfter classified as invalid resume: %v", err)

	stream, err := coll.Watch(csCtx, mongodriver.Pipeline{}, options.ChangeStream().SetFullDocument(options.UpdateLookup))
	if err != nil {
		t.Fatalf("cold watch after invalid: %v", err)
	}
	defer stream.Close(context.Background())

	id := fmt.Sprintf("live-cold-%d", time.Now().UnixNano())
	saw := make(chan struct{}, 1)
	go func() {
		for stream.Next(csCtx) {
			var ev bson.M
			if err := stream.Decode(&ev); err != nil {
				continue
			}
			if op, _ := ev["operationType"].(string); op != "insert" {
				continue
			}
			if liveEventDocID(ev) != id {
				continue
			}
			select {
			case saw <- struct{}{}:
			default:
			}
			return
		}
	}()
	if _, err := coll.InsertOne(ctx, bson.M{"_id": id}); err != nil {
		t.Fatalf("insert: %v", err)
	}
	select {
	case <-saw:
	case <-time.After(10 * time.Second):
		t.Fatal("timeout cold insert after invalid resume")
	}
}

func TestIsInvalidResumeError_wrapped(t *testing.T) {
	t.Parallel()
	inner := mongodriver.CommandError{Code: 286, Message: "ChangeStreamHistoryLost"}
	wrapped := fmt.Errorf("watch failed: %w", inner)
	if !isInvalidResumeError(wrapped) {
		t.Fatal("errors.As should unwrap CommandError 286")
	}
	double := fmt.Errorf("outer: %w", wrapped)
	if !isInvalidResumeError(double) {
		t.Fatal("double wrap should still match")
	}
}

func requireLiveChangestreamMongo(t *testing.T) *eipmongo.Mongo {
	t.Helper()
	if os.Getenv("EIP_MONGO_PARITY_LIVE") != "1" {
		t.Skip("set EIP_MONGO_PARITY_LIVE=1 against stack Mongo (eip-core)")
	}
	m, err := eipmongo.ConnectPrimary()
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		m.Disconnect(ctx)
	})
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := m.Ping(ctx); err != nil {
		t.Fatalf("ping: %v", err)
	}
	return m
}

func liveEventDocID(ev bson.M) string {
	if dk, ok := ev["documentKey"].(bson.M); ok {
		if id, ok := dk["_id"].(string); ok {
			return id
		}
	}
	if full := eipmongo.AsDocumentM(ev["fullDocument"]); full != nil {
		if id, ok := full["_id"].(string); ok {
			return id
		}
	}
	return ""
}
