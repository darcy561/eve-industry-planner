package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"eve-industry-planner/shared/container"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/stackservices"
	"eve-industry-planner/shared/wsplacement"
)

func TestPublishPlacementStateOnChange(t *testing.T) {
	t.Setenv("WS_TARGET_CLIENTS", "2")
	t.Setenv("WS_CLIENT_CUTOFF", "5")
	t.Setenv("HOSTNAME", "websocket-place-1")

	var mu sync.Mutex
	var pubs []natscore.PlacementState
	s := &Server{
		Stack:        &stackservices.Clients{},
		shutdownChan: make(chan struct{}),
		placementPublishFn: func(subject string, data []byte) error {
			if subject != natscore.SubjectWSPlacementState {
				t.Errorf("subject=%q", subject)
			}
			st, err := natscore.ParsePlacementState(data)
			if err != nil {
				t.Errorf("parse: %v", err)
				return err
			}
			mu.Lock()
			pubs = append(pubs, st)
			mu.Unlock()
			return nil
		},
	}
	ctx := context.Background()
	s.publishPlacementState(ctx, 2, false)
	s.publishPlacementState(ctx, 2, false) // dedupe
	s.publishPlacementState(ctx, 1, false)

	mu.Lock()
	defer mu.Unlock()
	if len(pubs) != 2 {
		t.Fatalf("pubs=%d want 2 (change only)", len(pubs))
	}
	if pubs[0].ContainerID != container.ID() || !pubs[0].Soft || pubs[0].Full || pubs[0].Clients != 2 {
		t.Fatalf("first=%+v", pubs[0])
	}
	if pubs[1].Soft || pubs[1].Clients != 1 {
		t.Fatalf("second=%+v", pubs[1])
	}
}

func TestPublishPlacementStateSkipsDedupeWithoutNATS(t *testing.T) {
	t.Setenv("WS_TARGET_CLIENTS", "2")
	t.Setenv("WS_CLIENT_CUTOFF", "5")
	t.Setenv("HOSTNAME", "websocket-place-skip")

	s := &Server{
		Stack:        &stackservices.Clients{}, // NATS nil → publish skipped
		shutdownChan: make(chan struct{}),
	}
	ctx := context.Background()
	s.publishPlacementState(ctx, 2, false)
	if s.hasLastPlacement {
		t.Fatal("skip must not set lastPlacementState")
	}

	var pubs int
	s.placementPublishFn = func(string, []byte) error {
		pubs++
		return nil
	}
	s.publishPlacementState(ctx, 2, false)
	if pubs != 1 || !s.hasLastPlacement {
		t.Fatalf("pubs=%d hasLast=%v", pubs, s.hasLastPlacement)
	}
}

func TestHandlePlacement(t *testing.T) {
	t.Setenv("WS_TARGET_CLIENTS", "1")
	t.Setenv("WS_CLIENT_CUTOFF", "10")
	t.Setenv("HOSTNAME", "websocket-place-http")

	s := &Server{
		Clients: map[string]*Client{"a": {id: "a"}},
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, wsplacement.StatusPath, nil)
	s.HandlePlacement(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d", rec.Code)
	}
	var st natscore.PlacementState
	if err := json.NewDecoder(rec.Body).Decode(&st); err != nil {
		t.Fatal(err)
	}
	if st.Clients != 1 || !st.Soft || st.Full || st.Draining || st.ContainerID != container.ID() {
		t.Fatalf("%+v", st)
	}
}

func TestContextUntilShutdownCancels(t *testing.T) {
	s := &Server{shutdownChan: make(chan struct{})}
	ctx, cancel := s.contextUntilShutdown()
	defer cancel()

	close(s.shutdownChan)
	select {
	case <-ctx.Done():
	case <-time.After(2 * time.Second):
		t.Fatal("context not cancelled after shutdownChan close")
	}
}
