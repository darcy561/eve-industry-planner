package tasks

import (
	esiratelimiter "eve-industry-planner/worker/ratelimiter"
	"eve-industry-planner/shared"
)

// TaskDependencies holds all dependencies needed by ESI task functions
type TaskDependencies struct {
	*shared.ServiceClients
	ESIClient esiratelimiter.ClientInterface
}
