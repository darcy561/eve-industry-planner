package groups

import (
	"context"
	"eve-industry-planner/shared/stackservices"
	"net/http"
	"strings"
	"time"

	"eve-industry-planner/api/helper"
	mongocore "eve-industry-planner/shared/core/mongo"
	mongoget "eve-industry-planner/shared/core/mongo/get"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/mongo"
)

// GetGroupByIDHandler handles GET /v1/groups/{groupID} — one group for the authenticated account.
func GetGroupByIDHandler(w http.ResponseWriter, r *http.Request, clients *stackservices.Clients, groupID string) {
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

	groupID = strings.TrimSpace(groupID)
	if groupID == "" {
		metrics.Error("bad_request")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "group ID required", "groups get by id: missing group id", "groups_missing_group_id", "groups_get", nil, nil)
		return
	}

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionUserJobGroups)

	group, err := mongoget.LoadGroupByID(ctx, collection, accountID, groupID)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			helper.RespondNotFound(w, r, metrics)
			return
		}
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to retrieve group", "failed to load group by id", "groups_get_by_id_failed", "groups_get", err, map[string]interface{}{"group_id": groupID})
		return
	}

	logs.AttachDebugStep(r, "mongo_query_completed", map[string]interface{}{
		"group_id": groupID,
	})

	if err := helper.EncodeJSON(w, group); err != nil {
		metrics.Error("encode_error")
		helper.RespondEndpointServerError(w, r, "Internal server error", "failed to encode group response", "groups_encode_failed", "groups_get", err, map[string]interface{}{"group_id": groupID})
		return
	}

	metrics.Success()
	logs.AttachHandlerSuccessDetail(r, "single group retrieved", map[string]interface{}{
		"group_id":    groupID,
		"duration_ms": time.Since(start).Milliseconds(),
	})
}
