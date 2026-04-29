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
	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/core/internaljwt"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/models"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

// RefreshRequest represents the request body for token refresh
type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
	EveToken     string `json:"eve_token"` // EVE SSO token - must match the one stored with refresh token
}

// RefreshResponse represents the response sent to the client
type RefreshResponse struct {
	AccessToken         string                          `json:"access_token"`
	RefreshToken        string                          `json:"refresh_token"`
	ExpiresAt           int64                           `json:"expires_at"` // Unix timestamp (seconds since epoch)
	FirstLogin          bool                            `json:"first_login,omitempty"`
	UserDocument        models.UserAccountDocument      `json:"user_document,omitempty"`
	ApplicationSettings models.ApplicationSettings      `json:"application_settings,omitempty"`
	LinkedCharacters    []models.LinkedCharacterSession `json:"linked_characters,omitempty"`
}

// RefreshHandler handles token refresh requests
func RefreshHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	refreshHandler(w, r, clients, false)
}

// LoginRefreshHandler handles login refresh requests (existing token login path).
func LoginRefreshHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	refreshHandler(w, r, clients, true)
}

func refreshHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients, touchLastLogin bool) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)
	m := apimetrics.GetAPISessionRefresh()
	sessionMetrics := apimetrics.GetAPIAuthSessionLifecycle()
	appVersion := extractAppVersion(r)

	// Only allow POST requests
	if !helper.RequireMethod(w, r, http.MethodPost) {
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		logs.WarnCtx(ctx, "invalid method for refresh endpoint")
		return
	}

	// Extract refresh token and EVE token from request body
	refreshToken, eveToken, err := extractRefreshTokenFromRequest(r)
	if err != nil {
		m.Errors.WithLabelValues("extraction_error").Inc(ctx)
		logs.WarnCtx(ctx, "failed to extract tokens from request body", "error", err)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Validate refresh token length to prevent DoS attacks
	if len(refreshToken) > maxRefreshTokenLength {
		m.Errors.WithLabelValues("refresh_token_too_long").Inc(ctx)
		logs.WarnCtx(ctx, "refresh token too long", "length", len(refreshToken), "max", maxRefreshTokenLength)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Validate EVE token length to prevent DoS attacks
	if len(eveToken) > maxTokenLength {
		m.Errors.WithLabelValues("eve_token_too_long").Inc(ctx)
		logs.WarnCtx(ctx, "EVE token too long", "length", len(eveToken), "max", maxTokenLength)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Get refresh token data from Redis first to get stored character hash
	tokenData, err := auth.GetRefreshTokenData(ctx, clients.Redis, refreshToken)
	if err != nil {
		m.Errors.WithLabelValues("refresh_token_not_found").Inc(ctx)
		logs.WarnCtx(ctx, "invalid or expired refresh token", "error", err)
		http.Error(w, "Invalid token", http.StatusUnauthorized)
		return
	}

	// Validate the EVE SSO token and extract the owner field (character hash)
	cfg, err := config.LoadConfig()
	if err != nil {
		m.Errors.WithLabelValues("config_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to load config for auth refresh", "error", err)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}
	eveTokenInfo, err := auth.ValidateEveTokenAndExtractHash(r.Context(), eveToken, cfg.EveSSOClientID)
	if err != nil {
		contentType := r.Header.Get("Content-Type")
		m.Errors.WithLabelValues("validation_error").Inc(ctx)
		logs.WarnCtx(ctx, "EVE SSO token validation failed (refresh)",
			"error", err,
			"eve_token_length", len(eveToken),
			"content_type", contentType,
			"account_id", tokenData.AccountID,
		)
		http.Error(w, auth.GetEveTokenErrorMessage(err), http.StatusUnauthorized)
		return
	}

	// Verify the EVE token's owner field (character hash) matches the one stored with refresh token
	if tokenData.CharacterHash != eveTokenInfo.CharacterHash {
		m.Errors.WithLabelValues("character_hash_mismatch").Inc(ctx)
		logs.WarnCtx(ctx, "EVE token owner field (character hash) does not match refresh token",
			"eve_hash", eveTokenInfo.CharacterHash,
			"stored_hash", tokenData.CharacterHash,
			"account_id", tokenData.AccountID,
		)
		http.Error(w, "Invalid token", http.StatusUnauthorized)
		return
	}

	// Load or get cached RSA private key for JWT signing
	cachedKey, err := internaljwt.GetOrLoadPrivateKey()
	if err != nil {
		m.Errors.WithLabelValues("key_load_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to load RSA private key for JWT signing", "error", err, "account_id", tokenData.AccountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}

	// Always load corporations from Redis (keyed by AccountID)
	// Corporations are stored by AccountID (aggregated from all characters)
	corporations := auth.GetCorporations(ctx, clients.Redis, tokenData.AccountID)

	// Generate new refresh token (rotate refresh token for security)
	newRefreshToken, err := auth.GenerateRefreshToken()
	if err != nil {
		m.Errors.WithLabelValues("refresh_token_generation_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to generate new refresh token", "error", err,
			"account_id", tokenData.AccountID, "character_hash", tokenData.CharacterHash)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}

	// Update token data with fresh corporations from Redis
	updatedTokenData := *tokenData
	updatedTokenData.Corporations = internaljwt.CorporationIDs(corporations)
	now := time.Now().UTC()
	sessionFlow := "refresh"
	startedSession := false
	if touchLastLogin || updatedTokenData.SessionID == "" {
		sessionID, err := auth.GenerateSessionID()
		if err != nil {
			m.Errors.WithLabelValues("session_generation_error").Inc(ctx)
			logs.ErrorCtx(ctx, "failed to generate session id", "error", err,
				"account_id", tokenData.AccountID, "character_hash", tokenData.CharacterHash)
			logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
			return
		}
		updatedTokenData.SessionID = sessionID
		updatedTokenData.SessionStart = now
		startedSession = true
		if touchLastLogin {
			sessionFlow = "login_refresh"
		} else {
			sessionFlow = "refresh_backfill"
		}
	}
	if updatedTokenData.SessionStart.IsZero() {
		updatedTokenData.SessionStart = now
	}
	updatedTokenData.SessionSeenAt = now
	if appVersion != "" && appVersion != "unknown" {
		updatedTokenData.AppVersion = appVersion
	}

	// Generate new access token with stored user data and corporations.
	// SessionID is embedded in the claim and persists across normal refreshes.
	internalToken, _, err := internaljwt.GenerateInternalJWT(
		cachedKey.Key,
		tokenData.CharacterHash,
		cachedKey.Kid,
		updatedTokenData.SessionID,
		corporations,
		nil,
	)
	if err != nil {
		m.Errors.WithLabelValues("jwt_generation_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to generate internal JWT", "error", err,
			"account_id", tokenData.AccountID, "character_hash", tokenData.CharacterHash)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}

	// Store new refresh token in Redis with updated user data
	if err := auth.StoreRefreshToken(ctx, clients.Redis, newRefreshToken, updatedTokenData); err != nil {
		m.Errors.WithLabelValues("redis_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to store new refresh token", "error", err,
			"account_id", tokenData.AccountID, "character_hash", tokenData.CharacterHash)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}
	if err := auth.UpsertSessionRecord(ctx, clients.Redis, auth.SessionRecord{
		SessionID:     updatedTokenData.SessionID,
		AccountID:     tokenData.AccountID,
		CharacterHash: tokenData.CharacterHash,
		AppVersion:    updatedTokenData.AppVersion,
		StartedAt:     updatedTokenData.SessionStart,
		LastSeenAt:    updatedTokenData.SessionSeenAt,
	}); err != nil {
		m.Errors.WithLabelValues("session_store_error").Inc(ctx)
		sessionMetrics.StoreErrors.WithLabelValues(sessionFlow).Inc(ctx)
		logs.ErrorCtx(ctx, "failed to store session record", "error", err,
			"account_id", tokenData.AccountID, "character_hash", tokenData.CharacterHash)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}
	if startedSession {
		sessionMetrics.Started.WithLabelValues(sessionFlow).Inc(ctx)
		apimetrics.RecordAuthSessionDistinctAccount(ctx, clients.Redis, tokenData.AccountID)
	} else {
		sessionMetrics.Continued.WithLabelValues(sessionFlow).Inc(ctx)
	}
	sessionMetrics.Stored.WithLabelValues(sessionFlow).Inc(ctx)

	// Revoke old refresh token (token rotation)
	if err := auth.RevokeRefreshToken(ctx, clients.Redis, refreshToken); err != nil {
		// Log but don't fail - old token will expire naturally
		logs.WarnCtx(ctx, "failed to revoke old refresh token", "error", err,
			"account_id", tokenData.AccountID, "character_hash", tokenData.CharacterHash)
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	w.WriteHeader(http.StatusOK)

	// Return new access token and new refresh token
	// Calculate expiration timestamp using the same duration as token generation (Unix timestamp in seconds)
	expiresAt := now.Add(internaljwt.TokenExpirationDuration).Unix()

	response := RefreshResponse{
		AccessToken:  internalToken,
		RefreshToken: newRefreshToken,
		ExpiresAt:    expiresAt,
	}
	if touchLastLogin {
		loginDocs, err := helper.ResolveUserDocumentsForLogin(ctx, clients.Mongo, tokenData.AccountID)
		if err != nil {
			m.Errors.WithLabelValues("mongo_error").Inc(ctx)
			logs.ErrorCtx(ctx, "failed to resolve user documents for login refresh", "error", err, "account_id", tokenData.AccountID)
			logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
			return
		}
		response.FirstLogin = loginDocs.FirstLogin
		userOut := loginDocs.User
		var linkedCharacters []models.LinkedCharacterSession
		if userOut.UserCloudAccounts && cfg.RefreshTokenKeyring != nil {
			if len(userOut.RefreshTokens) > 0 {
				linkedCharacterSessions, err := userendpoints.BuildCloudLinkedCharactersForLogin(
					ctx, clients.Mongo, tokenData.AccountID, &userOut,
					cfg.EveSSOClientID, cfg.EveSSOClientSecret, cfg.RefreshTokenKeyring,
				)
				if err != nil {
					logs.WarnCtx(ctx, "cloud linked-character ESI session bundle failed (login-refresh)",
						"error", err, "account_id", tokenData.AccountID)
				} else {
					linkedCharacters = linkedCharacterSessions
				}
			}
			userendpoints.StripRefreshTokensFromUserDocumentForClient(&userOut)
		}
		response.UserDocument = userOut
		response.ApplicationSettings = loginDocs.Settings
		response.LinkedCharacters = linkedCharacters
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		m.Errors.WithLabelValues("encode_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to encode response", "error", err, "account_id", tokenData.AccountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}

	// Update metrics
	duration := time.Since(start)
	m.Requests.Observe(ctx, apimetrics.DurationMilliseconds(duration))
	m.RequestsCount.Inc(ctx)
	m.Successes.Inc(ctx)

	logs.InfoCtx(ctx, "successfully refreshed token",
		"account_id", tokenData.AccountID,
		"character_hash", tokenData.CharacterHash,
		"duration_ms", duration.Milliseconds(),
	)
}

// extractRefreshTokenFromRequest extracts the refresh token and EVE token from the request body
// We use POST with body (not GET with header) to avoid tokens appearing in logs/URLs
// Implements security measures: body size limits and input validation
func extractRefreshTokenFromRequest(r *http.Request) (string, string, error) {
	var reqBody RefreshRequest
	if err := helper.DecodeJSONRequest(r, &reqBody, maxRefreshTokenLength+maxTokenLength+1024); err != nil {
		return "", "", err
	}

	if reqBody.RefreshToken == "" {
		return "", "", errors.New("refresh_token is required in request body")
	}

	if reqBody.EveToken == "" {
		return "", "", errors.New("eve_token is required in request body")
	}

	refreshToken := strings.TrimSpace(reqBody.RefreshToken)
	if refreshToken == "" {
		return "", "", errors.New("refresh_token cannot be empty")
	}

	eveToken := strings.TrimSpace(reqBody.EveToken)
	if eveToken == "" {
		return "", "", errors.New("eve_token cannot be empty")
	}

	return refreshToken, eveToken, nil
}
