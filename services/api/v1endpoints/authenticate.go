package v1endpoints

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	userendpoints "eve-industry-planner/api/v1endpoints/user"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/models"
	taskscore "eve-industry-planner/shared/tasks"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

const (
	maxTokenLength = 8192 // Maximum EVE SSO token length in bytes (8KB). No official JWT max in RFC 7519,
	// but this is a common defensive limit. EVE SSO tokens are typically ~1-2KB.
	maxRefreshTokenLength = 512 // Maximum refresh token length in bytes (UUID format is 36 chars, but allow buffer)
)


func AuthHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)
	m := apimetrics.GetAPIEveTokenLogin()
	sessionMetrics := apimetrics.GetAPIAuthSessionLifecycle()
	cfg, err := config.LoadConfig()
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("config_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "config_error", "error", err)
		respondAuthSessionsServerError(w, r, "failed to load config for auth login", "auth_config_load", err, nil)
		return
	}

	// Only allow POST requests
	if !helper.RequireMethod(w, r, http.MethodPost) {
		duration := time.Since(start)
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "method_not_allowed")
		logs.WarnCtx(ctx, "invalid method for auth endpoint")
		return
	}

	// Extract token from request body (POST-only, tokens in body for security)
	tokenString, err := extractTokenFromRequest(r)
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("extraction_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "extraction_error",
			"error", err)
		logs.WarnCtx(ctx, "failed to extract token from request body", "error", err)
		// Generic error message to avoid leaking information
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Validate token length to prevent DoS attacks
	if len(tokenString) > maxTokenLength {
		duration := time.Since(start)
		m.Errors.WithLabelValues("token_too_long").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "token_too_long",
			"length", len(tokenString), "max", maxTokenLength)
		logs.WarnCtx(ctx, "token too long", "length", len(tokenString), "max", maxTokenLength)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Validate the EVE SSO token and extract character hash
	tokenInfo, err := auth.ValidateEveTokenAndExtractHash(r.Context(), tokenString, cfg.EveSSOClientID)
	if err != nil {
		duration := time.Since(start)
		contentType := r.Header.Get("Content-Type")
		m.Errors.WithLabelValues("validation_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "validation_error",
			"error", err,
			"token_length", len(tokenString),
			"content_type", contentType,
		)
		// Do not log raw token; length + error are enough for support and Grafana.
		logs.WarnCtx(ctx, "EVE SSO token validation failed",
			"error", err,
			"token_length", len(tokenString),
			"content_type", contentType,
		)
		http.Error(w, auth.GetEveTokenErrorMessage(err), http.StatusUnauthorized)
		return
	}
	characterHash := tokenInfo.CharacterHash
	scopes := tokenInfo.Scopes
	accountID := auth.GetAccountIDFromCharacterHash(characterHash)
	appVersion := extractAppVersion(r)

	// Load corporation/alliance ID caches from Redis if available (keyed by AccountID)
	corporations := auth.GetCorporations(ctx, clients.Redis, accountID)
	alliances := auth.GetAlliances(ctx, clients.Redis, accountID)

	sessionID, err := auth.GenerateSessionID()
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("session_generation_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "session_generation_error",
			"error", err, "account_id", accountID, "character_hash", characterHash)
		respondAuthSessionsServerError(w, r, "failed to generate session id", "auth_session_id_gen", err, map[string]interface{}{
			"account_id": accountID, "character_hash": characterHash,
		})
		return
	}
	sessionNow := time.Now().UTC()

	// Store refresh token in Redis with user data (including corporations)
	refreshTokenData := auth.RefreshTokenData{
		CharacterHash: characterHash,
		AccountID:     accountID,
		Scopes:        scopes,
		Corporations:  corporations,
		Alliances:     alliances,
		SessionID:     sessionID,
		SessionStart:  sessionNow,
		SessionSeenAt: sessionNow,
		AppVersion:    appVersion,
	}
	refreshToken, err := auth.MintAndStoreRefreshToken(ctx, clients.Redis, refreshTokenData)
	if err != nil {
		duration := time.Since(start)
		if errors.Is(err, auth.ErrRefreshTokenGenerate) {
			m.Errors.WithLabelValues("refresh_token_generation_error").Inc(ctx)
			apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "refresh_token_generation_error",
				"error", err, "account_id", accountID, "character_hash", characterHash)
			respondAuthSessionsServerError(w, r, "failed to generate refresh token", "auth_refresh_token_gen", err, map[string]interface{}{
				"account_id": accountID,
			})
		} else {
			m.Errors.WithLabelValues("redis_error").Inc(ctx)
			apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "redis_error",
				"error", err, "account_id", accountID, "character_hash", characterHash)
			respondAuthSessionsServerError(w, r, "failed to store refresh token", "auth_redis_store_refresh", err, map[string]interface{}{
				"account_id": accountID,
			})
		}
		return
	}
	if err := auth.UpsertSessionRecord(ctx, clients.Redis, auth.SessionRecord{
		SessionID:     sessionID,
		AccountID:     accountID,
		CharacterHash: characterHash,
		AppVersion:    appVersion,
		StartedAt:     sessionNow,
		LastSeenAt:    sessionNow,
	}); err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("session_store_error").Inc(ctx)
		sessionMetrics.StoreErrors.WithLabelValues("login").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "session_store_error",
			"error", err, "account_id", accountID, "character_hash", characterHash)
		respondAuthSessionsServerError(w, r, "failed to store session record", "auth_redis_session_record", err, map[string]interface{}{
			"account_id": accountID, "character_hash": characterHash,
		})
		return
	}
	sessionMetrics.Started.WithLabelValues("login").Inc(ctx)
	sessionMetrics.Stored.WithLabelValues("login").Inc(ctx)
	apimetrics.RecordAuthSessionDistinctAccount(ctx, clients.Redis, accountID)
	if err := auth.UpdateAccountSessionGrants(ctx, clients.Redis, accountID, corporations, alliances); err != nil {
		logs.WarnCtx(ctx, "failed to update account session grants", "error", err, "account_id", accountID)
	}

	loginDocs, err := helper.ResolveUserDocumentsForLogin(ctx, clients.Mongo, accountID)
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("mongo_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "mongo_error",
			"error", err, "account_id", accountID)
		respondAuthSessionsServerError(w, r, "failed to resolve user documents for login", "auth_mongo_user_docs", err, map[string]interface{}{
			"account_id": accountID,
		})
		return
	}

	reauthRequiredAt := auth.ReauthRequiredAtUnix(sessionNow, time.Time{})

	userOut := loginDocs.User
	var linkedCharacters []models.LinkedCharacterSession
	if userOut.UserCloudAccounts && cfg.RefreshTokenKeyring != nil {
		if len(userOut.RefreshTokens) > 0 {
			linkedCharacterSessions, err := userendpoints.BuildCloudLinkedCharactersForLogin(
				ctx, clients.Mongo, accountID, &userOut,
				cfg.EveSSOClientID, cfg.EveSSOClientSecret, cfg.RefreshTokenKeyring,
			)
			if err != nil {
				logs.WarnCtx(ctx, "cloud linked-character ESI session bundle failed",
					"error", err, "account_id", accountID)
			} else {
				linkedCharacters = linkedCharacterSessions
			}
		}
	}
	userendpoints.StripRefreshTokensFromUserDocumentForClient(&userOut)
	if clients != nil && clients.JetStream != nil && len(linkedCharacters) > 0 {
		tokens := make([]string, 0, len(linkedCharacters)+1)
		tokens = append(tokens, tokenString)
		for _, linked := range linkedCharacters {
			if strings.TrimSpace(linked.AccessToken) != "" {
				tokens = append(tokens, strings.TrimSpace(linked.AccessToken))
			}
		}
		taskRequest := natscore.AccountSessionGrantsRequest{
			AccountID: accountID,
			Tokens:    tokens,
		}
		if err := natscore.PublishTask(ctx, clients.JetStream, taskscore.UpdateAccountSessionGrants.Subject, taskscore.UpdateAccountSessionGrants.Name, taskRequest, clients.NATS); err != nil {
			logs.WarnCtx(ctx, "failed to publish account access grants refresh task on login", "account_id", accountID, "error", err)
		}
	}

	response := SessionBootstrapResponse{
		Kind:                sessionKindBootstrap,
		EsiOAuthStorage:     esiOAuthStorageFromUserCloud(userOut.UserCloudAccounts),
		AccountID:           accountID,
		SessionID:           sessionID,
		MainCharacterHash:   characterHash,
		RefreshToken:        refreshToken,
		ReauthRequiredAt:    reauthRequiredAt,
		FirstLogin:          loginDocs.FirstLogin,
		UserDocument:        userOut,
		ApplicationSettings: loginDocs.Settings,
		LinkedCharacters:    linkedCharacters,
	}
	auth.SetAppSessionCookie(w, sessionID)
	if userOut.UserCloudAccounts {
		auth.SetAppRefreshCookie(w, r, refreshToken)
		response.RefreshToken = ""
	}
	auth.SetEsiOAuthStorageCookieFromUserCloud(w, r, userOut.UserCloudAccounts)

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	w.WriteHeader(http.StatusOK)

	if err := json.NewEncoder(w).Encode(response); err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("encode_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "encode_error",
			"error", err, "account_id", accountID)
		respondAuthSessionsServerError(w, r, "failed to encode response", "auth_response_encode", err, map[string]interface{}{
			"account_id": accountID,
		})
		return
	}

	// Update metrics
	duration := time.Since(start)
	m.Requests.Observe(ctx, apimetrics.DurationMilliseconds(duration))
	m.RequestsCount.Inc(ctx)
	m.Successes.Inc(ctx)
	if loginDocs.FirstLogin {
		m.NewUsers.Inc(ctx)
	}

	// Log per-request metrics for slow requests
	apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "success",
		"account_id", accountID,
		"first_login", loginDocs.FirstLogin,
	)

	logs.InfoCtx(ctx, "successfully authenticated user",
		"account_id", accountID,
		"duration_ms", duration.Milliseconds(),
	)
}

func extractAppVersion(r *http.Request) string {
	version := strings.TrimSpace(r.Header.Get("X-App-Version"))
	if version == "" {
		return "unknown"
	}
	return version
}

// extractTokenFromRequest extracts the JWT token from the request body
// We use POST with body (not GET with header) to avoid tokens appearing in logs/URLs
// Implements security measures: body size limits and input validation
func extractTokenFromRequest(r *http.Request) (string, error) {
	var reqBody struct {
		Token string `json:"token"`
	}
	if err := helper.DecodeJSONRequest(r, &reqBody, maxTokenLength+1024); err != nil {
		return "", err
	}

	if reqBody.Token == "" {
		return "", errors.New("token is required in request body")
	}

	tokenString := strings.TrimSpace(reqBody.Token)
	if tokenString == "" {
		return "", errors.New("token cannot be empty")
	}

	return tokenString, nil
}

func respondAuthSessionsServerError(w http.ResponseWriter, r *http.Request, logMsg, failureClass string, err error, extra map[string]interface{}) {
	if extra == nil {
		extra = map[string]interface{}{}
	}
	extra["session_endpoint"] = "auth_sessions"
	helper.RespondEndpointServerError(w, r, "Internal server error", logMsg, failureClass, "eve_token_login", err, extra)
}
