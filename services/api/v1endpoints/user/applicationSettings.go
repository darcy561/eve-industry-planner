package user

import (
	"context"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	mongocore "eve-industry-planner/shared/core/mongo"
	mongoget "eve-industry-planner/shared/core/mongo/get"
	mongoput "eve-industry-planner/shared/core/mongo/put"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/models"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/mongo"
)

func ApplicationSettingsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
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
	start := helper.RequestStartOrNow(ctx)
	m := apimetrics.GetAPIEveTokenLogin()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncSuccesses:    func(ctx context.Context) { m.Successes.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	accountID, ok := helper.RequireAccountID(w, r)
	if !ok {
		metrics.Error("auth_error")
		logs.WarnCtx(ctx, "failed to extract accountID")
		return
	}

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionApplicationSettings)

	settingsDoc, err := mongoget.LoadApplicationSettingsDocument(ctx, collection, accountID, time.Now().UTC())
	if err != nil {
		if err == mongo.ErrNoDocuments {
			metrics.Error("not_found")
			logs.WarnCtx(ctx, "application settings document not found", "account_id", accountID)
			http.Error(w, "Application settings not found", http.StatusNotFound)
			return
		}
		metrics.Error("database_error")
		logs.ErrorCtx(ctx, "failed to query application settings", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to retrieve application settings", err)
		return
	}

	if err := helper.EncodeJSON(w, settingsDoc); err != nil {
		metrics.Error("encode_error")
		logs.ErrorCtx(ctx, "failed to encode application settings response", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}

	metrics.Success()
	logs.InfoCtx(ctx, "application settings document retrieved",
		"account_id", accountID,
		"duration_ms", time.Since(start).Milliseconds())
}

func handleSaveApplicationSettings(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
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

	accountID, ok := helper.RequireAccountID(w, r)
	if !ok {
		metrics.Error("auth_error")
		logs.WarnCtx(ctx, "failed to extract accountID")
		return
	}

	var settingsDoc models.ApplicationSettings
	if !helper.DecodeJSONOrBadRequest(w, r, metrics, &settingsDoc) {
		logs.WarnCtx(ctx, "failed to decode application settings JSON", "account_id", accountID)
		return
	}

	models.UpgradeApplicationSettings(&settingsDoc, accountID, time.Now().UTC())

	if settingsDoc.MetaData.AccountID != "" && settingsDoc.MetaData.AccountID != accountID {
		metrics.Error("account_id_mismatch")
		logs.WarnCtx(ctx, "account ID mismatch", "token_account_id", accountID, "doc_account_id", settingsDoc.MetaData.AccountID)
		http.Error(w, "Account ID in document must match authenticated account", http.StatusForbidden)
		return
	}
	helper.PopulateRequestMeta(r, &settingsDoc.MetaData.MetaData, accountID)

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionApplicationSettings)

	result, retriedWithoutWSClientID, err := mongoput.UpsertApplicationSettingsDocument(ctx, collection, accountID, settingsDoc)
	if retriedWithoutWSClientID {
		logs.WarnCtx(ctx, "application settings upsert with websocket client id failed, retrying without client id",
			"account_id", accountID,
			"ws_client_id", settingsDoc.MetaData.ClientID,
			"error", err)
	}
	if err != nil {
		metrics.Error("database_error")
		logs.ErrorCtx(ctx, "failed to upsert application settings", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to save application settings", err)
		return
	}

	w.WriteHeader(http.StatusNoContent)

	metrics.Success()
	logs.InfoCtx(ctx, "application settings document saved",
		"account_id", accountID,
		"matched", result.MatchedCount,
		"upserted", result.UpsertedCount,
		"duration_ms", time.Since(start).Milliseconds())
}
