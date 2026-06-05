package user

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/core/config"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared/models"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

type cloudStoredEsiRefreshTokensRequest struct {
	RefreshTokens []models.RefreshToken `json:"refreshTokens"`
}

type cloudStoredEsiRefreshTokenDeleteRequest struct {
	CharacterHashes []string `json:"characterHashes"`
}

type cloudStoredEsiRefreshTokensResponse struct {
	RefreshTokens []models.RefreshToken `json:"refreshTokens"`
}

func CloudStoredEsiRefreshTokensHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	m := apimetrics.GetAPICloudStoredEsiRefreshTokens()
	switch r.Method {
	case http.MethodGet:
		handleGetCloudStoredEsiRefreshTokens(w, r, clients)
	case http.MethodPut:
		handlePutCloudStoredEsiRefreshTokens(w, r, clients)
	case http.MethodDelete:
		handleDeleteCloudStoredEsiRefreshTokens(w, r, clients)
	default:
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed. Use GET, PUT, or DELETE.", "invalid method for cloud stored ESI refresh tokens endpoint", "linked_chars_method_not_allowed", "cloud_stored_esi_refresh_tokens", nil, map[string]interface{}{"method": r.Method})
	}
}

func handleGetCloudStoredEsiRefreshTokens(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	m := apimetrics.GetAPICloudStoredEsiRefreshTokens()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncSuccesses:    func(ctx context.Context) { m.Successes.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	accountID := helper.AuthenticatedAccountID(r)

	// GET returns linked-character hashes only. OAuth refresh material stays encrypted server-side;
	// clients obtain ESI access via POST /api/v1/esi/characters/access-token/server.
	col := clients.Mongo.Database(mongocore.DatabaseName).Collection(mongocore.CollectionUsers)
	var userDoc models.UserAccountDocument
	if err := col.FindOne(ctx, bson.M{"_id": accountID, "_meta.accountID": accountID}).Decode(&userDoc); err != nil {
		if err == mongo.ErrNoDocuments {
			metrics.Error("not_found")
			helper.RespondEndpointError(w, r, http.StatusNotFound, "User document not found", "linked chars user doc not found", "linked_chars_user_not_found", "cloud_stored_esi_refresh_tokens", nil, map[string]interface{}{
				"additional_chars_endpoint": "linked_characters_oauth_credentials",
				"operation":                 "get",
			})
			return
		}
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to load user document", "linked chars user doc load", "linked_chars_user_doc_load", "cloud_stored_esi_refresh_tokens", err, map[string]interface{}{
			"additional_chars_endpoint": "linked_characters_oauth_credentials",
			"operation":                 "get",
		})
		return
	}

	out := make([]models.RefreshToken, 0, len(userDoc.RefreshTokens))
	for i := range userDoc.RefreshTokens {
		row := userDoc.RefreshTokens[i]
		hash := strings.TrimSpace(row.CharacterHash)
		if hash == "" {
			continue
		}
		out = append(out, models.RefreshToken{
			CharacterHash: hash,
		})
	}

	if err := helper.EncodeJSON(w, cloudStoredEsiRefreshTokensResponse{RefreshTokens: out}); err != nil {
		metrics.Error("encode_error")
		helper.RespondEndpointServerError(w, r, "Internal server error", "linked chars response encode", "linked_chars_response_encode", "cloud_stored_esi_refresh_tokens", err, map[string]interface{}{
			"additional_chars_endpoint": "linked_characters_oauth_credentials",
			"operation":                 "get",
					})
		return
	}
	metrics.Success()
	logs.AttachDebugStep(r, "linked_chars_loaded", map[string]interface{}{
		"character_count": len(out),
	})
}

func handlePutCloudStoredEsiRefreshTokens(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	m := apimetrics.GetAPICloudStoredEsiRefreshTokens()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncSuccesses:    func(ctx context.Context) { m.Successes.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	accountID := helper.AuthenticatedAccountID(r)

	cfg, err := config.LoadConfig()
	if err != nil {
		metrics.Error("config_error")
		helper.RespondEndpointServerError(w, r, "Internal server error", "linked chars config load", "linked_chars_config_load", "cloud_stored_esi_refresh_tokens", err, map[string]interface{}{
			"additional_chars_endpoint": "linked_characters_oauth_credentials",
			"operation":                 "put",
					})
		return
	}
	if cfg.RefreshTokenKeyring == nil {
		metrics.Error("config_error")
		helper.RespondEndpointServerError(w, r, "Refresh token keyring not configured", "linked chars keyring missing", "linked_chars_keyring_missing", "cloud_stored_esi_refresh_tokens", fmt.Errorf("refresh token keyring is nil"), map[string]interface{}{
			"additional_chars_endpoint": "linked_characters_oauth_credentials",
			"operation":                 "put",
					})
		return
	}

	var req cloudStoredEsiRefreshTokensRequest
	if !helper.DecodeJSONOrBadRequest(w, r, metrics, &req) {
		return
	}

	col := clients.Mongo.Database(mongocore.DatabaseName).Collection(mongocore.CollectionUsers)
	var existingDoc models.UserAccountDocument
	if err := col.FindOne(ctx, bson.M{"_id": accountID, "_meta.accountID": accountID}).Decode(&existingDoc); err != nil {
		if err == mongo.ErrNoDocuments {
			metrics.Error("not_found")
			helper.RespondEndpointError(w, r, http.StatusNotFound, "User document not found", "linked chars user doc not found", "linked_chars_user_not_found", "cloud_stored_esi_refresh_tokens", nil, map[string]interface{}{
				"additional_chars_endpoint": "linked_characters_oauth_credentials",
				"operation":                 "put",
			})
			return
		}
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to load user document", "linked chars user doc load", "linked_chars_user_doc_load", "cloud_stored_esi_refresh_tokens", err, map[string]interface{}{
			"additional_chars_endpoint": "linked_characters_oauth_credentials",
			"operation":                 "put",
		})
		return
	}

	prevByHash := make(map[string]models.RefreshToken, len(existingDoc.RefreshTokens))
	for _, row := range existingDoc.RefreshTokens {
		hash := strings.ToLower(strings.TrimSpace(row.CharacterHash))
		if hash == "" {
			continue
		}
		prevByHash[hash] = row
	}

	nextRows := make([]models.RefreshToken, 0, len(existingDoc.RefreshTokens)+len(req.RefreshTokens))
	used := make(map[string]struct{}, len(req.RefreshTokens))
	for i := range req.RefreshTokens {
		row := req.RefreshTokens[i]
		row.CharacterHash = strings.TrimSpace(row.CharacterHash)
		if row.CharacterHash == "" {
			continue
		}
		key := strings.ToLower(row.CharacterHash)
		if strings.TrimSpace(row.RToken) != "" {
			if err := row.EncryptRefreshAtRest(row.RToken, cfg.RefreshTokenKeyring); err != nil {
				metrics.Error("validation_error")
				helper.RespondEndpointError(w, r, http.StatusBadRequest, "Invalid refresh token payload", "linked chars invalid refresh token payload", "linked_chars_invalid_refresh_token", "cloud_stored_esi_refresh_tokens", err, map[string]interface{}{
					"additional_chars_endpoint": "linked_characters_oauth_credentials",
					"operation":                 "put",
				})
				return
			}
			nextRows = append(nextRows, row)
			used[key] = struct{}{}
			continue
		}
		if prev, ok := prevByHash[key]; ok && prev.RTokenCiphertext != "" {
			nextRows = append(nextRows, prev)
			used[key] = struct{}{}
		}
	}
	for _, row := range existingDoc.RefreshTokens {
		hash := strings.TrimSpace(row.CharacterHash)
		if hash == "" {
			continue
		}
		key := strings.ToLower(hash)
		if _, ok := used[key]; ok {
			continue
		}
		nextRows = append(nextRows, row)
	}

	retryCfg := mongocore.DefaultRetryConfig()
	retryCfg.OperationName = fmt.Sprintf("update cloud-stored ESI refresh tokens %s", accountID)
	if err := mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
		_, err := col.UpdateOne(ctx, bson.M{"_id": accountID, "_meta.accountID": accountID}, bson.M{
			"$set": bson.M{
				"refreshTokens":      nextRows,
				"_meta.lastModified": time.Now().UTC(),
			},
		})
		return err
	}); err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to save refresh tokens", "linked chars refresh tokens save", "linked_chars_refresh_tokens_save", "cloud_stored_esi_refresh_tokens", err, map[string]interface{}{
			"additional_chars_endpoint": "linked_characters_oauth_credentials",
			"operation":                 "put",
					})
		return
	}

	w.WriteHeader(http.StatusNoContent)
	metrics.Success()
	logs.AttachDebugStep(r, "tokens_merged", map[string]interface{}{
		"incoming_count": len(req.RefreshTokens),
		"result_count":   len(nextRows),
	})
}

func handleDeleteCloudStoredEsiRefreshTokens(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	m := apimetrics.GetAPICloudStoredEsiRefreshTokens()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncSuccesses:    func(ctx context.Context) { m.Successes.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	accountID := helper.AuthenticatedAccountID(r)

	var req cloudStoredEsiRefreshTokenDeleteRequest
	if !helper.DecodeJSONOrBadRequest(w, r, metrics, &req) {
		return
	}

	toRemove := make(map[string]struct{}, len(req.CharacterHashes))
	for _, hash := range req.CharacterHashes {
		key := strings.ToLower(strings.TrimSpace(hash))
		if key == "" {
			continue
		}
		toRemove[key] = struct{}{}
	}
	if len(toRemove) == 0 {
		metrics.Error("validation_error")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "characterHashes must include at least one hash", "linked chars delete: no character hashes", "linked_chars_delete_no_hashes", "cloud_stored_esi_refresh_tokens", nil, map[string]interface{}{
			"additional_chars_endpoint": "linked_characters_oauth_credentials",
			"operation":                 "delete",
		})
		return
	}

	col := clients.Mongo.Database(mongocore.DatabaseName).Collection(mongocore.CollectionUsers)
	var existingDoc models.UserAccountDocument
	if err := col.FindOne(ctx, bson.M{"_id": accountID, "_meta.accountID": accountID}).Decode(&existingDoc); err != nil {
		if err == mongo.ErrNoDocuments {
			metrics.Error("not_found")
			helper.RespondEndpointError(w, r, http.StatusNotFound, "User document not found", "linked chars user doc not found", "linked_chars_user_not_found", "cloud_stored_esi_refresh_tokens", nil, map[string]interface{}{
				"additional_chars_endpoint": "linked_characters_oauth_credentials",
				"operation":                 "delete",
			})
			return
		}
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to load user document", "linked chars user doc load", "linked_chars_user_doc_load", "cloud_stored_esi_refresh_tokens", err, map[string]interface{}{
			"additional_chars_endpoint": "linked_characters_oauth_credentials",
			"operation":                 "delete",
		})
		return
	}

	nextRows := make([]models.RefreshToken, 0, len(existingDoc.RefreshTokens))
	for _, row := range existingDoc.RefreshTokens {
		key := strings.ToLower(strings.TrimSpace(row.CharacterHash))
		if key == "" {
			continue
		}
		if _, remove := toRemove[key]; remove {
			continue
		}
		nextRows = append(nextRows, row)
	}

	retryCfg := mongocore.DefaultRetryConfig()
	retryCfg.OperationName = fmt.Sprintf("delete cloud-stored ESI refresh tokens %s", accountID)
	if err := mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
		_, err := col.UpdateOne(ctx, bson.M{"_id": accountID, "_meta.accountID": accountID}, bson.M{
			"$set": bson.M{
				"refreshTokens":      nextRows,
				"_meta.lastModified": time.Now().UTC(),
			},
		})
		return err
	}); err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to delete refresh tokens", "linked chars refresh tokens delete", "linked_chars_refresh_tokens_delete", "cloud_stored_esi_refresh_tokens", err, map[string]interface{}{
			"additional_chars_endpoint": "linked_characters_oauth_credentials",
			"operation":                 "delete",
						"hashes_requested":          len(toRemove),
		})
		return
	}

	w.WriteHeader(http.StatusNoContent)
	metrics.Success()
	logs.AttachDebugStep(r, "mongo_updated", map[string]interface{}{
		"hashes_requested": len(toRemove),
		"remaining_count":  len(nextRows),
	})
}
