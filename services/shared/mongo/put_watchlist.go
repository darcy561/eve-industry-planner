package mongo

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// UpsertWatchlistDeprecated replace-upserts the watchlist document (mongo.WatchlistDeprecated).
func (d *Docs) UpsertWatchlistDeprecated(ctx context.Context, accountID string, groups any, items any, now time.Time, sessionID, wsClientID string) (*mongo.UpdateResult, error) {
	coll, err := d.requireColl()
	if err != nil || accountID == "" {
		return nil, fmt.Errorf("UpsertWatchlistDeprecated: invalid arguments")
	}
	meta := bson.M{
		models.MetaFieldOwner: models.AccountOwner(accountID),
		"lastModified":        now,
	}
	if sessionID != "" {
		meta["sessionID"] = sessionID
	}
	if wsClientID != "" {
		meta["clientID"] = wsClientID
	}
	doc := bson.M{
		"_id":    accountID,
		"groups": groups,
		"items":  items,
		"_meta":  meta,
	}
	var result *mongo.UpdateResult
	err = Retry(ctx, "UpsertWatchlistDeprecated", func() error {
		var opErr error
		result, opErr = coll.ReplaceOne(ctx, bson.M{"_id": accountID}, doc, options.Replace().SetUpsert(true))
		return opErr
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}
