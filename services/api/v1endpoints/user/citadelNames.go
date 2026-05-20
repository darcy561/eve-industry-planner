package user

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"eve-industry-planner/api/helper"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const maxCitadelNameBatch = 200

// structurePosition matches ESI GET /universe/structures/{structure_id}/ position object.
type structurePosition struct {
	X float64 `json:"x" bson:"x"`
	Y float64 `json:"y" bson:"y"`
	Z float64 `json:"z" bson:"z"`
}

// citadelNameSubmission matches the ESI structure body plus required id (structure_id path).
// Optional fields use pointers so legacy `{id,name}` JSON does not unset stored ESI fields.
type citadelNameSubmission struct {
	ID            int64              `json:"id"`
	Name          string             `json:"name"`
	SolarSystemID *int32             `json:"solar_system_id,omitempty"`
	TypeID        *int32             `json:"type_id,omitempty"`
	Position      *structurePosition `json:"position,omitempty"`
}

// citadelNamesSubmitRequest supports batch `submissions` or a single legacy `{id,name}` body.
type citadelNamesSubmitRequest struct {
	Submissions []citadelNameSubmission `json:"submissions"`
	ID          int64                   `json:"id"`
	Name        string                  `json:"name"`
}

type citadelNameRecord struct {
	ID            int64              `bson:"_id" json:"id"`
	Name          string             `bson:"name" json:"name"`
	SolarSystemID *int32             `bson:"solar_system_id,omitempty" json:"solar_system_id,omitempty"`
	TypeID        *int32             `bson:"type_id,omitempty" json:"type_id,omitempty"`
	Position      *structurePosition `bson:"position,omitempty" json:"position,omitempty"`
	FirstSeenAt   time.Time          `bson:"firstSeenAt" json:"firstSeenAt"`
	LastSeenAt    time.Time          `bson:"lastSeenAt" json:"lastSeenAt"`
	SubmitCount   int64              `bson:"submitCount" json:"submitCount"`
}

type citadelNameLookupResponse struct {
	ID            int64              `json:"id"`
	Name          string             `json:"name"`
	Source        string             `json:"source"`
	SolarSystemID *int32             `json:"solar_system_id,omitempty"`
	TypeID        *int32             `json:"type_id,omitempty"`
	Position      *structurePosition `json:"position,omitempty"`
}

const (
	// Browser cache: 7 days fresh.
	citadelNamesBrowserCacheControl = "public, max-age=604800, stale-while-revalidate=86400"
	// CDN cache (Cloudflare): 30 days fresh.
	citadelNamesCDNCacheControl = "public, s-maxage=2592000, stale-while-revalidate=604800, stale-if-error=604800"
)

func CitadelNamesHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	switch r.Method {
	case http.MethodPost:
		handleSubmitCitadelName(w, r, clients)
	default:
		m := apimetrics.GetAPICitadelNames()
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		logs.WarnCtx(ctx, "invalid method for citadel names endpoint")
		http.Error(w, "Method not allowed. Use POST to submit citadel names.", http.StatusMethodNotAllowed)
	}
}

func CitadelNameByIDHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	switch r.Method {
	case http.MethodGet:
		handleGetCitadelNameByID(w, r, clients)
	default:
		m := apimetrics.GetAPICitadelNames()
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		logs.WarnCtx(ctx, "invalid method for citadel name lookup endpoint")
		http.Error(w, "Method not allowed. Use GET to resolve citadel names.", http.StatusMethodNotAllowed)
	}
}

func handleSubmitCitadelName(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)
	m := apimetrics.GetAPICitadelNames()
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

	var body citadelNamesSubmitRequest
	if !helper.DecodeJSONOrBadRequest(w, r, metrics, &body) {
		return
	}

	items := body.Submissions
	if len(items) == 0 {
		n := strings.TrimSpace(body.Name)
		if body.ID > 0 && n != "" {
			items = []citadelNameSubmission{{ID: body.ID, Name: n}}
		}
	}
	if len(items) == 0 {
		metrics.Error("validation_error")
		http.Error(w, "submissions or id+name required", http.StatusBadRequest)
		return
	}
	if len(items) > maxCitadelNameBatch {
		metrics.Error("validation_error")
		http.Error(w, fmt.Sprintf("at most %d submissions per request", maxCitadelNameBatch), http.StatusBadRequest)
		return
	}

	// Last occurrence wins if the same id appears twice.
	byID := make(map[int64]citadelNameSubmission, len(items))
	for _, it := range items {
		name := strings.TrimSpace(it.Name)
		if it.ID <= 0 || name == "" {
			metrics.Error("validation_error")
			http.Error(w, "each submission needs a positive id and non-empty name", http.StatusBadRequest)
			return
		}
		if len(name) > 300 {
			metrics.Error("validation_error")
			http.Error(w, "name is too long", http.StatusBadRequest)
			return
		}
		byID[it.ID] = citadelNameSubmission{ID: it.ID, Name: name}
	}

	now := time.Now().UTC()
	coll := clients.Mongo.Database(mongocore.DatabaseName).Collection(mongocore.CollectionCitadelNames)

	var writes []mongo.WriteModel
	for _, s := range byID {
		writes = append(writes, mongo.NewUpdateOneModel().
			SetFilter(bson.M{"_id": s.ID}).
			SetUpdate(bson.M{
				"$set": bson.M{
					"name":       s.Name,
					"lastSeenAt": now,
				},
				"$setOnInsert": bson.M{
					"firstSeenAt": now,
				},
				"$inc": bson.M{
					"submitCount": 1,
				},
			}).
			SetUpsert(true))
	}

	bulkOpts := options.BulkWrite().SetOrdered(false)
	_, err := coll.BulkWrite(ctx, writes, bulkOpts)
	if err != nil {
		metrics.Error("database_error")
		logs.ErrorCtx(ctx, "failed to bulk upsert citadel names", "account_id", accountID, "count", len(writes), "err", err)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to submit citadel names", err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
	metrics.Success()
	logs.InfoCtx(ctx, "citadel names submitted",
		"account_id", accountID,
		"count", len(writes),
		"duration_ms", time.Since(start).Milliseconds())
}

func handleGetCitadelNameByID(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)
	m := apimetrics.GetAPICitadelNames()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncSuccesses:    func(ctx context.Context) { m.Successes.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	citadelIDRaw := r.PathValue("citadelID")
	citadelID, err := strconv.ParseInt(strings.TrimSpace(citadelIDRaw), 10, 64)
	if err != nil || citadelID <= 0 {
		metrics.Error("validation_error")
		http.Error(w, "Invalid citadel ID", http.StatusBadRequest)
		return
	}

	coll := clients.Mongo.Database(mongocore.DatabaseName).Collection(mongocore.CollectionCitadelNames)
	var record citadelNameRecord
	if err := coll.FindOne(ctx, bson.M{"_id": citadelID}).Decode(&record); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			metrics.Error("not_found")
			http.Error(w, "Citadel name not found", http.StatusNotFound)
			return
		}
		metrics.Error("database_error")
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to retrieve citadel name", err)
		return
	}

	response := citadelNameLookupResponse{
		ID:     record.ID,
		Name:   record.Name,
		Source: "community",
	}

	etag := fmt.Sprintf(`W/"citadel-%d-%d"`, record.ID, record.LastSeenAt.Unix())
	setCitadelLookupCacheHeaders(w, etag)
	if strings.TrimSpace(r.Header.Get("If-None-Match")) == etag {
		w.WriteHeader(http.StatusNotModified)
		metrics.Success()
		return
	}

	if err := helper.EncodeJSON(w, response); err != nil {
		metrics.Error("encode_error")
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}

	metrics.Success()
	logs.InfoCtx(ctx, "citadel name resolved",
		"id", citadelID,
		"duration_ms", time.Since(start).Milliseconds())
}

func setCitadelLookupCacheHeaders(w http.ResponseWriter, etag string) {
	w.Header().Set("Cache-Control", citadelNamesBrowserCacheControl)
	w.Header().Set("CDN-Cache-Control", citadelNamesCDNCacheControl)
	// Explicit Cloudflare override header (supported by Cloudflare).
	w.Header().Set("Cloudflare-CDN-Cache-Control", citadelNamesCDNCacheControl)
	w.Header().Set("ETag", etag)
}
