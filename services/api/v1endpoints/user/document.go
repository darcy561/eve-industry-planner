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
	"eve-industry-planner/shared"
	"eve-industry-planner/shared/models"
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
		logs.WarnCtx(ctx, "invalid method for user main document endpoint")
		http.Error(w, "Method not allowed. Use GET to retrieve or PUT to save.", http.StatusMethodNotAllowed)
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

	accountID, ok := helper.RequireAccountID(w, r)
	if !ok {
		metrics.Error("auth_error")
		logs.WarnCtx(ctx, "failed to extract accountID")
		return
	}

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionUsers)

	userDoc, err := mongoget.LoadUserAccountDocument(ctx, collection, accountID)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			metrics.Error("not_found")
			logs.WarnCtx(ctx, "user document not found", "account_id", accountID)
			http.Error(w, "User document not found", http.StatusNotFound)
			return
		}
		metrics.Error("database_error")
		logs.ErrorCtx(ctx, "failed to query user document", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to retrieve user document", err)
		return
	}

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
		logs.ErrorCtx(ctx, "failed to encode user document response", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}

	metrics.Success()
	logs.InfoCtx(ctx, "user document retrieved",
		"account_id", accountID,
		"duration_ms", time.Since(start).Milliseconds())
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

	accountID, ok := helper.RequireAccountID(w, r)
	if !ok {
		metrics.Error("auth_error")
		logs.WarnCtx(ctx, "failed to extract accountID")
		return
	}

	var userDoc models.UserAccountDocument
	if !helper.DecodeJSONOrBadRequest(w, r, metrics, &userDoc) {
		logs.WarnCtx(ctx, "failed to decode user document JSON", "account_id", accountID)
		return
	}

	if userDoc.MetaData.AccountID != "" && userDoc.MetaData.AccountID != accountID {
		metrics.Error("account_id_mismatch")
		logs.WarnCtx(ctx, "account ID mismatch", "token_account_id", accountID, "doc_account_id", userDoc.MetaData.AccountID)
		http.Error(w, "Account ID in document must match authenticated account", http.StatusForbidden)
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
			logs.ErrorCtx(ctx, "failed to load existing user document", "error", loadErr, "account_id", accountID)
			logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to save user document", loadErr)
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
			logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", cfgErr)
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
						logs.WarnCtx(ctx, "failed to encrypt refresh token on save", "error", encErr, "account_id", accountID)
						http.Error(w, "Invalid refresh token payload", http.StatusBadRequest)
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
		logs.WarnCtx(ctx, "user document upsert with websocket client id failed, retrying without client id",
			"account_id", accountID,
			"ws_client_id", userDoc.MetaData.ClientID,
			"error", err)
	}
	if err != nil {
		metrics.Error("database_error")
		logs.ErrorCtx(ctx, "failed to upsert user document", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to save user document", err)
		return
	}

	auth.SetEsiOAuthStorageCookieFromUserCloud(w, r, userDoc.UserCloudAccounts)
	w.WriteHeader(http.StatusNoContent)

	metrics.Success()
	logs.InfoCtx(ctx, "user document saved",
		"account_id", accountID,
		"matched", result.MatchedCount,
		"upserted", result.UpsertedCount,
		"duration_ms", time.Since(start).Milliseconds())
}
