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
