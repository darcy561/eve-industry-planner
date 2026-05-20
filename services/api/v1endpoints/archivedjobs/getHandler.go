package archivedjobs

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	"eve-industry-planner/api/helper"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const (
	defaultArchivedJobsPageSize = 50
	maxArchivedJobsPageSize     = 200
)

type archivedJobsListProjection struct {
	JobID               string `bson:"jobID" json:"jobID"`
	Name                string `bson:"name" json:"name"`
	ItemID              int    `bson:"itemID" json:"itemID"`
	JobType             int    `bson:"jobType" json:"jobType"`
	JobStatus           int    `bson:"jobStatus" json:"jobStatus"`
	GroupID             string `bson:"groupID" json:"groupID"`
	ItemsProducedPerRun int    `bson:"itemsProducedPerRun" json:"itemsProducedPerRun"`
	IsReadyToSell       bool   `bson:"isReadyToSell" json:"isReadyToSell"`
	Meta                struct {
		ArchivedAt time.Time `bson:"archivedAt" json:"archivedAt"`
	} `bson:"_meta" json:"_meta"`
}

type archivedJobsPagination struct {
	Page     int  `json:"page"`
	PageSize int  `json:"pageSize"`
	HasMore  bool `json:"hasMore"`
}

type archivedJobsListResponse struct {
	Items      []archivedJobsListProjection `json:"items"`
	Pagination archivedJobsPagination       `json:"pagination"`
}

func parsePositiveInt(raw string, fallback int) (int, error) {
	if raw == "" {
		return fallback, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return 0, errors.New("must be a positive integer")
	}
	return n, nil
}

// GetArchivedJobsHandler handles GET /api/v1/archived-jobs (paginated, most recent first).
// Returns lightweight rows only; excludes heavy nested build/material/order payloads.
func GetArchivedJobsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	m := apimetrics.GetAPIArchivedJobs()
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
	if clients == nil || clients.Mongo == nil {
		metrics.Error("mongo_client_missing")
		logs.RespondHTTPError(w, r, http.StatusServiceUnavailable, "Service unavailable", errors.New("mongo client missing"))
		return
	}

	page, err := parsePositiveInt(r.URL.Query().Get("page"), 1)
	if err != nil {
		metrics.Error("invalid_page")
		http.Error(w, "invalid page: must be a positive integer", http.StatusBadRequest)
		return
	}
	pageSize, err := parsePositiveInt(r.URL.Query().Get("pageSize"), defaultArchivedJobsPageSize)
	if err != nil {
		metrics.Error("invalid_page_size")
		http.Error(w, "invalid pageSize: must be a positive integer", http.StatusBadRequest)
		return
	}
	if pageSize > maxArchivedJobsPageSize {
		pageSize = maxArchivedJobsPageSize
	}

	filter := bson.M{"_meta.accountID": accountID}
	skip := int64((page - 1) * pageSize)
	limit := int64(pageSize + 1) // fetch one extra row to compute hasMore
	opts := options.Find().
		SetSort(bson.D{{Key: "_meta.archivedAt", Value: -1}, {Key: "_id", Value: -1}}).
		SetSkip(skip).
		SetLimit(limit).
		SetProjection(bson.M{
			"_id":                 0,
			"jobID":               1,
			"name":                1,
			"itemID":              1,
			"jobType":             1,
			"jobStatus":           1,
			"groupID":             1,
			"itemsProducedPerRun": 1,
			"isReadyToSell":       1,
			"_meta.archivedAt":    1,
		})

	coll := clients.Mongo.Database(mongocore.DatabaseName).Collection(mongocore.CollectionArchivedJobs)
	rows := make([]archivedJobsListProjection, 0, pageSize+1)
	retryCfg := mongocore.DefaultRetryConfig()
	retryCfg.OperationName = "list archived jobs"
	if err := mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
		cur, e := coll.Find(ctx, filter, opts)
		if e != nil {
			return e
		}
		defer cur.Close(ctx)
		return cur.All(ctx, &rows)
	}); err != nil {
		metrics.Error("database_error")
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to list archived jobs", err)
		return
	}

	hasMore := len(rows) > pageSize
	if hasMore {
		rows = rows[:pageSize]
	}
	resp := archivedJobsListResponse{
		Items: rows,
		Pagination: archivedJobsPagination{
			Page:     page,
			PageSize: pageSize,
			HasMore:  hasMore,
		},
	}
	w.WriteHeader(http.StatusOK)
	if err := helper.EncodeJSON(w, resp); err != nil {
		metrics.Error("encode_error")
		return
	}
	metrics.Success()
}
