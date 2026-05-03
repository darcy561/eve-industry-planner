package indexing

import (
	"context"

	"go.mongodb.org/mongo-driver/mongo"
)

// EnsureCitadelNamesIndexes is a no-op: citadel_names uses only _id and payload fields.
// If an older deployment created a lastSeenAt index, drop it manually when convenient.
func EnsureCitadelNamesIndexes(ctx context.Context, client *mongo.Client) error {
	_ = ctx
	_ = client
	return nil
}
