package appconfig

import (
	"context"
	"strings"
	"sync"

	"eve-industry-planner/core/metrics/common"
	"eve-industry-planner/shared/appconfig"
	"eve-industry-planner/shared/logs"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

func featureFlagAsFloat(v interface{}) float64 {
	switch x := v.(type) {
	case bool:
		if x {
			return 1
		}
		return 0
	case float64:
		if x != 0 {
			return 1
		}
		return 0
	case int:
		if x != 0 {
			return 1
		}
		return 0
	case int64:
		if x != 0 {
			return 1
		}
		return 0
	case string:
		s := strings.ToLower(strings.TrimSpace(x))
		switch s {
		case "1", "true", "yes", "on":
			return 1
		default:
			return 0
		}
	default:
		return 0
	}
}

var registerOnce sync.Once

// Register registers observable gauges mirroring GET /api/v1/app-config (same env vars as the API;
// core typically shares .env with api in compose).
func Register() {
	registerOnce.Do(func() {
		m := common.Meter()
		gMaint, err := m.Float64ObservableGauge("core.app_config.maintenance_mode",
			metric.WithUnit("1"),
			metric.WithDescription("1 when MAINTENANCE_MODE is truthy; same signal as app-config JSON."),
		)
		if err != nil {
			logs.ErrorCtx(context.Background(), "core metrics app_config: maintenance_mode gauge", "error", err)
			return
		}
		gVer, err := m.Int64ObservableGauge("core.app_config.advertised_version_info",
			metric.WithUnit("1"),
			metric.WithDescription("Info metric: app_version_number label matches /api/v1/app-config."),
		)
		if err != nil {
			logs.ErrorCtx(context.Background(), "core metrics app_config: advertised_version_info gauge", "error", err)
			return
		}
		gFlag, err := m.Float64ObservableGauge("core.app_config.feature_flag",
			metric.WithUnit("1"),
			metric.WithDescription("Feature flags from APP_FEATURE_FLAGS_JSON (1=on, 0=off) by flag_key label."),
		)
		if err != nil {
			logs.ErrorCtx(context.Background(), "core metrics app_config: feature_flag gauge", "error", err)
			return
		}
		_, err = m.RegisterCallback(func(ctx context.Context, o metric.Observer) error {
			maint := 0.0
			if appconfig.MaintenanceModeEnabled() {
				maint = 1.0
			}
			o.ObserveFloat64(gMaint, maint)
			ver := appconfig.AdvertisedAppVersion()
			o.ObserveInt64(gVer, 1, metric.WithAttributes(attribute.String("app_version_number", ver)))
			for k, v := range appconfig.FeatureFlags() {
				key := strings.TrimSpace(k)
				if key == "" {
					continue
				}
				o.ObserveFloat64(gFlag, featureFlagAsFloat(v), metric.WithAttributes(attribute.String("flag_key", key)))
			}
			return nil
		}, gMaint, gVer, gFlag)
		if err != nil {
			logs.ErrorCtx(context.Background(), "core metrics app_config: register callback", "error", err)
		}
	})
}
