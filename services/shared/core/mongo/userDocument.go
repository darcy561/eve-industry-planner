package mongo

import (
	"context"
	"errors"
	"fmt"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared/models"

	"go.mongodb.org/mongo-driver/mongo"
)

// EnsureUserAccountDocument checks if a user document exists with _id and _meta.accountID
// matching accountID — same rule as DocumentExistsByID and models.Job ownership.
// If no such document exists, it creates the user row and application_settings with default values.
// Returns true if the documents were created (first provision), false if a valid row already existed.
func EnsureUserAccountDocument(ctx context.Context, client *mongo.Client, accountID string) (bool, error) {
	if client == nil {
		return false, errors.New("mongo client is nil")
	}
	if accountID == "" {
		return false, errors.New("accountID is required")
	}

	database := client.Database(DatabaseName)
	collection := database.Collection(CollectionUsers)

	queryCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	retryConfig := DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("check user document %s", accountID)

	var documentExists bool
	err := RetryMongoOperation(queryCtx, retryConfig, func() error {
		var checkErr error
		documentExists, checkErr = DocumentExistsByID(queryCtx, collection, accountID, accountID)
		return checkErr
	})
	if err != nil {
		return false, fmt.Errorf("failed to query user document: %w", err)
	}

	if documentExists {
		return false, nil
	}

	// Document not found, create both the account document and the application settings document
	now := time.Now().UTC()
	newUserDoc := models.UserAccountDocument{
		LinkedJobs:     []int64{},
		LinkedTrans:    []int64{},
		LinkedOrders:   []int64{},
		RefreshTokens:  []models.RefreshToken{},
		MetaData: models.UserMeta{
			MetaData: models.MetaData{
				AccountID:    accountID,
				LastModified: now,
			},
			CreatedAt:   now,
			LastLoginAt: now,
		},
	}

	newSettingsDoc := models.DefaultApplicationSettings(accountID, now)

	insertCtx, cancelInsert := context.WithTimeout(ctx, 10*time.Second)
	defer cancelInsert()

	// Convert account document to MongoDB document with _id set to accountID
	doc, err := StructToMongoDoc(newUserDoc, accountID)
	if err != nil {
		return false, fmt.Errorf("failed to convert struct to document: %w", err)
	}

	retryConfigInsert := DefaultRetryConfig()
	retryConfigInsert.OperationName = fmt.Sprintf("insert user document %s", accountID)

	err = RetryMongoOperation(insertCtx, retryConfigInsert, func() error {
		_, err := collection.InsertOne(insertCtx, doc)
		return err
	})
	if err != nil {
		return false, fmt.Errorf("failed to create user document: %w", err)
	}

	// Insert the application settings document in the application_settings collection
	settingsCollection := database.Collection(CollectionApplicationSettings)
	settingsDoc, err := StructToMongoDoc(newSettingsDoc, accountID)
	if err != nil {
		return false, fmt.Errorf("failed to convert application settings to document: %w", err)
	}

	retryConfigSettings := DefaultRetryConfig()
	retryConfigSettings.OperationName = fmt.Sprintf("insert application settings %s", accountID)

	err = RetryMongoOperation(insertCtx, retryConfigSettings, func() error {
		_, err := settingsCollection.InsertOne(insertCtx, settingsDoc)
		return err
	})
	if err != nil {
		return false, fmt.Errorf("failed to create application settings document: %w", err)
	}

	logs.InfoCtx(ctx, "created new user document and application settings", "accountID", accountID)
	return true, nil
}

// EnsureDefaultUserAccountDocumentOnly inserts a users-row when application_settings already exists (orphan settings repair).
func EnsureDefaultUserAccountDocumentOnly(ctx context.Context, client *mongo.Client, accountID string) error {
	if client == nil {
		return errors.New("mongo client is nil")
	}
	if accountID == "" {
		return errors.New("accountID is required")
	}

	now := time.Now().UTC()
	newUserDoc := models.UserAccountDocument{
		LinkedJobs:     []int64{},
		LinkedTrans:    []int64{},
		LinkedOrders:   []int64{},
		RefreshTokens:  []models.RefreshToken{},
		MetaData: models.UserMeta{
			MetaData: models.MetaData{
				AccountID:    accountID,
				LastModified: now,
			},
			CreatedAt:   now,
			LastLoginAt: now,
		},
	}

	database := client.Database(DatabaseName)
	collection := database.Collection(CollectionUsers)

	insertCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	doc, err := StructToMongoDoc(newUserDoc, accountID)
	if err != nil {
		return fmt.Errorf("failed to convert struct to document: %w", err)
	}

	retryConfigInsert := DefaultRetryConfig()
	retryConfigInsert.OperationName = fmt.Sprintf("insert user document only %s", accountID)

	err = RetryMongoOperation(insertCtx, retryConfigInsert, func() error {
		_, err := collection.InsertOne(insertCtx, doc)
		return err
	})
	if err != nil {
		return fmt.Errorf("failed to create user document: %w", err)
	}

	logs.InfoCtx(ctx, "created user document only (settings already present)", "accountID", accountID)
	return nil
}
