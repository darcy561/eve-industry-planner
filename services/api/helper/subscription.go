package helper

import (
	"context"
	"encoding/json"
	"fmt"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"

	"github.com/nats-io/nats.go/jetstream"
)

// PublishSubscriptionRequest publishes a subscription request to NATS
// Subject format: doc.subscribe.{accountID}
// Message body: {"collection": "users|jobs", "docIDs": ["doc1", "doc2", ...]}
func PublishSubscriptionRequest(ctx context.Context, js jetstream.JetStream, accountID string, collection string, docIDs []string) error {
	if js == nil {
		return fmt.Errorf("JetStream not available")
	}
	if accountID == "" {
		return fmt.Errorf("accountID is required")
	}
	if collection == "" {
		return fmt.Errorf("collection is required")
	}
	if len(docIDs) == 0 {
		return fmt.Errorf("at least one docID is required")
	}

	// Create subscription request message
	request := natscore.SubscriptionRequest{
		Collection: collection,
		DocIDs:     docIDs,
	}

	// Marshal to JSON
	msgData, err := json.Marshal(request)
	if err != nil {
		return fmt.Errorf("failed to marshal subscription request: %w", err)
	}

	// Construct subject: doc.subscribe.{accountID}
	subject := fmt.Sprintf("%s.%s", natscore.SubjectDocSubscribe, accountID)

	// Publish to NATS using helper function (includes retry logic)
	err = natscore.PublishMessage(ctx, js, subject, msgData)
	if err != nil {
		return fmt.Errorf("failed to publish subscription request: %w", err)
	}

	logs.DebugCtx(ctx, "published subscription request",
		"account_id", accountID,
		"collection", collection,
		"doc_count", len(docIDs),
		"subject", subject)

	return nil
}
