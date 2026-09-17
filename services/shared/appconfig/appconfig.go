package appconfig

import (
	"eve-industry-planner/shared/jsoncodec"
	"os"
	"strings"
)

// Truthy reads a boolean-ish config value: 1, true, yes or on, case-insensitive.
func Truthy(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

// FeatureFlags parses APP_FEATURE_FLAGS_JSON (same semantics as the app-config HTTP handler).
func FeatureFlags() map[string]any {
	s := strings.TrimSpace(os.Getenv("APP_FEATURE_FLAGS_JSON"))
	if s == "" {
		return map[string]any{}
	}
	var out map[string]any
	if err := jsoncodec.Unmarshal([]byte(s), &out); err != nil || out == nil {
		return map[string]any{}
	}
	return out
}
