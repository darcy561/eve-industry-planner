package sso

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"eve-industry-planner/shared/core/config"
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
	logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", errors.New("EVE SSO client ID or secret not configured"))
	return false
}

func handleSSOProviderError(w http.ResponseWriter, r *http.Request, err error, defaultMessage string) {
	if strings.Contains(err.Error(), "invalid_grant") || strings.Contains(err.Error(), "invalid_request") {
		http.Error(w, defaultMessage, http.StatusBadRequest)
		return
	}
	if strings.Contains(err.Error(), "server error") {
		logs.RespondHTTPError(w, r, http.StatusBadGateway, "EVE SSO server error", err)
		return
	}
	logs.RespondHTTPError(w, r, http.StatusInternalServerError, defaultMessage, err)
}

func writeTokenPayload(w http.ResponseWriter, payload EveSSOTokenPayload) error {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	return json.NewEncoder(w).Encode(payload)
}

