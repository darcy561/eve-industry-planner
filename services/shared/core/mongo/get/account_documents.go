package mongoget

import (
	"context"
	"fmt"
	"time"

	mongoput "eve-industry-planner/shared/core/mongo/put"
	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

func LoadUserAccountDocument(ctx context.Context, usersCol *mongo.Collection, accountID string) (models.UserAccountDocument, error) {
	if usersCol == nil || accountID == "" {
		return models.UserAccountDocument{}, fmt.Errorf("LoadUserAccountDocument: invalid arguments")
	}
	var doc models.UserAccountDocument
	retryCfg := defaultRetryConfig(fmt.Sprintf("load user document %s", accountID))
	if err := retryMongoOperation(ctx, retryCfg, func() error {
		return usersCol.FindOne(ctx, bson.M{"_id": accountID, "_meta.accountID": accountID}).Decode(&doc)
	}); err != nil {
		return models.UserAccountDocument{}, err
	}
	beforeSchemaVersion := doc.SchemaVersion
	models.UpgradeUserAccountDocument(&doc)
	if beforeSchemaVersion != doc.SchemaVersion {
		if _, _, err := mongoput.UpsertUserAccountDocument(ctx, usersCol, accountID, doc); err != nil {
			return models.UserAccountDocument{}, fmt.Errorf("persist upgraded user document: %w", err)
		}
	}
	return doc, nil
}

func LoadApplicationSettingsDocument(ctx context.Context, settingsCol *mongo.Collection, accountID string, now time.Time) (models.ApplicationSettings, error) {
	if settingsCol == nil || accountID == "" {
		return models.ApplicationSettings{}, fmt.Errorf("LoadApplicationSettingsDocument: invalid arguments")
	}
	var doc models.ApplicationSettings
	retryCfg := defaultRetryConfig(fmt.Sprintf("load application settings %s", accountID))
	if err := retryMongoOperation(ctx, retryCfg, func() error {
		return settingsCol.FindOne(ctx, bson.M{"_id": accountID, "_meta.accountID": accountID}).Decode(&doc)
	}); err != nil {
		return models.ApplicationSettings{}, err
	}
	beforeSchemaVersion := doc.SchemaVersion
	models.UpgradeApplicationSettings(&doc, accountID, now)
	if beforeSchemaVersion != doc.SchemaVersion {
		if _, _, err := mongoput.UpsertApplicationSettingsDocument(ctx, settingsCol, accountID, doc); err != nil {
			return models.ApplicationSettings{}, fmt.Errorf("persist upgraded application settings: %w", err)
		}
	}
	return doc, nil
}
