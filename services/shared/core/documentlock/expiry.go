package documentlock

import (
	"context"
	"strings"

	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/logs"
)

// StartExpirySubscriber listens for Redis TTL expirations on v2 doc-lock keys.
func StartExpirySubscriber(ctx context.Context, d Deps) {
	if d.Redis == nil || d.JetStream == nil {
		return
	}
	go runExpirySubscriberLoop(ctx, d)
}

func runExpirySubscriberLoop(ctx context.Context, d Deps) {
	rdb := d.Redis

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

			newHolder, exp, promoted, promoteErr := promoteWaitlistHeadOnExpiry(ctx, d, accountID, collection, docID)
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
				payload = BuildHandoffCompletedPayload(
					collection,
					docID,
					newHolder,
					exp,
					HandoffCompletedOpts{Reason: LockHandoffReasonTTLPromotion},
				)
			} else {
				payload = map[string]any{
					LockPayloadEventKey: LockEventExpired,
					"collection":        collection,
					"docID":      docID,
					"reason":     LockExpiryReasonTTL,
				}
			}

			if err := PublishLockEvent(ctx, d.JetStream, accountID, payload); err != nil {
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

			if promoted && collection == mongocore.CollectionUserJobGroups {
				ReleaseStaleDependentJobLocksAfterGroupGrant(ctx, d, accountID, docID, newHolder)
			}
		}
	}
}

func promoteWaitlistHeadOnExpiry(
	ctx context.Context,
	d Deps,
	accountID, collection, docID string,
) (newHolder string, expiresAtUnix int64, promoted bool, err error) {
	if d.Redis == nil {
		return "", 0, false, nil
	}
	head, rec, ok, err := PromoteWaitlistHead(ctx, d.Redis, accountID, collection, docID)
	if err != nil {
		return "", 0, false, err
	}
	if !ok {
		return "", 0, false, nil
	}
	return head, rec.ExpiresAtUnix, true, nil
}
