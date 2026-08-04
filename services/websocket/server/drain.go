package server

// Drain owns stop/evacuate kick behaviour for this replica.
//
// Two triggers share one kick path (kickAndWait → ForceCloseLocalClients):
//   - DrainForRoll (process stop): set local draining, Ready 503 + refuse upgrades, kick until empty
//   - Redis drain PUBLISH / cordon key: kick while the cordon key is present; Ready stays up
//     (router skips via Redis cordon; HandleWS refuses cordoned upgrades)
//
// When local draining is set, the cordon watcher does not run a second wait — DrainForRoll
// owns the stop-grace budget.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"eve-industry-planner/shared/core/instanceid"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/wsplacement"
	"eve-industry-planner/websocket/server/config"

	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
)

var errCordonDrainPubSubClosed = errors.New("cordon drain: pubsub channel closed")

// drainSignal is the Redis PUBLISH payload on wsplacement.DrainChannel (JSON preferred).
// Bare slot id strings are also accepted. DrainForRoll synthesizes action=roll.
type drainSignal struct {
	Slot   string `json:"slot"`
	Action string `json:"action"` // cordon | evacuate | roll | …
	Via    string `json:"via"`    // ws-placement-ops | sigterm | …
}

func parseDrainSignal(raw string) (drainSignal, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return drainSignal{}, false
	}
	if strings.HasPrefix(raw, "{") {
		var sig drainSignal
		if err := json.Unmarshal([]byte(raw), &sig); err != nil {
			return drainSignal{}, false
		}
		sig.Slot = strings.TrimSpace(sig.Slot)
		sig.Action = strings.TrimSpace(sig.Action)
		sig.Via = strings.TrimSpace(sig.Via)
		if sig.Slot == "" {
			return drainSignal{}, false
		}
		return sig, true
	}
	return drainSignal{Slot: raw, Action: "unknown", Via: "bare_slot_publish"}, true
}

func normalizeDrainSignal(sig drainSignal) drainSignal {
	sig.Slot = strings.TrimSpace(sig.Slot)
	sig.Action = strings.TrimSpace(sig.Action)
	sig.Via = strings.TrimSpace(sig.Via)
	if sig.Action == "" {
		sig.Action = "cordon"
	}
	if sig.Via == "" {
		sig.Via = "ops"
	}
	return sig
}

func drainExplainMessage(sig drainSignal, slot string) string {
	sig = normalizeDrainSignal(sig)
	switch sig.Action {
	case "evacuate":
		return fmt.Sprintf(
			"Slot %s was evacuated (%s). Live sockets on this replica are closed so clients reconnect onto the updated Redis placement map.",
			slot, sig.Via,
		)
	case "cordon":
		return fmt.Sprintf(
			"Slot %s was cordoned (%s). This replica refuses new upgrades and is closing live sockets so clients reconnect elsewhere.",
			slot, sig.Via,
		)
	case "roll":
		return fmt.Sprintf(
			"Slot %s is stopping (%s). Live sockets are closed so clients reconnect onto an eligible replica.",
			slot, sig.Via,
		)
	default:
		return fmt.Sprintf(
			"Slot %s drain signal action=%q via=%s. Reconnect to follow Redis placement.",
			slot, sig.Action, sig.Via,
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

	slot := instanceid.Replica()
	sig = normalizeDrainSignal(sig)
	payload, _ := json.Marshal(map[string]string{
		"type":    "please_reconnect",
		"action":  sig.Action,
		"via":     sig.Via,
		"slot":    slot,
		"message": drainExplainMessage(sig, slot),
	})

	closed := 0
	for _, client := range clients {
		if client == nil || client.conn == nil {
			continue
		}
		// Sync write before Close so please_reconnect reaches the wire under stop grace
		// (queueing to Send races the immediate Close). writeMu serializes with the writer.
		_ = client.writeFrame(websocket.TextMessage, payload, 100*time.Millisecond)
		_ = client.conn.Close()
		closed++
	}
	return closed
}

// IsDraining reports whether this process has started local stop/roll drain.
func (s *Server) IsDraining() bool {
	return s != nil && s.draining.Load()
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

// upgradeBlockReason is the single SoT for "this slot must not accept new upgrades".
// checkCutoff is false after the socket is already hijacked (capacity refuse is HTTP-only).
func (s *Server) upgradeBlockReason(ctx context.Context, checkCutoff bool) string {
	if s.IsDraining() {
		return "draining"
	}
	if s.isOwnSlotCordoned(ctx) {
		return "cordoned"
	}
	if checkCutoff && config.SlotAtClientCutoff(s.ConnectedCount()) {
		return "at_cutoff"
	}
	return ""
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
	case "cordoned":
		wsUpgradeRejectServer(w, r, s, upgradeStart, "cordoned", http.StatusServiceUnavailable,
			"websocket upgrade rejected: slot cordoned",
			"Service unavailable: cordoned",
			"ws_upgrade_cordoned",
			nil, nil)
		return true
	case "at_cutoff":
		wsUpgradeRejectServer(w, r, s, upgradeStart, "at_cutoff", http.StatusServiceUnavailable,
			"websocket upgrade rejected: slot at client_cutoff",
			"Service unavailable: at_cutoff",
			"ws_upgrade_at_cutoff",
			nil, nil)
		return true
	default:
		return false
	}
}

// DrainForRoll marks the process not-ready / upgrade-refusing, force-closes local
// sockets, then waits until Clients is empty or ctx is done. Call before Shutdown
// so the same cleanup budget covers kick + wait + sync-pool stop.
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

	sig := drainSignal{
		Slot:   instanceid.Replica(),
		Action: "roll",
		Via:    "sigterm",
	}
	s.kickAndWait(ctx, func() drainSignal { return sig }, "websocket drain", func() bool { return true })
}

// kickAndWait force-closes, then re-kicks until Clients is empty, ctx is done, or
// keepGoing returns false. signal() is read on each kick so cordon can refresh action/via.
func (s *Server) kickAndWait(ctx context.Context, signal func() drainSignal, logPrefix string, keepGoing func() bool) {
	kick := func() int {
		sig := drainSignal{Action: "cordon", Via: "ops"}
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
		"slot", instanceid.Replica(), "action", sig.Action, "via", sig.Via,
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

func (s *Server) ownCordonKey() string {
	return wsplacement.CordonPrefix + instanceid.Replica()
}

func (s *Server) isOwnSlotCordoned(ctx context.Context) bool {
	if s.Stack == nil || s.Stack.Redis == nil {
		return false
	}
	n, err := s.Stack.Redis.Exists(ctx, s.ownCordonKey()).Result()
	if err != nil {
		logs.WarnCtx(ctx, "cordon EXISTS failed", "error", err, "key", s.ownCordonKey())
		return false
	}
	return n > 0
}

// startCordonDrainWatcher listens for Redis PUBLISH on the drain channel and kicks local
// sockets when the payload matches this slot. Also kicks once at startup if the cordon
// key is already set (missed publish / mid-drain restart).
func (s *Server) startCordonDrainWatcher() {
	if s.Stack == nil || s.Stack.Redis == nil {
		logs.WarnCtx(context.Background(), "cordon drain watcher skipped: redis unavailable")
		return
	}
	go s.runCordonDrainWatcher(s.Stack.Redis)
}

func (s *Server) runCordonDrainWatcher(rdb *redis.Client) {
	ctx, cancel := s.contextUntilShutdown()
	defer cancel()

	slot := instanceid.Replica()
	channel := wsplacement.DrainChannel

	var mu sync.Mutex
	var waiting bool
	var activeSig drainSignal

	signal := func() drainSignal {
		mu.Lock()
		defer mu.Unlock()
		return activeSig
	}
	keepGoing := func() bool {
		return !s.IsDraining() && s.isOwnSlotCordoned(ctx)
	}

	trigger := func(sig drainSignal) {
		mu.Lock()
		defer mu.Unlock()
		if s.IsDraining() || !s.isOwnSlotCordoned(ctx) {
			return
		}
		activeSig = sig
		if waiting {
			// Refresh kick with latest signal; wait loop already re-kicks via signal().
			_ = s.ForceCloseLocalClients(sig)
			return
		}
		waiting = true
		go func() {
			defer func() {
				mu.Lock()
				waiting = false
				mu.Unlock()
			}()
			s.kickAndWait(ctx, signal, "slot cordon drain", keepGoing)
		}()
	}

	if s.isOwnSlotCordoned(ctx) {
		trigger(drainSignal{
			Slot:   slot,
			Action: "cordon",
			Via:    "cordon_present_at_start",
		})
	}

	for {
		err := s.subscribeCordonDrain(ctx, rdb, channel, slot, trigger)
		if err == nil || errors.Is(err, context.Canceled) {
			return
		}
		logs.WarnCtx(ctx, "cordon drain subscribe ended; retrying",
			"error", err, "channel", channel, "slot", slot)
		select {
		case <-ctx.Done():
			return
		case <-time.After(2 * time.Second):
		}
	}
}

func (s *Server) subscribeCordonDrain(
	ctx context.Context,
	rdb *redis.Client,
	channel, slot string,
	trigger func(sig drainSignal),
) error {
	pubsub := rdb.Subscribe(ctx, channel)
	defer func() { _ = pubsub.Close() }()

	if _, err := pubsub.Receive(ctx); err != nil {
		return err
	}
	logs.InfoCtx(ctx, "cordon drain watcher subscribed", "channel", channel, "slot", slot)

	ch := pubsub.Channel()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case msg, ok := <-ch:
			if !ok {
				return errCordonDrainPubSubClosed
			}
			if msg == nil {
				continue
			}
			sig, ok := parseDrainSignal(msg.Payload)
			if !ok || sig.Slot != slot {
				continue
			}
			trigger(sig)
		}
	}
}
