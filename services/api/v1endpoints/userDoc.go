package v1endpoints

import (
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/models"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

func UserMainDocumentHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	switch r.Method {
	case http.MethodGet:
		handleGetUserDocument(w, r, clients)
	case http.MethodPut:
		handleSaveUserDocument(w, r, clients)
	default:
		m := apimetrics.GetAPIEveTokenLogin()
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		logs.WarnCtx(ctx, "invalid method for user main document endpoint")
		http.Error(w, "Method not allowed. Use GET to retrieve or PUT to save.", http.StatusMethodNotAllowed)
	}
}

func handleGetUserDocument(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start, ok := logs.RequestStartTime(ctx)
	if !ok {
		start = time.Now()
	}
	m := apimetrics.GetAPIEveTokenLogin()

	// Extract accountID from JWT token
	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		m.Errors.WithLabelValues("auth_error").Inc(ctx)
		logs.WarnCtx(ctx, "failed to extract accountID", "error", err)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionUsers)

	// Find user document by _id (which is set to accountID) with retry
	var userDoc models.UserAccountDocument
	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("find user document %s", accountID)

	err = mongocore.RetryMongoOperation(ctx, retryConfig, func() error {
		err := collection.FindOne(ctx, bson.M{"_id": accountID, "_meta.accountID": accountID}).Decode(&userDoc)
		return err
	})
	if err != nil {
		if err == mongo.ErrNoDocuments {
			m.Errors.WithLabelValues("not_found").Inc(ctx)
			logs.WarnCtx(ctx, "user document not found", "account_id", accountID)
			http.Error(w, "User document not found", http.StatusNotFound)
			return
		}
		m.Errors.WithLabelValues("database_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to query user document", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to retrieve user document", err)
		return
	}

	if err := helper.EncodeJSON(w, userDoc); err != nil {
		logs.ErrorCtx(ctx, "failed to encode user document response", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}

	m.Successes.Inc(ctx)
	logs.InfoCtx(ctx, "user main document retrieved",
		"account_id", accountID,
		"duration_ms", time.Since(start).Milliseconds())
}

func handleSaveUserDocument(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start, ok := logs.RequestStartTime(ctx)
	if !ok {
		start = time.Now()
	}
	m := apimetrics.GetAPIEveTokenLogin()

	// Extract accountID from JWT token
	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		m.Errors.WithLabelValues("auth_error").Inc(ctx)
		logs.WarnCtx(ctx, "failed to extract accountID", "error", err)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse request body
	var userDoc models.UserAccountDocument
	if err := helper.DecodeJSONRequest(r, &userDoc, helper.DefaultMaxBodySize); err != nil {
		m.Errors.WithLabelValues("invalid_json").Inc(ctx)
		logs.WarnCtx(ctx, "failed to decode user document JSON", "error", err, "account_id", accountID)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Validate that accountID in document matches the JWT token accountID (if provided)
	// If not provided, set it from token. If provided but wrong, reject.
	if userDoc.MetaData.AccountID != "" && userDoc.MetaData.AccountID != accountID {
		m.Errors.WithLabelValues("account_id_mismatch").Inc(ctx)
		logs.WarnCtx(ctx, "account ID mismatch", "token_account_id", accountID, "doc_account_id", userDoc.MetaData.AccountID)
		http.Error(w, "Account ID in document must match authenticated account", http.StatusForbidden)
		return
	}
	userDoc.MetaData.AccountID = accountID
	if sessionID, sErr := auth.ExtractSessionID(r); sErr == nil && sessionID != "" {
		userDoc.MetaData.SessionID = sessionID
	}
	wsClientID := helper.ExtractWSClientID(r)
	if wsClientID != "" {
		userDoc.MetaData.ClientID = wsClientID
	}

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionUsers)

	retryConfigUpdate := mongocore.DefaultRetryConfig()
	retryConfigUpdate.OperationName = fmt.Sprintf("update user document %s", accountID)

	var result *mongo.UpdateResult
	err = mongocore.RetryMongoOperation(ctx, retryConfigUpdate, func() error {
		var upsertErr error
		result, upsertErr = mongocore.UpsertStructByIDPreservingMeta(ctx, collection, userDoc, accountID)
		return upsertErr
	})
	if err != nil && wsClientID != "" {
		logs.WarnCtx(ctx, "user document upsert with websocket client id failed, retrying without client id",
			"account_id", accountID,
			"ws_client_id", wsClientID,
			"error", err)
		userDoc.MetaData.ClientID = ""
		err = mongocore.RetryMongoOperation(ctx, retryConfigUpdate, func() error {
			var upsertErr error
			result, upsertErr = mongocore.UpsertStructByIDPreservingMeta(ctx, collection, userDoc, accountID)
			return upsertErr
		})
	}
	if err != nil {
		m.Errors.WithLabelValues("database_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to upsert user document", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to save user document", err)
		return
	}

	w.WriteHeader(http.StatusNoContent)

	m.Successes.Inc(ctx)
	logs.InfoCtx(ctx, "user main document saved",
		"account_id", accountID,
		"matched", result.MatchedCount,
		"upserted", result.UpsertedCount,
		"duration_ms", time.Since(start).Milliseconds())
}
