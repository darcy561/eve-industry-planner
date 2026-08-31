package scheduler

import (
	"context"
	"eve-industry-planner/shared/stackservices"
	"fmt"

	"eve-industry-planner/core/primarycontroller"
	"eve-industry-planner/core/servicemanager"
)

// StartUnderPrimary starts/stops the scheduler when primarycontroller state changes.
func StartUnderPrimary(ctx context.Context, clients *stackservices.Clients, states <-chan primarycontroller.State) (*servicemanager.Managed, error) {
	if clients == nil {
		return nil, fmt.Errorf("scheduler: clients required")
	}
	m := servicemanager.New("scheduler", func(context.Context) (func(), error) {
		if clients.NATS == nil || clients.Redis == nil || clients.Mongo == nil {
			return nil, fmt.Errorf("scheduler: nats, redis, and mongo required")
		}
		return StartService("scheduler", clients.NATS, clients.Redis, clients.Mongo)
	})
	if err := m.Follow(ctx, states); err != nil {
		return nil, err
	}
	return m, nil
}
