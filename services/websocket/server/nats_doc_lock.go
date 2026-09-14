package server

import (
	"context"
	"strings"

	"eve-industry-planner/shared/container"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/websocket/server/natslogic"

	"github.com/nats-io/nats.go/jetstream"
)

// subscribeToDocLockNotifications delivers API-published lock events to the tabs
// working in the account the subject names.
func (s *Server) subscribeToDocLockNotifications() {
	ctx := context.Background()
	if s.Stack == nil || s.Stack.NATS.JS() == nil {
		return
	}
	stream, err := s.Stack.NATS.DocUpdate.Ensure(ctx)
	if err != nil {
		logs.ErrorCtx(ctx, "doc lock: ensure stream", "error", err)
		return
	}
	s.fanoutFilterMu.Lock()
	s.fanoutStream = stream
	s.fanoutFilterMu.Unlock()

	docLockDurable, consumerConfig := natslogic.DocLockConsumerConfig()

	processor := eipnats.Handle("websocket/nats", "nats.doc_lock_notification",
		func(ctx context.Context, msg jetstream.Msg) error {
			subject := msg.Subject()
			accountID, err := eipnats.ExtractIDFromSubject(subject, eipnats.SubjectDocLock)
			if err != nil {
				return eipnats.Terminate("bad subject %s: %v", subject, err)
			}
			wire, suppressSessionID, err := natslogic.BuildDocumentLockWire(msg.Data())
			if err != nil {
				return eipnats.Terminate("unreadable lock payload on %s: %v", subject, err)
			}

			outcome := s.deliverDocumentLock(accountID, wire, suppressSessionID)
			finishReplicaFanoutOperation(ctx, "doc lock notification", "", subject, outcome, nil)
			return nil
		})

	if _, err := s.Stack.NATS.DocUpdate.Subscribe(ctx, consumerConfig, processor,
		eipnats.WithStopChannel(s.intakeStopChan)); err != nil {
		logs.ErrorCtx(ctx, "doc lock: subscribe", "error", err)
		return
	}

	s.reconcileDocFanoutFilters(ctx)

	logs.DebugCtx(ctx, "subscribed to doc.lock notifications",
		"consumer", docLockDurable,
		"container_id", container.ID())
}

// deliverDocumentLock addresses a lock event to the tabs working in an account.
//
// The source is a session rather than a tab: a viewer join or leave is one fact
// about a whole session, and the id the payload carries is the JWT session id
// every tab of it shares.
func (s *Server) deliverDocumentLock(accountID string, wire []byte, suppressSessionID string) outboundDeliveryOutcome {
	return s.deliverOutbound(Outbound{
		Family:   eipnats.ClientMessageDocumentLock,
		Audience: eipnats.AudienceSubscribers,
		Target:   models.Owner{Kind: models.OwnerAccount, ID: accountID},
		Source:   Source{SessionID: strings.TrimSpace(suppressSessionID)},
		Frame:    wire,
	})
}
