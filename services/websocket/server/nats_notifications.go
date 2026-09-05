package server

import (
	"context"

	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
)

// subscribeToNotifications forwards account notifications to that account's tabs.
//
// Core NATS rather than JetStream: a notification says something happened now,
// and one replayed after a reconnect would be worse than none. Nothing is
// acknowledged and nothing is retried.
//
// The payload is forwarded as published. Unlike a document change it carries no
// refs, no source ids and no scope — the tenant is in the subject — so there is
// nothing to route on and nothing to strip.
func (s *Server) subscribeToNotifications() {
	ctx := context.Background()
	if s.Stack == nil || s.Stack.NATS == nil {
		return
	}

	stop, err := eipnats.SubscribeNotifications(s.Stack.NATS, func(n eipnats.Notification) {
		accountID, ok := eipnats.AccountIDFromTenantString(n.TenantString)
		if !ok {
			// Corporation and alliance tenants have no clients of their own yet.
			return
		}
		outcome := s.broadcastRawToAccount("notification", accountID, n.Payload, "")
		if outcome.RecipientCount == 0 {
			return
		}
		logs.DebugCtx(ctx, "notification delivered",
			"component", "websocket",
			"subtype", n.Subtype,
			"recipients", outcome.RecipientCount,
		)
	})
	if err != nil {
		logs.ErrorCtx(ctx, "notifications: subscribe", "component", "websocket", "error", err)
		return
	}

	go func() {
		<-s.shutdownChan
		stop()
	}()
}
