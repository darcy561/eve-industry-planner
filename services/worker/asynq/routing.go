package asynq

import (
	natscore "eve-industry-planner/shared/core/nats"
)

// IsESITask determines if a task is an ESI task (interacts with EVE Online ESI API)
func IsESITask(subject string) bool {
	switch subject {
	case natscore.SubjectRefreshSystemIndexes,
		natscore.SubjectRefreshAdjustedPrices,
		natscore.SubjectRefreshMarketPrices,
		natscore.SubjectFetchMissingMarketPrices,
		natscore.SubjectFetchCorporations:
		return true
	default:
		return false
	}
}

// GetESIQueue maps NATS subject to ESI asynq queue name based on PrimaryGroup and priority.
// All PrimaryGroups get equal weight (10) for equal distribution across rate limit groups.
// Within markets group, we split high/low priority to prevent low-priority tasks from starving high-priority ones.
func GetESIQueue(subject string) string {
	switch subject {
	case natscore.SubjectRefreshAdjustedPrices:
		return "esi_markets_high" // Adjusted prices - high priority within markets group
	case natscore.SubjectFetchMissingMarketPrices:
		return "esi_markets_high" // Missing market prices - high priority within markets group
	case natscore.SubjectRefreshMarketPrices:
		return "esi_markets_low" // Market prices - low priority within markets group
	case natscore.SubjectRefreshSystemIndexes:
		return "esi_industry" // Industry group (PrimaryGroup: "industry")
	case natscore.SubjectFetchCorporations:
		return "esi_characters" // Characters group (PrimaryGroup: "characters")
	default:
		return "esi_default" // Unknown groups - default fallback
	}
}

// GetRegularQueue maps NATS subject to regular asynq queue name based on priority
func GetRegularQueue(subject string) string {
	// No regular tasks currently - all tasks use ESI rate limiter
	return "regular_normal" // Default to normal priority
}
