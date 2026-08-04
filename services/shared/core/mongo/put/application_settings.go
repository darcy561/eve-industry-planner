package mongoput

import (
	"context"
	"fmt"

	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/mongo"
)

// UpsertApplicationSettingsDocument writes application_settings with _meta-preserving upsert.
// If wsClientID is present and the first write fails, it retries once with empty _meta.clientID.
func UpsertApplicationSettingsDocument(ctx context.Context, collection *mongo.Collection, accountID string, doc models.ApplicationSettings) (result *mongo.UpdateResult, retriedWithoutWSClientID bool, err error) {
	if collection == nil || accountID == "" {
		return nil, false, fmt.Errorf("UpsertApplicationSettingsDocument: invalid arguments")
	}
	doUpsert := func(d models.ApplicationSettings) (*mongo.UpdateResult, error) {
		return mongocore.UpsertStructByIDPreservingMetaWithRetry(
			ctx,
			collection,
			d,
			accountID,
			fmt.Sprintf("update application settings %s", accountID),
		)
	}
	return upsertWithWSClientIDRetry(
		doc,
		doUpsert,
		func(d *models.ApplicationSettings) bool {
			if d.MetaData.ClientID == "" {
				return false
			}
			d.MetaData.ClientID = ""
			return true
		},
	)
}
