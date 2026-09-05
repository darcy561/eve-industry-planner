package changestream

import (
	"context"
	"eve-industry-planner/testing/mongolive"
	"fmt"
	"sync"
	"testing"
	"time"

	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const liveIdleColl = "_eip_changestream_live_idle"

// requireLiveWatchMongo returns a watch-client handle under the same live gate as the
// resume tests: EIP_MONGO_PARITY_LIVE=1.
func requireLiveWatchMongo(t *testing.T) *eipmongo.Mongo {
	t.Helper()
	return mongolive.RequireWatch(t, len(CollectionGroups()))
}

// An idle stream on the watch client stays alive past the point a client-wide operation
// timeout would have ended it, and still delivers an event afterwards.
func TestLive_Watch_survivesIdleAndDeliversAfter(t *testing.T) {
	m := requireLiveWatchMongo(t)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	coll := m.Coll(liveIdleColl)
	t.Cleanup(func() {
		cctx, c := context.WithTimeout(context.Background(), 15*time.Second)
		defer c()
		_ = coll.Drop(cctx)
	})
	_ = coll.Drop(ctx)

	csCtx, csCancel := context.WithCancel(ctx)
	defer csCancel()
	stream, err := coll.Watch(csCtx, mongodriver.Pipeline{}, options.ChangeStream().
		SetFullDocument(options.UpdateLookup).
		SetMaxAwaitTime(changeStreamMaxAwaitTime))
	if err != nil {
		t.Fatalf("watch: %v", err)
	}
	defer stream.Close(context.Background())

	got := make(chan bson.Raw, 1)
	failed := make(chan error, 1)
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
			case got <- tok:
			default:
			}
			return
		}
		// Next returning false before any event means the cursor died while idle.
		if err := stream.Err(); err != nil {
			failed <- err
			return
		}
		failed <- fmt.Errorf("stream ended while idle with no error")
	}()

	// Stay idle well past both the old ceiling and one full MaxAwaitTime cycle.
	idle := changeStreamMaxAwaitTime + 15*time.Second
	select {
	case err := <-failed:
		t.Fatalf("stream did not survive idle: %v", err)
	case <-time.After(idle):
	}

	id := fmt.Sprintf("live-idle-%d", time.Now().UnixNano())
	if _, err := coll.InsertOne(ctx, bson.M{"_id": id}); err != nil {
		t.Fatalf("insert after idle: %v", err)
	}

	select {
	case tok := <-got:
		if len(tok) == 0 {
			t.Fatal("empty resume token after idle")
		}
	case err := <-failed:
		t.Fatalf("stream failed after idle: %v", err)
	case <-time.After(30 * time.Second):
		t.Fatal("timeout waiting for event after idle")
	}
}

// With every collection group awaiting events at once, the pool still has room for other
// work on the same client: streams hold a connection for the whole await.
func TestLive_Watch_allGroupsAwaitLeavesPoolRoom(t *testing.T) {
	m := requireLiveWatchMongo(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	groups := CollectionGroups()
	csCtx, csCancel := context.WithCancel(ctx)

	var wg sync.WaitGroup
	streams := make([]*mongodriver.ChangeStream, 0, len(groups))
	// Each stream is closed only after its reader has stopped, so Next never runs on a
	// closed stream.
	defer func() {
		csCancel()
		wg.Wait()
		for _, s := range streams {
			_ = s.Close(context.Background())
		}
	}()

	for _, g := range groups {
		stream, err := m.DB.Watch(csCtx, MatchPipelineForCollections(g.Collections),
			options.ChangeStream().
				SetFullDocument(options.UpdateLookup).
				SetMaxAwaitTime(changeStreamMaxAwaitTime))
		if err != nil {
			t.Fatalf("watch %s: %v", g.ID, err)
		}
		streams = append(streams, stream)
		wg.Go(func() {
			for stream.Next(csCtx) {
			}
		})
	}

	// Let every stream reach its blocking getMore before competing for a connection.
	time.Sleep(5 * time.Second)

	pingCtx, pingCancel := context.WithTimeout(ctx, 10*time.Second)
	defer pingCancel()
	if err := m.Ping(pingCtx); err != nil {
		t.Fatalf("ping while %d groups await: %v", len(groups), err)
	}
}

// Cancelling the stream context ends an idle Next promptly, so lose-primary teardown is
// not held up for a full MaxAwaitTime.
func TestLive_Watch_idleCancelIsPrompt(t *testing.T) {
	m := requireLiveWatchMongo(t)
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	coll := m.Coll(liveIdleColl)
	t.Cleanup(func() {
		cctx, c := context.WithTimeout(context.Background(), 15*time.Second)
		defer c()
		_ = coll.Drop(cctx)
	})

	csCtx, csCancel := context.WithCancel(ctx)
	stream, err := coll.Watch(csCtx, mongodriver.Pipeline{}, options.ChangeStream().
		SetFullDocument(options.UpdateLookup).
		SetMaxAwaitTime(changeStreamMaxAwaitTime))
	if err != nil {
		csCancel()
		t.Fatalf("watch: %v", err)
	}
	defer stream.Close(context.Background())

	returned := make(chan struct{})
	go func() {
		for stream.Next(csCtx) {
		}
		close(returned)
	}()

	// Cancel mid-await, then require Next to return well inside a full await cycle.
	time.Sleep(2 * time.Second)
	csCancel()

	select {
	case <-returned:
	case <-time.After(changeStreamMaxAwaitTime / 2):
		t.Fatal("Next did not return promptly after cancel")
	}
}
