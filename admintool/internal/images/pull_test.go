package images

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	jsonmessage "github.com/moby/moby/api/types/jsonstream"
)

func TestPullParallelDefaultAndBounds(t *testing.T) {
	t.Setenv("EIP_PULL_PARALLEL", "")
	if got := pullParallel(); got != defaultPullParallel {
		t.Fatalf("default: got %d want %d", got, defaultPullParallel)
	}

	t.Setenv("EIP_PULL_PARALLEL", "8")
	if got := pullParallel(); got != 8 {
		t.Fatalf("got %d", got)
	}

	t.Setenv("EIP_PULL_PARALLEL", "99")
	if got := pullParallel(); got != 16 {
		t.Fatalf("cap: got %d want 16", got)
	}

	t.Setenv("EIP_PULL_PARALLEL", "0")
	if got := pullParallel(); got != defaultPullParallel {
		t.Fatalf("invalid 0: got %d", got)
	}

	t.Setenv("EIP_PULL_PARALLEL", "nope")
	if got := pullParallel(); got != defaultPullParallel {
		t.Fatalf("invalid text: got %d", got)
	}
}

func TestConsumePullStreamUpToDate(t *testing.T) {
	board := newPullBoard([]string{"redis:8"}, 1)
	board.cliTTY = false

	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	_ = enc.Encode(jsonmessage.Message{Status: "Status: Image is up to date for redis:8"})

	up, err := consumePullStream(&buf, "redis:8", board)
	if err != nil {
		t.Fatal(err)
	}
	if !up {
		t.Fatal("expected upToDate")
	}
	board.mu.Lock()
	got := board.rows["redis:8"].upToDate
	board.mu.Unlock()
	if !got {
		t.Fatal("board not marked up to date")
	}
}

func TestConsumePullStreamLayerProgress(t *testing.T) {
	board := newPullBoard([]string{"mongo:8"}, 1)
	board.cliTTY = false

	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	_ = enc.Encode(jsonmessage.Message{
		ID:       "abc",
		Status:   "Downloading",
		Progress: &jsonmessage.Progress{Current: 50, Total: 100},
	})
	_ = enc.Encode(jsonmessage.Message{
		ID:       "abc",
		Status:   "Pull complete",
		Progress: &jsonmessage.Progress{Current: 100, Total: 100},
	})

	up, err := consumePullStream(&buf, "mongo:8", board)
	if err != nil {
		t.Fatal(err)
	}
	if up {
		t.Fatal("should not be up to date")
	}
	board.mu.Lock()
	r := board.rows["mongo:8"]
	cur, tot, st := r.current, r.total, r.status
	board.mu.Unlock()
	if st != "pulling" {
		t.Fatalf("status=%q", st)
	}
	if cur != 100 || tot != 100 {
		t.Fatalf("progress=%d/%d", cur, tot)
	}
}

func TestConsumePullStreamError(t *testing.T) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	_ = enc.Encode(jsonmessage.Message{
		Error: &jsonmessage.Error{Message: "denied"},
	})
	_, err := consumePullStream(&buf, "ghcr.io/x/y:z", newPullBoard([]string{"ghcr.io/x/y:z"}, 1))
	if err == nil || !strings.Contains(err.Error(), "denied") {
		t.Fatalf("got %v", err)
	}
}

func TestConsumePullStreamNilBoard(t *testing.T) {
	var buf bytes.Buffer
	_ = json.NewEncoder(&buf).Encode(jsonmessage.Message{Status: "Image is up to date for x"})
	up, err := consumePullStream(&buf, "x", nil)
	if err != nil || !up {
		t.Fatalf("up=%v err=%v", up, err)
	}
}
