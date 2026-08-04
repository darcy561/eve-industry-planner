package server

import (
	"context"
	"time"

	"eve-industry-planner/shared/core/instanceid"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/wsplacement"
	"eve-industry-planner/websocket/server/config"
)

const (
	// Best-effort placement hint TTL. Refresh while still at cutoff/target so a live
	// slot stays hinted; crash → key expires and the router can place again.
	slotFullKeyTTL       = 90 * time.Second
	slotFullRefreshEvery = 30 * time.Second
)

func (s *Server) ownFullKey() string {
	return wsplacement.FullPrefix + instanceid.Replica()
}

func (s *Server) ownSoftKey() string {
	return wsplacement.SoftPrefix + instanceid.Replica()
}

// syncSlotFullFlag SET/DEL eip:ws:full:v1:{slot} from the current client count.
// Router placement hint only (eligible skip). Call on connect/disconnect and via the maintainer.
func (s *Server) syncSlotFullFlag(ctx context.Context, connected int) {
	if s.Stack == nil || s.Stack.Redis == nil {
		return
	}
	rdb := s.Stack.Redis
	key := s.ownFullKey()
	if config.SlotAtClientCutoff(connected) {
		if err := rdb.Set(ctx, key, "1", slotFullKeyTTL).Err(); err != nil {
			logs.WarnCtx(ctx, "slot full flag SET failed",
				"error", err, "key", key, "connected", connected, "client_cutoff", config.SlotClientCutoff())
			return
		}
		logs.DebugCtx(ctx, "slot full flag set",
			"key", key, "connected", connected, "client_cutoff", config.SlotClientCutoff(), "ttl", slotFullKeyTTL.String())
		return
	}
	n, err := rdb.Del(ctx, key).Result()
	if err != nil {
		logs.WarnCtx(ctx, "slot full flag DEL failed", "error", err, "key", key)
		return
	}
	if n > 0 {
		logs.DebugCtx(ctx, "slot full flag cleared", "key", key, "connected", connected)
	}
}

// syncSlotSoftFlag SET/DEL eip:ws:soft:v1:{slot} from the current client count.
// Soft divert hint only — does not refuse upgrades (that stays at cutoff / cordon / draining).
// Same TTL/refresh cadence as the full hint.
func (s *Server) syncSlotSoftFlag(ctx context.Context, connected int) {
	if s.Stack == nil || s.Stack.Redis == nil {
		return
	}
	rdb := s.Stack.Redis
	key := s.ownSoftKey()
	if config.SlotAtTargetClients(connected) {
		if err := rdb.Set(ctx, key, "1", slotFullKeyTTL).Err(); err != nil {
			logs.WarnCtx(ctx, "slot soft flag SET failed",
				"error", err, "key", key, "connected", connected, "target_clients", config.SlotTargetClients())
			return
		}
		logs.DebugCtx(ctx, "slot soft flag set",
			"key", key, "connected", connected, "target_clients", config.SlotTargetClients(), "ttl", slotFullKeyTTL.String())
		return
	}
	n, err := rdb.Del(ctx, key).Result()
	if err != nil {
		logs.WarnCtx(ctx, "slot soft flag DEL failed", "error", err, "key", key)
		return
	}
	if n > 0 {
		logs.DebugCtx(ctx, "slot soft flag cleared", "key", key, "connected", connected)
	}
}

// startSlotFullFlagMaintainer refreshes Redis full + soft placement hints while
// this slot stays at/above thresholds (no connect/disconnect traffic) and clears on startup when empty.
func (s *Server) startSlotFullFlagMaintainer() {
	if s.Stack == nil || s.Stack.Redis == nil {
		logs.WarnCtx(context.Background(), "slot full flag maintainer skipped: redis unavailable")
		return
	}
	go s.runSlotFullFlagMaintainer()
}

func (s *Server) runSlotFullFlagMaintainer() {
	ctx := context.Background()
	s.ClientsMu.RLock()
	n := len(s.Clients)
	s.ClientsMu.RUnlock()
	s.syncSlotFullFlag(ctx, n)
	s.syncSlotSoftFlag(ctx, n)

	t := time.NewTicker(slotFullRefreshEvery)
	defer t.Stop()
	for {
		select {
		case <-s.shutdownChan:
			return
		case <-t.C:
			s.ClientsMu.RLock()
			connected := len(s.Clients)
			s.ClientsMu.RUnlock()
			s.syncSlotFullFlag(ctx, connected)
			s.syncSlotSoftFlag(ctx, connected)
		}
	}
}
