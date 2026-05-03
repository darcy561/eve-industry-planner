package helper

import (
	"context"
	"errors"
	"fmt"
	"time"

	mongocore "eve-industry-planner/shared/core/mongo"
	mongoget "eve-industry-planner/shared/core/mongo/get"
	mongoput "eve-industry-planner/shared/core/mongo/put"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

type LoginDocumentsResolution struct {
	User       models.UserAccountDocument
	Settings   models.ApplicationSettings
	FirstLogin bool
}

func ResolveUserDocumentsForLogin(ctx context.Context, dbClient *mongo.Client, accountID string) (*LoginDocumentsResolution, error) {
	if dbClient == nil {
		return nil, errors.New("mongo client is nil")
	}
	if accountID == "" {
		return nil, errors.New("accountID is required")
	}

	now := time.Now().UTC()
	db := dbClient.Database(mongocore.DatabaseName)
	usersCol := db.Collection(mongocore.CollectionUsers)
	settingsCol := db.Collection(mongocore.CollectionApplicationSettings)

	userDoc, userErr := mongoget.LoadUserAccountDocument(ctx, usersCol, accountID)
	userExists := userErr == nil
	if userErr != nil && !errors.Is(userErr, mongo.ErrNoDocuments) {
		return nil, fmt.Errorf("load user document: %w", userErr)
	}
	settingsDoc, settingsErr := mongoget.LoadApplicationSettingsDocument(ctx, settingsCol, accountID, now)
	settingsExist := settingsErr == nil
	if settingsErr != nil && !errors.Is(settingsErr, mongo.ErrNoDocuments) {
		return nil, fmt.Errorf("load application settings document: %w", settingsErr)
	}
	firstLogin := !userExists

	if !userExists && settingsExist {
		logs.WarnCtx(ctx, "application settings without user document; creating default user row", "account_id", accountID)
	}
	if !userExists {
		userDoc = models.DefaultUserAccountDocument(accountID, now)
		if _, _, err := mongoput.UpsertUserAccountDocument(ctx, usersCol, accountID, userDoc); err != nil {
			return nil, fmt.Errorf("create default user document: %w", err)
		}
	}
	if !settingsExist {
		settingsDoc = models.DefaultApplicationSettings(accountID, now)
		if _, _, err := mongoput.UpsertApplicationSettingsDocument(ctx, settingsCol, accountID, settingsDoc); err != nil {
			return nil, fmt.Errorf("create default application settings: %w", err)
		}
	}
	if err := updateUserLastLoginMetadata(ctx, usersCol, accountID, now); err != nil {
		return nil, err
	}
	userDoc.MetaData.LastLoginAt = now
	userDoc.MetaData.LastModified = now
	return &LoginDocumentsResolution{User: userDoc, Settings: settingsDoc, FirstLogin: firstLogin}, nil
}

func updateUserLastLoginMetadata(ctx context.Context, usersCol *mongo.Collection, accountID string, at time.Time) error {
	if usersCol == nil || accountID == "" {
		return fmt.Errorf("updateUserLastLoginMetadata: invalid args")
	}
	setDoc := bson.M{"_meta.lastLoginAt": at, "_meta.lastModified": at}
	retryCfg := mongocore.DefaultRetryConfig()
	retryCfg.OperationName = fmt.Sprintf("touch last login %s", accountID)
	return mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
		_, err := usersCol.UpdateOne(ctx, bson.M{"_id": accountID, "_meta.accountID": accountID}, bson.M{"$set": setDoc})
		return err
	})
}
