package server

import (
	"context"
	"eve-industry-planner/shared/jsoncodec"
	"time"

	"eve-industry-planner/shared/appconfig"
	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
)

// maintenanceWriteWait bounds the message write per client, sequentially: long
// enough for a live socket, short enough that a dead one does not hold the rest.
const maintenanceWriteWait = time.Second

// StartMaintenanceWatch keeps the upgrade gate on the live flag and closes live
// sessions when a window starts. Close-clients only: the container is not going away.
func (s *Server) StartMaintenanceWatch(ctx context.Context) (stop func(), err error) {
	if s == nil || s.Stack == nil || s.Stack.Redis.Driver() == nil {
		return func() {}, nil
	}
	s.maintenance = appconfig.NewMaintenanceFlag(s.Stack.Redis)
	if s.maintenanceEnabled(ctx) {
		logs.InfoCtx(ctx, "websocket started during maintenance, refusing upgrades")
	}
	if s.Stack.NATS == nil {
		return func() {}, nil
	}
	return eipnats.SubscribeMaintenanceState(s.Stack.NATS, func(state eipnats.MaintenanceState) {
		s.applyMaintenanceState(ctx, state.Enabled)
	})
}

// applyMaintenanceState closes live sessions when maintenance turns on; turning
// off needs nothing, the gate reads per upgrade.
func (s *Server) applyMaintenanceState(ctx context.Context, enabled bool) {
	if s == nil || s.maintenance == nil {
		return
	}
	// Nothing is cached from the announce; the gate reads Redis.
	if !enabled {
		logs.InfoCtx(ctx, "websocket maintenance cleared, accepting upgrades")
		return
	}
	payload, err := jsoncodec.Marshal(eipnats.MaintenanceMessage{
		Type:    eipnats.ClientMessageMaintenance,
		Enabled: true,
		Message: "The service is in maintenance; the app reconnects when it ends.",
	})
	if err != nil {
		logs.ErrorCtx(ctx, "websocket maintenance message", "error", err)
		return
	}
	closed := s.closeLocalClients(payload, maintenanceWriteWait)
	logs.InfoCtx(ctx, "websocket maintenance started, closed live sessions", "closed", closed)
}

// maintenanceEnabled reports the live flag; nil reads as off.
func (s *Server) maintenanceEnabled(ctx context.Context) bool {
	if s == nil || s.maintenance == nil {
		return false
	}
	return s.maintenance.Enabled(ctx)
}
