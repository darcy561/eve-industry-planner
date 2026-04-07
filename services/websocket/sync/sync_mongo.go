package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

const (
	// MongoDBQueryTimeout is the timeout for MongoDB queries during sync
	MongoDBQueryTimeout = 10 * time.Second
)

// structToMap converts a struct to map[string]interface{} via JSON marshaling
// This ensures proper type conversion and JSON compatibility
func structToMap(v interface{}) (map[string]interface{}, error) {
	// Marshal struct to JSON bytes
	jsonBytes, err := json.Marshal(v)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal struct to JSON: %w", err)
	}

	// Unmarshal JSON bytes to map[string]interface{}
	var result map[string]interface{}
	if err := json.Unmarshal(jsonBytes, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal JSON to map: %w", err)
	}

	return result, nil
}

// queryDocumentsOnce performs a single MongoDB query attempt
// Decodes into structs for known collections (users, jobs, groups) for type safety
// Falls back to bson.M for unknown collections
func queryDocumentsOnce(ctx context.Context, collection *mongo.Collection, filter bson.M, collectionName string) (map[string]map[string]interface{}, error) {
	results := make(map[string]map[string]interface{})

	// Use Find with $in operator to query all documents at once
	cursor, err := collection.Find(ctx, filter)
	if err != nil {
		return nil, fmt.Errorf("MongoDB query failed: %w", err)
	}
	defer cursor.Close(ctx)

	// Handle known collections with struct decoding
	switch collectionName {
	case mongocore.CollectionUsers:
		var users []models.UserAccountDocument
		if err := cursor.All(ctx, &users); err != nil {
			return nil, fmt.Errorf("failed to decode users: %w", err)
		}
		for _, user := range users {
			userMap, err := structToMap(user)
			if err != nil {
				logs.WarnCtx(ctx, "failed to convert user to map",
					"account_id", user.AccountID,
					"error", err)
				continue
			}
			results[user.AccountID] = userMap
		}
		return results, cursor.Err()

	case mongocore.CollectionJobs:
		var jobs []models.Job
		if err := cursor.All(ctx, &jobs); err != nil {
			return nil, fmt.Errorf("failed to decode jobs: %w", err)
		}
		for _, job := range jobs {
			jobMap, err := structToMap(job)
			if err != nil {
				logs.WarnCtx(ctx, "failed to convert job to map",
					"job_id", job.JobID,
					"error", err)
				continue
			}
			results[job.JobID] = jobMap
		}
		return results, cursor.Err()

	case mongocore.CollectionGroups:
		var groups []models.Group
		if err := cursor.All(ctx, &groups); err != nil {
			return nil, fmt.Errorf("failed to decode groups: %w", err)
		}
		for _, group := range groups {
			groupMap, err := structToMap(group)
			if err != nil {
				logs.WarnCtx(ctx, "failed to convert group to map",
					"group_id", group.GroupID,
					"error", err)
				continue
			}
			results[group.GroupID] = groupMap
		}
		return results, cursor.Err()
	}

	// Fallback for unknown collections: decode to bson.M and convert via JSON
	for cursor.Next(ctx) {
		// Check context before processing each document
		select {
		case <-ctx.Done():
			cursor.Close(ctx)
			return nil, ctx.Err()
		default:
		}
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			logs.WarnCtx(ctx, "failed to decode document during sync",
				"collection", collectionName,
				"error", err)
			continue
		}

		// Extract document ID from _id field
		var docID string
		switch idVal := doc["_id"].(type) {
		case string:
			docID = idVal
		case primitive.ObjectID:
			docID = idVal.Hex()
		default:
			// Try to convert to string
			docID = fmt.Sprintf("%v", doc["_id"])
			logs.DebugCtx(ctx, "converted _id to string",
				"collection", collectionName,
				"_id_type", fmt.Sprintf("%T", doc["_id"]),
				"doc_id", docID)
		}

		// Convert bson.M to map[string]interface{} via JSON marshaling
		// This ensures proper BSON to JSON type conversion
		docMap, err := structToMap(doc)
		if err != nil {
			logs.WarnCtx(ctx, "failed to convert document to map",
				"collection", collectionName,
				"doc_id", docID,
				"error", err)
			continue
		}

		// Ensure _id is set to the extracted docID (in case it was ObjectID)
		docMap["_id"] = docID

		results[docID] = docMap
	}

	if err := cursor.Err(); err != nil {
		return nil, fmt.Errorf("MongoDB cursor error: %w", err)
	}

	return results, nil
}

// QueryDocumentsByCollection queries documents from MongoDB by collection name and document IDs
// Returns a map of documentID -> document data (as map[string]interface{})
// Documents that don't exist are omitted from the result
// Uses bulk query with $in operator for efficiency
// Implements retry logic with exponential backoff for transient MongoDB errors
// Context can be cancelled to stop ongoing queries if client disconnects
func QueryDocumentsByCollection(ctx context.Context, s SyncServer, collectionName string, documentIDs []string, accountID string) (map[string]map[string]interface{}, error) {
	if len(documentIDs) == 0 {
		return make(map[string]map[string]interface{}), nil
	}

	// Check if context is already cancelled
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	// Get MongoDB client (type assert to *mongo.Client)
	mongoClientInterface := s.GetMongoClient()
	if mongoClientInterface == nil {
		return nil, fmt.Errorf("MongoDB client not available")
	}

	// Type assert to *mongo.Client
	mongoClient, ok := mongoClientInterface.(*mongo.Client)
	if !ok {
		return nil, fmt.Errorf("invalid MongoDB client type")
	}

	// Get database and collection
	database := mongoClient.Database(mongocore.DatabaseName)
	collection := database.Collection(collectionName)

	// Build query filter
	filter := bson.M{
		"_id": bson.M{"$in": documentIDs},
	}

	// For non-users collections, add accountID filter for security
	// Users collection uses _id as accountID, so no additional filter needed
	if collectionName != "users" {
		filter["accountID"] = accountID // Use camelCase accountID (matches BSON tag)
	}

	// Use retry logic from mongo core package
	var results map[string]map[string]interface{}
	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("query documents from %s", collectionName)

	err := mongocore.RetryMongoOperation(ctx, retryConfig, func() error {
		var err error
		results, err = queryDocumentsOnce(ctx, collection, filter, collectionName)
		return err
	})

	if err != nil {
		return nil, err
	}

	// Log success
	logs.DebugCtx(ctx, "queried documents for sync",
		"collection", collectionName,
		"requested", len(documentIDs),
		"found", len(results))

	return results, nil
}

// QueryAllJobsForAccount queries all jobs for an accountID where isIncludedOnPlanner is true
// Returns a map of jobID -> job data (as map[string]interface{})
// Uses struct decoding for type safety and proper BSON to JSON conversion
func QueryAllJobsForAccount(ctx context.Context, s SyncServer, accountID string) (map[string]map[string]interface{}, error) {
	// Check if context is already cancelled
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	// Get MongoDB client
	mongoClientInterface := s.GetMongoClient()
	if mongoClientInterface == nil {
		return nil, fmt.Errorf("MongoDB client not available")
	}

	mongoClient, ok := mongoClientInterface.(*mongo.Client)
	if !ok {
		return nil, fmt.Errorf("invalid MongoDB client type")
	}

	// Get database and collection
	database := mongoClient.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionJobs)

	// Build query filter: accountID and isIncludedOnPlanner = true
	filter := bson.M{
		"accountID":           accountID,
		"isIncludedOnPlanner": true,
	}

	// Use retry logic from mongo core package
	var jobs []models.Job
	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("query all jobs for account %s", accountID)

	err := mongocore.RetryMongoOperation(ctx, retryConfig, func() error {
		cursor, err := collection.Find(ctx, filter)
		if err != nil {
			return fmt.Errorf("MongoDB query failed: %w", err)
		}
		defer cursor.Close(ctx)

		// Decode directly into Job structs
		if err := cursor.All(ctx, &jobs); err != nil {
			return fmt.Errorf("failed to decode jobs: %w", err)
		}

		return cursor.Err()
	})

	if err != nil {
		return nil, err
	}

	// Convert structs to maps via JSON marshaling
	results := make(map[string]map[string]interface{}, len(jobs))
	for _, job := range jobs {
		jobMap, err := structToMap(job)
		if err != nil {
			logs.WarnCtx(ctx, "failed to convert job to map",
				"job_id", job.JobID,
				"error", err)
			continue
		}
		results[job.JobID] = jobMap
	}

	logs.DebugCtx(ctx, "queried all jobs for account",
		"collection", mongocore.CollectionJobs,
		"account_id", accountID,
		"found", len(results))

	return results, nil
}

// QueryAllGroupsForAccount queries all groups for an accountID
// Returns a map of groupID -> group data (as map[string]interface{})
// Uses struct decoding for type safety and proper BSON to JSON conversion
func QueryAllGroupsForAccount(ctx context.Context, s SyncServer, accountID string) (map[string]map[string]interface{}, error) {
	// Check if context is already cancelled
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	// Get MongoDB client
	mongoClientInterface := s.GetMongoClient()
	if mongoClientInterface == nil {
		return nil, fmt.Errorf("MongoDB client not available")
	}

	mongoClient, ok := mongoClientInterface.(*mongo.Client)
	if !ok {
		return nil, fmt.Errorf("invalid MongoDB client type")
	}

	// Get database and collection
	database := mongoClient.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionGroups)

	// Build query filter: accountID
	filter := bson.M{
		"accountID": accountID,
	}

	// Use retry logic from mongo core package
	var groups []models.Group
	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("query all groups for account %s", accountID)

	err := mongocore.RetryMongoOperation(ctx, retryConfig, func() error {
		cursor, err := collection.Find(ctx, filter)
		if err != nil {
			return fmt.Errorf("MongoDB query failed: %w", err)
		}
		defer cursor.Close(ctx)

		// Decode directly into Group structs
		if err := cursor.All(ctx, &groups); err != nil {
			return fmt.Errorf("failed to decode groups: %w", err)
		}

		return cursor.Err()
	})

	if err != nil {
		return nil, err
	}

	// Convert structs to maps via JSON marshaling
	results := make(map[string]map[string]interface{}, len(groups))
	for _, group := range groups {
		groupMap, err := structToMap(group)
		if err != nil {
			logs.WarnCtx(ctx, "failed to convert group to map",
				"group_id", group.GroupID,
				"error", err)
			continue
		}
		results[group.GroupID] = groupMap
	}

	logs.DebugCtx(ctx, "queried all groups for account",
		"collection", mongocore.CollectionGroups,
		"account_id", accountID,
		"found", len(results))

	return results, nil
}
