package documentlocks

import (
	"context"
	"strings"

	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
)

// LockExpiryReasonTTL tags TTL-driven `document_lock_expired` events.
const LockExpiryReasonTTL = "ttl"

// LockHandoffReasonTTLPromotion tags `document_lock_handoff_completed` events
// that originate from the expiry subscriber promoting the waitlist head when
// the lease TTL fires — distinguishes them from interactive claim-handoff.
const LockHandoffReasonTTLPromotion = "ttl_promotion"

// StartExpirySubscriber listens for Redis TTL expirations on v2 doc-lock keys.
// When a lease expires it either promotes an alive waitlist head into the lock
// (publishing `document_lock_handoff_completed`) or publishes
// `document_lock_expired` so clients can resync (requires Redis notify-keyspace-events Ex).
func StartExpirySubscriber(ctx context.Context, clients *shared.ServiceClients) {
	if clients == nil || clients.Redis == nil || clients.JetStream == nil {
		return
	}
	go runExpirySubscriberLoop(ctx, clients)
}

func runExpirySubscriberLoop(ctx context.Context, clients *shared.ServiceClients) {
	rdb := clients.Redis

	pubsub := rdb.PSubscribe(ctx, "__keyevent@*__:expired")
	defer func() { _ = pubsub.Close() }()

	ch := pubsub.Channel()

	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			if msg == nil {
				continue
			}
			key := strings.TrimSpace(msg.Payload)
			if key == "" {
				continue
			}
			accountID, collection, docID, parsed := ParseExpiredLockKey(key)
			if !parsed {
				continue
			}

			// Honour fairness: if a session is already waiting in line to edit, give
			// the lock to them now rather than letting the former holder race the
			// expired-event handler to re-acquire. Only triggers when waitlist has
			// an alive head; otherwise we fall through to the expired event below.
			newHolder, exp, promoted, promoteErr := promoteWaitlistHeadOnExpiry(
				ctx, clients, accountID, collection, docID,
			)
			if promoteErr != nil {
				logs.WarnCtx(ctx, "doc lock expiry: waitlist promotion failed",
					"error", promoteErr,
					"account_id", accountID,
					"collection", collection,
					"doc_id", docID,
				)
			}

			var payload map[string]any
			if promoted {
				payload = buildHandoffCompletedPayload(
					collection,
					docID,
					newHolder,
					exp,
					HandoffCompletedOpts{Reason: LockHandoffReasonTTLPromotion},
				)
			} else {
				payload = map[string]any{
					"type":       LockEventExpired,
					"collection": collection,
					"docID":      docID,
					"reason":     LockExpiryReasonTTL,
				}
			}

			// Route through publishLockEvent so the payload always carries the
			// `accountID` field that handlers.go / cascade.go also inject —
			// keeps the wire shape uniform across every doc-lock publish path
			// even though the NATS subject already encodes the same id.
			if err := publishLockEvent(ctx, clients, accountID, payload); err != nil {
				logs.WarnCtx(ctx, "doc lock expiry: publish failed",
					"error", err,
					"account_id", accountID,
					"promoted", promoted,
				)
			} else {
				logs.DebugCtx(ctx, "doc lock expiry processed",
					"account_id", accountID,
					"collection", collection,
					"doc_id", docID,
					"promoted", promoted,
				)
			}

			// TTL-driven group rotations skip the manual-handoff cascade in
			// `handleClaimHandoff`, so per-job locks held by the dead holder would
			// linger until their own TTL fires — clear them now so the new group
			// holder's cards reflect the rotation immediately. We don't know the
			// previous holder's id (Redis already evicted the expired record), so
			// the cascade releases any per-job lock not aligned to `newHolder`.
			if promoted && collection == mongocore.CollectionUserJobGroups {
				ReleaseStaleDependentJobLocksAfterGroupGrant(
					ctx, clients, accountID, docID, newHolder,
				)
			}
		}
	}
}

// promoteWaitlistHeadOnExpiry tries to install the next live waitlist entry as
// the new lock holder. Returns the new holder's sessionID and the new TTL
// expiry when a promotion occurred; (zero, zero, false, nil) when there was no
// alive head and the caller should publish a regular `document_lock_expired`.
//
// Thin wrapper over `promoteWaitlistHead` (shared with /hand-over) that
// reshapes the return to the (sessionID, expiresAt, promoted, err) tuple the
// expiry loop wants to publish.
//
// Runs BEFORE the WS event is published so that any client `tryAcquire`
// triggered by the resulting expired/handoff_completed event will see the
// post-promotion lock state and respond consistently.
func promoteWaitlistHeadOnExpiry(
	ctx context.Context,
	clients *shared.ServiceClients,
	accountID, collection, docID string,
) (newHolder string, expiresAtUnix int64, promoted bool, err error) {
	if clients == nil || clients.Redis == nil {
		return "", 0, false, nil
	}
	head, rec, ok, err := promoteWaitlistHead(ctx, clients.Redis, accountID, collection, docID)
	if err != nil {
		return "", 0, false, err
	}
	if !ok {
		return "", 0, false, nil
	}
	return head, rec.ExpiresAtUnix, true, nil
}
