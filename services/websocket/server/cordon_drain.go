package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"eve-industry-planner/shared/core/instanceid"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/wsplacement"

	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
)

var errCordonDrainPubSubClosed = errors.New("cordon drain: pubsub channel closed")

// drainSignal is the Redis PUBLISH payload on eip:ws:drain:v1 (JSON preferred).
// Legacy: bare slot id string still accepted.
type drainSignal struct {
	Slot   string `json:"slot"`
	Action string `json:"action"` // cordon | evacuate | …
	Via    string `json:"via"`    // ws-placement-ops | capacity-controller | …
}

func cordonDrainConfig() (cordonPrefix, drainChannel string) {
	return wsplacement.CordonPrefix, wsplacement.DrainChannel
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
	// Legacy ops publish: bare "websocket-N"
	return drainSignal{Slot: raw, Action: "unknown", Via: "legacy_publish"}, true
}

func (s *Server) ownCordonKey() string {
	prefix, _ := cordonDrainConfig()
	return prefix + instanceid.Replica()
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

// startCordonDrainWatcher listens for Redis PUBLISH on the drain channel (ops cordon/evacuate)
// and force-closes local sockets when the payload matches this slot. Also drains once at
// startup if the cordon key is already set (missed publish / mid-drain restart).
//
// Temporary bus: Redis pub/sub pairs with the Redis-only ops script. Placement/cordon state
// stays in Redis; prefer a NATS drain notify when the capacity controller (#18) owns this path.
func (s *Server) startCordonDrainWatcher() {
	if s.Stack == nil || s.Stack.Redis == nil {
		logs.WarnCtx(context.Background(), "cordon drain watcher skipped: redis unavailable")
		return
	}
	go s.runCordonDrainWatcher(s.Stack.Redis)
}

func (s *Server) runCordonDrainWatcher(rdb *redis.Client) {
	ctx := context.Background()
	slot := instanceid.Replica()
	_, channel := cordonDrainConfig()

	var mu sync.Mutex
	trigger := func(sig drainSignal) {
		mu.Lock()
		defer mu.Unlock()
		if !s.isOwnSlotCordoned(ctx) {
			return
		}
		n := s.ForceCloseLocalClients(sig)
		logs.InfoCtx(ctx, "slot cordon drain: force-closed local clients",
			"slot", slot, "action", sig.Action, "via", sig.Via, "closed", n)
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
		time.Sleep(2 * time.Second)
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

func drainExplainMessage(sig drainSignal, slot string) string {
	action := sig.Action
	if action == "" {
		action = "cordon"
	}
	via := sig.Via
	if via == "" {
		via = "ops"
	}
	switch action {
	case "evacuate":
		return fmt.Sprintf(
			"Slot %s was evacuated (%s). Live sockets on this replica are closed so clients reconnect onto the updated Redis placement map.",
			slot, via,
		)
	case "cordon":
		return fmt.Sprintf(
			"Slot %s was cordoned (%s). This replica refuses new placements and is closing live sockets so clients reconnect elsewhere.",
			slot, via,
		)
	default:
		return fmt.Sprintf(
			"Slot %s drain signal action=%q via=%s. Reconnect to follow Redis placement.",
			slot, action, via,
		)
	}
}

// ForceCloseLocalClients asks every local socket to reconnect (SPA already reconnects on
// non-manual close). Writes a JSON text frame directly on the connection (not via Send) so
// DevTools can see what triggered the drain, then CloseGoingAway + conn.Close.
func (s *Server) ForceCloseLocalClients(sig drainSignal) int {
	s.ClientsMu.RLock()
	clients := make([]*Client, 0, len(s.Clients))
	for _, c := range s.Clients {
		clients = append(clients, c)
	}
	s.ClientsMu.RUnlock()

	slot := instanceid.Replica()
	action := strings.TrimSpace(sig.Action)
	if action == "" {
		action = "cordon"
	}
	via := strings.TrimSpace(sig.Via)
	if via == "" {
		via = "ops"
	}
	explain := drainExplainMessage(sig, slot)

	payload, _ := json.Marshal(map[string]string{
		"type":    "please_reconnect",
		"action":  action,
		"via":     via,
		"slot":    slot,
		"message": explain,
	})

	closeReason := action + ":" + slot
	if len(closeReason) > 120 {
		closeReason = closeReason[:120]
	}

	for _, client := range clients {
		if client == nil || client.conn == nil {
			continue
		}
		_ = client.conn.SetWriteDeadline(time.Now().Add(500 * time.Millisecond))
		if err := client.conn.WriteMessage(websocket.TextMessage, payload); err != nil {
			logs.DebugCtx(context.Background(), "cordon drain: please_reconnect write failed",
				"client_id", client.id, "error", err)
		}
		_ = client.conn.WriteMessage(
			websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseGoingAway, closeReason),
		)
		_ = client.conn.Close()
	}
	return len(clients)
}
