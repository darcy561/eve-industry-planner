package user

import (
	"context"
	"eve-industry-planner/shared/stackservices"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	mongocore "eve-industry-planner/shared/core/mongo"
	mongoget "eve-industry-planner/shared/core/mongo/get"
	mongoput "eve-industry-planner/shared/core/mongo/put"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/mongo"
)

func ApplicationSettingsHandler(w http.ResponseWriter, r *http.Request, clients *stackservices.Clients) {
	ctx := r.Context()
	switch r.Method {
	case http.MethodGet:
		handleGetApplicationSettings(w, r, clients)
	case http.MethodPut:
		handleSaveApplicationSettings(w, r, clients)
	default:
		m := apimetrics.GetAPIEveTokenLogin()
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed. Use GET to retrieve or PUT to save.", "invalid method for application settings document endpoint", "app_settings_method_not_allowed", "eve_token_login", nil, map[string]interface{}{"method": r.Method})
	}
}

func handleGetApplicationSettings(w http.ResponseWriter, r *http.Request, clients *stackservices.Clients) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)
	m := apimetrics.GetAPIEveTokenLogin()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncSuccesses:    func(ctx context.Context) { m.Successes.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	accountID := helper.AuthenticatedAccountID(r)

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionApplicationSettings)

	settingsDoc, err := mongoget.LoadApplicationSettingsDocument(ctx, collection, accountID, time.Now().UTC())
	if err != nil {
		if err == mongo.ErrNoDocuments {
			metrics.Error("not_found")
			helper.RespondEndpointError(w, r, http.StatusNotFound, "Application settings not found", "application settings document not found", "app_settings_not_found", "eve_token_login", nil, nil)
			return
		}
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to retrieve application settings", "failed to query application settings", "app_settings_query_failed", "eve_token_login", err, nil)
		return
	}

	logs.AttachDebugStep(r, "mongo_query_completed", map[string]interface{}{
		"settings_found": true,
	})

	if err := helper.EncodeJSON(w, settingsDoc); err != nil {
		metrics.Error("encode_error")
		helper.RespondEndpointServerError(w, r, "Internal server error", "failed to encode application settings response", "app_settings_encode_failed", "eve_token_login", err, nil)
		return
	}

	metrics.Success()
	logs.AttachHandlerSuccessDetail(r, "application settings document retrieved", map[string]interface{}{
		"duration_ms": time.Since(start).Milliseconds(),
	})
}

func handleSaveApplicationSettings(w http.ResponseWriter, r *http.Request, clients *stackservices.Clients) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)
	m := apimetrics.GetAPIEveTokenLogin()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncSuccesses:    func(ctx context.Context) { m.Successes.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	accountID := helper.AuthenticatedAccountID(r)

	var settingsDoc models.ApplicationSettings
	if !helper.DecodeJSONOrBadRequest(w, r, metrics, &settingsDoc) {
		return
	}

	models.UpgradeApplicationSettings(&settingsDoc, accountID, time.Now().UTC())

	if settingsDoc.MetaData.AccountID != "" && settingsDoc.MetaData.AccountID != accountID {
		metrics.Error("account_id_mismatch")
		helper.RespondEndpointError(w, r, http.StatusForbidden, "Account ID in document must match authenticated account", "account ID mismatch on application settings save", "app_settings_account_mismatch", "eve_token_login", nil, map[string]interface{}{
			"token_account_id": accountID,
			"doc_account_id":   settingsDoc.MetaData.AccountID,
		})
		return
	}
	helper.PopulateRequestMeta(r, &settingsDoc.MetaData.MetaData, accountID)

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionApplicationSettings)

	result, retriedWithoutWSClientID, err := mongoput.UpsertApplicationSettingsDocument(ctx, collection, accountID, settingsDoc)
	if retriedWithoutWSClientID {
		logs.AttachHandlerCaveat(r, "upsert_retried_without_ws_client_id", "application settings upsert with websocket client id failed, retrying without client id", map[string]interface{}{
			"ws_client_id": settingsDoc.MetaData.ClientID,
			"error":        err.Error(),
		})
	}
	if err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to save application settings", "failed to upsert application settings", "app_settings_upsert_failed", "eve_token_login", err, nil)
		return
	}

	logs.AttachDebugStep(r, "mongo_upsert_completed", map[string]interface{}{
		"matched":  result.MatchedCount,
		"upserted": result.UpsertedCount,
	})

	w.WriteHeader(http.StatusNoContent)

	metrics.Success()
	logs.AttachHandlerSuccessDetail(r, "application settings document saved", map[string]interface{}{
		"matched":     result.MatchedCount,
		"upserted":    result.UpsertedCount,
		"duration_ms": time.Since(start).Milliseconds(),
	})
}
