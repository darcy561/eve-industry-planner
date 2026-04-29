package sso

import (
	"context"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

func EveSSORefreshHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
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
		duration := time.Since(start)
		m.Errors.WithLabelValues("extraction_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_sso_token_refresh", duration, "extraction_error", "error", err)
		logs.WarnCtx(ctx, "failed to extract refresh token from request body", "error", err)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if len(refreshToken) > maxRefreshTokenLength {
		duration := time.Since(start)
		m.Errors.WithLabelValues("refresh_token_too_long").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_sso_token_refresh", duration, "refresh_token_too_long", "length", len(refreshToken), "max", maxRefreshTokenLength)
		logs.WarnCtx(ctx, "refresh token too long", "length", len(refreshToken), "max", maxRefreshTokenLength)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if !validateSSOCredentialsOrRespond(w, r, "eve_sso_token_refresh", start, cfg, incError) {
		return
	}

	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	tokenResponse, err := refreshEveSSOAccessToken(ctx, cfg.EveSSOClientID, cfg.EveSSOClientSecret, refreshToken)
	var characterHash string
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("sso_refresh_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_sso_token_refresh", duration, "sso_refresh_error", "error", err)
		logs.WarnCtx(ctx, "failed to refresh access token", "error", err)
		handleSSOProviderError(w, r, err, "Invalid refresh token")
		return
	}

	characterHash, extractErr := extractCharacterHashFromEveSSOAccessToken(tokenResponse.AccessToken, cfg.EveSSOClientID)
	if extractErr != nil {
		logs.WarnCtx(ctx, "token character hash extraction degraded; continuing", "error", extractErr)
	} else {
		logs.DebugCtx(ctx, "successfully parsed SSO token claims", "character_hash", characterHash)
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
		logs.ErrorCtx(ctx, "failed to encode response", "error", err)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}

	duration := time.Since(start)
	m.Requests.Observe(ctx, apimetrics.DurationMilliseconds(duration))
	m.RequestsCount.Inc(ctx)
	m.Successes.Inc(ctx)
	apimetrics.RecordSSORefreshDistinctCharacter(ctx, clients.Redis, characterHash)

	accountID := auth.GetAccountIDFromCharacterHash(characterHash)
	apimetrics.LogRequestMetrics(ctx, "eve_sso_token_refresh", duration, "success", "character_hash", characterHash, "account_id", accountID)
	logs.InfoCtx(ctx, "SSO token refresh completed", "character_hash", characterHash, "account_id", accountID, "duration_ms", duration.Milliseconds())
}
