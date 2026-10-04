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
	meta := models.MetaData{Owner: models.AccountOwner(accountID), LastModified: now}
	ApplyMetaSessionClient(&meta, sessionID, wsClientID)
	doc := bson.M{
		"_id":                accountID,
		"groups":             groups,
		"items":              items,
		models.MetaFieldName: meta,
	}
	return RetryValue(ctx, "UpsertWatchlistDeprecated", func() (*mongo.UpdateResult, error) {
		return coll.ReplaceOne(ctx, bson.M{"_id": accountID}, doc, options.Replace().SetUpsert(true))
	})
}
