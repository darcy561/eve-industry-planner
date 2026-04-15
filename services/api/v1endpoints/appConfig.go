package v1endpoints

import (
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/appconfig"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

type AppConfigResponse struct {
	AppVersionNumber string                 `json:"app_version_number"`
	MaintenanceMode  bool                   `json:"maintenance_mode"`
	FeatureFlags     map[string]interface{} `json:"feature_flags"`
}

// AppConfigHandler returns lightweight client config without Firebase Remote Config.
func AppConfigHandler(w http.ResponseWriter, r *http.Request, _ *shared.ServiceClients) {
	ctx := r.Context()
	start, ok := logs.RequestStartTime(ctx)
	if !ok {
		start = time.Now()
	}
	m := apimetrics.GetAPIAppConfig()

	if r.Method != http.MethodGet {
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		logs.WarnCtx(ctx, "invalid method for app-config endpoint")
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	featureFlags := appconfig.FeatureFlags()

	response := AppConfigResponse{
		AppVersionNumber: appconfig.AdvertisedAppVersion(),
		MaintenanceMode:  appconfig.MaintenanceModeEnabled(),
		FeatureFlags:     featureFlags,
	}

	payload, etag, err := helper.BuildJSONPayloadAndWeakETag(response)
	if err != nil {
		m.Errors.WithLabelValues("json_build_error").Inc(ctx)
		logs.ErrorCtx(ctx, "app-config: build JSON payload", "error", err)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}

	w.Header().Set("Cache-Control", "public, max-age=60")
	w.Header().Set("ETag", etag)
	if helper.IfNoneMatchSatisfied(r.Header.Get("If-None-Match"), etag) {
		w.WriteHeader(http.StatusNotModified)
		duration := time.Since(start)
		m.Requests.Observe(ctx, apimetrics.DurationMilliseconds(duration))
		m.RequestsCount.Inc(ctx)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write(append(payload, '\n')); err != nil {
		m.Errors.WithLabelValues("write_error").Inc(ctx)
		logs.ErrorCtx(ctx, "app-config: write response", "error", err)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}

	duration := time.Since(start)
	m.Requests.Observe(ctx, apimetrics.DurationMilliseconds(duration))
	m.RequestsCount.Inc(ctx)
}
