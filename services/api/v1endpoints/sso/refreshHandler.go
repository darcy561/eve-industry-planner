package sso

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

func (h *Handlers) EveSSORefreshHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)
	m := apimetrics.GetAPIEveSSOTokenRefresh()
	incError := func(label string) { m.Errors.WithLabelValues(label).Inc(ctx) }
	cfg, ok := loadSSOConfigOrRespond(w, r, "eve_sso_token_refresh", start, "failed to load config for SSO refresh", incError)
	if !ok {
		return
	}

	if !ensurePostMethod(w, r, "eve_sso_token_refresh", "SSO refresh endpoint", start, incError) {
		return
	}

	refreshToken, err := extractRefreshTokenFromSSORequest(r)
	if err != nil {
		m.Errors.WithLabelValues("extraction_error").Inc(ctx)
		respondSSOClientError(w, r, "eve_sso_token_refresh", "Invalid request", "failed to extract refresh token from request body", "sso_refresh_extraction_error", http.StatusBadRequest, map[string]any{
			"error": err.Error(),
		})
		return
	}

	if len(refreshToken) > maxRefreshTokenLength {
		m.Errors.WithLabelValues("refresh_token_too_long").Inc(ctx)
		respondSSOClientError(w, r, "eve_sso_token_refresh", "Invalid request", "refresh token too long", "sso_refresh_token_too_long", http.StatusBadRequest, map[string]any{
			"length": len(refreshToken),
			"max":    maxRefreshTokenLength,
		})
		return
	}

	if !validateSSOCredentialsOrRespond(w, r, "eve_sso_token_refresh", start, cfg, incError) {
		return
	}

	logs.AttachDebugStep(r, "refresh_token_received", map[string]any{
		"refresh_token_len": len(refreshToken),
	})

	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	tokenResponse, err := RefreshEveSSOAccessToken(ctx, cfg.ClientID, cfg.ClientSecret, refreshToken)
	var characterHash string
	if err != nil {
		m.Errors.WithLabelValues("sso_refresh_error").Inc(ctx)
		attachSSOClientFailure(r, "eve_sso_token_refresh", "failed to refresh access token", "sso_refresh_error", map[string]any{
			"sso_endpoint":      "token_refresh",
			"refresh_token_len": len(refreshToken),
			"error":             err.Error(),
		})
		handleSSOProviderError(w, r, err, "Invalid refresh token")
		return
	}

	logs.AttachDebugStep(r, "token_refreshed", map[string]any{
		"expires_in": tokenResponse.ExpiresIn,
	})

	if tokenResponse.AccessToken == "" {
		duration := time.Since(start)
		m.Errors.WithLabelValues("no_access_token").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_sso_token_refresh", duration, "no_access_token")
		helper.RespondEndpointServerError(w, r, "No access token received from EVE SSO", "no access token received from EVE SSO refresh", "sso_empty_access_token", "eve_sso_token_refresh", errors.New("empty access token from EVE SSO"), map[string]any{
			"sso_endpoint": "token_refresh",
			"expires_in":   tokenResponse.ExpiresIn,
		})
		return
	}

	characterHash, extractErr := extractCharacterHashFromEveSSOAccessToken(tokenResponse.AccessToken, cfg.ClientID)
	if extractErr != nil {
		logs.AttachHandlerCaveat(r, "character_hash_extraction_degraded", "token character hash extraction degraded; continuing", map[string]any{
			"error": extractErr.Error(),
		})
	} else {
		logs.AttachDebugStepMsg(r, "claims_parsed", "parsed SSO access token claims", map[string]any{
			"character_hash": characterHash,
		})
	}

	response := EveSSOTokenPayload{
		AccessToken:  tokenResponse.AccessToken,
		RefreshToken: tokenResponse.RefreshToken,
		TokenType:    tokenResponse.TokenType,
		ExpiresIn:    tokenResponse.ExpiresIn,
	}
	if err := writeTokenPayload(w, response); err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("encode_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_sso_token_refresh", duration, "encode_error", "error", err)
		helper.RespondEndpointServerError(w, r, "Internal server error", "failed to encode response", "sso_response_encode", "eve_sso_token_refresh", err, map[string]any{
			"sso_endpoint": "token_refresh",
		})
		return
	}

	duration := time.Since(start)
	m.Requests.Observe(ctx, apimetrics.DurationMilliseconds(duration))
	m.RequestsCount.Inc(ctx)
	m.Successes.Inc(ctx)
	apimetrics.RecordSSORefreshDistinctCharacter(ctx, h.Redis, characterHash)

	accountID := auth.GetAccountIDFromCharacterHash(characterHash)
	r = logs.BindRequestAccountIDToRequest(r, accountID)
	ctx = r.Context()
	if duration > time.Second {
		apimetrics.LogRequestMetrics(ctx, "eve_sso_token_refresh", duration, "success", "account_storage", auth.AccountStorageLocal)
	}
	logs.AttachHandlerSuccessDetail(r, fmt.Sprintf("SSO token refresh completed (%s)", auth.AccountStorageLogPhrase(auth.AccountStorageLocal)), map[string]any{
		"account_storage": auth.AccountStorageLocal,
		"duration_ms":     duration.Milliseconds(),
	})
}
