package appconfig

import (
	"os"
	"strings"

	"eve-industry-planner/shared/telemetry"
)

// ProcessAppVersion is this container's baked identity (GH Action / Dockerfile ldflags + ENV).
// Priority: link-time BakedRelease → FRONTEND_APP_VERSION → APP_VERSION_NUMBER → APP_VERSION.
func ProcessAppVersion() string {
	if v := strings.TrimSpace(telemetry.BakedRelease); v != "" {
		return v
	}
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

// AdvertisedAppVersion is the process bake/env version (same as ProcessAppVersion).
// Name kept for existing metrics / call sites.
func AdvertisedAppVersion() string {
	return ProcessAppVersion()
}
