package indexing

import (
	"context"
	"fmt"

	"go.mongodb.org/mongo-driver/mongo"
)

// EnsureIndexes ensures all application MongoDB indexes exist. Call once after connecting a client
// (any binary that relies on these collections). Safe to run repeatedly; register more index
// ensures here as you add them.
func EnsureIndexes(ctx context.Context, client *mongo.Client) error {
	if client == nil {
		return fmt.Errorf("mongo client is nil")
	}
	if err := EnsureArchivedJobsIndexes(ctx, client); err != nil {
		return err
	}
	if err := EnsureUserAccountDocumentsIndexes(ctx, client); err != nil {
		return err
	}
	if err := EnsureUserJobGroupsIndexes(ctx, client); err != nil {
		return err
	}
	if err := EnsureUserWatchlistDeprecatedIndexes(ctx, client); err != nil {
		return err
	}
	if err := EnsureUserJobDocumentsIndexes(ctx, client); err != nil {
		return err
	}
	return nil
}
