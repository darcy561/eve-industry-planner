package v1endpoints

import (
	"encoding/json"
	"errors"
	eipnats "eve-industry-planner/shared/nats"
	"net/http"
	"strings"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	user "eve-industry-planner/api/v1endpoints/user"
	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

const (
	maxTokenLength = 8192 // Maximum EVE SSO token length in bytes (8KB). No official JWT max in RFC 7519,
	// but this is a common defensive limit. EVE SSO tokens are typically ~1-2KB.
	maxRefreshTokenLength = 512 // Maximum refresh token length in bytes (UUID format is 36 chars, but allow buffer)
)

func (a *Handlers) AuthHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)
	m := apimetrics.GetAPIEveTokenLogin()
	sessionMetrics := apimetrics.GetAPIAuthSessionLifecycle()
	mongo := a.Mongo
	rdb := a.Redis
	natsHandle := a.NATS
	h := user.New(a.Deps)
	cfg, err := config.LoadCloudStoredESI()
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("config_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "config_error", "error", err)
		respondAuthSessionsServerError(w, r, "failed to load config for auth login", "auth_config_load", err, nil)
		return
	}

	// Only allow POST requests
	if !helper.RequireMethod(w, r, http.MethodPost) {
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		attachAuthLoginClientFailure(r, "invalid method for auth endpoint", "auth_login_method_not_allowed", map[string]any{
			"method": r.Method,
		})
		return
	}

	// Extract token from request body (POST-only, tokens in body for security)
	tokenString, err := extractTokenFromRequest(r)
	if err != nil {
		m.Errors.WithLabelValues("extraction_error").Inc(ctx)
		respondAuthLoginClientError(w, r, http.StatusBadRequest, "Invalid request", "failed to extract token from request body", "auth_login_extraction_error", map[string]any{
			"error": err.Error(),
		})
		return
	}

	// Validate token length to prevent DoS attacks
	if len(tokenString) > maxTokenLength {
		m.Errors.WithLabelValues("token_too_long").Inc(ctx)
		respondAuthLoginClientError(w, r, http.StatusBadRequest, "Invalid request", "EVE token too long", "auth_login_token_too_long", map[string]any{
			"length": len(tokenString),
			"max":    maxTokenLength,
		})
		return
	}

	logs.AttachDebugStep(r, "eve_token_received", map[string]any{
		"token_len": len(tokenString),
	})

	// Validate the EVE SSO token and extract character hash
	tokenInfo, err := auth.ValidateEveTokenAndExtractHash(r.Context(), tokenString, cfg.SSO.ClientID)
	if err != nil {
		contentType := r.Header.Get("Content-Type")
		m.Errors.WithLabelValues("validation_error").Inc(ctx)
		respondAuthLoginClientError(w, r, http.StatusUnauthorized, auth.GetEveTokenErrorMessage(err), "EVE SSO token validation failed", "auth_login_eve_token_invalid", map[string]any{
			"error":        err.Error(),
			"token_length": len(tokenString),
			"content_type": contentType,
		})
		return
	}
	characterHash := tokenInfo.CharacterHash
	scopes := tokenInfo.Scopes
	logs.AttachDebugStep(r, "claims_validated", map[string]any{
		"character_hash": characterHash,
		"scope_count":    len(scopes),
	})
	accountID := auth.GetAccountIDFromCharacterHash(characterHash)
	r = logs.BindRequestAccountIDToRequest(r, accountID)
	ctx = r.Context()
	appVersion := extractAppVersion(r)

	// Load corporation/alliance ID caches from Redis if available (keyed by AccountID)
	corporations := auth.GetCorporations(ctx, rdb, accountID)
	alliances := auth.GetAlliances(ctx, rdb, accountID)

	sessionID, err := auth.GenerateSessionID()
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("session_generation_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "session_generation_error",
			"error", err, "account_id", accountID, "character_hash", characterHash)
		respondAuthSessionsServerError(w, r, "failed to generate session id", "auth_session_id_gen", err, map[string]any{
			"character_hash": characterHash,
		})
		return
	}
	sessionNow := time.Now().UTC()
	r = logs.BindRequestIdentityToRequest(r, accountID, sessionID)
	ctx = r.Context()

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
	refreshToken, err := auth.MintAndStoreRefreshToken(ctx, rdb, refreshTokenData)
	if err != nil {
		duration := time.Since(start)
		if errors.Is(err, auth.ErrRefreshTokenGenerate) {
			m.Errors.WithLabelValues("refresh_token_generation_error").Inc(ctx)
			apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "refresh_token_generation_error",
				"error", err, "account_id", accountID, "character_hash", characterHash)
			respondAuthSessionsServerError(w, r, "failed to generate refresh token", "auth_refresh_token_gen", err, map[string]any{})
		} else {
			m.Errors.WithLabelValues("redis_error").Inc(ctx)
			apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "redis_error",
				"error", err, "account_id", accountID, "character_hash", characterHash)
			respondAuthSessionsServerError(w, r, "failed to store refresh token", "auth_redis_store_refresh", err, map[string]any{})
		}
		return
	}
	if err := auth.UpsertSessionRecord(ctx, rdb, auth.SessionRecord{
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
		respondAuthSessionsServerError(w, r, "failed to store session record", "auth_redis_session_record", err, map[string]any{
			"character_hash": characterHash,
		})
		return
	}
	logs.AttachDebugStep(r, "session_created", map[string]any{
		"session_id": sessionID,
	})
	sessionMetrics.Started.WithLabelValues("login").Inc(ctx)
	sessionMetrics.Stored.WithLabelValues("login").Inc(ctx)
	apimetrics.RecordAuthSessionDistinctAccount(ctx, rdb, accountID)
	if err := auth.UpdateAccountSessionGrants(ctx, rdb, a.EntityCipher, accountID, corporations, alliances); err != nil {
		logs.AttachHandlerCaveat(r, "account_session_grants_update_failed", "failed to update account session grants", map[string]any{
			"error": err.Error(),
		})
	}

	loginDocs, err := helper.ResolveUserDocumentsForLogin(ctx, mongo, accountID)
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("mongo_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "mongo_error",
			"error", err, "account_id", accountID)
		respondAuthSessionsServerError(w, r, "failed to resolve user documents for login", "auth_mongo_user_docs", err, map[string]any{})
		return
	}

	reauthRequiredAt := auth.ReauthRequiredAtUnix(sessionNow, time.Time{})

	userOut := loginDocs.User
	logs.AttachDebugStep(r, "login_docs_loaded", map[string]any{
		"first_login":   loginDocs.FirstLogin,
		"cloud_account": userOut.UserCloudAccounts,
	})
	var linkedCharacters []models.LinkedCharacterSession
	if userOut.UserCloudAccounts && cfg.Keys.Keyring != nil {
		if len(userOut.RefreshTokens) > 0 {
			linkedCharacterSessions, err := h.BuildCloudLinkedCharactersForLogin(
				ctx, accountID, &userOut,
				cfg.SSO.ClientID, cfg.SSO.ClientSecret, cfg.Keys.Keyring,
			)
			if err != nil {
				logs.AttachHandlerCaveat(r, "cloud_linked_characters_failed", "cloud linked-character ESI session bundle failed", map[string]any{
					"error": err.Error(),
				})
			} else {
				linkedCharacters = linkedCharacterSessions
			}
		}
	}
	user.StripRefreshTokensFromUserDocumentForClient(&userOut)
	if natsHandle != nil && len(linkedCharacters) > 0 {
		tokens := make([]string, 0, len(linkedCharacters)+1)
		tokens = append(tokens, tokenString)
		for _, linked := range linkedCharacters {
			if strings.TrimSpace(linked.AccessToken) != "" {
				tokens = append(tokens, strings.TrimSpace(linked.AccessToken))
			}
		}
		if err := eipnats.PublishUpdateAccountSessionGrants(ctx, natsHandle, accountID, tokens); err != nil {
			logs.AttachHandlerCaveat(r, "account_grants_publish_failed", "failed to publish account access grants refresh task on login", map[string]any{
				"error": err.Error(),
			})
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
	// Per-tab sessions: client stores session_id + refresh_token in sessionStorage (X-Session-ID).
	// Do not set shared HttpOnly cookies — they would collide across browser tabs.
	response.RefreshToken = refreshToken
	auth.SetEsiOAuthStorageCookieFromUserCloud(w, r, userOut.UserCloudAccounts)
	auth.SetTenantAffinityCookieAccount(w, r, accountID)

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	w.WriteHeader(http.StatusOK)

	if err := json.NewEncoder(w).Encode(response); err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("encode_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "encode_error",
			"error", err, "account_id", accountID)
		respondAuthSessionsServerError(w, r, "failed to encode response", "auth_response_encode", err, map[string]any{})
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
	if duration > time.Second {
		apimetrics.LogRequestMetrics(ctx, "eve_token_login", duration, "success",
			"first_login", loginDocs.FirstLogin,
		)
	}

	logs.AttachHandlerSuccessDetail(r, "successfully authenticated user", map[string]any{
		"first_login": loginDocs.FirstLogin,
		"duration_ms": duration.Milliseconds(),
	})
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

func respondAuthSessionsServerError(w http.ResponseWriter, r *http.Request, logMsg, failureClass string, err error, extra map[string]any) {
	if extra == nil {
		extra = map[string]any{}
	}
	extra["session_endpoint"] = "auth_sessions"
	helper.RespondEndpointServerError(w, r, "Internal server error", logMsg, failureClass, "eve_token_login", err, extra)
}
