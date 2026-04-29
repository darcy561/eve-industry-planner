package mongoput

import (
	"context"
	"fmt"

	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/shared/models"

	"go.mongodb.org/mongo-driver/mongo"
)

// UpsertUserAccountDocument writes users with _meta-preserving upsert.
// If wsClientID is present and the first write fails, it retries once with empty _meta.clientID.
func UpsertUserAccountDocument(ctx context.Context, collection *mongo.Collection, accountID string, doc models.UserAccountDocument) (result *mongo.UpdateResult, retriedWithoutWSClientID bool, err error) {
	if collection == nil || accountID == "" {
		return nil, false, fmt.Errorf("UpsertUserAccountDocument: invalid arguments")
	}
	doUpsert := func(d models.UserAccountDocument) (*mongo.UpdateResult, error) {
		return mongocore.UpsertStructByIDPreservingMetaWithRetry(
			ctx,
			collection,
			d,
			accountID,
			fmt.Sprintf("update user document %s", accountID),
		)
	}
	return upsertWithWSClientIDRetry(
		doc,
		doUpsert,
		func(d *models.UserAccountDocument) bool {
			if d.MetaData.ClientID == "" {
				return false
			}
			d.MetaData.ClientID = ""
			return true
		},
	)
}
