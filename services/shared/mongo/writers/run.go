package writers

import (
	"context"
	"fmt"

	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/mongo"
)

// RunOrdered executes bulk with ordered=true under [eipmongo.Retry].
// opName is for retry logs only.
func RunOrdered(ctx context.Context, opName string, bulk *eipmongo.ClientBulk) (*mongo.ClientBulkWriteResult, error) {
	return run(ctx, opName, bulk, true)
}

// RunUnordered executes bulk with ordered=false under [eipmongo.Retry].
func RunUnordered(ctx context.Context, opName string, bulk *eipmongo.ClientBulk) (*mongo.ClientBulkWriteResult, error) {
	return run(ctx, opName, bulk, false)
}

func run(ctx context.Context, opName string, bulk *eipmongo.ClientBulk, ordered bool) (*mongo.ClientBulkWriteResult, error) {
	if bulk == nil {
		return nil, fmt.Errorf("client bulk is required")
	}
	if opName == "" {
		opName = "mongo writers bulk"
	}
	var result *mongo.ClientBulkWriteResult
	err := eipmongo.Retry(ctx, opName, func() error {
		var runErr error
		if ordered {
			result, runErr = bulk.RunOrdered(ctx)
		} else {
			result, runErr = bulk.RunUnordered(ctx)
		}
		return runErr
	})
	return result, err
}
