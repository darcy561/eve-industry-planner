package v1endpoints

import (
	"context"
	"net/http"

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
	m := apimetrics.GetAPIAppConfig()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	if !helper.RequireMethod(w, r, http.MethodGet) {
		metrics.Error("method_not_allowed")
		logs.WarnCtx(ctx, "invalid method for app-config endpoint")
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
		metrics.Error("json_build_error")
		helper.RespondEndpointServerError(w, r, "Internal server error", "app-config: build JSON payload", "app_config_build_failed", "app_config", err, nil)
		return
	}

	w.Header().Set("Cache-Control", "public, max-age=60")
	w.Header().Set("ETag", etag)
	if helper.IfNoneMatchSatisfied(r.Header.Get("If-None-Match"), etag) {
		w.WriteHeader(http.StatusNotModified)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write(append(payload, '\n')); err != nil {
		metrics.Error("write_error")
		helper.RespondEndpointServerError(w, r, "Internal server error", "app-config: write response", "app_config_write_failed", "app_config", err, nil)
		return
	}
}
