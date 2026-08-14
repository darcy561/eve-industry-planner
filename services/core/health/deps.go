package health

import (
	"context"
	"eve-industry-planner/shared/stackservices"
	"fmt"
)

// Deps returns a Component that pings mongo/redis/nats (not primary role).
func Deps(clients *stackservices.Clients) Component {
	return Func{
		ComponentName: "deps",
		Fn:            depsReady(clients),
	}
}

func depsReady(clients *stackservices.Clients) func(context.Context) error {
	return func(ctx context.Context) error {
		if clients == nil {
			return fmt.Errorf("no clients")
		}
		if clients.Redis != nil {
			if err := clients.Redis.Ping(ctx).Err(); err != nil {
				return fmt.Errorf("redis: %w", err)
			}
		} else {
			return fmt.Errorf("redis missing")
		}
		if clients.Mongo != nil {
			if err := clients.Mongo.Ping(ctx); err != nil {
				return fmt.Errorf("mongo: %w", err)
			}
		} else {
			return fmt.Errorf("mongo missing")
		}
		if clients.NATS != nil {
			if !clients.NATS.IsConnected() {
				return fmt.Errorf("nats not connected")
			}
		} else {
			return fmt.Errorf("nats missing")
		}
		return nil
	}
}
