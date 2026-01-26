package asynq

import (
	natscore "eve-industry-planner/shared/core/nats"
)

// GetPriorityQueue maps NATS subject to priority queue name.
// Uses a 5-tier priority system:
// - priority_1: Reserved for future critical tasks
// - priority_2: Urgent, user-impacting tasks (e.g., adjusted prices, missing market prices)
// - priority_3: Default, steady throughput tasks (e.g., system indexes, corporation claims)
// - priority_4: High-volume background tasks (e.g., market prices)
// - priority_5: Reserved / bulk tasks
func GetPriorityQueue(subject string) string {
	switch subject {
	case natscore.SubjectRefreshAdjustedPrices:
		return "priority_2" // Urgent, user-impacting
	case natscore.SubjectFetchMissingMarketPrices:
		return "priority_2" // Urgent, user-impacting
	case natscore.SubjectRefreshSystemIndexes:
		return "priority_3" // Default, steady throughput
	case natscore.SubjectFetchCorporations:
		return "priority_3" // Default, steady throughput
	case natscore.SubjectRefreshMarketPrices:
		return "priority_4" // High-volume background
	case natscore.SubjectCountMarketPricesItems:
		return "priority_3" // Default, steady throughput (maintenance task)
	default:
		// Unknown tasks default to priority_3
		// Log when default routing is used to catch misclassifications
		return "priority_3" // Default fallback
	}
}
