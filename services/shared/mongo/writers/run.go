package writers

import (
	"context"
	"fmt"

	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/mongo"
)

// RunOrdered runs bulk under [eipmongo.Retry], stopping at the first write that fails; opName
// labels the retry logs.
func RunOrdered(ctx context.Context, opName string, bulk *eipmongo.ClientBulk) (*mongo.ClientBulkWriteResult, error) {
	if bulk == nil {
		return nil, fmt.Errorf("client bulk is required")
	}
	if opName == "" {
		opName = "mongo writers bulk"
	}
	return eipmongo.RetryValue(ctx, opName, func() (*mongo.ClientBulkWriteResult, error) {
		return bulk.RunOrdered(ctx)
	})
}
