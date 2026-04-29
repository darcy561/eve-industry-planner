package mongoget

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/shared/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

func LoadUserAccountDocument(ctx context.Context, usersCol *mongo.Collection, accountID string) (models.UserAccountDocument, bool, error) {
	if usersCol == nil || accountID == "" {
		return models.UserAccountDocument{}, false, fmt.Errorf("LoadUserAccountDocument: invalid arguments")
	}
	var doc models.UserAccountDocument
	retryCfg := defaultRetryConfig(fmt.Sprintf("load user document %s", accountID))
	if err := retryMongoOperation(ctx, retryCfg, func() error {
		return usersCol.FindOne(ctx, bson.M{"_id": accountID, "_meta.accountID": accountID}).Decode(&doc)
	}); err != nil {
		return models.UserAccountDocument{}, false, err
	}
	before := doc
	models.UpgradeUserAccountDocument(&doc)
	upgraded := before.SchemaVersion != doc.SchemaVersion ||
		before.HasCompletedFirstLoginFlow != doc.HasCompletedFirstLoginFlow
	return doc, upgraded, nil
}

func LoadApplicationSettingsDocument(ctx context.Context, settingsCol *mongo.Collection, accountID string, now time.Time) (models.ApplicationSettings, bool, error) {
	if settingsCol == nil || accountID == "" {
		return models.ApplicationSettings{}, false, fmt.Errorf("LoadApplicationSettingsDocument: invalid arguments")
	}
	var doc models.ApplicationSettings
	retryCfg := defaultRetryConfig(fmt.Sprintf("load application settings %s", accountID))
	if err := retryMongoOperation(ctx, retryCfg, func() error {
		return settingsCol.FindOne(ctx, bson.M{"_id": accountID, "_meta.accountID": accountID}).Decode(&doc)
	}); err != nil {
		return models.ApplicationSettings{}, false, err
	}
	beforeSchemaVersion := doc.SchemaVersion
	models.UpgradeApplicationSettings(&doc, accountID, now)
	upgraded := beforeSchemaVersion != doc.SchemaVersion
	return doc, upgraded, nil
}
