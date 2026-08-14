package documentlock

import (
	"context"
	"errors"
	"strings"

	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/logs"
)

// RunExpirySubscriber listens for Redis TTL expirations on doc-lock keys
// and drives the waitlist promotion / `document_lock_expired` fan-out.
//
// This is a **singleton** workload — only one process should drive it at a
// time. We host it in the `core` service (which is structurally a singleton
// via docker-compose `container_name`) and gate the loop behind a Redis
// lease so rolling-deploy overlap and (future) multi-replica scenarios
// can't produce duplicate events.
//
// The function blocks until ctx is cancelled or PSubscribe returns an
// unrecoverable error. Callers integrating with `redis/lease.RunWhileHeld`
// should pass this directly as the `fn` callback — the scoped context
// passed in will be cancelled when the lease is lost, which closes the
// PSubscribe channel and returns cleanly.
//
// The Service deps must include Redis + JetStream; without either the
// function returns a nil error immediately (caller logs it once on startup).
func RunExpirySubscriber(ctx context.Context, d Deps) error {
	if d.Redis == nil || d.JetStream == nil {
		return nil
	}

	rdb := d.Redis

	pubsub := rdb.PSubscribe(ctx, "__keyevent@*__:expired")
	defer func() { _ = pubsub.Close() }()

	ch := pubsub.Channel()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case msg, ok := <-ch:
			if !ok {
				if err := ctx.Err(); err != nil {
					return err
				}
				return errors.New("doclock expiry: pubsub channel closed")
			}
			if msg == nil {
				continue
			}
			handleExpiryMessage(ctx, d, msg.Payload)
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
	accountID, collection, docID, parsed := ParseExpiredLockKey(key)
	if !parsed {
		return
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
			"docID":             docID,
			"reason":            LockExpiryReasonTTL,
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

	if promoted {
		StripPassiveViewerOnHolderGrant(ctx, d, accountID, collection, docID, newHolder, true)
		if collection == eipmongo.CollectionUserJobGroups {
			ReleaseStaleDependentJobLocksAfterGroupGrant(ctx, d, accountID, docID, newHolder)
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
