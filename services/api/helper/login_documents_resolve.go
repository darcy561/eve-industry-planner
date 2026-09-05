package helper

import (
	"context"
	"errors"
	"fmt"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

type LoginDocumentsResolution struct {
	User       models.UserAccountDocument
	Settings   models.ApplicationSettings
	FirstLogin bool
}

func ResolveUserDocumentsForLogin(ctx context.Context, mongo *eipmongo.Mongo, accountID string) (*LoginDocumentsResolution, error) {
	if mongo == nil {
		return nil, errors.New("mongo handle is nil")
	}
	if accountID == "" {
		return nil, errors.New("accountID is required")
	}

	now := time.Now().UTC()

	userDoc, userErr := mongo.LoadUserAccount(ctx, accountID)
	userExists := userErr == nil
	if userErr != nil && !errors.Is(userErr, mongodriver.ErrNoDocuments) {
		return nil, fmt.Errorf("load user document: %w", userErr)
	}
	settingsDoc, settingsErr := mongo.LoadApplicationSettings(ctx, accountID, now)
	settingsExist := settingsErr == nil
	if settingsErr != nil && !errors.Is(settingsErr, mongodriver.ErrNoDocuments) {
		return nil, fmt.Errorf("load application settings document: %w", settingsErr)
	}
	firstLogin := !userExists

	if !userExists && settingsExist {
		logs.WarnCtx(ctx, "application settings without user document; creating default user row", "account_id", accountID)
	}
	if !userExists {
		userDoc = models.DefaultUserAccountDocument(accountID, now)
		if _, _, err := mongo.Users.UpsertUserAccount(ctx, accountID, userDoc); err != nil {
			return nil, fmt.Errorf("create default user document: %w", err)
		}
	}
	if !settingsExist {
		settingsDoc = models.DefaultApplicationSettings(accountID, now)
		if _, _, err := mongo.ApplicationSettings.UpsertApplicationSettings(ctx, accountID, settingsDoc); err != nil {
			return nil, fmt.Errorf("create default application settings: %w", err)
		}
	}
	if err := updateUserLastLoginMetadata(ctx, mongo, accountID, now); err != nil {
		return nil, err
	}
	userDoc.MetaData.LastLoginAt = now
	userDoc.MetaData.LastModified = now
	return &LoginDocumentsResolution{User: userDoc, Settings: settingsDoc, FirstLogin: firstLogin}, nil
}

func updateUserLastLoginMetadata(ctx context.Context, mongo *eipmongo.Mongo, accountID string, at time.Time) error {
	if mongo == nil || accountID == "" {
		return fmt.Errorf("updateUserLastLoginMetadata: invalid args")
	}
	usersCol := mongo.Users.Collection()
	if usersCol == nil {
		return fmt.Errorf("updateUserLastLoginMetadata: users collection unavailable")
	}
	setDoc := bson.M{"_meta.lastLoginAt": at, "_meta.lastModified": at}
	return eipmongo.Retry(ctx, fmt.Sprintf("touch last login %s", accountID), func() error {
		_, err := usersCol.UpdateOne(ctx, bson.M{eipmongo.FieldMetaOwnerKind: models.OwnerAccount, eipmongo.FieldMetaOwnerID: accountID, "_id": accountID}, bson.M{"$set": setDoc})
		return err
	})
}
