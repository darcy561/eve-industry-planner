package sso

import (
	"context"
	"errors"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

func EveSSOExchangeHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
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
		duration := time.Since(start)
		m.Errors.WithLabelValues("extraction_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_sso_code_exchange", duration, "extraction_error", "error", err)
		logs.WarnCtx(ctx, "failed to extract auth code from request body", "error", err)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if len(authCode) > maxAuthCodeLength {
		duration := time.Since(start)
		m.Errors.WithLabelValues("auth_code_too_long").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_sso_code_exchange", duration, "auth_code_too_long", "length", len(authCode), "max", maxAuthCodeLength)
		logs.WarnCtx(ctx, "auth code too long", "length", len(authCode), "max", maxAuthCodeLength)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if !validateSSOCredentialsOrRespond(w, r, "eve_sso_code_exchange", start, cfg, incError) {
		return
	}

	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	tokenResponse, err := exchangeAuthCodeForEveSSOTokens(ctx, cfg.EveSSOClientID, cfg.EveSSOClientSecret, authCode)
	var characterHash string
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("sso_exchange_error").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_sso_code_exchange", duration, "sso_exchange_error", "error", err)
		logs.WarnCtx(ctx, "failed to exchange auth code for token", "error", err)
		logs.AttachHandlerFailureDetail(r, map[string]interface{}{
			"failure_class":   "sso_upstream_token_request",
			"sso_endpoint":    "token_exchange",
			"auth_code_len":   len(authCode),
			"account_type":    accountType,
			"metric":          "eve_sso_code_exchange",
		})
		handleSSOProviderError(w, r, err, "Invalid authorization code")
		return
	}

	if tokenResponse.AccessToken == "" {
		duration := time.Since(start)
		m.Errors.WithLabelValues("no_access_token").Inc(ctx)
		apimetrics.LogRequestMetrics(ctx, "eve_sso_code_exchange", duration, "no_access_token")
		logs.WarnCtx(ctx, "no access token received from EVE SSO")
		logs.AttachHandlerFailureDetail(r, map[string]interface{}{
			"failure_class": "sso_empty_access_token",
			"sso_endpoint":  "token_exchange",
			"metric":        "eve_sso_code_exchange",
			"expires_in":    tokenResponse.ExpiresIn,
		})
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "No access token received from EVE SSO", errors.New("empty access token from EVE SSO"))
		return
	}

	characterHash, extractErr := extractCharacterHashFromEveSSOAccessToken(tokenResponse.AccessToken, cfg.EveSSOClientID)
	if extractErr != nil {
		logs.WarnCtx(ctx, "token character hash extraction degraded; continuing", "error", extractErr, "account_type", accountType)
	} else {
		logs.DebugCtx(ctx, "successfully parsed SSO token claims", "character_hash", characterHash, "account_type", accountType)
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
		logs.ErrorCtx(ctx, "failed to encode response", "error", err)
		logs.AttachHandlerFailureDetail(r, map[string]interface{}{
			"failure_class": "sso_response_encode",
			"sso_endpoint":  "token_exchange",
			"metric":        "eve_sso_code_exchange",
		})
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}

	duration := time.Since(start)
	m.Requests.Observe(ctx, apimetrics.DurationMilliseconds(duration))
	m.RequestsCount.Inc(ctx)
	m.Successes.Inc(ctx)

	accountID := auth.GetAccountIDFromCharacterHash(characterHash)
	apimetrics.LogRequestMetrics(ctx, "eve_sso_code_exchange", duration, "success", "account_type", accountType, "character_hash", characterHash, "account_id", accountID)
	logs.InfoCtx(ctx, "SSO token exchange completed", "character_hash", characterHash, "account_id", accountID, "account_type", accountType, "duration_ms", duration.Milliseconds())
}
