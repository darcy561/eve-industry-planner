package sso

import (
	"encoding/json"
	"errors"
	"maps"
	"net/http"
	"strings"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/evesso"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

func attachSSOClientFailure(r *http.Request, metricName, logMsg, failureClass string, extra map[string]any) {
	detail := map[string]any{
		"failure_class": failureClass,
		"metric":        metricName,
	}
	maps.Copy(detail, extra)
	logs.AttachClientFailureDetail(r, logMsg, detail)
}

func respondSSOClientError(w http.ResponseWriter, r *http.Request, metricName, publicMsg, logMsg, failureClass string, statusCode int, extra map[string]any) {
	attachSSOClientFailure(r, metricName, logMsg, failureClass, extra)
	http.Error(w, publicMsg, statusCode)
}

func ensurePostMethod(w http.ResponseWriter, r *http.Request, metricName string, endpointLabel string, start time.Time, incError func(label string)) bool {
	if r.Method == http.MethodPost {
		return true
	}
	incError("method_not_allowed")
	respondSSOClientError(w, r, metricName, "Method not allowed", "invalid method for "+endpointLabel, "sso_method_not_allowed", http.StatusMethodNotAllowed, map[string]any{
		"method": r.Method,
	})
	return false
}

func loadSSOConfigOrRespond(http.ResponseWriter, *http.Request, string, time.Time, string, func(label string)) (config.EveSSO, bool) {
	return config.LoadEveSSO(), true
}

func validateSSOCredentialsOrRespond(w http.ResponseWriter, r *http.Request, metricName string, start time.Time, cfg config.EveSSO, incError func(label string)) bool {
	if cfg.ClientID != "" && cfg.ClientSecret != "" {
		return true
	}
	duration := time.Since(start)
	incError("config_error")
	apimetrics.LogRequestMetrics(r.Context(), metricName, duration, "config_error")
	err := errors.New("EVE SSO client ID or secret not configured")
	helper.RespondEndpointServerError(w, r, "Internal server error", "EVE SSO client ID or secret not configured", "sso_credentials_missing", metricName, err, nil)
	return false
}

func handleSSOProviderError(w http.ResponseWriter, r *http.Request, err error, defaultMessage string) {
	msg := strings.ToLower(err.Error())
	switch {
	case isSSOGrantClientError(msg):
		respondSSOClientError(w, r, "", defaultMessage, "SSO provider rejected request", "sso_provider_invalid_grant", http.StatusBadRequest, map[string]any{
			"reason": "invalid_grant_or_oauth_description",
			"error":  err.Error(),
		})
		return
	case strings.Contains(msg, "server error"):
		helper.RespondEndpointError(w, r, http.StatusBadGateway, "EVE SSO server error", "SSO provider upstream server error", "sso_upstream_5xx", "", err, map[string]any{
			"provider_token_url": evesso.TokenURL(),
			"reason":             "upstream_server_error",
		})
		return
	default:
		helper.RespondEndpointServerError(w, r, defaultMessage, "SSO provider exchange failed with unexpected error", "sso_exchange_unexpected", "", err, map[string]any{
			"provider_token_url": evesso.TokenURL(),
			"reason":             "unexpected_sso_exchange_error",
		})
	}
}

// isSSOGrantClientError matches OAuth/token-grant failures that should map to HTTP 400, including
// EVE SSO error_description strings that do not contain "invalid_grant" verbatim.
func isSSOGrantClientError(msg string) bool {
	if strings.Contains(msg, "invalid_grant") || strings.Contains(msg, "invalid_request") {
		return true
	}
	if strings.Contains(msg, "authorization code") {
		return true
	}
	if strings.Contains(msg, "code has expired") || strings.Contains(msg, "code has already") {
		return true
	}
	if strings.Contains(msg, "redirect_uri") {
		return true
	}
	if strings.Contains(msg, "refresh token") {
		return true
	}
	return false
}

func writeTokenPayload(w http.ResponseWriter, payload EveSSOTokenPayload) error {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	return json.NewEncoder(w).Encode(payload)
}
