package v1endpoints

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/api/helper"
	"eve-industry-planner/api/api/helper/auth"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/logs"
	"eve-industry-planner/shared/shared/metrics"
	"eve-industry-planner/shared/shared/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func UserMainDocumentHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	// Route based on HTTP method
	switch r.Method {
	case http.MethodGet:
		handleGetUserDocument(w, r, clients)
	case http.MethodPut:
		handleSaveUserDocument(w, r, clients)
	default:
		m := metrics.GetAPIAuthLogin()
		m.Errors.WithLabelValues("method_not_allowed").Inc()
		logs.WarnCtx(r.Context(), "invalid method for user main document endpoint", "method", r.Method, "ip", r.RemoteAddr)
		http.Error(w, "Method not allowed. Use GET to retrieve or PUT to save.", http.StatusMethodNotAllowed)
	}
}

func handleGetUserDocument(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	start := time.Now()
	m := metrics.GetAPIAuthLogin()

	// Extract accountID from JWT token
	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		m.Errors.WithLabelValues("auth_error").Inc()
		logs.WarnCtx(r.Context(), "failed to extract accountID", "error", err, "ip", r.RemoteAddr)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Query MongoDB for user document by accountID (_id)
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionUsers)

	// Find user document by _id (which is set to accountID) with retry
	var userDoc models.UserAccountDocument
	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("find user document %s", accountID)

	err = mongocore.RetryMongoOperation(ctx, retryConfig, func() error {
		err := collection.FindOne(ctx, bson.M{"_id": accountID}).Decode(&userDoc)
		return err
	})
	if err != nil {
		if err == mongo.ErrNoDocuments {
			m.Errors.WithLabelValues("not_found").Inc()
			logs.WarnCtx(r.Context(), "user document not found", "account_id", accountID, "ip", r.RemoteAddr)
			http.Error(w, "User document not found", http.StatusNotFound)
			return
		}
		m.Errors.WithLabelValues("database_error").Inc()
		logs.ErrorCtx(r.Context(), "failed to query user document", "error", err, "account_id", accountID, "ip", r.RemoteAddr)
		http.Error(w, "Failed to retrieve user document", http.StatusInternalServerError)
		return
	}

	// Handle autosubscription - publish subscription request to NATS
	autoSubscribeHeader := r.Header.Get("AutoSubscribe")
	autoSubscribeQuery := r.URL.Query().Get("autoSubscribe")
	if autoSubscribeHeader == "true" || autoSubscribeQuery == "true" {
		if clients.JetStream != nil {
			// User document ID is the accountID itself, collection is "users"
			if err := publishSubscriptionRequest(r.Context(), clients.JetStream, accountID, mongocore.CollectionUsers, []string{accountID}); err != nil {
				logs.WarnCtx(r.Context(), "failed to publish subscription request", "account_id", accountID, "error", err)
			} else {
				logs.InfoCtx(r.Context(), "published subscription request for user document", "account_id", accountID)
			}
		} else {
			logs.WarnCtx(r.Context(), "JetStream not available for autosubscription", "account_id", accountID)
		}
	} else {
		logs.DebugCtx(r.Context(), "autosubscription not requested", "account_id", accountID, "header", autoSubscribeHeader, "query", autoSubscribeQuery)
	}

	m.Successes.Inc()
	logs.InfoCtx(r.Context(), "user main document retrieved",
		"account_id", accountID,
		"duration_ms", time.Since(start).Milliseconds())

	// Encode response (nginx handles compression)
	if err := helper.EncodeJSON(w, userDoc); err != nil {
		logs.ErrorCtx(r.Context(), "failed to encode user document response", "error", err, "account_id", accountID)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
}

func handleSaveUserDocument(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	start := time.Now()
	m := metrics.GetAPIAuthLogin()

	// Extract accountID from JWT token
	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		m.Errors.WithLabelValues("auth_error").Inc()
		logs.WarnCtx(r.Context(), "failed to extract accountID", "error", err, "ip", r.RemoteAddr)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse request body
	var userDoc models.UserAccountDocument
	if err := helper.DecodeJSONRequest(r, &userDoc, helper.DefaultMaxBodySize); err != nil {
		m.Errors.WithLabelValues("invalid_json").Inc()
		logs.WarnCtx(r.Context(), "failed to decode user document JSON", "error", err, "account_id", accountID, "ip", r.RemoteAddr)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Validate that accountID in document matches the JWT token accountID (if provided)
	// If not provided, set it from token. If provided but wrong, reject.
	if userDoc.AccountID != "" && userDoc.AccountID != accountID {
		m.Errors.WithLabelValues("account_id_mismatch").Inc()
		logs.WarnCtx(r.Context(), "account ID mismatch", "token_account_id", accountID, "doc_account_id", userDoc.AccountID, "ip", r.RemoteAddr)
		http.Error(w, "Account ID in document must match authenticated account", http.StatusForbidden)
		return
	}

	// Set accountID from JWT token (ensures it's always set correctly)
	userDoc.AccountID = accountID

	// Extract clientID from X-Client-ID header and set in Meta (optional)
	clientID := r.Header.Get("X-Client-ID")
	if clientID != "" {
		userDoc.Meta.ClientID = clientID
	}

	// Save to MongoDB
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionUsers)

	now := time.Now()
	userDoc.UpdatedAt = now

	// Convert user document struct to MongoDB document with _id set to accountID
	docBson, err := mongocore.StructToMongoDoc(userDoc, accountID)
	if err != nil {
		m.Errors.WithLabelValues("marshal_error").Inc()
		logs.ErrorCtx(r.Context(), "failed to convert user document to MongoDB document", "error", err, "account_id", accountID)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Upsert user document - filter by _id (which is accountID)
	opts := options.Update().SetUpsert(true)

	// Ensure accountID is always set (in case frontend didn't include it)
	setDoc := bson.M{}
	for k, v := range docBson {
		// Skip _id field as it's already set in the filter
		if k != "_id" {
			setDoc[k] = v
		}
	}
	// Explicitly set accountID to ensure it's never removed
	setDoc["accountID"] = accountID

	update := bson.M{
		"$set": setDoc,
		"$setOnInsert": bson.M{
			"createdAt": now,
		},
	}

	retryConfigUpdate := mongocore.DefaultRetryConfig()
	retryConfigUpdate.OperationName = fmt.Sprintf("update user document %s", accountID)

	var result *mongo.UpdateResult
	err = mongocore.RetryMongoOperation(ctx, retryConfigUpdate, func() error {
		var err error
		result, err = collection.UpdateOne(ctx, bson.M{"_id": accountID}, update, opts)
		return err
	})
	if err != nil {
		m.Errors.WithLabelValues("database_error").Inc()
		logs.ErrorCtx(r.Context(), "failed to upsert user document", "error", err, "account_id", accountID, "ip", r.RemoteAddr)
		http.Error(w, "Failed to save user document", http.StatusInternalServerError)
		return
	}

	// Handle autosubscription - publish subscription request to NATS
	autoSubscribeHeader := r.Header.Get("AutoSubscribe")
	autoSubscribeQuery := r.URL.Query().Get("autoSubscribe")
	if autoSubscribeHeader == "true" || autoSubscribeQuery == "true" {
		if clients.JetStream != nil {
			// User document ID is the accountID itself, collection is "users"
			if err := publishSubscriptionRequest(r.Context(), clients.JetStream, accountID, mongocore.CollectionUsers, []string{accountID}); err != nil {
				logs.WarnCtx(r.Context(), "failed to publish subscription request", "account_id", accountID, "error", err)
			} else {
				logs.InfoCtx(r.Context(), "published subscription request for user document", "account_id", accountID)
			}
		} else {
			logs.WarnCtx(r.Context(), "JetStream not available for autosubscription", "account_id", accountID)
		}
	} else {
		logs.DebugCtx(r.Context(), "autosubscription not requested", "account_id", accountID, "header", autoSubscribeHeader, "query", autoSubscribeQuery)
	}

	m.Successes.Inc()
	logs.InfoCtx(r.Context(), "user main document saved",
		"account_id", accountID,
		"matched", result.MatchedCount,
		"upserted", result.UpsertedCount,
		"duration_ms", time.Since(start).Milliseconds())

	// Return 204 No Content for successful save
	w.WriteHeader(http.StatusNoContent)
}
