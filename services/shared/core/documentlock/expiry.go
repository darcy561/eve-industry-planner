package documentlock

import (
	"context"
	"errors"
	"strings"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
)

// RunExpirySubscriber listens for Redis TTL expirations on doc-lock keys and drives the waitlist
// promotion / `document_lock_expired` fan-out.
func RunExpirySubscriber(ctx context.Context, d Deps) error {
	if d.Redis.Driver() == nil || d.NATS == nil {
		return nil
	}

	sub, err := d.Redis.SubscribePattern(ctx, "__keyevent@*__:expired")
	if err != nil {
		return err
	}
	defer func() { _ = sub.Close() }()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case payload, ok := <-sub.Payloads():
			if !ok {
				if err := ctx.Err(); err != nil {
					return err
				}
				return errors.New("doclock expiry: pubsub channel closed")
			}
			handleExpiryMessage(ctx, d, payload)
		}
	}
}

// handleExpiryMessage processes one keyspace-notification payload. Extracted
// so we can keep `RunExpirySubscriber` a tight select loop.
func handleExpiryMessage(ctx context.Context, d Deps, rawKey string) {
	key := strings.TrimSpace(rawKey)
	if key == "" {
		return
	}
	owner, collection, docID, parsed := ParseExpiredLockKey(key)
	if !parsed {
		return
	}

	newHolder, exp, promoted, promoteErr := promoteWaitlistHeadOnExpiry(ctx, d, owner, collection, docID)
	if promoteErr != nil {
		logs.WarnCtx(ctx, "doc lock expiry: waitlist promotion failed",
			"error", promoteErr,
			"owner_key", owner.Key(),
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
			"docID":             docID,
			"reason":            LockExpiryReasonTTL,
		}
	}

	if err := PublishLockEvent(ctx, d.NATS, owner, payload); err != nil {
		logs.WarnCtx(ctx, "doc lock expiry: publish failed",
			"error", err,
			"owner_key", owner.Key(),
			"promoted", promoted,
		)
	} else {
		logs.DebugCtx(ctx, "doc lock expiry processed",
			"owner_key", owner.Key(),
			"collection", collection,
			"doc_id", docID,
			"promoted", promoted,
		)
	}

	if promoted {
		StripPassiveViewerOnHolderGrant(ctx, d, owner, collection, docID, newHolder, true)
	}
}

func promoteWaitlistHeadOnExpiry(
	ctx context.Context,
	d Deps,
	owner models.Owner, collection, docID string,
) (newHolder string, expiresAtUnix int64, promoted bool, err error) {
	if d.Redis.Driver() == nil {
		return "", 0, false, nil
	}
	head, rec, ok, err := PromoteWaitlistHead(ctx, d.Redis, owner, collection, docID)
	if err != nil {
		return "", 0, false, err
	}
	if !ok {
		return "", 0, false, nil
	}
	return head, rec.ExpiresAtUnix, true, nil
}
