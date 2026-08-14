package changestream

import (
	"context"
	"eve-industry-planner/shared/stackservices"
	"fmt"

	"eve-industry-planner/core/primarycontroller"
	"eve-industry-planner/core/servicemanager"
)

// StartUnderPrimary starts/stops the changestream watcher when primarycontroller state changes.
func StartUnderPrimary(ctx context.Context, clients *stackservices.Clients, states <-chan primarycontroller.State) (*servicemanager.Managed, error) {
	if clients == nil {
		return nil, fmt.Errorf("changestream: clients required")
	}
	m := servicemanager.New("changestream", func(context.Context) (func(), error) {
		if clients.Mongo == nil || clients.JetStream == nil || clients.NATS == nil {
			return nil, fmt.Errorf("changestream: mongo, jetstream, and nats required")
		}
		return StartService(clients.Mongo, clients.JetStream, clients.NATS, clients.Redis)
	})
	if err := m.Follow(ctx, states); err != nil {
		return nil, err
	}
	return m, nil
}
