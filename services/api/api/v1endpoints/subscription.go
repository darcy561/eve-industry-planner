package v1endpoints

import (
	"context"

	"eve-industry-planner/api/api/helper"

	"github.com/nats-io/nats.go/jetstream"
)

// publishSubscriptionRequest is a wrapper for backward compatibility
// Deprecated: Use helper.PublishSubscriptionRequest instead
func publishSubscriptionRequest(ctx context.Context, js jetstream.JetStream, accountID string, collection string, docIDs []string) error {
	return helper.PublishSubscriptionRequest(ctx, js, accountID, collection, docIDs)
}
