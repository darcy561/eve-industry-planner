package server

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"eve-industry-planner/shared/container"
	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/shared/wsplacement"
	"eve-industry-planner/websocket/server/config"
)

const placementPublishRefreshEvery = 30 * time.Second

// placementPub publishes to NATS when available. ok=false means skipped (nil NATS);
// callers must not treat a skip as a successful publish for dedupe.
func (s *Server) placementPub(state eipnats.PlacementState) (ok bool, err error) {
	if s != nil && s.placementPublishFn != nil {
		return true, s.placementPublishFn(state)
	}
	if s == nil || s.Stack == nil || s.Stack.NATS == nil {
		return false, nil
	}
	return true, eipnats.PublishPlacementState(s.Stack.NATS, state)
}

// currentPlacementState builds PlacementState from live count and config thresholds.
func (s *Server) currentPlacementState(connected int) eipnats.PlacementState {
	return wsplacement.NewPlacementState(
		container.ID(),
		connected,
		config.TargetClients(),
		config.ClientCutoff(),
		s != nil && s.placementDraining(),
	)
}

// CurrentPlacementSnapshot returns placement flags for health census (capacity Observe).
func (s *Server) CurrentPlacementSnapshot() eipnats.PlacementState {
	if s == nil {
		return eipnats.PlacementState{}
	}
	return s.currentPlacementState(s.ConnectedCount())
}

// publishPlacementState publishes raw PlacementState JSON on SubjectWSPlacementState
// when soft/full/clients/draining changed (or force). Nil NATS is a skip (no dedupe update).
func (s *Server) publishPlacementState(ctx context.Context, connected int, force bool) {
	if s == nil {
		return
	}
	state := s.currentPlacementState(connected)
	s.placementMu.Lock()
	prev, hasPrev := s.lastPlacementState, s.hasLastPlacement
	if !force && hasPrev &&
		prev.Clients == state.Clients &&
		prev.Soft == state.Soft &&
		prev.Full == state.Full &&
		prev.Draining == state.Draining {
		s.placementMu.Unlock()
		return
	}
	s.placementMu.Unlock()

	ok, err := s.placementPub(state)
	if err != nil {
		logs.WarnCtx(ctx, "placement state publish failed",
			"error", err,
			"clients", state.Clients, "soft", state.Soft, "full", state.Full, "draining", state.Draining)
		return
	}
	if !ok {
		return
	}
	s.placementMu.Lock()
	s.lastPlacementState = state
	s.hasLastPlacement = true
	s.placementMu.Unlock()
	logs.DebugCtx(ctx, "placement state published",
		"subject", eipnats.SubjectWSPlacementState,
		"clients", state.Clients, "soft", state.Soft, "full", state.Full, "draining", state.Draining)
}

// syncPlacementFlags publishes placement state for the current connected count.
func (s *Server) syncPlacementFlags(ctx context.Context, connected int) {
	s.publishPlacementState(ctx, connected, false)
}

// startPlacementFlagMaintainer republishes placement state on a timer (and once at start).
func (s *Server) startPlacementFlagMaintainer() {
	if s.Stack == nil || s.Stack.NATS == nil {
		logs.WarnCtx(context.Background(), "placement flag maintainer skipped: nats unavailable")
		return
	}
	go s.runPlacementFlagMaintainer()
}

func (s *Server) runPlacementFlagMaintainer() {
	ctx := context.Background()
	s.ClientsMu.RLock()
	n := len(s.Clients)
	s.ClientsMu.RUnlock()
	s.publishPlacementState(ctx, n, true)

	t := time.NewTicker(placementPublishRefreshEvery)
	defer t.Stop()
	for {
		select {
		case <-s.shutdownChan:
			return
		case <-t.C:
			s.ClientsMu.RLock()
			connected := len(s.Clients)
			s.ClientsMu.RUnlock()
			s.publishPlacementState(ctx, connected, true)
		}
	}
}

// HandlePlacement serves GET wsplacement.StatusPath as PlacementState JSON.
func (s *Server) HandlePlacement(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	state := s.currentPlacementState(s.ConnectedCount())
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(state); err != nil {
		logs.WarnCtx(r.Context(), "placement status encode failed", "error", err)
	}
}
