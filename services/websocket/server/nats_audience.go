package server

import (
	"context"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipnats "eve-industry-planner/shared/nats"
)

// subscribeToAudienceMessages is the delivery path for every message that names
// its own recipients, whatever family it belongs to.
//
// One subscription and one place a fan-out is chosen, so a new family is a
// publish call rather than a Go file here.
func (s *Server) subscribeToAudienceMessages() {
	ctx := context.Background()
	if s.Stack == nil || s.Stack.NATS == nil {
		return
	}

	stop, err := eipnats.SubscribeAudience(s.Stack.NATS, func(msg eipnats.AudienceMessage) {
		outcome := s.deliverOutbound(audienceOutbound(msg))
		if outcome.Undeliverable != "" {
			logs.WarnCtx(ctx, "audience message: nothing can deliver it",
				"component", "websocket",
				"reason", outcome.Undeliverable,
				"family", msg.Family,
				"audience", string(msg.Audience),
				"subtype", msg.Subtype)
			return
		}
		if outcome.RecipientCount == 0 {
			return
		}
		logs.DebugCtx(ctx, "audience message delivered",
			"component", "websocket",
			"family", msg.Family,
			"audience", string(msg.Audience),
			"subtype", msg.Subtype,
			"recipients", outcome.RecipientCount)
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

// audienceOutbound converts a message that arrived already addressed.
//
// The frame is carried across untouched: its producer built what the browser
// reads, and this service has no file that knows what any of these families
// mean. A target that names no owner leaves the zero owner, which addresses
// nobody rather than a shared bucket.
//
// Only an audience a producer may name is taken from the wire. The audiences an
// adapter picks for itself are not addressable by publishing, so an unrecognised
// one leaves the zero audience and the walk reports that nothing could carry the
// message.
func audienceOutbound(msg eipnats.AudienceMessage) Outbound {
	out := Outbound{Family: msg.Family, Subtype: msg.Subtype, Frame: msg.Payload}
	switch msg.Audience {
	case eipnats.AudienceEveryone:
		out.Audience = msg.Audience
	case eipnats.AudienceSubscribers:
		out.Audience = msg.Audience
		if owner, err := models.ParseOwnerKey(msg.Target); err == nil {
			out.Target = owner
		}
	}
	return out
}
