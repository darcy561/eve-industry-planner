package helper

import "eve-industry-planner/shared/appconfig"

// MaintenanceModeEnabled returns true when MAINTENANCE_MODE is a truthy value
// (1, true, yes, on — case-insensitive). Empty or unknown values are false.
func MaintenanceModeEnabled() bool {
	return appconfig.MaintenanceModeEnabled()
}
