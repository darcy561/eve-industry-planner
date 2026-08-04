package changestream

import (
	"context"
	"testing"

	"eve-industry-planner/core/primaryhandoff"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

func TestResumeToken_roundTrip(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(mr.Close)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })

	token := bson.Raw([]byte{0x08, 0x00, 0x00, 0x00, 0x0a, 0x00}) // minimal-ish
	saveResumeToken(context.Background(), rdb, "planner", token)

	got, ok := loadResumeToken(context.Background(), rdb, "planner")
	if !ok {
		t.Fatal("expected token")
	}
	if string(got) != string(token) {
		t.Fatalf("token mismatch got %v want %v", got, token)
	}
	if !mr.Exists(primaryhandoff.ResumeTokenKey("planner")) {
		t.Fatal("key missing")
	}

	clearResumeToken(context.Background(), rdb, "planner")
	if _, ok := loadResumeToken(context.Background(), rdb, "planner"); ok {
		t.Fatal("expected miss after clear")
	}
}

func TestResumeTokenFromEvent(t *testing.T) {
	idDoc := bson.M{"_data": "abc"}
	evt := bson.M{"_id": idDoc, "operationType": "insert"}
	raw, err := resumeTokenFromEvent(evt)
	if err != nil {
		t.Fatal(err)
	}
	if len(raw) == 0 {
		t.Fatal("empty token")
	}
	if _, err := resumeTokenFromEvent(bson.M{}); err == nil {
		t.Fatal("expected error")
	}
}

func TestIsInvalidResumeError(t *testing.T) {
	if isInvalidResumeError(nil) {
		t.Fatal("nil")
	}
	if !isInvalidResumeError(mongo.CommandError{Code: 286, Message: "ChangeStreamHistoryLost"}) {
		t.Fatal("want 286")
	}
	if !isInvalidResumeError(mongo.CommandError{Code: 260, Message: "NonResumable"}) {
		t.Fatal("want 260")
	}
	if isInvalidResumeError(mongo.CommandError{Code: 1, Message: "other"}) {
		t.Fatal("other code")
	}
}

func TestLoadResumeToken_redisDownColdStart(t *testing.T) {
	rdb := redis.NewClient(&redis.Options{Addr: "127.0.0.1:1"})
	t.Cleanup(func() { _ = rdb.Close() })
	_, ok := loadResumeToken(context.Background(), rdb, "planner")
	if ok {
		t.Fatal("expected miss on redis error")
	}
}
