package changestream

import (
	"context"
	"fmt"
	"testing"

	"eve-industry-planner/core/primaryhandoff"
	"eve-industry-planner/testing/redisfake"

	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

func TestResumeToken_roundTrip(t *testing.T) {
	fake := redisfake.New(t)
	mr, rdb := fake.Server, fake.Client

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
	t.Parallel()
	cases := []struct {
		name string
		err  error
		want bool
	}{
		{"nil", nil, false},
		{"286", mongo.CommandError{Code: 286, Message: "ChangeStreamHistoryLost"}, true},
		{"280", mongo.CommandError{Code: 280, Message: "ChangeStreamFatalError"}, true},
		{"260", mongo.CommandError{Code: 260, Message: "NonResumable"}, true},
		{"other code", mongo.CommandError{Code: 1, Message: "other"}, false},
		{"FailedToParse resume token", mongo.CommandError{Code: 9, Name: "FailedToParse", Message: "resume token string was not a valid hex string"}, true},
		{"FailedToParse unrelated", mongo.CommandError{Code: 9, Name: "FailedToParse", Message: "could not parse query"}, false},
		{"string corrupt hex", fmt.Errorf("(FailedToParse) resume token string was not a valid hex string"), true},
		{"wrapped 286", fmt.Errorf("watch: %w", mongo.CommandError{Code: 286, Message: "ChangeStreamHistoryLost"}), true},
		{"network no resume", fmt.Errorf("connection refused"), false},
		{"resume alone", fmt.Errorf("will resume shortly"), false},
		{"hex without resume", fmt.Errorf("invalid hex encoding"), false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := isInvalidResumeError(tc.err); got != tc.want {
				t.Fatalf("isInvalidResumeError(%v)=%v want %v", tc.err, got, tc.want)
			}
		})
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
