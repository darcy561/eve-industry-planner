package appconfig

import (
	"encoding/json"
	"os"
	"strings"
)

// MaintenanceModeEnabled returns true when MAINTENANCE_MODE is a truthy value
// (1, true, yes, on — case-insensitive). Empty or unknown values are false.
func MaintenanceModeEnabled() bool {
	v := strings.TrimSpace(os.Getenv("MAINTENANCE_MODE"))
	if v == "" {
		return false
	}
	switch strings.ToLower(v) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

// AdvertisedAppVersion resolves the same string returned as app_version_number on GET /api/v1/app-config.
func AdvertisedAppVersion() string {
	appVersion := strings.TrimSpace(os.Getenv("FRONTEND_APP_VERSION"))
	if appVersion == "" {
		appVersion = strings.TrimSpace(os.Getenv("APP_VERSION_NUMBER"))
	}
	if appVersion == "" {
		appVersion = strings.TrimSpace(os.Getenv("APP_VERSION"))
	}
	if appVersion == "" {
		return "development"
	}
	return appVersion
}

// FeatureFlags parses APP_FEATURE_FLAGS_JSON (same semantics as the app-config HTTP handler).
func FeatureFlags() map[string]interface{} {
	s := strings.TrimSpace(os.Getenv("APP_FEATURE_FLAGS_JSON"))
	if s == "" {
		return map[string]interface{}{}
	}
	var out map[string]interface{}
	if err := json.Unmarshal([]byte(s), &out); err != nil || out == nil {
		return map[string]interface{}{}
	}
	return out
}
