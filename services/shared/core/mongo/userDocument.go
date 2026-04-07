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

// getDefaultJobStatusArray returns the default job status array
func getDefaultJobStatusArray() []models.JobStatus {
	return []models.JobStatus{
		{ID: 0, Name: "Planning", SortOrder: 0, Expanded: true, OpenAPIJobs: false, CompleteAPIJobs: false},
		{ID: 1, Name: "Purchasing", SortOrder: 1, Expanded: true, OpenAPIJobs: false, CompleteAPIJobs: false},
		{ID: 2, Name: "Building", SortOrder: 2, Expanded: true, OpenAPIJobs: false, CompleteAPIJobs: false},
		{ID: 3, Name: "Complete", SortOrder: 3, Expanded: true, OpenAPIJobs: false, CompleteAPIJobs: false},
		{ID: 4, Name: "For Sale", SortOrder: 4, Expanded: true, OpenAPIJobs: false, CompleteAPIJobs: false},
	}
}

// getDefaultApplicationSettings returns the default application settings for a new account.
func getDefaultApplicationSettings(accountID string, now time.Time) models.ApplicationSettings {
	return models.ApplicationSettings{
		UseCloudAccounts:                 false,
		DisplayHelpCards:                 false,
		DefaultMarketLocation:            "jita",
		DefaultOrderType:                 "sell",
		LocalMarketDisplay:               nil,
		LocalOrderDisplay:                nil,
		EsiJobTab:                        nil,
		EnableCompactLayoutView:          false,
		EnableAutomaticJobRecalculation:  true,
		EnableSkipMissingBlueprints:      false,
		HideCompleteMaterialsFromEditJob: false,
		DefaultStationIDForAssets:        60003760,
		DefaultCitadelBrokersFee:         1,
		DefaultMaterialEfficiencyValue:   0,
		CustomStructures: models.CustomStructures{
			Manufacturing: []models.CustomStructure{},
			Reaction:      []models.CustomStructure{},
			Reprocessing:  []models.ReprocessingStructure{},
		},
		ExemptTypeIDs: []int{},
		ReprocessingSettings: models.ReprocessingSettings{
			DefaultReprocessingCharacter: nil,
			PreferCompressed:             true,
			CompressionBonusMultiplier:   0.25,
			ValueMultiplier:              2.0,
			WastePenaltyMultiplier:       0.1,
			SellExcessMineralTypes:       false,
		},
		ExtrasCategories: []models.ExtraCategory{
			{ID: "0", Label: "Unassigned"},
			{ID: "1", Label: "Hauling Service"},
			{ID: "2", Label: "Jump Freight Service"},
			{ID: "3", Label: "Blueprint Copies"},
			{ID: "4", Label: "Loyal Point Costs"},
			{ID: "5", Label: "Other"},
		},
		PredefinedSystemIndexes: make(map[string]map[string]float64),
		MetaData: models.MetaData{
			LastModified: now,
			AccountID:    accountID,
		},
	}
}

// EnsureUserAccountDocument checks if a user document exists in the users collection by accountID.
// If the document doesn't exist, it creates a new one with default values.
// Returns true if the document was created (first login), false if it already existed.
func EnsureUserAccountDocument(ctx context.Context, client *mongo.Client, accountID string) (bool, error) {
	if client == nil {
		return false, errors.New("mongo client is nil")
	}
	if accountID == "" {
		return false, errors.New("accountID is required")
	}

	database := client.Database(DatabaseName)
	collection := database.Collection(CollectionUsers)

	// Create a context with timeout
	queryCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	// Check if the user document exists by _id (which is set to accountID) with retry
	var userDoc models.UserAccountDocument
	retryConfig := DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("find user document %s", accountID)

	var findErr error
	documentExists := false
	err := RetryMongoOperation(queryCtx, retryConfig, func() error {
		findErr = collection.FindOne(queryCtx, bson.M{"_id": accountID}).Decode(&userDoc)
		if findErr == nil {
			// Document exists, nothing to do
			documentExists = true
			return nil
		}
		// Return error only if it's not "document not found"
		if findErr != mongo.ErrNoDocuments {
			return findErr
		}
		// Document not found is expected - return nil to indicate success (document doesn't exist)
		documentExists = false
		return nil
	})

	if err != nil {
		return false, fmt.Errorf("failed to query user document: %w", err)
	}

	// Check if document was found
	if documentExists {
		// Document exists, nothing to do
		return false, nil
	}

	// Document not found, create both the account document and the application settings document
	now := time.Now()
	newUserDoc := models.UserAccountDocument{
		AccountID:       accountID,
		JobStatusArray:  getDefaultJobStatusArray(),
		LinkedJobs:      []int64{},
		LinkedTrans:     []int64{},
		LinkedOrders:    []int64{},
		RefreshTokens:   []models.RefreshToken{},
		FlagForDeletion: false,
		DeletedAt:       nil,
		MetaData: models.UserMeta{
			MetaData: models.MetaData{
				AccountID: accountID,
			},
			CreatedAt:   now,
			LastLoginAt: now,
		},
	}

	newSettingsDoc := getDefaultApplicationSettings(accountID, now)

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
