package sso

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/core/evesso"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

func ensurePostMethod(w http.ResponseWriter, r *http.Request, metricName string, endpointLabel string, start time.Time, incError func(label string)) bool {
	if r.Method == http.MethodPost {
		return true
	}
	duration := time.Since(start)
	incError("method_not_allowed")
	apimetrics.LogRequestMetrics(r.Context(), metricName, duration, "method_not_allowed")
	logs.WarnCtx(r.Context(), "invalid method for "+endpointLabel)
	http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	return false
}

func loadSSOConfigOrRespond(w http.ResponseWriter, r *http.Request, metricName string, start time.Time, logMessage string, incError func(label string)) (config.Config, bool) {
	cfg, err := config.LoadConfig()
	if err == nil {
		return cfg, true
	}
	duration := time.Since(start)
	incError("config_error")
	apimetrics.LogRequestMetrics(r.Context(), metricName, duration, "config_error", "error", err)
	logs.ErrorCtx(r.Context(), logMessage, "error", err)
	logs.AttachHandlerFailureDetail(r, map[string]interface{}{
		"failure_class": "sso_config_load",
		"metric":        metricName,
	})
	logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
	return config.Config{}, false
}

func validateSSOCredentialsOrRespond(w http.ResponseWriter, r *http.Request, metricName string, start time.Time, cfg config.Config, incError func(label string)) bool {
	if cfg.EveSSOClientID != "" && cfg.EveSSOClientSecret != "" {
		return true
	}
	duration := time.Since(start)
	incError("config_error")
	apimetrics.LogRequestMetrics(r.Context(), metricName, duration, "config_error")
	logs.ErrorCtx(r.Context(), "EVE SSO client ID or secret not configured")
	logs.AttachHandlerFailureDetail(r, map[string]interface{}{
		"failure_class": "sso_credentials_missing",
		"metric":        metricName,
	})
	logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", errors.New("EVE SSO client ID or secret not configured"))
	return false
}

func handleSSOProviderError(w http.ResponseWriter, r *http.Request, err error, defaultMessage string) {
	msg := strings.ToLower(err.Error())
	switch {
	case isSSOGrantClientError(msg):
		// CCP often sends OAuth error_description text (e.g. "Authorization code is invalid.") without
		// the literal substrings "invalid_grant" / "invalid_request" — those must still be 4xx, not 500.
		logs.WarnCtx(r.Context(), "SSO provider rejected request",
			"reason", "invalid_grant_or_oauth_description",
			"status_code", http.StatusBadRequest,
			"error", err)
		http.Error(w, defaultMessage, http.StatusBadRequest)
		return
	case strings.Contains(msg, "server error"):
		logs.ErrorCtx(r.Context(), "SSO provider upstream server error",
			"reason", "upstream_server_error",
			"status_code", http.StatusBadGateway,
			"error", err)
		logs.AttachHandlerFailureDetail(r, map[string]interface{}{
			"failure_class":      "sso_upstream_5xx",
			"provider_token_url": evesso.EveSSOTokenURL,
		})
		logs.RespondHTTPError(w, r, http.StatusBadGateway, "EVE SSO server error", err)
		return
	default:
		logs.ErrorCtx(r.Context(), "SSO provider exchange failed with unexpected error",
			"reason", "unexpected_sso_exchange_error",
			"status_code", http.StatusInternalServerError,
			"error", err)
		logs.AttachHandlerFailureDetail(r, map[string]interface{}{
			"failure_class":      "sso_exchange_unexpected",
			"provider_token_url": evesso.EveSSOTokenURL,
		})
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, defaultMessage, err)
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

