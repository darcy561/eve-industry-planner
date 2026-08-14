package server

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/shared/stackservices"

	"github.com/alitto/pond/v2"
)

func testServerChans() (intake, shutdown chan struct{}) {
	return make(chan struct{}), make(chan struct{})
}

func TestShutdownClosesChanAndIsIdempotent(t *testing.T) {
	intake, shutdown := testServerChans()
	s := &Server{
		SyncPool:       pond.NewPool(1),
		intakeStopChan: intake,
		shutdownChan:   shutdown,
	}

	done := make(chan struct{})
	go func() {
		<-s.shutdownChan
		close(done)
	}()

	s.Shutdown(context.Background())
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("shutdownChan not closed")
	}
	select {
	case <-s.intakeStopChan:
	default:
		t.Fatal("intakeStopChan not closed")
	}

	// Second call must not panic.
	s.Shutdown(context.Background())
}

func TestDrainForRollStopsIntakeThenWorkers(t *testing.T) {
	intake, shutdown := testServerChans()
	s := &Server{
		Clients:        make(map[string]*Client),
		intakeStopChan: intake,
		shutdownChan:   shutdown,
	}
	s.DrainForRoll(context.Background())
	select {
	case <-s.intakeStopChan:
	default:
		t.Fatal("expected intakeStopChan closed during DrainForRoll")
	}
	select {
	case <-s.shutdownChan:
	default:
		t.Fatal("expected shutdownChan closed at end of DrainForRoll")
	}
	// Shutdown after early stop must not panic (idempotent close + durable delete no-op).
	s.Shutdown(context.Background())
}

func TestDrainForRollOrderDeleteIntakeFlushStop(t *testing.T) {
	var steps []string
	drainStopTrace = func(step string) { steps = append(steps, step) }
	t.Cleanup(func() { drainStopTrace = nil })

	intake, shutdown := testServerChans()
	s := &Server{
		Clients:        make(map[string]*Client),
		intakeStopChan: intake,
		shutdownChan:   shutdown,
	}
	s.DrainForRoll(context.Background())
	want := []string{"delete", "intake_stop", "flush", "stop"}
	if len(steps) < len(want) {
		t.Fatalf("steps=%v want prefix %v", steps, want)
	}
	for i, w := range want {
		if steps[i] != w {
			t.Fatalf("steps=%v want prefix %v", steps, want)
		}
	}
}

func TestDeleteOwnDocFanoutConsumersNilSafe(t *testing.T) {
	(&Server{}).deleteOwnDocFanoutConsumers(context.Background())
	(&Server{Stack: &stackservices.Clients{}}).deleteOwnDocFanoutConsumers(context.Background())
}

func TestShutdownRespectsCanceledContext(t *testing.T) {
	intake, shutdown := testServerChans()
	s := &Server{
		SyncPool:       pond.NewPool(1),
		intakeStopChan: intake,
		shutdownChan:   shutdown,
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	started := time.Now()
	s.Shutdown(ctx)
	if time.Since(started) > time.Second {
		t.Fatal("Shutdown blocked too long on canceled context")
	}
}
