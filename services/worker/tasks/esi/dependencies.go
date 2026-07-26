package tasks

import (
	"eve-industry-planner/shared/stackservices"
	esiratelimiter "eve-industry-planner/worker/ratelimiter"
)

// TaskDependencies holds all dependencies needed by ESI task functions
type TaskDependencies struct {
	*stackservices.Clients
	ESIClient esiratelimiter.ClientInterface
}
