package tasks

// Task type identifiers for scheduler registration and NATS messaging
const (
	// TaskTypeRefreshSystemIndexes is the task type identifier for system indexes refresh
	TaskTypeRefreshSystemIndexes = "refreshSystemIndexes"

	// TaskTypeRefreshAdjustedPrices is the task type identifier for adjusted prices refresh
	TaskTypeRefreshAdjustedPrices = "refreshAdjustedPrices"

	// TaskTypeRefreshMarketPrices is the task type identifier for market prices refresh
	TaskTypeRefreshMarketPrices = "refreshMarketPrices"

	// TaskTypeRecalculateMarketPricesTotal is the task type identifier for recalculating total market prices count
	TaskTypeRecalculateMarketPricesTotal = "recalculateMarketPricesTotal"

	// TaskTypeUpdateCorporationClaims is the task type identifier for corporation claims update
	TaskTypeUpdateCorporationClaims = "updateCorporationClaims"
)
