package user

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/core/config"
	mongocore "eve-industry-planner/shared/core/mongo"
	mongoget "eve-industry-planner/shared/core/mongo/get"
	mongoput "eve-industry-planner/shared/core/mongo/put"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/models"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/mongo"
)

func DocumentHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	switch r.Method {
	case http.MethodGet:
		handleGetUserDocument(w, r, clients)
	case http.MethodPut:
		handleSaveUserDocument(w, r, clients)
	default:
		m := apimetrics.GetAPIEveTokenLogin()
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed. Use GET to retrieve or PUT to save.", "invalid method for user main document endpoint", "user_doc_method_not_allowed", "eve_token_login", nil, map[string]interface{}{"method": r.Method})
	}
}

func handleGetUserDocument(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)
	m := apimetrics.GetAPIEveTokenLogin()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncSuccesses:    func(ctx context.Context) { m.Successes.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	accountID := helper.AuthenticatedAccountID(r)

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionUsers)

	userDoc, err := mongoget.LoadUserAccountDocument(ctx, collection, accountID)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			metrics.Error("not_found")
			helper.RespondEndpointError(w, r, http.StatusNotFound, "User document not found", "user document not found", "user_doc_not_found", "eve_token_login", nil, nil)
			return
		}
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to retrieve user document", "failed to query user document", "user_doc_query_failed", "eve_token_login", err, nil)
		return
	}

	logs.AttachDebugStep(r, "mongo_query_completed", map[string]interface{}{
		"cloud_account": userDoc.UserCloudAccounts,
	})

	if userDoc.UserCloudAccounts {
		userDoc.StripRefreshTokenSecretsForTransport()
	}

	var cloudRefreshTokensOnly []models.RefreshToken
	if userDoc.UserCloudAccounts {
		cloudRefreshTokensOnly = userDoc.RefreshTokens
	}

	response := struct {
		LinkedJobs                 []int64               `json:"linkedJobs"`
		LinkedTrans                []int64               `json:"linkedTrans"`
		LinkedOrders               []int64               `json:"linkedOrders"`
		UserCloudAccounts          bool                  `json:"userCloudAccounts"`
		HasCompletedFirstLoginFlow bool                  `json:"hasCompletedFirstLoginFlow"`
		ShareCitadelNames          bool                  `json:"shareCitadelNames"`
		RefreshTokens              []models.RefreshToken `json:"refreshTokens,omitempty"`
		MetaData                   models.UserMeta       `json:"_meta"`
	}{
		LinkedJobs:                 userDoc.LinkedJobs,
		LinkedTrans:                userDoc.LinkedTrans,
		LinkedOrders:               userDoc.LinkedOrders,
		UserCloudAccounts:          userDoc.UserCloudAccounts,
		HasCompletedFirstLoginFlow: userDoc.HasCompletedFirstLoginFlow,
		ShareCitadelNames:          userDoc.ShareCitadelNames,
		RefreshTokens:              cloudRefreshTokensOnly,
		MetaData:                   userDoc.MetaData,
	}

	if err := helper.EncodeJSON(w, response); err != nil {
		metrics.Error("encode_error")
		helper.RespondEndpointServerError(w, r, "Internal server error", "failed to encode user document response", "user_doc_encode_failed", "eve_token_login", err, nil)
		return
	}

	metrics.Success()
	logs.AttachHandlerSuccessDetail(r, "user document retrieved", map[string]interface{}{
		"duration_ms": time.Since(start).Milliseconds(),
	})
}

func handleSaveUserDocument(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)
	m := apimetrics.GetAPIEveTokenLogin()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncSuccesses:    func(ctx context.Context) { m.Successes.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	accountID := helper.AuthenticatedAccountID(r)

	var userDoc models.UserAccountDocument
	if !helper.DecodeJSONOrBadRequest(w, r, metrics, &userDoc) {
		return
	}

	if userDoc.MetaData.AccountID != "" && userDoc.MetaData.AccountID != accountID {
		metrics.Error("account_id_mismatch")
		helper.RespondEndpointError(w, r, http.StatusForbidden, "Account ID in document must match authenticated account", "account ID mismatch on user document save", "user_doc_account_mismatch", "eve_token_login", nil, map[string]interface{}{
			"token_account_id": accountID,
			"doc_account_id":   userDoc.MetaData.AccountID,
		})
		return
	}
	helper.PopulateRequestMeta(r, &userDoc.MetaData.MetaData, accountID)

	database := clients.Mongo.Database(mongocore.DatabaseName)
	usersCol := database.Collection(mongocore.CollectionUsers)

	var existingDoc models.UserAccountDocument
	existingDoc, loadErr := mongoget.LoadUserAccountDocument(ctx, usersCol, accountID)
	if loadErr != nil {
		if !errors.Is(loadErr, mongo.ErrNoDocuments) {
			metrics.Error("database_error")
			helper.RespondEndpointServerError(w, r, "Failed to save user document", "failed to load existing user document", "user_doc_load_failed", "eve_token_login", loadErr, nil)
			return
		}
		// No existing doc is valid here; save path will upsert defaults from request.
		existingDoc = models.UserAccountDocument{}
	}
	if len(userDoc.RefreshTokens) == 0 {
		userDoc.RefreshTokens = existingDoc.RefreshTokens
	}
	// Once true, keep true (JSON decode defaults omitted bool to false).
	userDoc.HasCompletedFirstLoginFlow = userDoc.HasCompletedFirstLoginFlow || existingDoc.HasCompletedFirstLoginFlow

	if userDoc.UserCloudAccounts {
		cfg, cfgErr := config.LoadConfig()
		if cfgErr != nil {
			metrics.Error("config_error")
			helper.RespondEndpointServerError(w, r, "Internal server error", "failed to load config for user document save", "user_doc_config_load_failed", "eve_token_login", cfgErr, nil)
			return
		}
		if cfg.RefreshTokenKeyring != nil {
			prevByHash := make(map[string]models.RefreshToken, len(existingDoc.RefreshTokens))
			for _, t := range existingDoc.RefreshTokens {
				if t.CharacterHash == "" {
					continue
				}
				prevByHash[strings.ToLower(strings.TrimSpace(t.CharacterHash))] = t
			}
			for i := range userDoc.RefreshTokens {
				rt := &userDoc.RefreshTokens[i]
				if strings.TrimSpace(rt.RToken) != "" {
					if encErr := rt.EncryptRefreshAtRest(rt.RToken, cfg.RefreshTokenKeyring); encErr != nil {
						metrics.Error("invalid_json")
						helper.RespondEndpointError(w, r, http.StatusBadRequest, "Invalid refresh token payload", "failed to encrypt refresh token on save", "user_doc_invalid_refresh_token", "eve_token_login", encErr, nil)
						return
					}
					continue
				}
				key := strings.ToLower(strings.TrimSpace(rt.CharacterHash))
				if key == "" {
					continue
				}
				if prev, ok := prevByHash[key]; ok && prev.RTokenCiphertext != "" {
					*rt = prev
				}
			}
		}
	}

	result, retriedWithoutWSClientID, err := mongoput.UpsertUserAccountDocument(ctx, usersCol, accountID, userDoc)
	if retriedWithoutWSClientID {
		logs.AttachHandlerCaveat(r, "upsert_retried_without_ws_client_id", "user document upsert with websocket client id failed, retrying without client id", map[string]interface{}{
			"ws_client_id": userDoc.MetaData.ClientID,
			"error":        err.Error(),
		})
	}
	if err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to save user document", "failed to upsert user document", "user_doc_upsert_failed", "eve_token_login", err, nil)
		return
	}

	logs.AttachDebugStep(r, "mongo_upsert_completed", map[string]interface{}{
		"matched":  result.MatchedCount,
		"upserted": result.UpsertedCount,
	})

	auth.SetEsiOAuthStorageCookieFromUserCloud(w, r, userDoc.UserCloudAccounts)
	w.WriteHeader(http.StatusNoContent)

	metrics.Success()
	logs.AttachHandlerSuccessDetail(r, "user document saved", map[string]interface{}{
		"matched":     result.MatchedCount,
		"upserted":    result.UpsertedCount,
		"duration_ms": time.Since(start).Milliseconds(),
	})
}
