package mongo

import (
	"context"
	"fmt"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// LoadWatchlistDeprecated loads the deprecated watchlist document by account _id.
func (d *Docs) LoadWatchlistDeprecated(ctx context.Context, accountID string) (bson.M, error) {
	coll, err := d.requireColl()
	if err != nil || accountID == "" {
		return nil, fmt.Errorf("LoadWatchlistDeprecated: invalid arguments")
	}
	var raw bson.M
	if err := Retry(ctx, "LoadWatchlistDeprecated", func() error {
		return coll.FindOne(ctx, bson.M{"_id": accountID}).Decode(&raw)
	}); err != nil {
		return nil, err
	}
	return raw, nil
}
