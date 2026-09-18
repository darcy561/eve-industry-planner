package server

import (
	"context"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipnats "eve-industry-planner/shared/nats"
)

// subscribeToSessionGrantsChanges narrows open connections when an account's
// grants are rewritten.
//
// A connection's scopes are derived once, at connect, from the grants the
// session held then. Membership is removed by tasks that run days into a
// session, so without this a member who has left a planner keeps receiving its
// documents until they reconnect — the stored record closes every other surface
// immediately and this is the one that is already open.
//
// Every replica subscribes and each keeps what it hosts: the account's
// connections may be anywhere, and the alternative is a subject per account
// whose subscriptions would have to be reconciled as tabs come and go.
func (s *Server) subscribeToSessionGrantsChanges() {
	ctx := context.Background()
	if s.Stack == nil || s.Stack.NATS == nil {
		return
	}

	stop, err := eipnats.SubscribeSessionGrantsChanged(s.Stack.NATS, func(msg eipnats.SessionGrantsChanged) {
		s.applySessionGrantsChanged(ctx, msg)
	})
	if err != nil {
		logs.ErrorCtx(ctx, "session grants changes: subscribe", "component", "websocket", "error", err)
		return
	}

	go func() {
		<-s.shutdownChan
		stop()
	}()
}

// applySessionGrantsChanged holds every connection of one account to the ceiling
// the account now has.
func (s *Server) applySessionGrantsChanged(ctx context.Context, msg eipnats.SessionGrantsChanged) {
	if msg.AccountID == "" {
		return
	}

	// The account's own planner is not a grant and is never withdrawn: an account
	// works in it whether or not a membership row says so, which is the rule the
	// planner switch and the lock frames already follow.
	ceiling := msg.Granted.Add(models.AccountOwner(msg.AccountID)).Normalized()

	narrowed := 0
	for _, client := range s.clientsForAccount(msg.AccountID) {
		scopes := s.clientScopesSnapshot(client)
		next := scopes.Within(ceiling)
		s.setClientCeilingAndScopes(client, ceiling, next)
		if len(next) != len(scopes) {
			narrowed++
		}
	}
	if narrowed == 0 {
		return
	}
	logs.InfoCtx(ctx, "narrowed connections to a reduced grant ceiling",
		"component", "websocket",
		"account_id", msg.AccountID,
		"connections", narrowed)
}

// clientsForAccount is every connection this replica holds for one account.
//
// Snapshotted under both locks rather than acted on inside them, because what
// the caller does next takes the owner-index lock, which is a third.
func (s *Server) clientsForAccount(accountID string) []*Client {
	s.userConnMu.RLock()
	ids := make([]string, 0, len(s.userConnections[accountID]))
	for id := range s.userConnections[accountID] {
		ids = append(ids, id)
	}
	s.userConnMu.RUnlock()

	s.ClientsMu.RLock()
	defer s.ClientsMu.RUnlock()
	clients := make([]*Client, 0, len(ids))
	for _, id := range ids {
		if client := s.Clients[id]; client != nil {
			clients = append(clients, client)
		}
	}
	return clients
}
