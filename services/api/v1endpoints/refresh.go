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

// App session refresh (this file): POST /api/v1/auth/sessions/refresh and /auth/sessions/login-refresh issue a new planner API JWT.
//
// Tokens involved here (do not confuse with ESI OAuth refresh secrets):
//   - refresh_token / cookie "eip_app_refresh": planner app session refresh token; opaque value stored in Redis
//     under refresh_token:<token> with metadata (account_id, character_hash, session_id, …). Each login/device
//     chain uses its own opaque string. On successful refresh we mint a new token and revoke only the *presented*
//     previous token — other devices keep their own Redis keys (multi-session safe).
//   - eve_token (JSON body): current ESI access JWT from CCP (short-lived), proving the character matches the session.
//     May be omitted when the client sends only the HttpOnly app refresh cookie AND the account has cloud-stored
//     ESI refresh material in Mongo — the server then refreshes ESI from Mongo before issuing the planner JWT.
//
// ESI OAuth refresh material (long-lived, used to call login.eveonline.com for new ESI tokens) is separate:
// local clients may send it to POST /api/v1/eve-sso/tokens/refresh; cloud accounts store it encrypted in
// Mongo users.refreshTokens and refresh via POST /api/v1/eve-sso/cloud-stored-esi/refresh — neither path is this handler.

// RefreshRequest is the JSON body for planner app session refresh (not EVE OAuth refresh_token grant to CCP).
type RefreshRequest struct {
	// RefreshToken is the current planner app session refresh token (Redis). Optional when the client sends the HttpOnly app refresh cookie instead.
	RefreshToken string `json:"refresh_token"`
	// EveToken is the current ESI access JWT from CCP (optional for cloud cookie resume — server refreshes from Mongo).
	EveToken string `json:"eve_token"`
}

// RefreshResponse is returned after a successful app session refresh.
type RefreshResponse struct {
	// AccessToken is a new planner API JWT (internal signing), not an ESI access token.
	AccessToken string `json:"access_token"`
	// RefreshToken is the new planner app session refresh token when the client is not on cookie-only rotation (see refreshFromCookie).
	RefreshToken        string                          `json:"refresh_token,omitempty"`
	ExpiresAt           int64                           `json:"expires_at"` // Planner JWT expiry (Unix seconds)
	FirstLogin          bool                            `json:"first_login,omitempty"`
	UserDocument        models.UserAccountDocument      `json:"user_document,omitempty"`
	ApplicationSettings models.ApplicationSettings      `json:"application_settings,omitempty"`
	LinkedCharacters    []models.LinkedCharacterSession `json:"linked_characters,omitempty"`
	// MainCharacterEsiAccessToken is set on login-refresh when eve_token was omitted and the server refreshed ESI from Mongo (cloud cookie resume).
	MainCharacterEsiAccessToken string `json:"main_character_esi_access_token,omitempty"`
}

// RefreshHandler handles planner app session refresh (POST /api/v1/auth/sessions/refresh).
func RefreshHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	refreshHandler(w, r, clients, false)
}

// LoginRefreshHandler handles planner app session refresh on the login path (POST /api/v1/auth/sessions/login-refresh).
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

	// Planner app session refresh token: JSON body wins; else HttpOnly eip_app_refresh (typical for cloud).
	refreshToken, eveToken, refreshFromCookie, err := extractRefreshCredentials(r)
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

	// Validate the cookie/body value against Redis refresh_token:<opaque> (planner app session material).
	// Private API calls also use session:<session_id> (see middleware); refresh only requires this refresh row
	// to exist and does not re-check session:<id> here.
	tokenData, err := auth.GetRefreshTokenData(ctx, clients.Redis, refreshToken)
	if err != nil {
		if errors.Is(err, auth.ErrRefreshTokenNotFound) {
			m.Errors.WithLabelValues("refresh_token_not_found").Inc(ctx)
			logs.WarnCtx(ctx, "invalid or expired refresh token")
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}
		m.Errors.WithLabelValues("redis_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to load refresh token data", "error", err)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}

	cfg, err := config.LoadConfig()
	if err != nil {
		m.Errors.WithLabelValues("config_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to load config for auth refresh", "error", err)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}

	var mainEsiAccessFromMongo string
	if strings.TrimSpace(eveToken) == "" {
		if !refreshFromCookie {
			m.Errors.WithLabelValues("validation_error").Inc(ctx)
			http.Error(w, "eve_token is required unless authenticating with the app refresh cookie as a cloud account with stored ESI material", http.StatusBadRequest)
			return
		}
		esiAccess, err := userendpoints.RefreshStoredEsiFromMongoForCharacter(ctx, clients, tokenData.AccountID, tokenData.CharacterHash)
		if err != nil {
			switch {
			case errors.Is(err, userendpoints.ErrMongoStoredEsiNotCloud):
				m.Errors.WithLabelValues("validation_error").Inc(ctx)
				http.Error(w, "eve_token is required for non-cloud sessions", http.StatusBadRequest)
			case errors.Is(err, userendpoints.ErrMongoStoredEsiNoRow), errors.Is(err, userendpoints.ErrMongoStoredEsiUserNotFound):
				m.Errors.WithLabelValues("cloud_esi_not_found").Inc(ctx)
				logs.WarnCtx(ctx, "cloud ESI material not found for refresh session",
					"account_id", tokenData.AccountID,
					"character_hash", tokenData.CharacterHash)
				http.Error(w, "Invalid token", http.StatusUnauthorized)
			case errors.Is(err, userendpoints.ErrMongoStoredEsiKeyring), errors.Is(err, userendpoints.ErrMongoStoredEsiDecrypt), errors.Is(err, userendpoints.ErrMongoStoredEsiPersist):
				m.Errors.WithLabelValues("config_error").Inc(ctx)
				logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
			case errors.Is(err, userendpoints.ErrMongoStoredEsiInvalidGrant):
				m.Errors.WithLabelValues("validation_error").Inc(ctx)
				http.Error(w, "Stored ESI refresh invalid — full EVE login required", http.StatusUnauthorized)
			default:
				m.Errors.WithLabelValues("validation_error").Inc(ctx)
				logs.WarnCtx(ctx, "mongo stored ESI refresh failed (cookie resume)", "error", err, "account_id", tokenData.AccountID)
				http.Error(w, "Invalid token", http.StatusUnauthorized)
			}
			return
		}
		mainEsiAccessFromMongo = esiAccess
	} else {
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

	// Persist new planner app session refresh token (Redis).
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

	// Rotation: invalidate only the refresh token that authenticated this request (other devices hold different strings).
	if err := auth.RevokeRefreshToken(ctx, clients.Redis, refreshToken); err != nil {
		logs.WarnCtx(ctx, "failed to revoke superseded planner app session refresh token", "error", err,
			"account_id", tokenData.AccountID, "character_hash", tokenData.CharacterHash)
	}

	// Calculate expiration timestamp using the same duration as token generation (Unix timestamp in seconds)
	expiresAt := now.Add(internaljwt.TokenExpirationDuration).Unix()

	response := RefreshResponse{
		AccessToken: internalToken,
		ExpiresAt:   expiresAt,
	}
	if !refreshFromCookie {
		response.RefreshToken = newRefreshToken
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
		if strings.TrimSpace(mainEsiAccessFromMongo) != "" {
			response.MainCharacterEsiAccessToken = mainEsiAccessFromMongo
		}
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

	if refreshFromCookie {
		auth.SetAppRefreshCookie(w, r, newRefreshToken)
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	w.WriteHeader(http.StatusOK)

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

// extractRefreshCredentials reads eve_token (ESI access JWT) from JSON; planner app refresh from body or HttpOnly cookie.
// Body refresh_token wins over cookie when both are set.
func extractRefreshCredentials(r *http.Request) (refreshToken string, eveToken string, refreshFromCookie bool, err error) {
	var reqBody RefreshRequest
	if err := helper.DecodeJSONRequest(r, &reqBody, maxRefreshTokenLength+maxTokenLength+1024); err != nil {
		return "", "", false, err
	}

	eveToken = strings.TrimSpace(reqBody.EveToken)

	bodyRT := strings.TrimSpace(reqBody.RefreshToken)
	cookieRT := auth.ReadAppRefreshCookie(r)

	if bodyRT != "" {
		return bodyRT, eveToken, false, nil
	}
	if cookieRT != "" {
		return cookieRT, eveToken, true, nil
	}
	return "", "", false, errors.New("refresh_token is required in body or app refresh cookie")
}
