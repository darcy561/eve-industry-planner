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

func ApplicationSettingsDocumentHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	switch r.Method {
	case http.MethodGet:
		handleGetApplicationSettings(w, r, clients)
	case http.MethodPut:
		handleSaveApplicationSettings(w, r, clients)
	default:
		m := apimetrics.GetAPIEveTokenLogin()
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		logs.WarnCtx(ctx, "invalid method for application settings document endpoint")
		http.Error(w, "Method not allowed. Use GET to retrieve or PUT to save.", http.StatusMethodNotAllowed)
	}
}

func handleGetApplicationSettings(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start, ok := logs.RequestStartTime(ctx)
	if !ok {
		start = time.Now()
	}
	m := apimetrics.GetAPIEveTokenLogin()

	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		m.Errors.WithLabelValues("auth_error").Inc(ctx)
		logs.WarnCtx(ctx, "failed to extract accountID", "error", err)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionApplicationSettings)

	var settingsDoc models.ApplicationSettings
	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("find application settings %s", accountID)

	err = mongocore.RetryMongoOperation(ctx, retryConfig, func() error {
		err := collection.FindOne(ctx, bson.M{"_id": accountID, "_meta.accountID": accountID}).Decode(&settingsDoc)
		return err
	})
	if err != nil {
		if err == mongo.ErrNoDocuments {
			m.Errors.WithLabelValues("not_found").Inc(ctx)
			logs.WarnCtx(ctx, "application settings document not found", "account_id", accountID)
			http.Error(w, "Application settings not found", http.StatusNotFound)
			return
		}
		m.Errors.WithLabelValues("database_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to query application settings", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to retrieve application settings", err)
		return
	}

	if err := helper.EncodeJSON(w, settingsDoc); err != nil {
		logs.ErrorCtx(ctx, "failed to encode application settings response", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}

	m.Successes.Inc(ctx)
	logs.InfoCtx(ctx, "application settings document retrieved",
		"account_id", accountID,
		"duration_ms", time.Since(start).Milliseconds())
}

func handleSaveApplicationSettings(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start, ok := logs.RequestStartTime(ctx)
	if !ok {
		start = time.Now()
	}
	m := apimetrics.GetAPIEveTokenLogin()

	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		m.Errors.WithLabelValues("auth_error").Inc(ctx)
		logs.WarnCtx(ctx, "failed to extract accountID", "error", err)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var settingsDoc models.ApplicationSettings
	if err := helper.DecodeJSONRequest(r, &settingsDoc, helper.DefaultMaxBodySize); err != nil {
		m.Errors.WithLabelValues("invalid_json").Inc(ctx)
		logs.WarnCtx(ctx, "failed to decode application settings JSON", "error", err, "account_id", accountID)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if settingsDoc.MetaData.AccountID != "" && settingsDoc.MetaData.AccountID != accountID {
		m.Errors.WithLabelValues("account_id_mismatch").Inc(ctx)
		logs.WarnCtx(ctx, "account ID mismatch", "token_account_id", accountID, "doc_account_id", settingsDoc.MetaData.AccountID)
		http.Error(w, "Account ID in document must match authenticated account", http.StatusForbidden)
		return
	}
	settingsDoc.MetaData.AccountID = accountID
	if sessionID, sErr := auth.ExtractSessionID(r); sErr == nil && sessionID != "" {
		settingsDoc.MetaData.SessionID = sessionID
	}
	wsClientID := helper.ExtractWSClientID(r)
	if wsClientID != "" {
		settingsDoc.MetaData.ClientID = wsClientID
	}

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionApplicationSettings)

	retryConfigUpdate := mongocore.DefaultRetryConfig()
	retryConfigUpdate.OperationName = fmt.Sprintf("update application settings %s", accountID)

	var result *mongo.UpdateResult
	err = mongocore.RetryMongoOperation(ctx, retryConfigUpdate, func() error {
		var upsertErr error
		result, upsertErr = mongocore.UpsertStructByIDPreservingMeta(ctx, collection, settingsDoc, accountID)
		return upsertErr
	})
	if err != nil && wsClientID != "" {
		logs.WarnCtx(ctx, "application settings upsert with websocket client id failed, retrying without client id",
			"account_id", accountID,
			"ws_client_id", wsClientID,
			"error", err)
		settingsDoc.MetaData.ClientID = ""
		err = mongocore.RetryMongoOperation(ctx, retryConfigUpdate, func() error {
			var upsertErr error
			result, upsertErr = mongocore.UpsertStructByIDPreservingMeta(ctx, collection, settingsDoc, accountID)
			return upsertErr
		})
	}
	if err != nil {
		m.Errors.WithLabelValues("database_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to upsert application settings", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to save application settings", err)
		return
	}

	w.WriteHeader(http.StatusNoContent)

	m.Successes.Inc(ctx)
	logs.InfoCtx(ctx, "application settings document saved",
		"account_id", accountID,
		"matched", result.MatchedCount,
		"upserted", result.UpsertedCount,
		"duration_ms", time.Since(start).Milliseconds())
}
