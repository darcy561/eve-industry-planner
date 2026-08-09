package server

// Drain owns process-stop kick behaviour for this container.
//
// Kick path: DrainForRoll (SIGTERM) → draining + NATS publish → delete durables →
// stop intake → flush outbound shards → kick until empty → stop workers.

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"eve-industry-planner/shared/container"
	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/websocket/server/config"

	"github.com/gorilla/websocket"
)

// drainSignal is the please_reconnect / ForceClose payload for local kicks.
type drainSignal struct {
	ContainerID string `json:"container_id"`
	Action      string `json:"action"` // roll | …
	Via         string `json:"via"`    // sigterm | …
}

func normalizeDrainSignal(sig drainSignal) drainSignal {
	sig.ContainerID = strings.TrimSpace(sig.ContainerID)
	sig.Action = strings.TrimSpace(sig.Action)
	sig.Via = strings.TrimSpace(sig.Via)
	if sig.Action == "" {
		sig.Action = "roll"
	}
	if sig.Via == "" {
		sig.Via = "sigterm"
	}
	return sig
}

func drainExplainMessage(sig drainSignal, containerID string) string {
	sig = normalizeDrainSignal(sig)
	switch sig.Action {
	case "roll":
		return fmt.Sprintf(
			"Container %s is stopping (%s). Live sockets are closed so clients reconnect onto an eligible instance.",
			containerID, sig.Via,
		)
	case "evacuate":
		return fmt.Sprintf(
			"Container %s is evacuating (%s). Live sockets are closed so clients reconnect onto an eligible instance.",
			containerID, sig.Via,
		)
	default:
		return fmt.Sprintf(
			"Container %s drain signal action=%q via=%s. Reconnect to follow placement.",
			containerID, sig.Action, sig.Via,
		)
	}
}

// ForceCloseLocalClients closes every local socket (please_reconnect best-effort, then Close).
// Close-first unblocks readers so Clients drains within stop grace. Clients leave the map
// when their reader exits. Returns how many conns were closed.
func (s *Server) ForceCloseLocalClients(sig drainSignal) int {
	s.ClientsMu.RLock()
	clients := make([]*Client, 0, len(s.Clients))
	for _, c := range s.Clients {
		clients = append(clients, c)
	}
	s.ClientsMu.RUnlock()

	sig = normalizeDrainSignal(sig)
	if sig.ContainerID == "" {
		sig.ContainerID = container.ID()
	}
	payload, _ := json.Marshal(map[string]string{
		"type":         "please_reconnect",
		"action":       sig.Action,
		"via":          sig.Via,
		"container_id": sig.ContainerID,
		"message":      drainExplainMessage(sig, sig.ContainerID),
	})

	closed := 0
	for _, client := range clients {
		if client == nil || client.conn == nil {
			continue
		}
		_ = client.writeFrame(websocket.TextMessage, payload, 100*time.Millisecond)
		_ = client.conn.Close()
		closed++
	}
	return closed
}

// IsDraining reports whether this process has started local stop/roll or planned kick drain.
// Ready checks use this (cordon-only does not fail Ready).
func (s *Server) IsDraining() bool {
	return s != nil && s.draining.Load()
}

// IsCordoned reports planned soft-stop (no new homes; upgrades refused).
func (s *Server) IsCordoned() bool {
	return s != nil && s.plannedCordon.Load()
}

// placementDraining is true when routers must skip this backend.
func (s *Server) placementDraining() bool {
	return s.IsDraining() || s.IsCordoned()
}

// ConnectedCount returns the number of local WebSocket clients.
func (s *Server) ConnectedCount() int {
	if s == nil {
		return 0
	}
	s.ClientsMu.RLock()
	defer s.ClientsMu.RUnlock()
	return len(s.Clients)
}

// upgradeBlockReason is the single SoT for "this container must not accept new upgrades".
// checkCutoff is false after the socket is already hijacked (capacity refuse is HTTP-only).
func (s *Server) upgradeBlockReason(_ context.Context, checkCutoff bool) string {
	if s.IsDraining() || s.IsCordoned() {
		return "draining"
	}
	if checkCutoff && config.AtClientCutoff(s.ConnectedCount()) {
		return "at_cutoff"
	}
	return ""
}

// PlannedCordon soft-stops new homes (placement draining + upgrade refuse) without kicking clients.
func (s *Server) PlannedCordon(ctx context.Context) {
	if s == nil {
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}
	s.plannedCordon.Store(true)
	logs.InfoCtx(ctx, "websocket planned cordon", "via", "ws.command")
	s.publishPlacementState(ctx, s.ConnectedCount(), true)
}

// PlannedUncordon clears planned soft-stop when not mid roll/kick drain.
func (s *Server) PlannedUncordon(ctx context.Context) error {
	if s == nil {
		return fmt.Errorf("server nil")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if s.draining.Load() {
		return fmt.Errorf("uncordon refused: drain in progress")
	}
	s.plannedCordon.Store(false)
	logs.InfoCtx(ctx, "websocket planned uncordon", "via", "ws.command")
	s.publishPlacementState(ctx, s.ConnectedCount(), true)
	return nil
}

// PlannedDrain kicks local clients (please_reconnect) after soft-stop. Distinct from DrainForRoll
// (no durable delete / intake stop — scale-in SIGTERM still runs full roll drain).
// Kick wait is bounded by lifecycle.AppStopGrace (same SoT as DrainForRoll / stack stop grace).
func (s *Server) PlannedDrain(ctx context.Context) {
	if s == nil {
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}
	drainCtx, cancel := context.WithTimeout(ctx, lifecycle.AppStopGrace)
	defer cancel()
	s.plannedCordon.Store(true)
	if s.draining.CompareAndSwap(false, true) {
		logs.InfoCtx(drainCtx, "websocket planned drain started", "via", "ws.command")
	} else {
		logs.DebugCtx(drainCtx, "websocket planned drain already draining")
	}
	s.publishPlacementState(drainCtx, s.ConnectedCount(), true)
	sig := drainSignal{
		ContainerID: container.ID(),
		Action:      "evacuate",
		Via:         "ws.command",
	}
	s.kickAndWait(drainCtx, func() drainSignal { return sig }, "websocket planned drain", func() bool { return true })
}

// rejectUpgradeBlocked writes the HTTP 503 refuse for upgradeBlockReason. Returns true if rejected.
func (s *Server) rejectUpgradeBlocked(w http.ResponseWriter, r *http.Request, upgradeStart time.Time, reason string) bool {
	switch reason {
	case "draining":
		wsUpgradeRejectServer(w, r, s, upgradeStart, "draining", http.StatusServiceUnavailable,
			"websocket upgrade rejected: process draining",
			"Service unavailable: draining",
			"ws_upgrade_draining",
			nil, nil)
		return true
	case "at_cutoff":
		wsUpgradeRejectServer(w, r, s, upgradeStart, "at_cutoff", http.StatusServiceUnavailable,
			"websocket upgrade rejected: at client_cutoff",
			"Service unavailable: at_cutoff",
			"ws_upgrade_at_cutoff",
			nil, nil)
		return true
	default:
		return false
	}
}

// DrainForRoll marks the process not-ready / upgrade-refusing, publishes draining
// placement state, removes this container's JetStream durables, stops pull intake
// only, flushes outbound shard FIFOs while sockets are still up, force-closes
// sockets, then stops shard workers / coordinators. Call before Shutdown so the
// same cleanup budget covers flush + kick + wait + sync-pool.
func (s *Server) DrainForRoll(ctx context.Context) {
	if s == nil {
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if !s.draining.CompareAndSwap(false, true) {
		logs.DebugCtx(ctx, "websocket drain already in progress")
	} else {
		logs.InfoCtx(ctx, "websocket drain started", "via", "sigterm")
	}

	// Router learns draining before kick (NATS + /placement already include the flag).
	s.publishPlacementState(ctx, s.ConnectedCount(), true)

	// Delete durables first so the server stops delivering; then stop intake only
	// so outbound shard workers can flush queued fan-out before kick.
	s.deleteOwnDocFanoutConsumers(ctx)
	s.stopIntakeOnly()
	s.flushOutboundShards(ctx)

	sig := drainSignal{
		ContainerID: container.ID(),
		Action:      "roll",
		Via:         "sigterm",
	}
	s.kickAndWait(ctx, func() drainSignal { return sig }, "websocket drain", func() bool { return true })
	s.stopConsumeLoops()
}

// kickAndWait force-closes, then re-kicks until Clients is empty, ctx is done, or
// keepGoing returns false.
func (s *Server) kickAndWait(ctx context.Context, signal func() drainSignal, logPrefix string, keepGoing func() bool) {
	kick := func() int {
		sig := drainSignal{Action: "roll", Via: "sigterm"}
		if signal != nil {
			sig = signal()
		}
		return s.ForceCloseLocalClients(sig)
	}

	n := kick()
	sig := normalizeDrainSignal(drainSignal{})
	if signal != nil {
		sig = normalizeDrainSignal(signal())
	}
	logs.InfoCtx(ctx, logPrefix+": force-closed local clients",
		"container_id", container.ID(), "action", sig.Action, "via", sig.Via,
		"closed", n, "remaining", s.ConnectedCount())

	poll := time.NewTicker(50 * time.Millisecond)
	defer poll.Stop()
	rekick := time.NewTicker(250 * time.Millisecond)
	defer rekick.Stop()
	for {
		if s.ConnectedCount() == 0 {
			logs.DebugCtx(ctx, logPrefix+": all local clients gone")
			return
		}
		if keepGoing != nil && !keepGoing() {
			logs.DebugCtx(ctx, logPrefix+": stop condition cleared", "remaining", s.ConnectedCount())
			return
		}
		select {
		case <-ctx.Done():
			logs.WarnCtx(ctx, logPrefix+": wait interrupted",
				"error", ctx.Err(), "remaining", s.ConnectedCount())
			return
		case <-rekick.C:
			n := kick()
			if n > 0 {
				logs.DebugCtx(ctx, logPrefix+": re-kicked local clients",
					"closed", n, "remaining", s.ConnectedCount())
			}
		case <-poll.C:
		}
	}
}
