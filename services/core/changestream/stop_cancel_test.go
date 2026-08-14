package changestream

import (
	"context"
	"testing"
	"time"
)

func TestSleepOrDone_cancels(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if sleepOrDone(ctx, time.Hour) {
		t.Fatal("expected false when ctx already done")
	}
}

func TestWatcherStart_emptyGroupsStop(t *testing.T) {
	w := &Watcher{}
	stop := w.Start(nil)
	done := make(chan struct{})
	go func() {
		stop()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("stop hung")
	}
}
