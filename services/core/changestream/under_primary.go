package changestream

import (
	"context"
	"fmt"

	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/stackservices"

	"eve-industry-planner/core/primarycontroller"
	"eve-industry-planner/core/servicemanager"
)

// StartUnderPrimary starts/stops the changestream watcher when primarycontroller state changes.
func StartUnderPrimary(ctx context.Context, clients *stackservices.Clients, states <-chan primarycontroller.State) (*servicemanager.Managed, error) {
	if clients == nil {
		return nil, fmt.Errorf("changestream: clients required")
	}
	m := servicemanager.New("changestream", func(context.Context) (func(), error) {
		if clients.Mongo == nil || clients.NATS == nil {
			return nil, fmt.Errorf("changestream: mongo, jetstream, and nats required")
		}
		// Change streams need a client with no operation timeout; it lives only while primary.
		// One connection is held per group for as long as its stream awaits events.
		watchMongo, err := eipmongo.ConnectWatch(uint64(len(CollectionGroups())))
		if err != nil {
			return nil, fmt.Errorf("changestream: watch client: %w", err)
		}
		stop, err := StartService(watchMongo, clients.NATS, clients.Redis)
		if err != nil {
			watchMongo.Disconnect(context.Background())
			return nil, err
		}
		return func() {
			stop()
			watchMongo.Disconnect(context.Background())
		}, nil
	})
	if err := m.Follow(ctx, states); err != nil {
		return nil, err
	}
	return m, nil
}
