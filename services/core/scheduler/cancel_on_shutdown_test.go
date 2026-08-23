package scheduler

import (
	"context"
	"encoding/json"
	"sync/atomic"
	"testing"
	"time"

	"eve-industry-planner/testing/wait"
)

// #28: gocron Shutdown cancels in-flight job contexts (lose-primary path).
func TestTaskScheduler_StopCancelsInFlightJob(t *testing.T) {
	s, err := NewTaskScheduler(nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}

	var running atomic.Bool
	cancelled := make(chan struct{})
	s.RegisterHandler("refreshRegionMarketOrders", func(ctx context.Context, _ json.RawMessage) error {
		running.Store(true)
		select {
		case <-ctx.Done():
			close(cancelled)
			return ctx.Err()
		case <-time.After(30 * time.Second):
			t.Error("job finished without cancel")
			return nil
		}
	})

	if err := s.Start(); err != nil {
		t.Fatal(err)
	}
	if err := s.ScheduleOneTimeJob("cancel-test", "refreshRegionMarketOrders", time.Now().Add(150*time.Millisecond), nil); err != nil {
		t.Fatal(err)
	}

	wait.For(t, 3*time.Second, func() (bool, string) {
		return running.Load(), "scheduled job never started"
	})

	done := make(chan struct{})
	go func() {
		s.Stop()
		close(done)
	}()

	select {
	case <-cancelled:
	case <-time.After(5 * time.Second):
		t.Fatal("in-flight job context was not cancelled on Stop/Shutdown")
	}
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Stop did not return")
	}
}
