package sso

import (
	"context"
	"errors"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

func (h *Handlers) EveSSOExchangeHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)
	m := apimetrics.GetAPIEveSSOCodeExchange()
	incError := func(label string) { m.Errors.WithLabelValues(label).Inc(ctx) }
	cfg, ok := loadSSOConfigOrRespond(w, r, "eve_sso_code_exchange", start, "failed to load config for SSO exchange", incError)
	if !ok {
		return
	}

	if !ensurePostMethod(w, r, "eve_sso_code_exchange", "SSO exchange endpoint", start, incError) {
		return
	}

	authCode, accountType, err := extractAuthCodeFromRequest(r)
	if err != nil {
		m.Errors.WithLabelValues("extraction_error").Inc(ctx)
		respondSSOClientError(w, r, "eve_sso_code_exchange", "Invalid request", "failed to extract auth code from request body", "sso_exchange_extraction_error", http.StatusBadRequest, map[string]interface{}{
			"error": err.Error(),
		})
		return
	}

	if len(authCode) > maxAuthCodeLength {
		m.Errors.WithLabelValues("auth_code_too_long").Inc(ctx)
		respondSSOClientError(w, r, "eve_sso_code_exchange", "Invalid request", "auth code too long", "sso_exchange_auth_code_too_long", http.StatusBadRequest, map[string]interface{}{
			"length": len(authCode),
			"max":    maxAuthCodeLength,
		})
		return
	}

	if !validateSSOCredentialsOrRespond(w, r, "eve_sso_code_exchange", start, cfg, incError) {
		return
	}

	logs.AttachDebugStep(r, "auth_code_received", map[string]interface{}{
		"account_type":  accountType,
		"auth_code_len": len(authCode),
	})

	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	tokenResponse, err := exchangeAuthCodeForEveSSOTokens(ctx, cfg.ClientID, cfg.ClientSecret, authCode)
	var characterHash string
	if err != nil {
		m.Errors.WithLabelValues("sso_exchange_error").Inc(ctx)
		attachSSOClientFailure(r, "eve_sso_code_exchange", "failed to exchange auth code for token", "sso_exchange_error", map[string]interface{}{
			"sso_endpoint":  "token_exchange",
			"auth_code_len": len(authCode),
			"account_type":  accountType,
			"error":         err.Error(),
		})
		handleSSOProviderError(w, r, err, "Invalid authorization code")
		return
	}

	logs.AttachDebugStep(r, "token_exchanged", map[string]interface{}{
		"expires_in": tokenResponse.ExpiresIn,
	})

	if tokenResponse.AccessToken == "" {
		duration := time.Since(start)
		m.Errors.WithLabelValues("no_access_token").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_sso_code_exchange", duration, "no_access_token")
		helper.RespondEndpointServerError(w, r, "No access token received from EVE SSO", "no access token received from EVE SSO", "sso_empty_access_token", "eve_sso_code_exchange", errors.New("empty access token from EVE SSO"), map[string]interface{}{
			"sso_endpoint": "token_exchange",
			"expires_in":   tokenResponse.ExpiresIn,
		})
		return
	}

	characterHash, extractErr := extractCharacterHashFromEveSSOAccessToken(tokenResponse.AccessToken, cfg.ClientID)
	if extractErr != nil {
		logs.AttachHandlerCaveat(r, "character_hash_extraction_degraded", "token character hash extraction degraded; continuing", map[string]interface{}{
			"error":        extractErr.Error(),
			"account_type": accountType,
		})
	} else {
		logs.AttachDebugStepMsg(r, "claims_parsed", "parsed SSO access token claims", map[string]interface{}{
			"character_hash": characterHash,
			"account_type":   accountType,
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
		apimetrics.LogRequestMetrics(ctx, "eve_sso_code_exchange", duration, "encode_error", "error", err)
		helper.RespondEndpointServerError(w, r, "Internal server error", "failed to encode response", "sso_response_encode", "eve_sso_code_exchange", err, map[string]interface{}{
			"sso_endpoint": "token_exchange",
		})
		return
	}

	duration := time.Since(start)
	m.Requests.Observe(ctx, apimetrics.DurationMilliseconds(duration))
	m.RequestsCount.Inc(ctx)
	m.Successes.Inc(ctx)

	accountID := auth.GetAccountIDFromCharacterHash(characterHash)
	r = logs.BindRequestAccountIDToRequest(r, accountID)
	ctx = r.Context()
	if duration > time.Second {
		apimetrics.LogRequestMetrics(ctx, "eve_sso_code_exchange", duration, "success", "account_type", accountType, "character_hash", characterHash)
	}
	logs.AttachHandlerSuccessDetail(r, "SSO token exchange completed", map[string]interface{}{
		"character_hash": characterHash,
		"account_type":   accountType,
		"duration_ms":    duration.Milliseconds(),
	})
}
