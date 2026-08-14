package mongo

import (
	"context"
	"fmt"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/mongo"
)

// UpsertApplicationSettings writes application_settings with _meta-preserving upsert.
func (d *Docs) UpsertApplicationSettings(ctx context.Context, accountID string, doc models.ApplicationSettings) (*mongo.UpdateResult, bool, error) {
	if _, err := d.requireColl(); err != nil || accountID == "" {
		return nil, false, fmt.Errorf("UpsertApplicationSettings: invalid arguments")
	}
	doUpsert := func(sd models.ApplicationSettings) (*mongo.UpdateResult, error) {
		return d.UpsertStructPreservingMetaRetry(ctx, sd, accountID)
	}
	return upsertWithWSClientIDRetry(
		doc,
		doUpsert,
		func(sd *models.ApplicationSettings) bool {
			if sd.MetaData.ClientID == "" {
				return false
			}
			sd.MetaData.ClientID = ""
			return true
		},
	)
}
