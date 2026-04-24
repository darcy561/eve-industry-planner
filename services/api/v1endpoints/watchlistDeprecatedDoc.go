package v1endpoints

import (
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// WatchlistDeprecatedDocumentHandler serves GET/PUT for the legacy Firestore-shaped watchlist blob.
func WatchlistDeprecatedDocumentHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	switch r.Method {
	case http.MethodGet:
		handleGetWatchlistDeprecated(w, r, clients)
	case http.MethodPut:
		handlePutWatchlistDeprecated(w, r, clients)
	default:
		m := apimetrics.GetAPIEveTokenLogin()
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		logs.WarnCtx(ctx, "invalid method for watchlist-deprecated endpoint")
		http.Error(w, "Method not allowed. Use GET or PUT.", http.StatusMethodNotAllowed)
	}
}

func handleGetWatchlistDeprecated(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start, ok := logs.RequestStartTime(ctx)
	if !ok {
		start = time.Now()
	}
	m := apimetrics.GetAPIEveTokenLogin()

	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		m.Errors.WithLabelValues("auth_error").Inc(ctx)
		logs.WarnCtx(ctx, "failed to extract accountID", "error", err)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionUserWatchlistDeprecated)

	var raw bson.M
	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("find watchlist deprecated %s", accountID)

	err = mongocore.RetryMongoOperation(ctx, retryConfig, func() error {
		return collection.FindOne(ctx, bson.M{"_id": accountID}).Decode(&raw)
	})
	if err != nil {
		if err == mongo.ErrNoDocuments {
			resp := map[string]any{
				"groups": []any{},
				"items":  []any{},
			}
			if err := helper.EncodeJSON(w, resp); err != nil {
				logs.ErrorCtx(ctx, "failed to encode empty watchlist response", "error", err, "account_id", accountID)
				logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
				return
			}
			m.Successes.Inc(ctx)
			return
		}
		m.Errors.WithLabelValues("database_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to query watchlist deprecated", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to retrieve watchlist", err)
		return
	}

	groups, items := coalesceGroupsItemsFromDoc(raw)
	resp := map[string]any{
		"groups": groups,
		"items":  items,
	}
	if err := helper.EncodeJSON(w, resp); err != nil {
		logs.ErrorCtx(ctx, "failed to encode watchlist response", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}

	m.Successes.Inc(ctx)
	logs.InfoCtx(ctx, "watchlist deprecated document retrieved",
		"account_id", accountID,
		"duration_ms", time.Since(start).Milliseconds())
}

func coalesceGroupsItemsFromDoc(raw bson.M) (any, any) {
	var groups any = []any{}
	var items any = []any{}
	if g, ok := raw["groups"]; ok {
		groups = g
	}
	if it, ok := raw["items"]; ok {
		items = it
	}
	return groups, items
}

func handlePutWatchlistDeprecated(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start, ok := logs.RequestStartTime(ctx)
	if !ok {
		start = time.Now()
	}
	m := apimetrics.GetAPIEveTokenLogin()

	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		m.Errors.WithLabelValues("auth_error").Inc(ctx)
		logs.WarnCtx(ctx, "failed to extract accountID", "error", err)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var body struct {
		Groups any `json:"groups"`
		Items  any `json:"items"`
	}
	if err := helper.DecodeJSONRequest(r, &body, helper.DefaultMaxBodySize); err != nil {
		m.Errors.WithLabelValues("invalid_json").Inc(ctx)
		logs.WarnCtx(ctx, "failed to decode watchlist JSON", "error", err, "account_id", accountID)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	groups, err := asJSONArray("groups", body.Groups)
	if err != nil {
		m.Errors.WithLabelValues("invalid_json").Inc(ctx)
		logs.WarnCtx(ctx, "invalid watchlist groups", "error", err, "account_id", accountID)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	items, err := asJSONArray("items", body.Items)
	if err != nil {
		m.Errors.WithLabelValues("invalid_json").Inc(ctx)
		logs.WarnCtx(ctx, "invalid watchlist items", "error", err, "account_id", accountID)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	now := time.Now().UTC()
	doc := bson.M{
		"_id":     accountID,
		"groups":  groups,
		"items":   items,
		"_meta": bson.M{
			"accountID":    accountID,
			"lastModified": now,
		},
	}

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionUserWatchlistDeprecated)

	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("upsert watchlist deprecated %s", accountID)

	var result *mongo.UpdateResult
	err = mongocore.RetryMongoOperation(ctx, retryConfig, func() error {
		var opErr error
		result, opErr = collection.ReplaceOne(
			ctx,
			bson.M{"_id": accountID},
			doc,
			options.Replace().SetUpsert(true),
		)
		return opErr
	})
	if err != nil {
		m.Errors.WithLabelValues("database_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to upsert watchlist deprecated", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to save watchlist", err)
		return
	}

	w.WriteHeader(http.StatusNoContent)

	m.Successes.Inc(ctx)
	logs.InfoCtx(ctx, "watchlist deprecated document saved",
		"account_id", accountID,
		"matched", result.MatchedCount,
		"upserted", result.UpsertedCount,
		"duration_ms", time.Since(start).Milliseconds())
}

func asJSONArray(fieldName string, v any) (any, error) {
	if v == nil {
		return bson.A{}, nil
	}
	switch x := v.(type) {
	case []any:
		return x, nil
	case bson.A:
		return x, nil
	default:
		return nil, fmt.Errorf("%s must be a JSON array", fieldName)
	}
}
