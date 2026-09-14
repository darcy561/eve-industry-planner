package server

import (
	"context"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/websocket/server/outgoinglogic"
)

// subscribeToAudienceMessages is the delivery path for every message that names
// its own recipients, whatever family it belongs to.
//
// One subscription and one place a fan-out is chosen, so a new family is a
// publish call rather than a Go file here. The frame is forwarded exactly as
// published: the subject says who receives it, and nothing in the body is read
// to decide that.
func (s *Server) subscribeToAudienceMessages() {
	ctx := context.Background()
	if s.Stack == nil || s.Stack.NATS == nil {
		return
	}

	stop, err := eipnats.SubscribeAudience(s.Stack.NATS, func(msg eipnats.AudienceMessage) {
		recipients, routed := s.deliverToAudience(msg)
		if !routed {
			logs.WarnCtx(ctx, "audience message: no fan-out for audience",
				"component", "websocket",
				"audience", string(msg.Audience),
				"subtype", msg.Subtype)
			return
		}
		if recipients == 0 {
			return
		}
		logs.DebugCtx(ctx, "audience message delivered",
			"component", "websocket",
			"audience", string(msg.Audience),
			"subtype", msg.Subtype,
			"recipients", recipients)
	})
	if err != nil {
		logs.ErrorCtx(ctx, "audience messages: subscribe", "component", "websocket", "error", err)
		return
	}

	go func() {
		<-s.shutdownChan
		stop()
	}()
}

// deliverToAudience turns an audience into a set of sockets, reporting how many
// took the message and whether the audience named a fan-out at all.
//
// An audience this build cannot route is reported rather than treated as an
// empty delivery, which would read in the logs as a message nobody was
// connected for.
func (s *Server) deliverToAudience(msg eipnats.AudienceMessage) (recipients int, routed bool) {
	switch msg.Audience {
	case eipnats.AudienceEveryone:
		return s.broadcastRawToEveryClient(msg.Payload), true
	case eipnats.AudienceSubscribers:
		return s.broadcastRawToSubscribers(msg.Target, msg.Payload), true
	default:
		return 0, false
	}
}

// broadcastRawToEveryClient queues a pre-marshaled frame to every local socket
// and returns how many took it.
//
// Unlike the owner fan-out below this one checks nothing about who is listening,
// because the message belongs to nobody: an announcement on this audience is the
// same for every client and a signed-out one reads it too. A client whose send
// buffer is full is skipped rather than waited for — blocking the fan-out on one
// stalled socket would cost every other client its news.
func (s *Server) broadcastRawToEveryClient(data []byte) int {
	if s == nil || len(data) == 0 {
		return 0
	}
	s.ClientsMu.RLock()
	defer s.ClientsMu.RUnlock()

	sent := 0
	for _, client := range s.Clients {
		if client == nil {
			continue
		}
		if outgoinglogic.TrySendNonBlocking(client.Send, data) {
			sent++
		}
	}
	return sent
}

// broadcastRawToSubscribers queues a pre-marshaled frame to every connection
// working in the owner the key names.
//
// Holding the owner in scopes is the whole rule, as it is for that owner's
// documents. An account is reached through its own connection index rather than
// the owner pools, which do not carry an account's own key — see pooledScopes.
//
// Nothing is suppressed: these frames name no originating connection, so every
// subscriber is a recipient including whichever one caused the message.
func (s *Server) broadcastRawToSubscribers(ownerKey string, data []byte) int {
	if s == nil || len(data) == 0 {
		return 0
	}
	owner, err := models.ParseOwnerKey(ownerKey)
	if err != nil {
		return 0
	}
	if owner.Kind == models.OwnerAccount {
		return s.broadcastRawToAccount("audience", owner.ID, data, "").RecipientCount
	}

	clientIDs := s.clientsForOwner(owner)
	if len(clientIDs) == 0 {
		return 0
	}

	sent := 0
	s.ClientsMu.RLock()
	defer s.ClientsMu.RUnlock()
	for _, clientID := range clientIDs {
		client, ok := s.Clients[clientID]
		if !ok || !client.Scopes.Has(owner) {
			continue
		}
		if outgoinglogic.TrySendNonBlocking(client.Send, data) {
			sent++
		}
	}
	return sent
}
