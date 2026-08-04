package server

import (
	"context"
	"testing"
	"time"

	"github.com/alitto/pond/v2"
)

func TestShutdownClosesChanAndIsIdempotent(t *testing.T) {
	s := &Server{
		SyncPool:     pond.NewPool(1),
		shutdownChan: make(chan struct{}),
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

	// Second call must not panic.
	s.Shutdown(context.Background())
}

func TestShutdownRespectsCanceledContext(t *testing.T) {
	s := &Server{
		SyncPool:     pond.NewPool(1),
		shutdownChan: make(chan struct{}),
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	started := time.Now()
	s.Shutdown(ctx)
	if time.Since(started) > time.Second {
		t.Fatal("Shutdown blocked too long on canceled context")
	}
}
