package mongo

import (
	"context"
	"fmt"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// LoadWatchlistDeprecated loads the deprecated watchlist document by account _id.
func (d *Docs) LoadWatchlistDeprecated(ctx context.Context, accountID string) (bson.M, error) {
	if accountID == "" {
		return nil, fmt.Errorf("LoadWatchlistDeprecated: invalid arguments")
	}
	return findOne[bson.M](ctx, d, "LoadWatchlistDeprecated", AccountDocumentFilter(accountID))
}
