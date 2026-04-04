package v1endpoints

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"eve-industry-planner/api/helper"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/logs"

	"go.mongodb.org/mongo-driver/bson"
)

const (
	blueprintsCacheControl = "public, max-age=1800, s-maxage=3600"
)

func BlueprintsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	switch r.Method {
	case http.MethodGet:
		BlueprintGetHandler(w, r, clients)
	case http.MethodPost:
		BlueprintsPostHandler(w, r, clients)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func BlueprintGetHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	start := time.Now()
	ctx := r.Context()

	blueprintID := r.PathValue("blueprintID")
	if blueprintID == "" {
		blueprintID = strings.TrimPrefix(r.URL.Path, "/api/v1/blueprints/")
	}
	blueprintID = strings.TrimSpace(blueprintID)
	if blueprintID == "" {
		logs.WarnCtx(ctx, "v1 blueprints get: missing or empty blueprintID", "path", r.URL.Path)
		http.Error(w, "Invalid or missing blueprintID", http.StatusBadRequest)
		return
	}

	if clients == nil || clients.Mongo == nil {
		http.Error(w, "Service unavailable", http.StatusServiceUnavailable)
		return
	}

	queryCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	collection := clients.Mongo.Database(mongocore.DatabaseName).Collection(mongocore.CollectionBlueprints)
	data, found, err := mongocore.GetPublicDocumentByID(queryCtx, collection, blueprintID)
	if err != nil {
		logs.ErrorCtx(ctx, "v1 blueprints get: mongo error", "error", err, "blueprint_id", blueprintID)
		http.Error(w, "An error occurred while retrieving blueprint data. Please try again later.", http.StatusInternalServerError)
		return
	}
	if !found {
		logs.WarnCtx(ctx, "v1 blueprints get: blueprint not found", "blueprint_id", blueprintID)
		http.Error(w, "Blueprint not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Cache-Control", blueprintsCacheControl)
	if err := helper.EncodeJSON(w, data); err != nil {
		logs.ErrorCtx(ctx, "v1 blueprints get: encode error", "error", err, "blueprint_id", blueprintID)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	logs.InfoCtx(ctx, "blueprint retrieved via v1", "blueprint_id", blueprintID, "duration_ms", time.Since(start).Milliseconds())
}

type BlueprintsPostBody struct {
	IDArray []int `json:"idArray"`
}

func BlueprintsPostHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	start := time.Now()
	ctx := r.Context()

	var body BlueprintsPostBody
	if err := helper.DecodeJSONRequest(r, &body, helper.DefaultMaxBodySize); err != nil {
		logs.WarnCtx(ctx, "v1 blueprints post: invalid body", "error", err)
		http.Error(w, "Invalid or empty ID array", http.StatusBadRequest)
		return
	}
	if len(body.IDArray) == 0 {
		http.Error(w, "Invalid or empty ID array", http.StatusBadRequest)
		return
	}

	typeIDs := make([]string, 0, len(body.IDArray))
	for _, n := range body.IDArray {
		typeIDs = append(typeIDs, strconv.Itoa(n))
	}

	if clients == nil || clients.Mongo == nil {
		http.Error(w, "Service unavailable", http.StatusServiceUnavailable)
		return
	}

	queryCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	collection := clients.Mongo.Database(mongocore.DatabaseName).Collection(mongocore.CollectionBlueprints)
	docs, err := mongocore.GetPublicDocumentsByIDs(queryCtx, collection, typeIDs)
	if err != nil {
		logs.ErrorCtx(ctx, "v1 blueprints post: mongo error", "error", err)
		http.Error(w, "An error occurred while retrieving blueprint data. Please try again.", http.StatusInternalServerError)
		return
	}
	results := bsonDocsToMaps(docs)

	w.Header().Set("Cache-Control", blueprintsCacheControl)
	if err := helper.EncodeJSON(w, results); err != nil {
		logs.ErrorCtx(ctx, "v1 blueprints post: encode error", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	logs.InfoCtx(ctx, "blueprints retrieved via v1", "requested", len(typeIDs), "returned", len(results), "duration_ms", time.Since(start).Milliseconds())
}

func bsonDocsToMaps(docs []bson.M) []map[string]any {
	results := make([]map[string]any, 0, len(docs))
	for _, doc := range docs {
		results = append(results, map[string]any(doc))
	}
	return results
}
