package groups

import (
	"context"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	mongocore "eve-industry-planner/shared/core/mongo"
	mongoget "eve-industry-planner/shared/core/mongo/get"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

// GetGroupsHandler handles GET /v1/groups - retrieve all groups for the authenticated user
func GetGroupsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)
	m := apimetrics.GetAPIGroups()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncSuccesses:    func(ctx context.Context) { m.Successes.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	// Only allow GET requests
	if !helper.RequireMethod(w, r, http.MethodGet) {
		metrics.Error("method_not_allowed")
		logs.WarnCtx(ctx, "invalid method for getGroups endpoint")
		return
	}

	accountID, ok := helper.RequireAccountID(w, r)
	if !ok {
		metrics.Error("auth_error")
		logs.WarnCtx(ctx, "failed to extract accountID")
		return
	}

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionUserJobGroups)

	groups, err := mongoget.LoadGroupsByAccount(ctx, collection, accountID)
	if err != nil {
		metrics.Error("database_error")
		logs.ErrorCtx(ctx, "failed to query groups", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to retrieve groups", err)
		return
	}

	if err := helper.EncodeJSON(w, groups); err != nil {
		metrics.Error("encode_error")
		logs.ErrorCtx(ctx, "failed to encode groups response", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}

	metrics.Success()
	m.GroupsRequested.Observe(ctx, float64(len(groups)))
	logs.InfoCtx(ctx, "user groups retrieved",
		"account_id", accountID,
		"group_count", len(groups),
		"duration_ms", time.Since(start).Milliseconds())
}
