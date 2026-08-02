package process

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestMapDoneError(t *testing.T) {
	t.Parallel()
	if MapDoneError(nil) != nil {
		t.Fatal("nil")
	}
	if !errors.Is(MapDoneError(context.Canceled), ErrInterrupted) {
		t.Fatal("canceled")
	}
	if !errors.Is(MapDoneError(context.DeadlineExceeded), context.DeadlineExceeded) {
		t.Fatal("deadline")
	}
	boom := errors.New("boom")
	if MapDoneError(boom) != boom {
		t.Fatal("other")
	}
}

func TestTimeoutSignalContextCancels(t *testing.T) {
	t.Parallel()
	ctx, cancel := TimeoutSignalContext(30 * time.Millisecond)
	defer cancel()
	select {
	case <-ctx.Done():
		if !errors.Is(ctx.Err(), context.DeadlineExceeded) {
			t.Fatalf("want deadline, got %v", ctx.Err())
		}
	case <-time.After(time.Second):
		t.Fatal("timeout not fired")
	}
}
