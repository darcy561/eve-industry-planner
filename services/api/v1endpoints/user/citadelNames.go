package user

import (
	"context"
	"errors"
	"eve-industry-planner/shared/stackservices"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"eve-industry-planner/api/helper"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/logs"
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

func CitadelNamesHandler(w http.ResponseWriter, r *http.Request, clients *stackservices.Clients) {
	ctx := r.Context()
	switch r.Method {
	case http.MethodPost:
		handleSubmitCitadelName(w, r, clients)
	default:
		m := apimetrics.GetAPICitadelNames()
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed. Use POST to submit citadel names.", "invalid method for citadel names endpoint", "citadel_names_method_not_allowed", "citadel_names", nil, map[string]interface{}{"method": r.Method})
	}
}

func CitadelNameByIDHandler(w http.ResponseWriter, r *http.Request, clients *stackservices.Clients) {
	ctx := r.Context()
	switch r.Method {
	case http.MethodGet:
		handleGetCitadelNameByID(w, r, clients)
	default:
		m := apimetrics.GetAPICitadelNames()
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed. Use GET to resolve citadel names.", "invalid method for citadel name lookup endpoint", "citadel_name_lookup_method_not_allowed", "citadel_names", nil, map[string]interface{}{"method": r.Method})
	}
}

func handleSubmitCitadelName(w http.ResponseWriter, r *http.Request, clients *stackservices.Clients) {
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
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "submissions or id+name required", "citadel names submit: missing submissions", "citadel_names_missing_submissions", "citadel_names", nil, nil)
		return
	}
	if len(items) > maxCitadelNameBatch {
		metrics.Error("validation_error")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, fmt.Sprintf("at most %d submissions per request", maxCitadelNameBatch), "citadel names submit: batch too large", "citadel_names_batch_too_large", "citadel_names", nil, map[string]interface{}{"count": len(items), "max": maxCitadelNameBatch})
		return
	}

	// Last occurrence wins if the same id appears twice.
	byID := make(map[int64]citadelNameSubmission, len(items))
	for _, it := range items {
		name := strings.TrimSpace(it.Name)
		if it.ID <= 0 || name == "" {
			metrics.Error("validation_error")
			helper.RespondEndpointError(w, r, http.StatusBadRequest, "each submission needs a positive id and non-empty name", "citadel names submit: invalid submission", "citadel_names_invalid_submission", "citadel_names", nil, nil)
			return
		}
		if len(name) > 300 {
			metrics.Error("validation_error")
			helper.RespondEndpointError(w, r, http.StatusBadRequest, "name is too long", "citadel names submit: name too long", "citadel_names_name_too_long", "citadel_names", nil, nil)
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
		helper.RespondEndpointServerError(w, r, "Failed to submit citadel names", "failed to bulk upsert citadel names", "citadel_names_upsert_failed", "citadel_names", err, map[string]interface{}{"count": len(writes)})
		return
	}

	logs.AttachDebugStep(r, "mongo_upsert_completed", map[string]interface{}{
		"count": len(writes),
	})

	w.WriteHeader(http.StatusNoContent)
	metrics.Success()
	logs.AttachHandlerSuccessDetail(r, "citadel names submitted", map[string]interface{}{
		"count":       len(writes),
		"duration_ms": time.Since(start).Milliseconds(),
	})
}

func handleGetCitadelNameByID(w http.ResponseWriter, r *http.Request, clients *stackservices.Clients) {
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
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "Invalid citadel ID", "citadel name lookup: invalid citadel id", "citadel_name_invalid_id", "citadel_names", err, map[string]interface{}{"citadel_id_raw": citadelIDRaw})
		return
	}

	coll := clients.Mongo.Database(mongocore.DatabaseName).Collection(mongocore.CollectionCitadelNames)
	var record citadelNameRecord
	if err := coll.FindOne(ctx, bson.M{"_id": citadelID}).Decode(&record); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			metrics.Error("not_found")
			helper.RespondEndpointError(w, r, http.StatusNotFound, "Citadel name not found", "citadel name not found", "citadel_name_not_found", "citadel_names", nil, map[string]interface{}{"citadel_id": citadelID})
			return
		}
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to retrieve citadel name", "failed to retrieve citadel name", "citadel_name_query_failed", "citadel_names", err, map[string]interface{}{"citadel_id": citadelID})
		return
	}

	logs.AttachDebugStep(r, "mongo_query_completed", map[string]interface{}{
		"citadel_id": citadelID,
	})

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
		helper.RespondEndpointServerError(w, r, "Internal server error", "failed to encode citadel name response", "citadel_name_encode_failed", "citadel_names", err, map[string]interface{}{"citadel_id": citadelID})
		return
	}

	metrics.Success()
	logs.AttachHandlerSuccessDetail(r, "citadel name resolved", map[string]interface{}{
		"id":          citadelID,
		"duration_ms": time.Since(start).Milliseconds(),
	})
}

func setCitadelLookupCacheHeaders(w http.ResponseWriter, etag string) {
	w.Header().Set("Cache-Control", citadelNamesBrowserCacheControl)
	w.Header().Set("CDN-Cache-Control", citadelNamesCDNCacheControl)
	// Explicit Cloudflare override header (supported by Cloudflare).
	w.Header().Set("Cloudflare-CDN-Cache-Control", citadelNamesCDNCacheControl)
	w.Header().Set("ETag", etag)
}
