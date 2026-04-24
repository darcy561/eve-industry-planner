package documentlocks

import (
	"context"
	"strings"

	"eve-industry-planner/api/helper/doclock"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/logs"
)

// StartExpirySubscriber listens for Redis TTL expirations on v2 doc-lock keys and publishes
// document_lock_expired on JetStream so websocket clients can resync (requires Redis notify-keyspace-events Ex).
func StartExpirySubscriber(ctx context.Context, clients *shared.ServiceClients) {
	if clients == nil || clients.Redis == nil || clients.JetStream == nil {
		return
	}
	go runExpirySubscriberLoop(ctx, clients)
}

func runExpirySubscriberLoop(ctx context.Context, clients *shared.ServiceClients) {
	rdb := clients.Redis
	js := clients.JetStream

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
			err := doclock.PublishDocLockNotification(ctx, js, accountID, map[string]any{
				"type":       "document_lock_expired",
				"collection": collection,
				"docID":      docID,
				"reason":     "ttl",
			})
			if err != nil {
				logs.WarnCtx(ctx, "doc lock expiry: publish failed", "error", err, "account_id", accountID)
			} else {
				logs.DebugCtx(ctx, "doc lock expiry published", "account_id", accountID, "collection", collection, "doc_id", docID)
			}
		}
	}
}
