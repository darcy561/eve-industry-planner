package v1endpoints

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	userendpoints "eve-industry-planner/api/v1endpoints/user"
	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/models"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

// App session refresh (this file): POST /api/v1/auth/sessions/rotate and /auth/sessions/bootstrap rotate refresh cookies and session cookie.
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
// Mongo users.refreshTokens and refresh via POST /api/v1/esi/characters/access-token/server — neither path is this handler.

// RefreshRequest is the JSON body for planner app session refresh (not EVE OAuth refresh_token grant to CCP).
type RefreshRequest struct {
	// RefreshToken is the current planner app session refresh token (Redis). Optional when the client sends the HttpOnly app refresh cookie instead.
	RefreshToken string `json:"refresh_token"`
	// EveToken is the current ESI access JWT from CCP (optional for cloud cookie resume — server refreshes from Mongo).
	EveToken string `json:"eve_token"`
}

// RotateHandler handles periodic planner session rotation (POST /api/v1/auth/sessions/rotate).
func RotateHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	refreshHandler(w, r, clients, false)
}

// BootstrapHandler handles planner session bootstrap after login flows (POST /api/v1/auth/sessions/bootstrap).
func BootstrapHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	refreshHandler(w, r, clients, true)
}

func refreshHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients, touchLastLogin bool) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)
	m := apimetrics.GetAPISessionRefresh()
	sessionMetrics := apimetrics.GetAPIAuthSessionLifecycle()
	appVersion := extractAppVersion(r)
	sessionEndpoint := "sessions_rotate"
	if touchLastLogin {
		sessionEndpoint = "sessions_bootstrap"
	}
	credLog := auth.BuildRefreshCredentialLogDetail(r, sessionEndpoint, "", false, "")

	// Only allow POST requests
	if !helper.RequireMethod(w, r, http.MethodPost) {
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		attachSessionRefreshClientFailure(r, credLog, "invalid method for refresh endpoint", "auth_refresh_method_not_allowed", map[string]interface{}{
			"metric": "session_refresh",
			"method": r.Method,
		})
		return
	}

	// Planner app session refresh token: JSON body wins; else HttpOnly eip_app_refresh (typical for cloud).
	refreshToken, eveToken, refreshFromCookie, err := extractRefreshCredentials(r)
	credLog = auth.BuildRefreshCredentialLogDetail(r, sessionEndpoint, refreshToken, refreshFromCookie, eveToken)
	if err != nil {
		m.Errors.WithLabelValues("extraction_error").Inc(ctx)
		respondSessionRefreshClientError(w, r, credLog, http.StatusBadRequest, "Invalid request", "failed to extract planner refresh credentials", "auth_refresh_extraction_error", map[string]interface{}{
			"metric": "session_refresh",
			"error":  err.Error(),
		})
		return
	}

	logs.AttachDebugStep(r, "credentials_extracted", map[string]interface{}{
		"refresh_from_cookie": refreshFromCookie,
		"has_eve_token":       eveToken != "",
		"refresh_token_len":   len(refreshToken),
		"eve_token_len":       len(eveToken),
	})

	// Validate refresh token length to prevent DoS attacks
	if len(refreshToken) > maxRefreshTokenLength {
		m.Errors.WithLabelValues("refresh_token_too_long").Inc(ctx)
		respondSessionRefreshClientError(w, r, credLog, http.StatusBadRequest, "Invalid request", "refresh token too long", "auth_refresh_token_too_long", map[string]interface{}{
			"metric": "session_refresh",
			"length": len(refreshToken),
			"max":    maxRefreshTokenLength,
		})
		return
	}

	// Validate EVE token length to prevent DoS attacks
	if len(eveToken) > maxTokenLength {
		m.Errors.WithLabelValues("eve_token_too_long").Inc(ctx)
		respondSessionRefreshClientError(w, r, credLog, http.StatusBadRequest, "Invalid request", "EVE token too long", "auth_refresh_eve_token_too_long", map[string]interface{}{
			"metric": "session_refresh",
			"length": len(eveToken),
			"max":    maxTokenLength,
		})
		return
	}

	// Validate planner refresh material (refresh_token:<opaque>). When the presented token is missing or
	// stale but eip_session is valid, resolve the current refresh row for that session_id (multi-tab local).
	resolved, err := auth.ResolvePresentedRefreshTokenFromRequest(ctx, clients.Redis, refreshToken, r)
	recoveredViaSession := resolved.RecoveredViaSession
	refreshToken = resolved.Token
	tokenData := resolved.Data
	if err != nil {
		if errors.Is(err, auth.ErrRefreshTokenNotFound) {
			m.Errors.WithLabelValues("refresh_token_not_found").Inc(ctx)
			respondSessionRefreshClientError(w, r, credLog, http.StatusUnauthorized, "Invalid token", "planner refresh token not found in Redis", "auth_refresh_token_not_found", map[string]interface{}{
				"metric":                     "session_refresh",
				"session_recovery_attempted": credLog.HasEipSessionCookie,
			})
			return
		}
		m.Errors.WithLabelValues("redis_error").Inc(ctx)
		respondRefreshServerError(w, r, sessionEndpoint, "failed to load refresh token data", "auth_redis_load_refresh", err, nil)
		return
	}

	r = logs.BindRequestIdentityToRequest(r, tokenData.AccountID, tokenData.SessionID)
	ctx = r.Context()
	logs.AttachDebugStep(r, "refresh_token_resolved", map[string]interface{}{
		"recovered_via_session": recoveredViaSession,
		"session_id":            tokenData.SessionID,
	})

	now := time.Now().UTC()
	if strings.TrimSpace(tokenData.SessionID) != "" && auth.IsRefreshTokenDataReauthExpired(ctx, clients.Redis, tokenData, now) {
		m.Errors.WithLabelValues("reauth_required").Inc(ctx)
		attachSessionRefreshClientFailure(r, credLog, "planner session reauth window elapsed", "auth_reauth_required", map[string]interface{}{
			"metric":         "session_refresh",
			"session_start":  tokenData.SessionStart,
		})
		auth.ClearAppSessionCookie(w)
		auth.ClearAppRefreshCookie(w, r)
		writeRefreshAuthError(w, http.StatusUnauthorized, "reauth_required")
		return
	}

	cfg, err := config.LoadConfig()
	if err != nil {
		m.Errors.WithLabelValues("config_error").Inc(ctx)
		respondRefreshServerError(w, r, sessionEndpoint, "failed to load config for auth refresh", "auth_config_load", err, nil)
		return
	}

	if strings.TrimSpace(eveToken) == "" {
		if !refreshFromCookie {
			m.Errors.WithLabelValues("validation_error").Inc(ctx)
			respondSessionRefreshClientError(w, r, credLog, http.StatusBadRequest, "eve_token is required unless authenticating with the app refresh cookie as a cloud account with stored ESI material", "eve_token required for planner session refresh", "auth_refresh_eve_token_required", map[string]interface{}{
				"metric": "session_refresh",
			})
			return
		}
		_, err := userendpoints.RefreshStoredEsiFromMongoForCharacter(ctx, clients, tokenData.AccountID, tokenData.CharacterHash)
		if err != nil {
			switch {
			case errors.Is(err, userendpoints.ErrMongoStoredEsiNotCloud):
				m.Errors.WithLabelValues("validation_error").Inc(ctx)
				respondSessionRefreshClientError(w, r, credLog, http.StatusBadRequest, "eve_token is required for non-cloud sessions", "eve_token required for non-cloud planner session refresh", "auth_refresh_eve_token_required_non_cloud", map[string]interface{}{
					"metric":     "session_refresh",
				})
			case errors.Is(err, userendpoints.ErrMongoStoredEsiNoRow), errors.Is(err, userendpoints.ErrMongoStoredEsiUserNotFound):
				m.Errors.WithLabelValues("cloud_esi_not_found").Inc(ctx)
				respondSessionRefreshClientError(w, r, credLog, http.StatusUnauthorized, "Invalid token", "cloud ESI material not found for refresh session", "auth_cloud_esi_not_found", map[string]interface{}{
					"metric":         "session_refresh",
					"character_hash": tokenData.CharacterHash,
				})
			case errors.Is(err, userendpoints.ErrMongoStoredEsiKeyring), errors.Is(err, userendpoints.ErrMongoStoredEsiDecrypt), errors.Is(err, userendpoints.ErrMongoStoredEsiPersist):
				m.Errors.WithLabelValues("config_error").Inc(ctx)
				respondRefreshServerError(w, r, sessionEndpoint, "cloud stored ESI refresh internal error", "cloud_stored_esi_internal", err, map[string]interface{}{
					"character_hash": tokenData.CharacterHash,
				})
			case errors.Is(err, userendpoints.ErrMongoStoredEsiInvalidGrant):
				m.Errors.WithLabelValues("validation_error").Inc(ctx)
				respondSessionRefreshClientError(w, r, credLog, http.StatusUnauthorized, "Stored ESI refresh invalid — full EVE login required", "stored ESI refresh invalid for planner session refresh", "auth_cloud_esi_invalid_grant", map[string]interface{}{
					"metric":     "session_refresh",
				})
			default:
				m.Errors.WithLabelValues("validation_error").Inc(ctx)
				respondSessionRefreshClientError(w, r, credLog, http.StatusUnauthorized, "Invalid token", "mongo stored ESI refresh failed (cookie resume)", "auth_cloud_esi_refresh_failed", map[string]interface{}{
					"metric":     "session_refresh",
					"error":      err.Error(),
				})
			}
			return
		}
		logs.AttachDebugStep(r, "cloud_esi_refreshed", map[string]interface{}{
			"character_hash": tokenData.CharacterHash,
		})
	} else {
		eveTokenInfo, err := auth.ValidateEveTokenAndExtractHash(r.Context(), eveToken, cfg.EveSSOClientID)
		if err != nil {
			contentType := r.Header.Get("Content-Type")
			m.Errors.WithLabelValues("validation_error").Inc(ctx)
			respondSessionRefreshClientError(w, r, credLog, http.StatusUnauthorized, auth.GetEveTokenErrorMessage(err), "EVE SSO token validation failed (refresh)", "auth_eve_token_invalid", map[string]interface{}{
				"metric":           "session_refresh",
				"error":            err.Error(),
				"eve_token_length": len(eveToken),
				"content_type":     contentType,
			})
			return
		}

		if tokenData.CharacterHash != eveTokenInfo.CharacterHash {
			m.Errors.WithLabelValues("character_hash_mismatch").Inc(ctx)
			respondSessionRefreshClientError(w, r, credLog, http.StatusUnauthorized, "Invalid token", "EVE token owner field (character hash) does not match refresh token", "auth_character_hash_mismatch", map[string]interface{}{
				"metric":      "session_refresh",
				"eve_hash":    eveTokenInfo.CharacterHash,
				"stored_hash": tokenData.CharacterHash,
			})
			return
		}

		logs.AttachDebugStep(r, "eve_token_validated", map[string]interface{}{
			"character_hash": eveTokenInfo.CharacterHash,
		})
	}

	// Load corporation/alliance caches from Redis (aggregated from all characters on the account)
	corporations := auth.GetCorporations(ctx, clients.Redis, tokenData.AccountID)
	alliances := auth.GetAlliances(ctx, clients.Redis, tokenData.AccountID)

	// Update token data with fresh corporation/alliance lists from Redis
	updatedTokenData := *tokenData
	updatedTokenData.Corporations = corporations
	updatedTokenData.Alliances = alliances
	sessionFlow := "refresh"
	startedSession := false
	needNewSessionID := strings.TrimSpace(updatedTokenData.SessionID) == ""
	if needNewSessionID {
		sessionID, err := auth.GenerateSessionID()
		if err != nil {
			m.Errors.WithLabelValues("session_generation_error").Inc(ctx)
			respondRefreshServerError(w, r, sessionEndpoint, "failed to generate session id", "auth_session_id_gen", err, map[string]interface{}{
				"character_hash": tokenData.CharacterHash,
			})
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
	} else if touchLastLogin {
		sessionFlow = "login_refresh"
	}
	if updatedTokenData.SessionStart.IsZero() {
		updatedTokenData.SessionStart = now
	}
	updatedTokenData.SessionSeenAt = now
	if appVersion != "" && appVersion != "unknown" {
		updatedTokenData.AppVersion = appVersion
	}

	// Mint and persist the next planner refresh token (same path as login).
	newRefreshToken, err := auth.MintAndStoreRefreshToken(ctx, clients.Redis, updatedTokenData)
	if err != nil {
		if errors.Is(err, auth.ErrRefreshTokenGenerate) {
			m.Errors.WithLabelValues("refresh_token_generation_error").Inc(ctx)
			respondRefreshServerError(w, r, sessionEndpoint, "failed to generate new refresh token", "auth_refresh_token_gen", err, map[string]interface{}{
				"character_hash": tokenData.CharacterHash,
			})
			return
		}
		m.Errors.WithLabelValues("redis_error").Inc(ctx)
		respondRefreshServerError(w, r, sessionEndpoint, "failed to store new refresh token", "auth_redis_store_refresh", err, map[string]interface{}{
			"character_hash": tokenData.CharacterHash,
		})
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
		auth.RevokeRefreshTokenBestEffort(ctx, clients.Redis, newRefreshToken)
		m.Errors.WithLabelValues("session_store_error").Inc(ctx)
		sessionMetrics.StoreErrors.WithLabelValues(sessionFlow).Inc(ctx)
		respondRefreshServerError(w, r, sessionEndpoint, "failed to store session record", "auth_redis_session_record", err, map[string]interface{}{
			"session_flow":     sessionFlow,
			"character_hash":   tokenData.CharacterHash,
		})
		return
	}
	logs.AttachDebugStep(r, "session_rotated", map[string]interface{}{
		"session_flow":     sessionFlow,
		"started_session":  startedSession,
		"session_endpoint": sessionEndpoint,
	})
	if err := auth.VerifyAccountSessionPersisted(ctx, clients.Redis, tokenData.AccountID, updatedTokenData.SessionID); err != nil {
		auth.RevokeRefreshTokenBestEffort(ctx, clients.Redis, newRefreshToken)
		m.Errors.WithLabelValues("session_verify_error").Inc(ctx)
		sessionMetrics.StoreErrors.WithLabelValues(sessionFlow).Inc(ctx)
		respondRefreshServerError(w, r, sessionEndpoint, "account_sessions row missing after upsert", "auth_session_verify", err, map[string]interface{}{
			"session_flow":     sessionFlow,
			"character_hash":   tokenData.CharacterHash,
		})
		return
	}
	if startedSession {
		sessionMetrics.Started.WithLabelValues(sessionFlow).Inc(ctx)
		apimetrics.RecordAuthSessionDistinctAccount(ctx, clients.Redis, tokenData.AccountID)
	} else {
		sessionMetrics.Continued.WithLabelValues(sessionFlow).Inc(ctx)
	}
	sessionMetrics.Stored.WithLabelValues(sessionFlow).Inc(ctx)
	if err := auth.UpdateAccountSessionGrants(ctx, clients.Redis, tokenData.AccountID, corporations, alliances); err != nil {
		logs.AttachHandlerCaveat(r, "account_session_grants_update_failed", "failed to update account session grants", map[string]interface{}{
			"error": err.Error(),
		})
	}
	if err := auth.VerifyAccountSessionPersisted(ctx, clients.Redis, tokenData.AccountID, updatedTokenData.SessionID); err != nil {
		auth.RevokeRefreshTokenBestEffort(ctx, clients.Redis, newRefreshToken)
		m.Errors.WithLabelValues("session_verify_error").Inc(ctx)
		sessionMetrics.StoreErrors.WithLabelValues(sessionFlow).Inc(ctx)
		respondRefreshServerError(w, r, sessionEndpoint, "account_sessions row missing before issuing session cookies", "auth_session_verify", err, map[string]interface{}{
			"session_flow":     sessionFlow,
			"character_hash":   tokenData.CharacterHash,
		})
		return
	}

	// Rotation: invalidate only the refresh token that authenticated this request (other devices hold different strings).
	if err := auth.RevokeSupersededRefreshToken(ctx, clients.Redis, refreshToken); err != nil {
		logs.AttachHandlerCaveat(r, "superseded_refresh_revoke_failed", "failed to revoke superseded planner app session refresh token", map[string]interface{}{
			"error":          err.Error(),
			"character_hash": tokenData.CharacterHash,
		})
	}

	if touchLastLogin {
		loginDocs, err := helper.ResolveUserDocumentsForLogin(ctx, clients.Mongo, tokenData.AccountID)
		if err != nil {
			m.Errors.WithLabelValues("mongo_error").Inc(ctx)
			respondRefreshServerError(w, r, sessionEndpoint, "failed to resolve user documents for login refresh", "auth_mongo_user_docs", err, map[string]interface{}{
			})
			return
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
					logs.AttachHandlerCaveat(r, "cloud_linked_characters_failed", "cloud linked-character ESI session bundle failed (bootstrap)", map[string]interface{}{
						"error": err.Error(),
					})
				} else {
					linkedCharacters = linkedCharacterSessions
				}
			}
		}
		userendpoints.StripRefreshTokensFromUserDocumentForClient(&userOut)
		bootstrap := SessionBootstrapResponse{
			Kind:                sessionKindBootstrap,
			EsiOAuthStorage:     esiOAuthStorageFromUserCloud(userOut.UserCloudAccounts),
			AccountID:           tokenData.AccountID,
			SessionID:           updatedTokenData.SessionID,
			MainCharacterHash:   tokenData.CharacterHash,
			ReauthRequiredAt:    auth.ReauthRequiredAtUnix(updatedTokenData.SessionStart, time.Time{}),
			FirstLogin:          loginDocs.FirstLogin,
			UserDocument:        userOut,
			ApplicationSettings: loginDocs.Settings,
			LinkedCharacters:    linkedCharacters,
		}
		if !refreshFromCookie {
			bootstrap.RefreshToken = newRefreshToken
		}
		auth.ApplyRotatedSessionCookies(w, r, updatedTokenData.SessionID, newRefreshToken, refreshFromCookie, recoveredViaSession)
		auth.SetEsiOAuthStorageCookieFromUserCloud(w, r, userOut.UserCloudAccounts)

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Pragma", "no-cache")
		w.WriteHeader(http.StatusOK)
		if err := json.NewEncoder(w).Encode(bootstrap); err != nil {
			m.Errors.WithLabelValues("encode_error").Inc(ctx)
			respondRefreshServerError(w, r, sessionEndpoint, "failed to encode response", "auth_response_encode", err, map[string]interface{}{
			})
			return
		}
		duration := time.Since(start)
		m.Requests.Observe(ctx, apimetrics.DurationMilliseconds(duration))
		m.RequestsCount.Inc(ctx)
		m.Successes.Inc(ctx)
		logSessionRefreshSuccess(r, sessionEndpoint, tokenData, auth.AccountStorageLabel(userOut.UserCloudAccounts), refreshFromCookie, recoveredViaSession, duration)
		return
	}

	rotate := SessionRotateResponse{
		Kind:              sessionKindRotate,
		AccountID:         tokenData.AccountID,
		SessionID:         updatedTokenData.SessionID,
		MainCharacterHash: tokenData.CharacterHash,
		ReauthRequiredAt:  auth.ReauthRequiredAtUnix(updatedTokenData.SessionStart, time.Time{}),
	}
	if !refreshFromCookie {
		rotate.RefreshToken = newRefreshToken
	}

	auth.ApplyRotatedSessionCookies(w, r, updatedTokenData.SessionID, newRefreshToken, refreshFromCookie, recoveredViaSession)

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	w.WriteHeader(http.StatusOK)

	if err := json.NewEncoder(w).Encode(rotate); err != nil {
		m.Errors.WithLabelValues("encode_error").Inc(ctx)
		respondRefreshServerError(w, r, sessionEndpoint, "failed to encode response", "auth_response_encode", err, map[string]interface{}{
		})
		return
	}

	// Update metrics
	duration := time.Since(start)
	m.Requests.Observe(ctx, apimetrics.DurationMilliseconds(duration))
	m.RequestsCount.Inc(ctx)
	m.Successes.Inc(ctx)

	logSessionRefreshSuccess(r, sessionEndpoint, tokenData, auth.ResolveSessionRefreshAccountStorage(r, nil, refreshFromCookie, eveToken), refreshFromCookie, recoveredViaSession, duration)
}

func logSessionRefreshSuccess(r *http.Request, sessionEndpoint string, tokenData *auth.RefreshTokenData, accountStorage string, refreshFromCookie, recoveredViaSession bool, duration time.Duration) {
	if tokenData == nil || r == nil {
		return
	}
	logs.AttachHandlerSuccessDetail(r, fmt.Sprintf("successfully refreshed token (%s)", auth.AccountStorageLogPhrase(accountStorage)), map[string]interface{}{
		"account_storage":       accountStorage,
		"session_endpoint":      sessionEndpoint,
		"refresh_from_cookie":   refreshFromCookie,
		"recovered_via_session": recoveredViaSession,
		"duration_ms":           duration.Milliseconds(),
	})
}

func respondRefreshServerError(w http.ResponseWriter, r *http.Request, sessionEndpoint, logMsg, failureClass string, err error, extra map[string]interface{}) {
	if extra == nil {
		extra = map[string]interface{}{}
	}
	extra["session_endpoint"] = sessionEndpoint
	helper.RespondEndpointServerError(w, r, "Internal server error", logMsg, failureClass, "session_refresh", err, extra)
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

type refreshAuthErrorResponse struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func writeRefreshAuthError(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(refreshAuthErrorResponse{
		Code:    code,
		Message: "Unauthorized",
	})
}
