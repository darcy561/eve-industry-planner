package groups

import (
	"context"
	"net/http"
	"strings"
	"time"

	"eve-industry-planner/api/helper"
	mongocore "eve-industry-planner/shared/core/mongo"
	mongoget "eve-industry-planner/shared/core/mongo/get"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/mongo"
)

// GetGroupByIDHandler handles GET /v1/groups/{groupID} — one group for the authenticated account.
func GetGroupByIDHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients, groupID string) {
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

	accountID, ok := helper.RequireMethodAndAccountID(w, r, metrics, http.MethodGet)
	if !ok {
		return
	}

	groupID = strings.TrimSpace(groupID)
	if groupID == "" {
		metrics.Error("bad_request")
		http.Error(w, "group ID required", http.StatusBadRequest)
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
		logs.ErrorCtx(ctx, "failed to load group by id", "error", err, "account_id", accountID, "group_id", groupID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to retrieve group", err)
		return
	}

	if err := helper.EncodeJSON(w, group); err != nil {
		metrics.Error("encode_error")
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}

	metrics.Success()
	logs.InfoCtx(ctx, "single group retrieved",
		"account_id", accountID,
		"group_id", groupID,
		"duration_ms", time.Since(start).Milliseconds())
}
