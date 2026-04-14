package mongo

import (
	"context"
	"errors"
	"fmt"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// UserLoginResolution is the outcome of ResolveUserDocumentsForLogin.
type UserLoginResolution struct {
	User       models.UserAccountDocument
	Settings   models.ApplicationSettings
	FirstLogin bool
}

// ResolveUserDocumentsForLogin loads or creates user + application_settings in Mongo for this account.
// Mongo is authoritative at login. Legacy Firestore user data is imported via the operator CLI
// (tasks importUserAccountsFromFirestore) and the migrateUserDocumentToMongo worker, not here.
func ResolveUserDocumentsForLogin(ctx context.Context, dbClient *mongo.Client, accountID string) (*UserLoginResolution, error) {
	if dbClient == nil {
		return nil, errors.New("mongo client is nil")
	}
	if accountID == "" {
		return nil, errors.New("accountID is required")
	}

	now := time.Now().UTC()
	db := dbClient.Database(DatabaseName)
	usersCol := db.Collection(CollectionUsers)
	settingsCol := db.Collection(CollectionApplicationSettings)

	userExists, err := DocumentExistsByID(ctx, usersCol, accountID, accountID)
	if err != nil {
		return nil, fmt.Errorf("check user document: %w", err)
	}
	settingsExist, err := DocumentExistsByID(ctx, settingsCol, accountID, accountID)
	if err != nil {
		return nil, fmt.Errorf("check application settings document: %w", err)
	}

	if userExists && settingsExist {
		return loadPairTouchAndReturn(ctx, usersCol, settingsCol, accountID, now, false)
	}

	if userExists && !settingsExist {
		settingsDoc := models.DefaultApplicationSettings(accountID, now)
		doc, convErr := StructToMongoDoc(settingsDoc, accountID)
		if convErr != nil {
			return nil, fmt.Errorf("default settings bson: %w", convErr)
		}
		insertCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		retryIns := DefaultRetryConfig()
		retryIns.OperationName = fmt.Sprintf("insert missing application settings %s", accountID)
		if err := RetryMongoOperation(insertCtx, retryIns, func() error {
			_, err := settingsCol.InsertOne(insertCtx, doc)
			return err
		}); err != nil {
			return nil, fmt.Errorf("insert missing application settings: %w", err)
		}
		return loadPairTouchAndReturn(ctx, usersCol, settingsCol, accountID, now, false)
	}

	if !userExists && settingsExist {
		logs.WarnCtx(ctx, "application settings without user document; creating default user row",
			"account_id", accountID)
		if err := EnsureDefaultUserAccountDocumentOnly(ctx, dbClient, accountID); err != nil {
			return nil, fmt.Errorf("create default user document: %w", err)
		}
		return loadPairTouchAndReturn(ctx, usersCol, settingsCol, accountID, now, true)
	}

	firstLogin, err := EnsureUserAccountDocument(ctx, dbClient, accountID)
	if err != nil {
		return nil, fmt.Errorf("create default user document: %w", err)
	}
	res, err := loadPairTouchAndReturn(ctx, usersCol, settingsCol, accountID, now, firstLogin)
	if err != nil {
		return nil, err
	}
	res.FirstLogin = firstLogin
	return res, nil
}

func loadPairTouchAndReturn(
	ctx context.Context,
	usersCol, settingsCol *mongo.Collection,
	accountID string,
	now time.Time,
	firstLogin bool,
) (*UserLoginResolution, error) {
	var userDoc models.UserAccountDocument
	var settingsDoc models.ApplicationSettings
	retryUser := DefaultRetryConfig()
	retryUser.OperationName = fmt.Sprintf("find user for login %s", accountID)
	if err := RetryMongoOperation(ctx, retryUser, func() error {
		return usersCol.FindOne(ctx, bson.M{"_id": accountID, "_meta.accountID": accountID}).Decode(&userDoc)
	}); err != nil {
		return nil, fmt.Errorf("load user document: %w", err)
	}
	retrySettings := DefaultRetryConfig()
	retrySettings.OperationName = fmt.Sprintf("find application settings for login %s", accountID)
	if err := RetryMongoOperation(ctx, retrySettings, func() error {
		return settingsCol.FindOne(ctx, bson.M{"_id": accountID, "_meta.accountID": accountID}).Decode(&settingsDoc)
	}); err != nil {
		return nil, fmt.Errorf("load application settings: %w", err)
	}
	if err := touchUserLastLogin(ctx, usersCol, accountID, now); err != nil {
		return nil, err
	}
	userDoc.MetaData.LastLoginAt = now
	userDoc.MetaData.LastModified = now
	return &UserLoginResolution{
		User:       userDoc,
		Settings:   settingsDoc,
		FirstLogin: firstLogin,
	}, nil
}

func touchUserLastLogin(ctx context.Context, usersCol *mongo.Collection, accountID string, at time.Time) error {
	if usersCol == nil || accountID == "" {
		return fmt.Errorf("touchUserLastLogin: invalid args")
	}
	retryCfg := DefaultRetryConfig()
	retryCfg.OperationName = fmt.Sprintf("touch last login %s", accountID)
	return RetryMongoOperation(ctx, retryCfg, func() error {
		_, err := usersCol.UpdateOne(ctx, bson.M{"_id": accountID, "_meta.accountID": accountID}, bson.M{
			"$set": bson.M{
				"_meta.lastLoginAt":  at,
				"_meta.lastModified": at,
			},
		})
		return err
	})
}

// TouchUserLastLogin updates user last-login metadata without loading documents.
func TouchUserLastLogin(ctx context.Context, dbClient *mongo.Client, accountID string) error {
	if dbClient == nil {
		return errors.New("mongo client is nil")
	}
	if accountID == "" {
		return errors.New("accountID is required")
	}
	db := dbClient.Database(DatabaseName)
	usersCol := db.Collection(CollectionUsers)
	return touchUserLastLogin(ctx, usersCol, accountID, time.Now().UTC())
}
