package tasks

import (
	esiratelimiter "eve-industry-planner/shared/core/esi/rateLimiter"
	"eve-industry-planner/shared/shared"
)

// TaskDependencies holds all dependencies needed by ESI task functions
type TaskDependencies struct {
	*shared.ServiceClients
	ESIClient esiratelimiter.ClientInterface
}
