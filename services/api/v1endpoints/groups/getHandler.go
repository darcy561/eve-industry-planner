package groups

import (
	"context"
	"eve-industry-planner/shared/stackservices"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	mongocore "eve-industry-planner/shared/core/mongo"
	mongoget "eve-industry-planner/shared/core/mongo/get"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

// GetGroupsHandler handles GET /v1/groups - retrieve all groups for the authenticated user
func GetGroupsHandler(w http.ResponseWriter, r *http.Request, clients *stackservices.Clients) {
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

	if !helper.RequireMethod(w, r, http.MethodGet) {
		metrics.Error("method_not_allowed")
		return
	}

	accountID := helper.AuthenticatedAccountID(r)

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionUserJobGroups)

	groups, err := mongoget.LoadGroupsByAccount(ctx, collection, accountID)
	if err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to retrieve groups", "failed to query groups", "groups_query_failed", "groups_get", err, nil)
		return
	}

	logs.AttachDebugStep(r, "mongo_query_completed", map[string]interface{}{
		"group_count": len(groups),
	})

	if err := helper.EncodeJSON(w, groups); err != nil {
		metrics.Error("encode_error")
		helper.RespondEndpointServerError(w, r, "Internal server error", "failed to encode groups response", "groups_encode_failed", "groups_get", err, nil)
		return
	}

	metrics.Success()
	m.GroupsRequested.Observe(ctx, float64(len(groups)))
	logs.AttachHandlerSuccessDetail(r, "user groups retrieved", map[string]interface{}{
		"group_count": len(groups),
		"duration_ms": time.Since(start).Milliseconds(),
	})
}
